"""Tests de la brique C — indexation EPD du répertoire (spec 2026-09-17)."""
from src.repertoire_graph import repertoire_positions, first_exit

QGD_ORDRE_1 = "[Event \"?\"]\n[White \"?\"]\n[Black \"?\"]\n1. d4 d5 2. c4 e6 3. Nc3 Nf6 *"
QGD_ORDRE_2 = "[Event \"?\"]\n[White \"?\"]\n[Black \"?\"]\n1. d4 Nf6 2. c4 e6 3. Nc3 d5 *"

PARTIE_DANS_PUIS_SORT = (
    "[Event \"?\"]\n[White \"?\"]\n[Black \"?\"]\n"
    "1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Bb4 *"
)


def _converged_epd():
    """EPD après 3 coups, atteignable par les deux ordres."""
    import chess
    b = chess.Board()
    for mv in "d2d4 d7d5 c2c4 e7e6 b1c3 g8f6".split():
        b.push_uci(mv)
    return b.epd()


def test_la_fen_naurait_pas_fusionne_la_transposition():
    """Garde négative : la FEN éclate les transpositions, d'où l'EPD (ADR 0006)."""
    import chess
    b1 = chess.Board()
    for mv in "d2d4 d7d5 c2c4 e7e6 b1c3 g8f6".split():
        b1.push_uci(mv)
    b2 = chess.Board()
    for mv in "d2d4 g8f6 c2c4 e7e6 b1c3 d7d5".split():
        b2.push_uci(mv)
    assert b1.fen() != b2.fen(), "la FEN devrait différer (compteurs de coup)"
    assert b1.epd() == b2.epd(), "l'EPD doit fusionner (identité de position)"


def test_transposition_fusionne_en_un_seul_noeud():
    """Garde clé du spec : 2 ordres différents → même position → un seul nœud."""
    pos1 = repertoire_positions(QGD_ORDRE_1)
    pos2 = repertoire_positions(QGD_ORDRE_2)
    converged = _converged_epd()

    assert converged in pos1
    assert converged in pos2

    union = pos1 | pos2
    assert sum(1 for p in union if p == converged) == 1


def test_position_de_depart_est_racine():
    """Le nœud racine (position de départ) est dans le répertoire."""
    import chess
    assert chess.Board().epd() in repertoire_positions(QGD_ORDRE_1)


def test_first_exit_nul_si_dans_repertoire():
    """Une partie entièrement dans le répertoire ne signale pas de sortie."""
    rep = repertoire_positions(QGD_ORDRE_1)
    assert first_exit(QGD_ORDRE_1, rep) is None


def test_first_exit_signale_le_premier_coup_hors_repertoire():
    """La sortie tombe au 4e coup, pas avant — même sur partie courte."""
    rep = repertoire_positions(QGD_ORDRE_1)
    exit_move = first_exit(PARTIE_DANS_PUIS_SORT, rep)
    assert exit_move is not None
    coup, epd, fen = exit_move
    assert coup == 4, f"attendu sortie au coup 4, obtenu {coup}"
    import chess
    b = chess.Board()
    for mv in "d2d4 d7d5 c2c4 e7e6 b1c3 g8f6 c1g5".split():
        b.push_uci(mv)
    assert epd == b.epd()


def test_une_sortie_sur_un_coup_noir_porte_le_numero_de_ce_coup():
    """1...c5 hors répertoire sort au coup 1 : le compteur FEN, déjà passé à 2, surestimerait la sortie."""
    rep = repertoire_positions(QGD_ORDRE_1)
    sicilienne = "[Event \"?\"]\n[White \"?\"]\n[Black \"?\"]\n1. d4 c5 *"
    coup, _epd, _fen = first_exit(sicilienne, rep)
    assert coup == 1, f"attendu sortie au coup 1, obtenu {coup}"
