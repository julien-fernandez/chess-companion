"""Chess Companion — entry point."""
import sys
import logging
from datetime import datetime

from src.coach import Coach
from src.game_recorder import save_game

import pathlib
from logging.handlers import RotatingFileHandler

_log_path = pathlib.Path("logs/chess_companion.log")
_log_path.parent.mkdir(exist_ok=True)
_handler = RotatingFileHandler(_log_path, maxBytes=2_000_000, backupCount=1, encoding="utf-8")
_handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s",
                    handlers=[logging.StreamHandler(), _handler])

STOCKFISH_PATH = "stockfish"
USE_CLI  = "--cli"      in sys.argv
USE_VOICE= "--voice"    in sys.argv
NO_COACH = "--no-coach" in sys.argv
VS_AI    = "--vs-ai"    in sys.argv


def _make_coach() -> Coach | None:
    if NO_COACH:
        return None
    try:
        c = Coach(STOCKFISH_PATH)
        print("✓ Stockfish actif")
        return c
    except Exception as e:
        print(f"⚠ Stockfish indisponible ({e}) — mode sans coaching")
        return None


def main() -> None:
    coach = _make_coach()
    started_at = datetime.now()

    try:
        if USE_CLI:
            from src.cli import run_cli
            board, move_history = run_cli(coach, USE_VOICE)
        else:
            from src.gui import ChessGUI
            gui = ChessGUI(coach=coach, vs_ai=VS_AI)
            board, move_history = gui.run()

        result = "*"
        if board.is_game_over():
            outcome = board.outcome()
            if outcome:
                result = "1-0" if outcome.winner is True else ("0-1" if outcome.winner is False else "1/2-1/2")

        if coach and move_history:
            print("\n📊 Analyse post-partie — 3 pires coups :")
            for i, (bb, mv, ev) in enumerate(coach.analyze_game(move_history, top_n=3), 1):
                color = "Blancs" if bb.turn else "Noirs"
                label = "Gaffe" if ev.is_blunder else ("Imprécision" if ev.is_mistake else "Coup")
                best = bb.san(ev.best_move) if ev.best_move else "?"
                print(f"  {i}. Coup {bb.fullmove_number} ({color}) {bb.san(mv)} — {label} (−{ev.pawns_lost:.1f}♟). Mieux: {best}")

        pgn_path = save_game(board, started_at, result)
        print(f"✓ Partie sauvegardée: {pgn_path}")

    finally:
        if coach:
            coach.close()


if __name__ == "__main__":
    main()
