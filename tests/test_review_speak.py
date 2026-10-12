"""La voix serveur : une phrase se synthétise une fois, puis sort du cache ; une panne se dit, ne se tait pas."""
import pytest

from src.review_api import SpeakError, synthesize


class Engine:
    def __init__(self, audio=b"ID3mp3", fail=False):
        self.calls = []
        self.audio, self.fail = audio, fail

    def __call__(self, text, voice):
        self.calls.append((text, voice))
        if self.fail:
            raise OSError("edge injoignable")
        return self.audio


def test_une_phrase_se_synthetise_une_fois_puis_sort_du_cache(tmp_path):
    engine = Engine()
    assert synthesize({"text": "Pas compris."}, tmp_path, engine) == b"ID3mp3"
    assert synthesize({"text": "  Pas   compris. "}, tmp_path, engine) == b"ID3mp3"
    assert engine.calls == [("Pas compris.", "fr-FR-HenriNeural")]


def test_sans_dossier_de_cache_la_synthese_marche_quand_meme():
    engine = Engine()
    synthesize({"text": "Fou c 4 ?"}, None, engine)
    synthesize({"text": "Fou c 4 ?"}, None, engine)
    assert len(engine.calls) == 2


@pytest.mark.parametrize("payload", [{}, {"text": ""}, {"text": "   "}, {"text": 12}, {"text": "a" * 401}])
def test_un_texte_absent_ou_trop_long_est_refuse(tmp_path, payload):
    with pytest.raises(ValueError):
        synthesize(payload, tmp_path, Engine())


def test_une_panne_ou_un_audio_vide_leve_une_erreur_de_service_sans_cache(tmp_path):
    with pytest.raises(SpeakError):
        synthesize({"text": "Écarté."}, tmp_path, Engine(fail=True))
    with pytest.raises(SpeakError):
        synthesize({"text": "Écarté."}, tmp_path, Engine(audio=b""))
    assert list(tmp_path.iterdir()) == []
