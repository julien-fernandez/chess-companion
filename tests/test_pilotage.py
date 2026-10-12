"""Tests du pilotage : journal déclaré (ADR 0007) et agrégation des sorties (ADR 0008)."""
from pathlib import Path

import chess
import pytest
import chess.pgn

from src.pilotage import (
    Session,
    Sortie,
    choisir_chapitre,
    derniere_par_chapitre,
    detecter_couleur,
    moyenne_sortie,
    opening_moves,
    parse_journal,
)


def _partie(blanc: str, noir: str, coups: str = "1. e4 e5") -> chess.pgn.Game:
    import io
    pgn = f'[Event "?"]\n[White "{blanc}"]\n[Black "{noir}"]\n{coups} *'
    return chess.pgn.read_game(io.StringIO(pgn))

JOURNAL_VALIDE = """# Journal

> De la prose en blockquote, ignorée.

2026-09-18  scandinave  65%
2026-09-19  ecossais    40
2026-09-20  scandinave  70%
"""


def test_les_seances_valides_sont_lues():
    seances, rejets = parse_journal(JOURNAL_VALIDE)
    assert rejets == []
    assert len(seances) == 3
    assert seances[0] == Session("2026-09-18", "scandinave", 65)
    assert seances[1].pourcentage == 40, "le % final est optionnel"


def test_la_prose_markdown_ne_produit_pas_de_rejet():
    _seances, rejets = parse_journal("# Titre\n> prose\n| a | b |\n- puce\n* autre\n\n")
    assert rejets == []


def test_une_ligne_illisible_ressort_au_lieu_detre_avalee():
    seances, rejets = parse_journal("2026-09-18  scandinave  65%\nj'ai drillé un peu ce soir\n")
    assert len(seances) == 1
    assert len(rejets) == 1
    assert "ligne 2" in rejets[0]


def test_un_chapitre_inconnu_ressort():
    seances, rejets = parse_journal("2026-09-18  caro-kann  65%\n")
    assert seances == []
    assert len(rejets) == 1
    assert "caro-kann" in rejets[0]


def test_un_pourcentage_hors_bornes_ressort():
    seances, rejets = parse_journal("2026-09-18  scandinave  180%\n")
    assert seances == []
    assert "hors bornes" in rejets[0]


def test_julien_est_reconnu_sous_ses_differents_noms():
    """Un seul identifiant écarterait ses parties DecodeChess ou OTB, sous nom civil."""
    assert detecter_couleur(_partie("Jfernandezjlt", "adversaire")) == "white"
    assert detecter_couleur(_partie("adversaire", "jfernandezjlt")) == "black"
    assert detecter_couleur(_partie("LEER Fernandez", "?")) == "white"
    assert detecter_couleur(_partie("Magnus", "Hikaru")) is None


def test_la_derniere_seance_de_chaque_chapitre():
    seances, _ = parse_journal(JOURNAL_VALIDE)
    dernieres = derniere_par_chapitre(seances)
    assert dernieres["scandinave"].date == "2026-09-20"
    assert dernieres["scandinave"].pourcentage == 70
    assert dernieres["ecossais"].date == "2026-09-19"


def test_le_chapitre_se_choisit_sur_le_plus_long_prefixe_douverture():
    assert choisir_chapitre("white", ["e4", "e5"]) == "ecossais"
    assert choisir_chapitre("white", ["e4", "e6"]) == "francaise"
    assert choisir_chapitre("white", ["d4", "d5"]) == "londres", "le 1.d4 de Julien suffit"
    assert choisir_chapitre("black", ["e4", "c6"]) == "scandinave"
    assert choisir_chapitre("black", ["d4", "d5"]) == "vs-d4"
    assert choisir_chapitre("black", ["c4", "e5"]) is None, "aucun répertoire déclaré"
    assert choisir_chapitre("white", ["e4", "c5"]) is None, "sicilienne : pas de chapitre"


def test_une_partie_trop_courte_ne_choisit_pas_de_chapitre_blanc_sur_1e4():
    """1.e4 sans réponse ne suffit pas à trancher entre écossais et française."""
    assert opening_moves(_partie("jfernandezjlt", "x", "1. e4")) == ["e4"]
    assert choisir_chapitre("white", ["e4"]) is None


@pytest.mark.skipif(not (Path(__file__).resolve().parents[1] / "data" / "repertoire").is_dir(),
                    reason="repertoire PGN personnel non publie")
def test_la_sortie_se_mesure_contre_tous_les_chapitres_de_la_couleur():
    """Un 1.d4 hors répertoire reste mesuré — sortie au coup 1, pas un écart (ADR 0008)."""
    from src.pilotage import charger_repertoires, positions_par_couleur
    union = positions_par_couleur(charger_repertoires())
    depart = chess.Board().epd()
    assert depart in union["white"] and depart in union["black"]
    apres_e4 = chess.Board(); apres_e4.push_san("e4")
    apres_d4 = chess.Board(); apres_d4.push_san("d4")
    apres_c4 = chess.Board(); apres_c4.push_san("c4")
    assert apres_e4.epd() in union["white"] and apres_d4.epd() in union["white"]
    assert apres_c4.epd() not in union["white"], "donc 1.c4 EST une sortie au coup 1"


def test_les_parties_restees_dans_le_repertoire_ne_gonflent_pas_la_moyenne():
    """Les noyer dans la moyenne la ferait monter sans qu'aucune préparation ne s'allonge."""
    trouvees = [
        Sortie("a.pgn", 1, "white", "ecossais", 3, "e4 e5 Cf3"),
        Sortie("b.pgn", 1, "white", "ecossais", 5, "e4 e5 Cf3 Cc6 d4"),
        Sortie("c.pgn", 1, "white", "ecossais", None, ""),
    ]
    moyenne, n_sorties, n_dedans = moyenne_sortie(trouvees, "white")
    assert moyenne == 4.0
    assert (n_sorties, n_dedans) == (2, 1)


def test_sans_aucune_sortie_la_moyenne_est_absente_pas_zero():
    trouvees = [Sortie("a.pgn", 1, "black", "scandinave", None, "")]
    moyenne, n_sorties, n_dedans = moyenne_sortie(trouvees, "black")
    assert moyenne is None, "jamais 0.0, qui se lirait « sortie au coup 0 »"
    assert (n_sorties, n_dedans) == (0, 1)
