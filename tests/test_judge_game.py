"""Une partie jugée se verse une seule fois : un second passage n'ajoute ni carte ni éval."""
import io
import os

import chess.pgn
import psycopg
import pytest

from scripts.judge_game import find_game, require_finished, store_judgment
from src.games import insert_game

LOCAL_URL = os.environ.get("CHESS_DB_URL", "postgresql://postgres:local@localhost:55432/chess")
PGN = """[Event "Essai"]
[White "Jfernandezjlt"]
[Black "Adversaire"]
[Result "0-1"]
[Link "https://www.chess.com/game/daily/999000111"]

1. f3 e5 2. g4 Qh4# 0-1
"""


def _game():
    return chess.pgn.read_game(io.StringIO(PGN))


def _judgment(sans=("f3", "e5", "g4", "Qh4#")):
    plies = [{"ply": i + 1, "san": s, "evalBefore": 0, "evalAfter": 0, "bestSan": s, "bestPv": [s],
              "winPctLost": 0.0, "verdict": "kept"} for i, s in enumerate(sans)]
    plies[2].update(evalAfter=-10000, winPctLost=50.0, verdict="blunder")
    cards = [{"ply": 3, "role": "own", "verdict": "blunder",
              "reason": {"layers": [], "primary": None, "vocabularyVersion": "0.7.0"}}]
    return {"engine": "stockfish", "depth": 20, "vocabularyVersion": "0.7.0", "plies": plies, "cards": cards}


def test_une_partie_se_retrouve_par_son_lien(tmp_path):
    (tmp_path / "chesscom-2026-10.pgn").write_text(PGN, encoding="utf-8")
    game, path = find_game("https://www.chess.com/game/daily/999000111/", tmp_path)
    assert game.headers["Black"] == "Adversaire" and path.name == "chesscom-2026-10.pgn"
    with pytest.raises(SystemExit):
        find_game("https://www.chess.com/game/daily/1", tmp_path)


@pytest.fixture
def cur():
    try:
        conn = psycopg.connect(LOCAL_URL, connect_timeout=2)
    except psycopg.OperationalError as exc:
        pytest.skip(f"base locale injoignable : {exc}")
    with conn, conn.cursor() as cursor:
        yield cursor
        conn.rollback()


def test_un_second_passage_ne_change_rien(cur):
    game_id, created = insert_game(cur, _game(), "white", "chesscom", "999000111")
    assert created
    again, created_again = insert_game(cur, _game(), "white", "chesscom", "999000111")
    assert (again, created_again) == (game_id, False)
    assert store_judgment(cur, game_id, _judgment()) == {"evals": 4, "cards": 1}
    assert store_judgment(cur, game_id, _judgment()) == {"evals": 0, "cards": 0}
    cur.execute("SELECT role::text, expected_verdict::text FROM judgment_card WHERE game_id = %s", (game_id,))
    assert cur.fetchall() == [("own", "blunder")]


def test_un_san_qui_ne_colle_pas_a_la_partie_est_refuse(cur):
    game_id, _ = insert_game(cur, _game(), "white", "chesscom", "999000111")
    with pytest.raises(ValueError):
        store_judgment(cur, game_id, _judgment(("e4", "e5", "g4", "Qh4#")))


@pytest.mark.parametrize("result", ["*", None])
def test_une_partie_en_cours_n_est_jamais_jugee(result):
    """Juger une partie daily encore ouverte, c'est aider pendant qu'elle se joue : refus avant le moteur."""
    header = f'[Result "{result}"]\n' if result else ""
    pgn = PGN.replace('[Result "0-1"]\n', header).replace(" 0-1\n", " *\n")
    with pytest.raises(SystemExit, match="en cours"):
        require_finished(chess.pgn.read_game(io.StringIO(pgn)))


@pytest.mark.parametrize("result", ["1-0", "0-1", "1/2-1/2"])
def test_une_partie_finie_passe(result):
    require_finished(chess.pgn.read_game(io.StringIO(PGN.replace('"0-1"', f'"{result}"'))))
