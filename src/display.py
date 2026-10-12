"""Affichage terminal de l'échiquier."""
import chess
import colorama
from colorama import Fore, Back, Style

colorama.init()

SYMBOLS = {
    'P': '♟', 'N': '♞', 'B': '♝', 'R': '♜', 'Q': '♛', 'K': '♚',
    'p': '♙', 'n': '♘', 'b': '♗', 'r': '♖', 'q': '♕', 'k': '♔',
}


def render_board(board: chess.Board, last_move: chess.Move | None = None) -> None:
    print("\n  a b c d e f g h")
    print("  ───────────────")
    for rank in range(7, -1, -1):
        print(f"{rank + 1}│ ", end="")
        for file in range(8):
            sq = chess.square(file, rank)
            piece = board.piece_at(sq)
            dark = (rank + file) % 2 == 0
            highlighted = last_move and sq in (last_move.from_square, last_move.to_square)

            bg = Back.YELLOW if highlighted else (Back.BLUE if dark else Back.GREEN)
            if piece:
                symbol = SYMBOLS[piece.symbol()]
                color = Fore.WHITE if piece.color == chess.WHITE else Fore.BLACK
                print(f"{bg}{color}{symbol}{Style.RESET_ALL}", end=" ")
            else:
                print(f"{bg} {Style.RESET_ALL}", end=" ")
        print(f"{rank + 1}")
    print("  ───────────────")
    print("  a b c d e f g h\n")


def render_status(board: chess.Board) -> None:
    if board.is_checkmate():
        winner = "Noirs" if board.turn == chess.WHITE else "Blancs"
        print(f"♚ Échec et mat — {winner} gagnent!")
    elif board.is_stalemate():
        print("½ Pat — match nul")
    elif board.is_insufficient_material():
        print("½ Matériel insuffisant — match nul")
    elif board.is_fifty_moves():
        print("½ Règle des 50 coups — match nul")
    elif board.is_check():
        print("⚠ Échec!")
    else:
        turn = "Blancs" if board.turn == chess.WHITE else "Noirs"
        print(f"▶ Trait aux {turn}  (coup {board.fullmove_number})")
