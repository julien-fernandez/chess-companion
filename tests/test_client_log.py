"""Le journal du navigateur arrive dans journald, une ligne JSON par événement, bornée et sans secret."""
import json
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

import pytest

from src.review_api import COOKIE, MAX_LOG_ENTRIES, Handler, client_log_lines, session_token


@pytest.fixture
def api():
    Handler.secret = "secret-de-test"
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()


def _post(url, body, cookie=None):
    request = urllib.request.Request(url + "/api/log", data=json.dumps(body).encode(), method="POST",
                                     headers={"Content-Type": "application/json"})
    if cookie:
        request.add_header("Cookie", f"{COOKIE}={cookie}")
    try:
        return urllib.request.urlopen(request).status
    except urllib.error.HTTPError as exc:
        return exc.code


def test_la_route_ecrit_dans_journald_seulement_pour_une_session_connectee(api, capfd):
    assert _post(api, _batch()) == 401
    assert _post(api, _batch(), cookie=session_token("secret-de-test")) == 204
    logged = [line for line in capfd.readouterr().err.splitlines() if line.startswith("{")]
    assert [json.loads(line)["msg"] for line in logged] == ["décision"]


def _batch(**over):
    entry = {"ts": "2026-10-07T12:00:00Z", "level": "info", "module": "mic", "msg": "décision",
             "data": {"transcripts": ["fou c4"]}}
    return {"session": "s-1", "page": "#revision", "entries": [{**entry, **over}]}


def test_un_evenement_devient_une_ligne_json_marquee_client():
    [line] = client_log_lines(_batch())
    event = json.loads(line)
    assert event == {"client": True, "session": "s-1", "page": "#revision", "ts": "2026-10-07T12:00:00Z",
                     "level": "info", "module": "mic", "msg": "décision", "data": {"transcripts": ["fou c4"]}}


def test_le_debug_ne_part_pas_et_un_niveau_inconnu_est_refuse():
    assert client_log_lines(_batch(level="debug")) == []
    with pytest.raises(ValueError):
        client_log_lines(_batch(level="fatal"))


def test_la_cle_du_lien_est_masquee_meme_dans_les_donnees():
    [line] = client_log_lines(_batch(data={"url": "/api/login?key=s3cr3t-Ab_9"}))
    assert "s3cr3t" not in line and "key=<masqué>" in line


def test_un_lot_est_borne():
    batch = _batch()
    batch["entries"] = batch["entries"] * (MAX_LOG_ENTRIES + 1)
    with pytest.raises(ValueError):
        client_log_lines(batch)


def test_des_donnees_trop_longues_sont_tronquees_pas_refusees():
    [line] = client_log_lines(_batch(data={"stack": "x" * 10_000}))
    event = json.loads(line)
    assert len(event["data"]) <= 2_000 and event["data"].endswith("…")


def test_un_lot_mal_forme_est_refuse():
    for bad in ({}, {"session": "s", "page": "", "entries": "x"}, {"session": "s", "page": "", "entries": [1]}):
        with pytest.raises(ValueError):
            client_log_lines(bad)
