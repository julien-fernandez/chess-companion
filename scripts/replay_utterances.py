"""Rejoue les énoncés confirmés : étage 1 seul, puis étage 1 + décideur ; justesse, confirmations, latence.

La vérité de référence est le coup confirmé par Julien (confirmed = true) ; les énoncés tapés sont
exclus (le parseur exact y répond seul). Un énoncé sans vérité n'entre pas dans le calcul.
"""
import argparse
import json
import os
import pathlib
import statistics
import subprocess
import sys

import psycopg

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src.review_api import resolve_move  # noqa: E402
DEFAULT_URL = "postgresql://postgres:local@localhost:55432/chess"
SQL = """SELECT id, epd, transcripts, decided_san FROM utterance
         WHERE confirmed IS TRUE AND decided_san IS NOT NULL AND decider <> 'typed' ORDER BY id"""


def tally(truths: dict[int, str], decisions: dict[int, str | None]) -> dict[str, int]:
    """Justes, faux, et à confirmer (rien de décidé) sur les énoncés qui ont une vérité."""
    counts = {"justes": 0, "faux": 0, "a_confirmer": 0}
    for uid, truth in truths.items():
        decided = decisions.get(uid)
        key = "a_confirmer" if decided is None else "justes" if decided == truth else "faux"
        counts[key] += 1
    return counts


def phonetic_stage(rows: list[dict]) -> list[dict]:
    """Lance l'étage 1 (JS) sur les énoncés, par web/scripts/phonetic-cli.mjs."""
    done = subprocess.run(["node", "scripts/phonetic-cli.mjs"], cwd=ROOT / "web", check=True,
                          input=json.dumps(rows), capture_output=True, text=True, encoding="utf-8")
    return json.loads(done.stdout)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--decider", help="URL du décideur (/v1/systemone), ex. http://127.0.0.1:8111")
    parser.add_argument("--name", default="laya")
    parser.add_argument("--key", default=None)
    parser.add_argument("--timeout", type=float, default=5.0)
    parser.add_argument("--min-confidence", type=float, default=0.7,
                        help="même valeur que DECIDER_MIN_CONFIDENCE dans resolve-move.js")
    args = parser.parse_args()

    with psycopg.connect(os.environ.get("CHESS_DB_URL", DEFAULT_URL)) as conn, conn.cursor() as cur:
        cur.execute(SQL)
        rows = [{"id": i, "epd": e, "transcripts": t, "truth": s} for i, e, t, s in cur.fetchall()]
    truths = {r["id"]: r["truth"] for r in rows}
    print(f"énoncés confirmés : {len(rows)}")
    if not rows:
        return 0

    stage1 = phonetic_stage([{k: r[k] for k in ("id", "epd", "transcripts")} for r in rows])
    decisions = {s["id"]: s["decided"] for s in stage1}
    print("étage 1 seul       :", tally(truths, decisions))

    if args.decider:
        latencies = []
        for s in stage1:
            if s["decided"] is None:
                answer = resolve_move(s["request"], args.decider, args.key, args.name, args.timeout)
                latencies.append(answer["latency_ms"])
                if answer["san"] and answer["confidence"] >= args.min_confidence:
                    decisions[s["id"]] = answer["san"]
        median = statistics.median(latencies) if latencies else 0
        print(f"étage 1 + {args.name:8} :", tally(truths, decisions), f"latence médiane {median} ms")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
