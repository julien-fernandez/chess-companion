"""Le décideur distant ne tranche que sur une réponse lisible, dans la liste, et à temps ; l'audio s'écrit à part."""
import json
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from src.review_api import decider_request, resolve_move, save_audio


def test_laudio_dun_enonce_secrit_par_mois(tmp_path):
    when = datetime(2026, 9, 30, 20, 0, tzinfo=timezone.utc)
    assert save_audio(tmp_path, 12, "YWJj", when) == "2026-09/12.webm"
    assert (tmp_path / "2026-09/12.webm").read_bytes() == b"abc"


def test_un_audio_illisible_ou_trop_long_est_refuse(tmp_path):
    when = datetime(2026, 9, 30, tzinfo=timezone.utc)
    with pytest.raises(ValueError):
        save_audio(tmp_path, 1, "pas du base64 !", when)
    with pytest.raises(ValueError):
        save_audio(tmp_path, 1, "", when)


PAYLOAD = {
    "transcripts": ["phoque c4", "fou c'est quatre"],
    "options": [{"san": "Bc4", "spoken": "fou c 4"}, {"san": "c4", "spoken": "c 4"}],
    "phonetic": [{"san": "Bc4", "score": 0.78}, {"san": "c4", "score": 0.7}],
}


class FakeDecider(BaseHTTPRequestHandler):
    mode = "ok"
    received: dict = {}

    def do_POST(self):
        FakeDecider.received = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        if self.mode == "slow":
            time.sleep(0.5)
        if self.mode == "error":
            self.send_response(500)
            self.end_headers()
            return
        choice = {"off-list": "Qh5", "none-of-these": "none"}.get(self.mode, "Bc4")
        confidence = 1.5 if self.mode == "overconfident" else 0.9
        body = json.dumps({"answers": {"move": {"choice": choice, "probabilities": {choice: confidence},
                                                "confidence": confidence}}}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


@pytest.fixture
def decider():
    server = ThreadingHTTPServer(("127.0.0.1", 0), FakeDecider)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()
    FakeDecider.mode = "ok"


def test_le_decideur_recoit_les_coups_en_francais_et_tranche(decider):
    r = resolve_move(PAYLOAD, decider, None, "laya", 1.0)
    assert (r["san"], r["confidence"], r["decider"]) == ("Bc4", 0.9, "laya")
    question = FakeDecider.received["questions"]["move"]
    assert question["type"] == "choice"
    assert question["criteria"] == {"Bc4": "fou c 4", "c4": "c 4", "none": "aucun de ces coups, autre chose"}
    assert FakeDecider.received["state"]["classement_phonetique"] == ["fou c 4 (0.78)", "c 4 (0.70)"]


def test_laya_repond_avec_son_modele_multilingue_et_jev_avec_le_sien(decider):
    resolve_move(PAYLOAD, decider, None, "laya", 1.0)
    assert FakeDecider.received["model"] == "multilingual"
    resolve_move(PAYLOAD, decider, "clé", "jev", 1.0)
    assert "model" not in FakeDecider.received


@pytest.mark.parametrize("mode", ["slow", "error", "off-list", "none-of-these", "overconfident"])
def test_un_decideur_lent_en_erreur_ou_hors_liste_ne_tranche_pas(decider, mode):
    FakeDecider.mode = mode
    r = resolve_move(PAYLOAD, decider, None, "laya", 0.2)
    assert (r["san"], r["decider"]) == (None, "none")


def test_un_decideur_injoignable_ne_tranche_pas():
    r = resolve_move(PAYLOAD, "http://127.0.0.1:9", None, "laya", 0.5)
    assert (r["san"], r["decider"]) == (None, "none")


def test_une_requete_sans_coups_est_refusee():
    with pytest.raises(ValueError):
        decider_request({**PAYLOAD, "options": []})
    with pytest.raises(ValueError):
        decider_request({**PAYLOAD, "transcripts": "phoque c4"})
