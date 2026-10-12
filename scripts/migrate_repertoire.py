"""Verse le répertoire de build_repertoire.py et les parties de data/games/ dans la base (ADR 0012)."""
from __future__ import annotations

import io
import os
import re
import sys
from pathlib import Path

import chess
import chess.pgn
import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scripts.build_repertoire import REPERTOIRE  # noqa: E402
from src.games import game_identity, insert_game  # noqa: E402
from src.pilotage import CHAPITRES, PARTIES_DIR, detecter_couleur  # noqa: E402

DEFAULT_URL = "postgresql://postgres:local@localhost:55432/chess"
VIDEO_AUTHOR = re.compile(r"d'après (?P<author>[^,]+), YouTube (?P<video>[\w-]{11})(?: \((?P<lo>\d+)-(?P<hi>\d+) Elo\))?")
ANNOUNCED = re.compile(r"^(?P<move>\d+)\.\.\.\S+ \((?P<pct>\d+)% des adversaires\)")
RECURRENCE = re.compile(r"\((?:\d+ fois|\d+ fois dans la vidéo)\)")

LONDON_CHECKS = {
    0: [(9, "c3 attaque le fou en b4", "board.is_attacked_by(WHITE, B4)")],
    1: [(13, "Db5+ fait échec et attaque le cavalier b4 et le pion b7",
         "board.is_check() and board.is_attacked_by(WHITE, B4) and board.is_attacked_by(WHITE, B7)"),
        (15, "Dxb7 attaque la tour a8 et le cavalier c6",
         "board.is_attacked_by(WHITE, A8) and board.is_attacked_by(WHITE, C6)")],
    2: [(11, "hxg3 ouvre la colonne h sur h7", "board.is_attacked_by(WHITE, H7)")],
    3: [(11, "hxg3 ouvre la colonne h sur h7", "board.is_attacked_by(WHITE, H7)")],
    4: [(11, "Cbd2 défend f3 : Fxf3 se reprend du cavalier", "board.is_attacked_by(WHITE, F3)")],
    5: [(7, "dxe5 gagne un pion", "pawn_balance(board) == 1")],
    6: [(5, "Cf3 défend le pion e5", "board.is_attacked_by(WHITE, E5)")],
    7: [(11, "d5 attaque le cavalier c6", "board.is_attacked_by(WHITE, C6)")],
}


def pawn_balance(board: chess.Board) -> int:
    """Pions blancs moins pions noirs."""
    return len(board.pieces(chess.PAWN, chess.WHITE)) - len(board.pieces(chess.PAWN, chess.BLACK))


def evaluate_check(board: chess.Board, expression: str) -> bool:
    """Évalue une expression de garde 2 sur la position obtenue après le coup."""
    names = {name.upper(): square for square, name in enumerate(chess.SQUARE_NAMES)}
    return bool(eval(expression, {"__builtins__": {}}, {
        "board": board, "WHITE": chess.WHITE, "BLACK": chess.BLACK,
        "pawn_balance": pawn_balance, **names,
    }))


def classify_source(chapter_title: str, label: str) -> tuple[str, dict]:
    """(kind, attributs de la source) d'une variante, d'après son libellé et celui du chapitre."""
    if "(sans source)" in label:
        return "hand_written", {"title": "Écrit à la main"}
    if "(parties réelles)" in label:
        return "own_games", {"title": "Parties de Julien"}
    video = VIDEO_AUTHOR.search(chapter_title)
    if video:
        return "coach_video", {
            "title": chapter_title.split(" — ")[0],
            "author": video["author"],
            "url": f"https://www.youtube.com/watch?v={video['video']}",
            "elo_min": int(video["lo"]) if video["lo"] else None,
            "elo_max": int(video["hi"]) if video["hi"] else None,
        }
    return "hand_written", {"title": "Écrit à la main"}


def admission_for(kind: str, label: str) -> str:
    """Motif d'admission déductible du libellé ; « declared » quand rien ne l'atteste."""
    if kind == "coach_video" and ANNOUNCED.search(label):
        return "announced_frequency"
    if kind == "coach_video" and RECURRENCE.search(label):
        return "source_recurrence"
    return "declared"


def replay(sans: list[str]) -> list[tuple[int, str, str, str, chess.Board]]:
    """(ply, san, epd avant, epd après, position après) pour chaque coup, par rejeu."""
    board = chess.Board()
    moves = []
    for ply, san in enumerate(sans, start=1):
        before = board.epd()
        board.push_san(san)
        moves.append((ply, san, before, board.epd(), board.copy()))
    return moves


def source_id(cur: psycopg.Cursor, kind: str, attrs: dict) -> int:
    url = attrs.get("url")
    if url:
        cur.execute("SELECT id FROM source WHERE url = %s", (url,))
    else:
        cur.execute("SELECT id FROM source WHERE kind = %s AND url IS NULL", (kind,))
    row = cur.fetchone()
    if row:
        return row[0]
    cur.execute(
        "INSERT INTO source (kind, title, author, url, elo_min, elo_max) "
        "VALUES (%s, %s, %s, %s, %s, %s) RETURNING id",
        (kind, attrs["title"], attrs.get("author"), url, attrs.get("elo_min"), attrs.get("elo_max")),
    )
    return cur.fetchone()[0]


def migrate_repertoire(cur: psycopg.Cursor) -> dict[str, int]:
    by_file = {entry[0]: slug for slug, entry in CHAPITRES.items()}
    counts = {"variations": 0, "moves": 0, "claims": 0, "refuted": 0}
    for filename, title, lines in REPERTOIRE:
        slug = by_file[filename]
        _file, label, side, prefix = CHAPITRES[slug]
        cur.execute(
            "INSERT INTO chapter (slug, label, side, opening_prefix) VALUES (%s, %s, %s, %s)",
            (slug, label, side, list(prefix)),
        )
        for ord_, (line_label, sans) in enumerate(lines, start=1):
            kind, attrs = classify_source(title, line_label)
            cur.execute(
                "INSERT INTO variation (chapter_slug, ord, label, source_id, admission) "
                "VALUES (%s, %s, %s, %s, %s) RETURNING id",
                (slug, ord_, line_label, source_id(cur, kind, attrs), admission_for(kind, line_label)),
            )
            variation_id = cur.fetchone()[0]
            counts["variations"] += 1
            moves = replay(sans)
            for ply, san, before, after, _board in moves:
                cur.execute("INSERT INTO position (epd) VALUES (%s), (%s) ON CONFLICT DO NOTHING",
                            (before, after))
                cur.execute(
                    "INSERT INTO variation_move (variation_id, ply, san, from_epd, to_epd) "
                    "VALUES (%s, %s, %s, %s, %s)",
                    (variation_id, ply, san, before, after),
                )
                own = (before.split(" ")[1] == "w") == (side == "white")
                if own:
                    cur.execute("INSERT INTO card (epd, san) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                                (before, san))
                counts["moves"] += 1
            announced = ANNOUNCED.search(line_label)
            if announced:
                cur.execute(
                    "INSERT INTO claim (variation_id, ply, nature, statement) VALUES (%s, %s, 'statistic', %s)",
                    (variation_id, 2 * int(announced["move"]),
                     f"{announced['pct']} % des adversaires jouent ce coup"),
                )
                counts["claims"] += 1
            if slug == "londres":
                for ply, statement, expression in LONDON_CHECKS.get(ord_ - 1, []):
                    verdict = "verified" if evaluate_check(moves[ply - 1][4], expression) else "refuted"
                    counts["refuted"] += verdict == "refuted"
                    cur.execute(
                        "INSERT INTO claim (variation_id, ply, nature, statement, verification, check_expression) "
                        "VALUES (%s, %s, 'objective', %s, %s, %s)",
                        (variation_id, ply, statement, verdict, expression),
                    )
                    counts["claims"] += 1
    return counts


def migrate_games(cur: psycopg.Cursor) -> dict[str, int]:
    counts = {"games": 0, "skipped_not_julien": 0, "duplicates": 0}
    for path in sorted(PARTIES_DIR.glob("*.pgn")):
        handle = io.StringIO(path.read_text(encoding="utf-8"))
        while (game := chess.pgn.read_game(handle)) is not None:
            side = detecter_couleur(game)
            if side is None:
                counts["skipped_not_julien"] += 1
                continue
            platform, external_id = game_identity(game, path)
            _, created = insert_game(cur, game, side, platform, external_id)
            counts["games" if created else "duplicates"] += 1
    return counts


def main() -> int:
    url = os.environ.get("CHESS_DB_URL", DEFAULT_URL)
    with psycopg.connect(url) as conn, conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM variation")
        if cur.fetchone()[0]:
            print("La base contient déjà des variantes : migration refusée, rien n'est écrasé.",
                  file=sys.stderr)
            return 1
        repertoire = migrate_repertoire(cur)
        games = migrate_games(cur)
    print(f"répertoire : {repertoire}")
    print(f"parties    : {games}")
    return 1 if repertoire["refuted"] else 0


if __name__ == "__main__":
    sys.exit(main())
