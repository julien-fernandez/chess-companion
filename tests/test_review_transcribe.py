"""La reconnaissance côté serveur : l'audio part à Whisper (Groq) avec le vocabulaire des coups, jamais le coup attendu."""
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from src.review_api import TranscribeError, transcribe_audio

AUDIO = {"audio": "YWJj", "mime": "audio/webm;codecs=opus"}


class FakeWhisper(BaseHTTPRequestHandler):
    mode = "ok"
    received: dict = {}

    def do_POST(self):
        body = self.rfile.read(int(self.headers["Content-Length"]))
        FakeWhisper.received = {"path": self.path, "auth": self.headers.get("Authorization"),
                                "agent": self.headers.get("User-Agent"),
                                "type": self.headers.get("Content-Type"), "body": body}
        if self.mode == "error":
            self.send_response(401)
            self.end_headers()
            return
        data = json.dumps({"text": " Cavalier F3. "}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass


@pytest.fixture
def whisper():
    server = ThreadingHTTPServer(("127.0.0.1", 0), FakeWhisper)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()
    FakeWhisper.mode = "ok"


def test_laudio_part_a_whisper_en_francais_avec_le_vocabulaire_des_coups(whisper):
    r = transcribe_audio(AUDIO, whisper, "clé", 2.0)
    assert r["transcripts"] == ["Cavalier F3."]
    assert r["latency_ms"] >= 0
    sent = FakeWhisper.received
    assert sent["path"] == "/audio/transcriptions"
    assert sent["auth"] == "Bearer clé"
    assert sent["type"].startswith("multipart/form-data; boundary=")
    body = sent["body"]
    assert b'name="model"\r\n\r\nwhisper-large-v3-turbo' in body
    assert b'name="language"\r\n\r\nfr' in body
    assert b'filename="enonce.webm"' in body and b"\r\n\r\nabc\r\n" in body
    assert "cavalier".encode() in body and "roque".encode() in body


def test_la_requete_ne_se_presente_pas_comme_urllib(whisper):
    # Cloudflare, devant Groq, refuse « Python-urllib » en 403 (erreur 1010) : vu au premier vrai appel.
    transcribe_audio(AUDIO, whisper, "clé", 2.0)
    assert not FakeWhisper.received["agent"].startswith("Python-urllib")


def test_le_coup_attendu_nentre_jamais_dans_la_requete(whisper):
    transcribe_audio({**AUDIO, "expected": "Nf3", "san": "Nf3"}, whisper, "clé", 2.0)
    assert b"Nf3" not in FakeWhisper.received["body"]


def test_un_audio_de_safari_garde_son_extension(whisper):
    transcribe_audio({"audio": "YWJj", "mime": "audio/mp4"}, whisper, "clé", 2.0)
    assert b'filename="enonce.mp4"' in FakeWhisper.received["body"]


@pytest.mark.parametrize("payload", [{}, {"audio": ""}, {"audio": "pas du base64 !"}, {"audio": "A" * 500_000}])
def test_un_audio_absent_illisible_ou_trop_long_est_refuse(payload):
    with pytest.raises(ValueError):
        transcribe_audio(payload, "http://127.0.0.1:9", "clé", 0.5)


def test_whisper_en_erreur_ou_injoignable_leve_une_erreur_de_service(whisper):
    FakeWhisper.mode = "error"
    with pytest.raises(TranscribeError):
        transcribe_audio(AUDIO, whisper, "clé", 2.0)
    with pytest.raises(TranscribeError):
        transcribe_audio(AUDIO, "http://127.0.0.1:9", "clé", 0.5)


def test_sans_cle_la_reconnaissance_serveur_est_absente():
    with pytest.raises(TranscribeError):
        transcribe_audio(AUDIO, "http://127.0.0.1:9", None, 0.5)
