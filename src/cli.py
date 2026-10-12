"""Boucle CLI (mode texte / --cli)."""
import logging
import chess
from src.display import render_board, render_status
from src.voice_input import VoiceInput
from src.tts import speak, describe_move

logger = logging.getLogger(__name__)


def run_cli(coach, use_voice: bool) -> tuple[chess.Board, list]:
    board = chess.Board()
    voice = VoiceInput(board) if use_voice else None
    text_parser = VoiceInput(board) if not use_voice else None
    move_history: list[tuple[chess.Board, chess.Move]] = []

    print("\n♟  Chess Companion — CLI")
    print("Commandes: e4 / cavalier f3 / petit roque / undo / quit")
    if use_voice:
        print("Mode vocal activé 🎤\n")

    render_board(board)
    render_status(board)

    while not board.is_game_over():
        if voice:
            print("🎤 Dites votre coup...")
            raw = voice.listen()
        else:
            raw = input("Coup: ").strip().lower()

        if raw is None:
            print("Non reconnu, réessayez.")
            continue

        parser = voice if voice else text_parser
        uci = parser.parse(raw)

        if uci == "quit":
            print("Partie interrompue.")
            break

        if uci == "undo":
            if board.move_stack:
                board.pop()
                if move_history:
                    move_history.pop()
                render_board(board)
                render_status(board)
            else:
                print("Aucun coup à annuler.")
            continue

        if uci is None:
            print("Coup non reconnu.")
            continue

        try:
            move = chess.Move.from_uci(uci)
        except ValueError:
            print(f"Format UCI invalide: {uci}")
            continue

        if move not in board.legal_moves:
            print(f"Coup illégal: {uci}")
            continue

        feedback = ""
        if coach:
            try:
                ev = coach.assess_move(board, move)
                feedback = ev.feedback(board, move)
            except Exception as e:
                logger.debug(f"Erreur coaching: {e}")

        speak(describe_move(board, move))
        move_history.append((board.copy(), move))
        board.push(move)
        render_board(board, last_move=move)
        render_status(board)

        if feedback:
            print(f"\n💬 {feedback}\n")
            speak(feedback)

    return board, move_history
