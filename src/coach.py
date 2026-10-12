"""Stockfish wrapper + logique de coaching."""
import chess
import chess.engine
import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)

BLUNDER_PAWNS_LOST = 2.0
MISTAKE_PAWNS_LOST = 0.5


@dataclass
class Evaluation:
    """Scores en pions, tous du point de vue du camp qui vient de jouer."""

    pawns_before_move: float
    pawns_after_move: float
    best_move: chess.Move | None
    pawns_lost: float

    @property
    def is_blunder(self) -> bool:
        return self.pawns_lost >= BLUNDER_PAWNS_LOST

    @property
    def is_mistake(self) -> bool:
        return MISTAKE_PAWNS_LOST <= self.pawns_lost < BLUNDER_PAWNS_LOST

    def feedback(self, board_before: chess.Board, move: chess.Move) -> str:
        move_san = board_before.san(move) if move in board_before.legal_moves else str(move)
        if self.is_blunder:
            best = board_before.san(self.best_move) if self.best_move else "?"
            return f"Gaffe! {move_san} perd {self.pawns_lost:.1f} pions. Mieux valait {best}."
        if self.is_mistake:
            best = board_before.san(self.best_move) if self.best_move else "?"
            return f"Imprécision. {move_san} perd {self.pawns_lost:.1f} pions. {best} était meilleur."
        return ""


class Coach:
    def __init__(self, stockfish_path: str = "stockfish", depth: int = 15):
        self.engine = chess.engine.SimpleEngine.popen_uci(stockfish_path)
        self.depth = depth
        logger.info(f"Stockfish initialisé (depth={depth})")

    def evaluate(self, board: chess.Board) -> float:
        """Retourne l'évaluation en pawn units du côté qui a le trait."""
        info = self.engine.analyse(board, chess.engine.Limit(depth=self.depth))
        score = info["score"].white()
        if score.is_mate():
            return 100.0 if score.mate() > 0 else -100.0
        pov = score.score() / 100.0
        return pov if board.turn == chess.WHITE else -pov

    def best_move(self, board: chess.Board) -> chess.Move | None:
        result = self.engine.play(board, chess.engine.Limit(depth=self.depth))
        return result.move

    def assess_move(self, board_before: chess.Board, move: chess.Move) -> Evaluation:
        """Évalue la qualité d'un coup en comparant avant/après."""
        pawns_before_move = self.evaluate(board_before)
        best = self.best_move(board_before)

        board_after = board_before.copy()
        board_after.push(move)
        pawns_for_opponent = self.evaluate(board_after)
        pawns_after_move = -pawns_for_opponent
        pawns_lost = max(0.0, pawns_before_move - pawns_after_move)

        return Evaluation(pawns_before_move, pawns_after_move, best, pawns_lost)

    def analyze_game(
        self,
        history: list[tuple[chess.Board, chess.Move]],
        top_n: int = 3,
    ) -> list[tuple[chess.Board, chess.Move, "Evaluation"]]:
        """Retourne les top_n pires coups de la partie, triés par delta décroissant."""
        evaluations = []
        for board_before, move in history:
            try:
                ev = self.assess_move(board_before, move)
                evaluations.append((board_before, move, ev))
            except Exception as e:
                logger.debug(f"analyze_game skip {move}: {e}")
        evaluations.sort(key=lambda t: t[2].pawns_lost, reverse=True)
        return evaluations[:top_n]

    def close(self) -> None:
        self.engine.quit()
        logger.info("Stockfish fermé")
