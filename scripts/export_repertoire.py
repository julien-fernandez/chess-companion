"""Exporte le répertoire de la base vers export/repertoire.json, versionné pour ses diffs (ADR 0012)."""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import psycopg

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "export" / "repertoire.json"
DEFAULT_URL = "postgresql://postgres:local@localhost:55432/chess"

QUERY = """
SELECT c.slug, c.label, c.side::text, c.opening_prefix,
       v.id, v.ord, v.label, v.admission::text, v.source_locator,
       s.kind::text, s.title, s.author, s.url, s.elo_min, s.elo_max
FROM chapter c
JOIN variation v ON v.chapter_slug = c.slug
JOIN source s ON s.id = v.source_id
ORDER BY c.side, c.slug, v.ord
"""


def export(cur: psycopg.Cursor) -> dict:
    """Répertoire complet : chapitres, variantes, sources, coups et affirmations."""
    cur.execute("SELECT variation_id, array_agg(san ORDER BY ply) FROM variation_move GROUP BY 1")
    sans = dict(cur.fetchall())
    cur.execute(
        "SELECT variation_id, ply, nature::text, statement, verification::text, check_expression "
        "FROM claim ORDER BY variation_id, ply, id"
    )
    claims: dict[int, list[dict]] = {}
    for variation_id, ply, nature, statement, verification, expression in cur.fetchall():
        claims.setdefault(variation_id, []).append({
            "ply": ply, "nature": nature, "statement": statement,
            "verification": verification, "check_expression": expression,
        })
    chapters: dict[str, dict] = {}
    cur.execute(QUERY)
    for (slug, label, side, prefix, variation_id, ord_, v_label, admission, locator,
         kind, title, author, url, elo_min, elo_max) in cur.fetchall():
        chapter = chapters.setdefault(slug, {
            "slug": slug, "label": label, "side": side, "opening_prefix": prefix, "variations": [],
        })
        chapter["variations"].append({
            "ord": ord_, "label": v_label, "admission": admission, "source_locator": locator,
            "source": {"kind": kind, "title": title, "author": author, "url": url,
                       "elo_min": elo_min, "elo_max": elo_max},
            "sans": sans.get(variation_id, []),
            "claims": claims.get(variation_id, []),
        })
    cur.execute(
        "SELECT a.side::text, a.epd, a.reason, array_agg(DISTINCT rm.san ORDER BY rm.san) "
        "FROM intended_alternative a "
        "LEFT JOIN repertoire_move rm ON rm.chapter_side = a.side AND rm.from_epd = a.epd AND rm.role = 'own' "
        "GROUP BY 1, 2, 3 ORDER BY 1, 2"
    )
    alternatives = [{"side": side, "epd": epd, "reason": reason, "answers": answers}
                    for side, epd, reason, answers in cur.fetchall()]
    return {"chapters": list(chapters.values()), "intended_alternatives": alternatives}


def main() -> int:
    with psycopg.connect(os.environ.get("CHESS_DB_URL", DEFAULT_URL)) as conn, conn.cursor() as cur:
        payload = export(cur)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    n = sum(len(c["variations"]) for c in payload["chapters"])
    print(f"{OUT} — {len(payload['chapters'])} chapitres, {n} variantes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
