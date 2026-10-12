"""Le coup de sortie d'une partie en cours ne se donne jamais : ce serait de l'aide pendant qu'elle se joue."""
import pytest

import scripts.analyze_opening as analyze_opening

PGN = """[Event "Essai"]
[White "Jfernandezjlt"]
[Black "Adversaire"]
[Result "{result}"]

1. e4 e5 2. Nf3 Nc6 {result}

"""


@pytest.fixture
def no_repertoire(monkeypatch):
    """Le répertoire est généré et gitignoré : la garde se teste sans lui."""
    monkeypatch.setattr(analyze_opening, "charger_repertoires", lambda: {})
    monkeypatch.setattr(analyze_opening, "positions_par_couleur", lambda _: {"white": set(), "black": set()})
    calls = []
    monkeypatch.setattr(analyze_opening, "analyser_partie", lambda *a, **k: calls.append(a) or "écartée")
    return calls


def test_une_partie_en_cours_est_ecartee_sans_analyse(no_repertoire, capsys):
    analyze_opening.analyze(PGN.format(result="*"))
    assert no_repertoire == []
    assert "en cours" in capsys.readouterr().out


def test_seule_la_partie_finie_est_analysee(no_repertoire, capsys):
    analyze_opening.analyze(PGN.format(result="*") + PGN.format(result="1-0"))
    assert len(no_repertoire) == 1
    assert "Partie 1 écartée — en cours" in capsys.readouterr().out
