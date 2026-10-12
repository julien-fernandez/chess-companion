"""Le rejeu compte juste ce qui est juste : un énoncé non décidé est à confirmer, jamais juste."""
from scripts.replay_utterances import tally


def test_un_enonce_non_decide_nest_ni_juste_ni_faux():
    truths = {1: "Bc4", 2: "e4", 3: "Nf3"}
    decisions = {1: "Bc4", 2: None, 3: "Nc3"}
    assert tally(truths, decisions) == {"justes": 1, "faux": 1, "a_confirmer": 1}


def test_un_corpus_vide_rend_des_zeros():
    assert tally({}, {}) == {"justes": 0, "faux": 0, "a_confirmer": 0}
