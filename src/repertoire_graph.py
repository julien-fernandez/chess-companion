"""Graphe de positions du répertoire, indexé par EPD et non par FEN (ADR 0006)."""
from __future__ import annotations

import io
from typing import Iterator

import chess
import chess.pgn

NON_VU = "non_vu"
VU = "vu"
SU = "su"
RATE = "rate"


def repertoire_positions(pgn: str) -> set[str]:
    """EPD de chaque position du répertoire, racine incluse, par rejeu."""
    positions: set[str] = set()
    for game in _read_games(pgn):
        board = game.board()
        positions.add(board.epd())
        for move in game.mainline_moves():
            board.push(move)
            positions.add(board.epd())
    return positions


def first_exit(game_pgn: str, repertoire: set[str]) -> tuple[int, str, str] | None:
    """(numéro de coup, epd, fen) du premier nœud hors répertoire, même s'il vaut 1 ; None sinon."""
    for game in _read_games(game_pgn):
        board = game.board()
        if board.epd() not in repertoire:
            return 1, board.epd(), board.fen()
        for move in game.mainline_moves():
            move_number = board.fullmove_number
            board.push(move)
            if board.epd() not in repertoire:
                return move_number, board.epd(), board.fen()
    return None


def _read_games(pgn: str) -> Iterator[chess.pgn.Game]:
    src = io.StringIO(pgn)
    while True:
        game = chess.pgn.read_game(src)
        if game is None:
            break
        yield game