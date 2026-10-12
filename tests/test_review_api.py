"""L'API de révision rend les variantes avec toutes les réponses admises, et refuse un mauvais mot de passe."""
import os

import psycopg
import pytest

from src.review_api import Handler, hash_password, list_variations, password_matches, record_review, record_utterance

LOCAL_URL = os.environ.get("CHESS_DB_URL", "postgresql://postgres:local@localhost:55432/chess")


def test_une_empreinte_accepte_son_mot_de_passe_et_lui_seul():
    record = hash_password("cavalier-f3")
    assert password_matches("cavalier-f3", record)
    assert not password_matches("cavalier-f6", record)
    assert not password_matches("cavalier-f3", "pas-une-empreinte")


def test_le_journal_ne_garde_jamais_la_cle_du_lien(capsys):
    handler = Handler.__new__(Handler)
    handler.client_address = ("127.0.0.1", 0)
    handler.requestline = "GET /api/login?key=s3cr3t-Ab_9&x=1 HTTP/1.1"
    handler.log_request(302)
    handler.log_error("code %d, message %s", 400, "Bad request syntax ('GET /api/login?key=s3cr3t-Ab_9')")
    logged = capsys.readouterr().err
    assert "s3cr3t" not in logged
    assert logged.count("key=<masqué>") == 2
    assert "&x=1" in logged


@pytest.fixture
def cur():
    try:
        conn = psycopg.connect(LOCAL_URL, connect_timeout=2)
    except psycopg.OperationalError as exc:
        pytest.skip(f"base locale injoignable : {exc}")
    with conn, conn.cursor() as cursor:
        yield cursor
        conn.rollback()


def test_chaque_coup_de_julien_porte_ses_reponses_admises(cur):
    variations = list_variations(cur)
    assert len(variations) == 40
    london = next(v for v in variations if v["chapter"] == "londres"
                  and [m["san"] for m in v["moves"][:5]] == ["d4", "d5", "Bf4", "Nc6", "Nf3"])
    third = london["moves"][4]
    assert third["own"] and third["answers"] == ["Nf3", "e3"]
    assert not london["moves"][3]["own"] and "answers" not in london["moves"][3]
    assert all(m["san"] in m["answers"] for v in variations for m in v["moves"] if m["own"])


def test_un_rappel_sur_une_carte_inconnue_est_refuse(cur):
    with pytest.raises(ValueError):
        record_review(cur, {"epd": "8/8/8/8/8/8/8/8 w - -", "san": "e4", "outcome": "recalled"})
    with pytest.raises(ValueError):
        record_review(cur, {"epd": "x", "san": "e4", "outcome": "sans-doute"})


START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -"


def test_un_enonce_est_trace_et_relie_a_son_rappel(cur, tmp_path):
    uid = record_utterance(cur, {
        "epd": START, "expected_san": "e4", "transcripts": ["e quatre", "e 4"],
        "phonetic_san": "e4", "phonetic_margin": 0.17, "decider": "phonetic", "decided_san": "e4",
        "confidence": 1, "confirmed": None, "latency_ms": 3, "audio": "YWJj",
    }, tmp_path)
    cur.execute("SELECT transcripts, decider::text, audio_file FROM utterance WHERE id = %s", (uid,))
    transcripts, decider, audio_file = cur.fetchone()
    assert (transcripts, decider) == (["e quatre", "e 4"], "phonetic")
    assert (tmp_path / audio_file).read_bytes() == b"abc"
    cur.execute("SELECT epd, san FROM card LIMIT 1")
    epd, san = cur.fetchone()
    rid = record_review(cur, {"epd": epd, "san": san, "outcome": "recalled", "utterance_id": uid})
    cur.execute("SELECT review_id FROM utterance WHERE id = %s", (uid,))
    assert cur.fetchone()[0] == rid


def test_un_enonce_mal_forme_est_refuse(cur):
    with pytest.raises(ValueError):
        record_utterance(cur, {"epd": START, "expected_san": "e4", "transcripts": [], "decider": "devin"}, None)
    with pytest.raises(ValueError):
        record_utterance(cur, {"epd": START, "expected_san": "e4", "transcripts": "e4", "decider": "typed"}, None)
    with pytest.raises(ValueError):
        record_utterance(cur, {"epd": START, "expected_san": "e4", "transcripts": [], "decider": "typed",
                               "confidence": "haute"}, None)
    for bad in ({"confidence": 2}, {"confidence": float("nan")}, {"phonetic_margin": -0.5},
                {"latency_ms": 2 ** 40}):
        with pytest.raises(ValueError):
            record_utterance(cur, {"epd": START, "expected_san": "e4", "transcripts": [], "decider": "typed",
                                   **bad}, None)


def test_un_enonce_sur_une_position_inconnue_est_refuse_sans_planter(cur):
    with pytest.raises(ValueError):
        record_utterance(cur, {"epd": "8/8/8/8/8/8/8/8 w - -", "expected_san": "e4", "transcripts": [],
                               "decider": "typed"}, None)


def test_un_audio_illisible_ne_fait_pas_perdre_la_trace(cur, tmp_path):
    uid = record_utterance(cur, {"epd": START, "expected_san": "e4", "transcripts": ["fouad"],
                                 "decider": "none", "audio": "pas du base64 !"}, tmp_path)
    cur.execute("SELECT audio_file FROM utterance WHERE id = %s", (uid,))
    assert cur.fetchone()[0] is None
