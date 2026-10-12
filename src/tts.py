"""Text-to-speech FR via gTTS."""
import os
import tempfile
import logging
import chess

logger = logging.getLogger(__name__)

PIECE_NAMES = {
    chess.PAWN: 'pion',
    chess.KNIGHT: 'cavalier',
    chess.BISHOP: 'fou',
    chess.ROOK: 'tour',
    chess.QUEEN: 'dame',
    chess.KING: 'roi',
}

_pygame_ready = False


def _init_pygame() -> bool:
    global _pygame_ready
    if _pygame_ready:
        return True
    try:
        import pygame
        pygame.mixer.init()
        _pygame_ready = True
        return True
    except Exception:
        return False


def describe_move(board: chess.Board, move: chess.Move) -> str:
    """Décrit un coup en français."""
    piece = board.piece_at(move.from_square)
    if piece is None:
        return "coup invalide"

    piece_name = PIECE_NAMES.get(piece.piece_type, 'pièce')
    frm = chess.square_name(move.from_square)
    to = chess.square_name(move.to_square)

    if board.is_queenside_castling(move):
        return "grand roque"
    if board.is_kingside_castling(move):
        return "petit roque"

    text = f"{piece_name} {frm} {to}"
    if board.is_capture(move):
        text += ", prend"
    if move.promotion:
        text += f", promotion en {PIECE_NAMES.get(move.promotion, 'dame')}"
    return text


def speak(text: str) -> None:
    """Énonce le texte en FR. Silencieux si gTTS/pygame indisponible."""
    try:
        from gtts import gTTS
        import pygame
        if not _init_pygame():
            raise RuntimeError("pygame unavailable")
        tts = gTTS(text=text, lang='fr', slow=False)
        tmp = os.path.join(tempfile.gettempdir(), "_chess_tts.mp3")
        tts.save(tmp)
        pygame.mixer.music.load(tmp)
        pygame.mixer.music.play()
        while pygame.mixer.music.get_busy():
            pygame.time.Clock().tick(10)
        os.remove(tmp)
    except Exception as e:
        logger.debug(f"TTS ignoré: {e}")
        print(f"[TTS] {text}")
