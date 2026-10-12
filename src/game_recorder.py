"""Enregistrement de parties + export PGN."""
import chess
import chess.pgn
import sqlite3
import json
import logging
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)

DB_PATH = Path(__file__).parent.parent / "data" / "games.db"


def _ensure_db() -> None:
    DB_PATH.parent.mkdir(exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS games (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                pgn TEXT NOT NULL,
                result TEXT,
                moves_count INTEGER,
                duration_seconds INTEGER,
                metadata JSON
            )
        """)


def save_game(board: chess.Board, started_at: datetime, result: str = "*") -> Path:
    """Sauvegarde la partie en PGN et dans SQLite. Retourne le chemin du fichier PGN."""
    _ensure_db()

    game = chess.pgn.Game.from_board(board)
    game.headers["Date"] = started_at.strftime("%Y.%m.%d")
    game.headers["White"] = "Julien"
    game.headers["Black"] = "?"
    game.headers["Result"] = result
    game.headers["Event"] = "OTB"

    pgn_str = str(game)
    duration = int((datetime.now() - started_at).total_seconds())

    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            "INSERT INTO games (date, pgn, result, moves_count, duration_seconds) VALUES (?,?,?,?,?)",
            (started_at.isoformat(), pgn_str, result, board.fullmove_number, duration)
        )

    pgn_dir = Path(__file__).parent.parent / "data" / "pgn"
    pgn_dir.mkdir(exist_ok=True)
    pgn_path = pgn_dir / f"{started_at.strftime('%Y%m%d_%H%M%S')}.pgn"
    pgn_path.write_text(pgn_str, encoding="utf-8")
    logger.info(f"Partie sauvegardée: {pgn_path}")
    return pgn_path
