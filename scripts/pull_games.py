"""Tire les parties chess.com de Julien vers data/games/ via chrome-relay."""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.pilotage import ME, PARTIES_DIR

ARCHIVES = f"https://api.chess.com/pub/player/{ME}/games/archives"
DELAI_MS = "60000"


def _chrome_relay(args: list[str]) -> str:
    """Lance chrome-relay par son chemin résolu, et lève sur code retour non nul."""
    binaire = shutil.which("chrome-relay")
    if binaire is None:
        raise SystemExit("chrome-relay introuvable dans le PATH. Installe-le : npm i -g chrome-relay")
    fini = subprocess.run([binaire, *args], capture_output=True, text=True, encoding="utf-8")
    if fini.returncode != 0:
        raise SystemExit(f"chrome-relay a échoué (rc={fini.returncode}) :\n{fini.stderr.strip()}")
    return fini.stdout


def _onglet_chesscom() -> str:
    """Premier onglet chess.com ouvert, sans lequel Cloudflare bloque le tirage."""
    brut = _chrome_relay(["tabs"])
    debut = brut.find("{")
    if debut < 0:
        raise SystemExit("Sortie de `chrome-relay tabs` illisible.")
    data = json.loads(brut[debut:])
    for fenetre in data.get("windows", []):
        for onglet in fenetre.get("tabs", []):
            if "chess.com" in (onglet.get("url") or ""):
                return str(onglet["tabId"])
    raise SystemExit("Aucun onglet chess.com ouvert. Ouvre chess.com dans le navigateur, "
                     "puis relance — Cloudflare bloque tout autre chemin.")


def _evaluer(tab: str, js: str):
    """Évalue du JS dans l'onglet et rend le `result`, ou lève si la page n'en rend aucun."""
    brut = _chrome_relay(["js", "-t", tab, "--timeout-ms", DELAI_MS, js])
    debut = brut.find("{")
    if debut < 0:
        raise SystemExit(f"Sortie de `chrome-relay js` illisible :\n{brut}")
    charge = json.loads(brut[debut:])
    if "result" not in charge:
        raise SystemExit(f"Pas de résultat rendu par la page :\n{json.dumps(charge, indent=2)[:600]}")
    return charge["result"]


def main() -> None:
    ap = argparse.ArgumentParser(description="Tire les parties chess.com vers data/games/.")
    ap.add_argument("--months", type=int, default=3, help="nombre de mois récents à tirer")
    ap.add_argument("--tab", help="tabId d'un onglet chess.com (auto-détecté sinon)")
    ap.add_argument("--out", type=Path, default=PARTIES_DIR)
    args = ap.parse_args()

    tab = args.tab or _onglet_chesscom()
    urls = _evaluer(tab, f"const r = await fetch({ARCHIVES!r}); return await r.json();")
    archives = urls.get("archives") if isinstance(urls, dict) else None
    if not archives:
        raise SystemExit(f"Aucune archive rendue pour {ME}. Réponse : {str(urls)[:300]}")

    args.out.mkdir(parents=True, exist_ok=True)
    recents = archives[-args.months:]
    print(f"{len(archives)} mois disponibles, {len(recents)} tirés.")

    total = 0
    for url in recents:
        annee, mois = url.rstrip("/").split("/")[-2:]
        js = (f"const r = await fetch({url!r}); const j = await r.json(); "
              f"const out = []; for (const g of j.games) {{ out.push(g.pgn); }} "
              f"return out.join('\\n\\n');")
        pgn = _evaluer(tab, js)
        if not isinstance(pgn, str) or "[Event " not in pgn:
            print(f"  {annee}-{mois} : réponse sans PGN, fichier NON écrit "
                  f"({str(pgn)[:120]!r})", file=sys.stderr)
            continue
        cible = args.out / f"chesscom-{annee}-{mois}.pgn"
        cible.write_text(pgn, encoding="utf-8")
        n = pgn.count("[Event ")
        total += n
        print(f"  {annee}-{mois} : {n:3d} parties → {cible.name}")

    if total == 0:
        raise SystemExit("Aucune partie tirée — rien n'a été écrit.")
    print(f"{total} parties au total. Enchaîne : uv run python scripts/pilotage.py")


if __name__ == "__main__":
    main()
