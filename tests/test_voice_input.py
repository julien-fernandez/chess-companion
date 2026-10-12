"""Tests du parseur vocal."""
import chess
import pytest
from src.voice_input import VoiceInput


@pytest.fixture
def voice():
    board = chess.Board()
    return VoiceInput(board)


def test_pawn_move(voice):
    assert voice.parse("e4") == "e2e4"


def test_uci_direct(voice):
    assert voice.parse("e2e4") == "e2e4"


def test_piece_move(voice):
    assert voice.parse("cavalier f3") == "g1f3"


def test_quit(voice):
    assert voice.parse("quitter") == "quit"


def test_undo(voice):
    assert voice.parse("annuler") == "undo"


def test_invalid(voice):
    assert voice.parse("blabla") is None


def test_castling_not_possible_initially(voice):
    assert voice.parse("petit roque") is None


def test_castling_possible_once_the_white_king_side_is_clear():
    board = chess.Board("r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4")
    voice = VoiceInput(board)
    assert voice.parse("petit roque") == "e1g1"


def test_two_knights_reaching_the_same_square_return_none():
    board = chess.Board("8/8/8/8/8/N7/8/N6K w - - 0 1")
    voice = VoiceInput(board)
    assert voice.parse("cavalier a3") is None
