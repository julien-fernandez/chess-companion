"""Lit le journal du navigateur dans la sortie de journald (stdlib seule : tourne aussi sur la box).

ssh vps 'journalctl -u chess-review -o cat --since today' | python scripts/client_logs.py --sessions
ssh vps 'journalctl -u chess-review -o cat --since "1 hour ago"' | python scripts/client_logs.py --level warn
Heures en UTC (horodatage du navigateur).
"""
from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Iterable

LEVELS = ["info", "warn", "error"]


def events(lines: Iterable[str], session: str | None = None, level: str | None = None,
           module: str | None = None) -> list[dict]:
    """Les événements du navigateur, filtrés ; `level` garde ce niveau et les plus graves."""
    floor = LEVELS.index(level) if level else 0
    found = []
    for line in lines:
        if not line.startswith("{"):
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if event.get("client") is not True or event.get("level") not in LEVELS:
            continue
        if session and not event.get("session", "").startswith(session):
            continue
        if LEVELS.index(event["level"]) < floor or (module and event.get("module") != module):
            continue
        found.append(event)
    return found


def _clock(ts: str) -> str:
    return ts[11:19] if len(ts) >= 19 else ts


def render(event: dict) -> str:
    data = event.get("data")
    tail = "" if data is None else " " + (data if isinstance(data, str) else json.dumps(data, ensure_ascii=False))
    return (f"{_clock(event.get('ts', ''))} {event.get('session', '')[:8]} {event.get('page', '')} "
            f"{event['level'].upper():<5} {event.get('module', ''):<8} {event.get('msg', '')}{tail}")


def sessions(found: list[dict]) -> list[dict]:
    """Une ligne par session : page, début, fin, nombre d'événements et d'erreurs."""
    summary: dict[str, dict] = {}
    for event in found:
        key = event.get("session", "")[:8]
        row = summary.setdefault(key, {"session": key, "page": event.get("page", ""), "start": _clock(event["ts"]),
                                       "end": _clock(event["ts"]), "events": 0, "errors": 0})
        row["end"] = _clock(event["ts"])
        row["events"] += 1
        row["errors"] += event["level"] == "error"
    return list(summary.values())


def main() -> int:
    ap = argparse.ArgumentParser(description="Journal du navigateur, lu dans la sortie de journalctl (stdin).")
    ap.add_argument("--session", help="préfixe d'identifiant de session")
    ap.add_argument("--level", choices=LEVELS, help="ce niveau et les plus graves")
    ap.add_argument("--module", help="module exact (mic, review, jugement, partie, api, window, page…)")
    ap.add_argument("--sessions", action="store_true", help="résumé par session au lieu des événements")
    args = ap.parse_args()
    found = events(sys.stdin, args.session, args.level, args.module)
    if args.sessions:
        for row in sessions(found):
            print(f"{row['session']} {row['page'] or '(partie)':<10} {row['start']}–{row['end']} "
                  f"{row['events']} événements, {row['errors']} erreurs")
    else:
        for event in found:
            print(render(event))
    return 0


if __name__ == "__main__":
    sys.exit(main())
