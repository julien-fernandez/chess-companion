"""Le lecteur du journal du navigateur ne garde que ses lignes, filtre, et résume les sessions."""
import json

from scripts.client_logs import events, render, sessions


def _line(session, level, msg, ts="2026-10-07T12:00:00.000Z", page="#revision", module="review", data=None):
    return json.dumps({"client": True, "session": session, "page": page, "ts": ts, "level": level,
                       "module": module, "msg": msg, "data": data}, ensure_ascii=False)


JOURNAL = [
    "127.0.0.1 - - [07/Oct/2026 12:00:00] \"GET /api/variations HTTP/1.1\" 200 -",
    _line("aaaa1111", "info", "variante", data={"id": 3}),
    "Traceback (most recent call last):",
    _line("aaaa1111", "error", "injoignable", ts="2026-10-07T12:00:05.000Z", module="api"),
    _line("bbbb2222", "warn", "refusé", page="", ts="2026-10-07T13:00:00.000Z", module="api"),
    '{"client": false}',
]


def test_seules_les_lignes_du_navigateur_sont_lues():
    assert [e["msg"] for e in events(JOURNAL)] == ["variante", "injoignable", "refusé"]


def test_filtres_par_session_niveau_et_module():
    assert [e["msg"] for e in events(JOURNAL, session="aaaa")] == ["variante", "injoignable"]
    assert [e["msg"] for e in events(JOURNAL, level="warn")] == ["injoignable", "refusé"]
    assert [e["msg"] for e in events(JOURNAL, module="api")] == ["injoignable", "refusé"]


def test_une_ligne_lisible_par_evenement():
    [first] = events(JOURNAL, session="aaaa", level="info")[:1]
    assert render(first) == '12:00:00 aaaa1111 #revision INFO  review   variante {"id": 3}'


def test_le_resume_des_sessions_compte_les_erreurs():
    assert sessions(events(JOURNAL)) == [
        {"session": "aaaa1111", "page": "#revision", "start": "12:00:00", "end": "12:00:05", "events": 2, "errors": 1},
        {"session": "bbbb2222", "page": "", "start": "13:00:00", "end": "13:00:00", "events": 1, "errors": 0},
    ]
