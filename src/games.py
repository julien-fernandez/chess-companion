"""Une partie jouée et ses coups, versés en base (ADR 0012) : partagé par la migration et le jugement."""
from __future__ import annotations

import hashlib
import re
from pathlib import Path

import chess.pgn
import psycopg


FINISHED = {"1-0", "0-1", "1/2-1/2"}


def is_finished(game: chess.pgn.Game) -> bool:
    """Une partie sans résultat se joue encore : l'analyser serait de l'aide (anti-usage)."""
    return game.headers.get("Result", "*") in FINISHED


def game_identity(game: chess.pgn.Game, path: Path | None) -> tuple[str, str]:
    """(plateforme, identifiant externe) : le lien chess.com, sinon l'empreinte du PGN."""
    link = game.headers.get("Link", "")
    if "chess.com" in link:
        return "chesscom", link.rstrip("/").rsplit("/", 1)[-1]
    if "lichess" in game.headers.get("Site", ""):
        return "lichess", game.headers["Site"].rstrip("/").rsplit("/", 1)[-1]
    digest = hashlib.sha256(str(game).encode("utf-8")).hexdigest()[:16]
    from_chesscom = path is not None and path.name.startswith("chesscom-")
    return ("chesscom" if from_chesscom else "other"), digest


def insert_game(cur: psycopg.Cursor, game: chess.pgn.Game, side: str, platform: str,
                external_id: str) -> tuple[int, bool]:
    """(id, créée) : une partie déjà versée rend son id, sans toucher à ses coups."""
    date = game.headers.get("UTCDate") or game.headers.get("Date", "")
    played_at = date.replace(".", "-") if re.fullmatch(r"\d{4}\.\d{2}\.\d{2}", date) else None
    cur.execute(
        "INSERT INTO played_game (platform, external_id, played_at, white, black, julien_side, "
        "time_control, result, pgn) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) "
        "ON CONFLICT (platform, external_id) DO NOTHING RETURNING id",
        (platform, external_id, played_at, game.headers.get("White", "?"), game.headers.get("Black", "?"),
         side, game.headers.get("TimeControl"), game.headers.get("Result", "*"), str(game)),
    )
    row = cur.fetchone()
    if row is None:
        cur.execute("SELECT id FROM played_game WHERE platform = %s AND external_id = %s", (platform, external_id))
        existing = cur.fetchone()
        assert existing is not None
        return existing[0], False
    board = game.board()
    for ply, move in enumerate(game.mainline_moves(), start=1):
        before, san = board.epd(), board.san(move)
        board.push(move)
        cur.execute(
            "INSERT INTO game_move (game_id, ply, san, from_epd, to_epd) VALUES (%s, %s, %s, %s, %s)",
            (row[0], ply, san, before, board.epd()),
        )
    return row[0], True
