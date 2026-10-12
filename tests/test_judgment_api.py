"""La révision d'une carte de jugement se note côté serveur, et la raison s'annote après coup."""
import pytest

from src.review_api import annotate_judgment_review, grade_verdict, list_judgments, record_judgment_review
from tests.test_judge_game import _game, _judgment, cur  # noqa: F401 — fixture partagée
from scripts.judge_game import store_judgment
from src.games import insert_game

V = ["kept", "slipped", "mistake", "blunder"]


@pytest.mark.parametrize(("expected", "given", "outcome"), [
    ("blunder", "blunder", "recalled"),
    ("blunder", "mistake", "recalled_after_retry"),
    ("slipped", "mistake", "recalled_after_retry"),
    ("slipped", "kept", "failed"),
    ("kept", "slipped", "failed"),
    ("blunder", "slipped", "failed"),
    ("kept", "kept", "recalled"),
])
def test_notation_niveau_exact_cran_voisin_sens_faux(expected, given, outcome):
    assert grade_verdict(expected, given) == outcome


def test_toute_paire_de_verdicts_a_une_note():
    assert {grade_verdict(e, g) for e in V for g in V} == {"recalled", "recalled_after_retry", "failed"}


def _card(cur):
    game_id, _ = insert_game(cur, _game(), "white", "chesscom", "999000111")
    store_judgment(cur, game_id, _judgment())
    return game_id


def test_une_carte_neuve_est_due_et_porte_son_verso(cur):
    game_id = _card(cur)
    card = next(c for c in list_judgments(cur) if c["game_id"] == game_id)
    assert (card["ply"], card["san"], card["mover"], card["opponent"]) == (3, "g4", "white", "Adversaire")
    assert card["expected_verdict"] == "blunder" and card["reason"]["vocabularyVersion"] == "0.7.0"
    assert card["fen"].count(" ") == 5 and card["due_at"] is not None


def test_le_serveur_note_et_la_raison_sannote(cur):
    game_id = _card(cur)
    answer = record_judgment_review(cur, {"game_id": game_id, "ply": 3, "verdict": "mistake"})
    assert answer["outcome"] == "recalled_after_retry"
    annotate_judgment_review(cur, {"id": answer["id"], "reason_tag": "ignores", "note": "pas vu Dh4",
                                   "reason_wrong": True})
    cur.execute("SELECT reason_tag::text, note, reason_wrong FROM judgment_review WHERE id = %s", (answer["id"],))
    assert cur.fetchone() == ("ignores", "pas vu Dh4", True)


def test_les_entrees_douteuses_sont_refusees(cur):
    game_id = _card(cur)
    for bad in ({"game_id": game_id, "ply": 3, "verdict": "terrible"},
                {"game_id": game_id, "ply": 2, "verdict": "kept"},
                {"game_id": "x", "ply": 3, "verdict": "kept"}):
        with pytest.raises(ValueError):
            record_judgment_review(cur, bad)
    with pytest.raises(ValueError):
        annotate_judgment_review(cur, {"id": -1, "reason_tag": "ignores", "note": "", "reason_wrong": False})
    answer = record_judgment_review(cur, {"game_id": game_id, "ply": 3, "verdict": "blunder"})
    with pytest.raises(ValueError):
        annotate_judgment_review(cur, {"id": answer["id"], "reason_tag": "devin", "note": "", "reason_wrong": False})
