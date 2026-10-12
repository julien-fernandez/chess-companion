"""Juge une partie coup par coup et en tire les cartes de jugement (spec 2026-10-06 ; `--link` ou `--pgn`)."""
from __future__ import annotations

import argparse
import io
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import chess.pgn
import psycopg
from psycopg.types.json import Jsonb

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.games import game_identity, insert_game, is_finished  # noqa: E402
from src.pilotage import PARTIES_DIR, detecter_couleur  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_URL = "postgresql://postgres:local@localhost:55432/chess"


def find_game(link: str, directory: Path) -> tuple[chess.pgn.Game, Path]:
    """La partie dont l'en-tête Link est `link`, cherchée dans les PGN tirés."""
    wanted = link.rstrip("/")
    for path in sorted(directory.glob("*.pgn")):
        handle = io.StringIO(path.read_text(encoding="utf-8"))
        while (game := chess.pgn.read_game(handle)) is not None:
            if game.headers.get("Link", "").rstrip("/") == wanted:
                return game, path
    raise SystemExit(f"Partie introuvable dans {directory} : lancer scripts/pull_games.py --months 1")


def require_finished(game: chess.pgn.Game) -> None:
    """Refuse une partie sans résultat : la juger pendant qu'elle se joue serait de l'aide (anti-usage)."""
    if not is_finished(game):
        result = game.headers.get("Result", "*")
        raise SystemExit(f"Partie en cours (Result « {result} ») : on ne juge qu'une partie finie.")


def judge(game: chess.pgn.Game, side: str, depth: int) -> dict:
    """Lance web/scripts/judge-game.mjs sur la partie ; lève sur toute erreur du moteur."""
    node = shutil.which("node")
    if node is None:
        raise SystemExit("node introuvable dans le PATH")
    done = subprocess.run(
        [node, "scripts/judge-game.mjs", "-", side], cwd=ROOT / "web", input=str(game),
        capture_output=True, text=True, encoding="utf-8", env={**os.environ, "DEPTH": str(depth)},
    )
    if done.returncode != 0:
        raise SystemExit(f"judge-game.mjs a échoué (rc={done.returncode}) :\n{done.stderr.strip()}")
    return json.loads(done.stdout)


def store_judgment(cur: psycopg.Cursor, game_id: int, judgment: dict) -> dict[str, int]:
    """Verse évals et cartes ; ce qui existe déjà reste tel quel (une carte révisée ne change pas)."""
    cur.execute("SELECT ply, san FROM game_move WHERE game_id = %s ORDER BY ply", (game_id,))
    recorded = dict(cur.fetchall())
    counts = {"evals": 0, "cards": 0}
    for p in judgment["plies"]:
        if recorded.get(p["ply"]) != p["san"]:
            raise ValueError(f"demi-coup {p['ply']} : {p['san']} jugé, {recorded.get(p['ply'])} en base")
        cur.execute(
            "INSERT INTO move_eval (game_id, ply, engine, depth, eval_before_cp, eval_after_cp, best_san, "
            "best_pv, win_pct_lost) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) "
            "ON CONFLICT (game_id, ply) DO NOTHING",
            (game_id, p["ply"], judgment["engine"], judgment["depth"], p["evalBefore"], p["evalAfter"],
             p["bestSan"], p["bestPv"], p["winPctLost"]),
        )
        counts["evals"] += cur.rowcount
    for c in judgment["cards"]:
        cur.execute(
            "INSERT INTO judgment_card (game_id, ply, role, expected_verdict, generated_reason, vocabulary_version) "
            "VALUES (%s, %s, %s, %s, %s, %s) ON CONFLICT (game_id, ply) DO NOTHING",
            (game_id, c["ply"], c["role"], c["verdict"],
             Jsonb(c["reason"]) if c["reason"] is not None else None,
             judgment["vocabularyVersion"]),
        )
        counts["cards"] += cur.rowcount
    return counts


def main() -> int:
    ap = argparse.ArgumentParser(description="Juge une partie et en tire les cartes de jugement.")
    source = ap.add_mutually_exclusive_group(required=True)
    source.add_argument("--link", help="lien chess.com de la partie, déjà tirée dans data/games/")
    source.add_argument("--pgn", type=Path, help="fichier PGN d'une seule partie")
    ap.add_argument("--depth", type=int, default=20)
    args = ap.parse_args()

    if args.link:
        game, path = find_game(args.link, PARTIES_DIR)
    else:
        path = args.pgn
        game = chess.pgn.read_game(io.StringIO(path.read_text(encoding="utf-8")))
        if game is None:
            raise SystemExit(f"Aucune partie lisible dans {path}")
    require_finished(game)
    side = detecter_couleur(game)
    if side is None:
        raise SystemExit("Partie sans Julien (aucun alias reconnu dans White/Black)")

    judgment = judge(game, side, args.depth)
    platform, external_id = game_identity(game, path)
    with psycopg.connect(os.environ.get("CHESS_DB_URL", DEFAULT_URL)) as conn, conn.cursor() as cur:
        game_id, _ = insert_game(cur, game, side, platform, external_id)
        counts = store_judgment(cur, game_id, judgment)
    roles = [c["role"] for c in judgment["cards"]]
    print(f"Partie {game_id} : {counts['evals']} évals et {counts['cards']} cartes nouvelles "
          f"({roles.count('own')} erreurs, {roles.count('control')} témoins, "
          f"{roles.count('opponent_gift')} cadeaux non punis).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
