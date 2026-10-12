"""Tableau de bord : mesuré, déclaré, écarté (ADR 0007). Run: uv run python scripts/pilotage.py"""
from __future__ import annotations

import argparse
import html
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.pilotage import (
    CHAPITRES,
    JOURNAL,
    PARTIES_DIR,
    PILOTAGE_DIR,
    REPERTOIRE_DIR,
    charger_repertoires,
    couverture,
    derniere_par_chapitre,
    moyenne_sortie,
    parse_journal,
    sorties,
)

CIBLE_SORTIE = 4.0

CSS = """
:root { color-scheme: light dark; }
body { font: 16px/1.55 -apple-system, "Segoe UI", system-ui, sans-serif;
       max-width: 52rem; margin: 2.5rem auto; padding: 0 1.2rem; }
h1 { font-size: 1.7rem; margin-bottom: .2rem; }
h2 { font-size: 1.15rem; margin-top: 2.2rem; border-bottom: 1px solid #8884; padding-bottom: .3rem; }
.sub { opacity: .65; font-size: .85rem; margin-top: 0; }
table { border-collapse: collapse; width: 100%; margin: .6rem 0 1rem; }
th, td { text-align: left; padding: .4rem .6rem; border-bottom: 1px solid #8883; }
th { font-weight: 600; font-size: .82rem; text-transform: uppercase; letter-spacing: .04em; opacity: .7; }
td.n { text-align: right; font-variant-numeric: tabular-nums; }
.tag { font-size: .7rem; padding: .1rem .45rem; border-radius: .7rem; border: 1px solid currentColor; }
.mesure { color: #1a7f37; }
.declare { color: #9a6700; }
.ok { color: #1a7f37; font-weight: 600; }
.ko { color: #b3261e; font-weight: 600; }
.warn { background: #f7e7c0; border-left: 4px solid #9a6700; padding: .7rem .9rem; margin: 1rem 0;
        border-radius: 0 .3rem .3rem 0; }
@media (prefers-color-scheme: dark) { .warn { background: #3a2f16; } }
ul.check { list-style: none; padding-left: 0; }
ul.check li::before { content: "☐ "; opacity: .6; }
code { font-size: .88em; background: #8882; padding: .1rem .3rem; border-radius: .2rem; }
.vide { opacity: .6; font-style: italic; }
"""


def _rows_sortie(trouvees) -> str:
    lignes = []
    for couleur, libelle in (("white", "Blancs"), ("black", "Noirs")):
        moyenne, n_sorties, n_dedans = moyenne_sortie(trouvees, couleur)
        if moyenne is None:
            valeur, classe = "—", ""
        else:
            classe = "ok" if moyenne > CIBLE_SORTIE else "ko"
            valeur = f"coup {moyenne:.1f}"
        lignes.append(
            f"<tr><td>{libelle}</td><td class='n'>{n_sorties + n_dedans}</td>"
            f"<td class='n'>{n_dedans}</td>"
            f"<td class='n {classe}'>{valeur}</td></tr>"
        )
    return "\n".join(lignes)


def _rows_couverture(couv) -> str:
    lignes = []
    for slug, (n_lignes, n_positions) in couv.items():
        libelle = CHAPITRES[slug][1]
        couleur = "Blancs" if CHAPITRES[slug][2] == "white" else "Noirs"
        lignes.append(
            f"<tr><td>{html.escape(libelle)}</td><td>{couleur}</td>"
            f"<td class='n'>{n_lignes}</td><td class='n'>{n_positions}</td></tr>"
        )
    return "\n".join(lignes)


def _rows_journal(dernieres, aujourdhui: date) -> str:
    if not dernieres:
        return ("<tr><td colspan='4' class='vide'>Aucune séance déclarée. "
                "Ajoute une ligne à data/pilotage/journal.md après ton premier drill.</td></tr>")
    lignes = []
    for slug in CHAPITRES:
        seance = dernieres.get(slug)
        libelle = html.escape(CHAPITRES[slug][1])
        if seance is None:
            lignes.append(f"<tr><td>{libelle}</td><td class='vide'>jamais drillé</td>"
                          f"<td class='n'>—</td><td class='n'>—</td></tr>")
            continue
        jours = (aujourdhui - date.fromisoformat(seance.date)).days
        lignes.append(
            f"<tr><td>{libelle}</td><td>{seance.date}</td>"
            f"<td class='n'>{jours} j</td><td class='n'>{seance.pourcentage} %</td></tr>"
        )
    return "\n".join(lignes)


def _liste(items: list[str], vide: str) -> str:
    if not items:
        return f"<p class='vide'>{html.escape(vide)}</p>"
    puces = "\n".join(f"<li>{html.escape(x)}</li>" for x in items)
    return f"<ul>{puces}</ul>"


def _branches(trouvees) -> str:
    a_ajouter = [s for s in trouvees if s.coup is not None]
    if not a_ajouter:
        return "<p class='vide'>Aucune sortie de répertoire mesurée.</p>"
    a_ajouter.sort(key=lambda s: s.coup)
    lignes = "\n".join(
        f"<tr><td class='n'>{s.coup}</td><td>{html.escape(s.libelle_chapitre)}</td>"
        f"<td><code>{html.escape(s.branche)}</code></td></tr>"
        for s in a_ajouter[:15]
    )
    reste = "" if len(a_ajouter) <= 15 else f"<p class='vide'>… et {len(a_ajouter) - 15} autres.</p>"
    return (f"<table><tr><th>Coup</th><th>Chapitre</th><th>Branche jouée (notation française)</th></tr>"
            f"{lignes}</table>{reste}")


def rendre(trouvees, ecarts, couv, seances, rejets, aujourdhui: date) -> str:
    dernieres = derniere_par_chapitre(seances)
    return f"""<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pilotage — ouvertures</title><style>{CSS}</style></head><body>

<h1>Pilotage de l'apprentissage des ouvertures</h1>
<p class="sub">Snapshot du {aujourdhui.isoformat()} · {len(trouvees)} parties retenues ·
{len(seances)} séances déclarées</p>

<div class="warn">
<strong>La règle qui tient le dispositif.</strong> Une carte de révision est une position (EPD)
et le coup attendu : ajouter une branche ne remet aucune progression à zéro (ADR 0011).
Tant que la révision vocale n'existe pas, le drill reste <strong>déclaré</strong> ci-dessous.
</div>

<h2>Coup de sortie de préparation <span class="tag mesure">mesuré</span></h2>
<p class="sub">Rejoué depuis <code>data/games/*.pgn</code> contre le répertoire, indexé par EPD.
La moyenne ne porte que sur les parties qui SONT sorties. Cible : au-dessus du coup {CIBLE_SORTIE:.0f}.</p>
<table>
<tr><th>Couleur</th><th>Parties</th><th>Restées dedans</th><th>Sortie moyenne</th></tr>
{_rows_sortie(trouvees)}
</table>

<h2>Couverture du répertoire <span class="tag mesure">mesuré</span></h2>
<table>
<tr><th>Chapitre</th><th>Couleur</th><th>Lignes</th><th>Positions (EPD)</th></tr>
{_rows_couverture(couv)}
</table>

<h2>Drill <span class="tag declare">déclaré</span></h2>
<p class="sub">Lu dans <code>data/pilotage/journal.md</code>, écrit à la main, en attendant la
révision vocale dont les rappels seront mesurés en base. Ce chiffre est auto-déclaré, et
falsifiable.</p>
<table>
<tr><th>Chapitre</th><th>Dernière séance</th><th>Il y a</th><th>Progression</th></tr>
{_rows_journal(dernieres, aujourdhui)}
</table>

<h2>Branches à verser au répertoire <span class="tag mesure">mesuré</span></h2>
{_branches(trouvees)}

<h2>Le rituel</h2>
<ul class="check">
<li>Driller 10 min, puis noter <code>DATE CHAPITRE %</code> dans le journal</li>
<li>Après chaque partie : <code>uv run python scripts/analyze_opening.py &lt;partie.pgn&gt;</code></li>
<li>Verser la branche rendue en base, puis <code>uv run python scripts/export_repertoire.py</code></li>
<li>Régénérer ce tableau : <code>uv run python scripts/pilotage.py</code></li>
</ul>

<h2>Écarté du calcul</h2>
<p class="sub">Tout ce qui n'est pas entré dans les chiffres ci-dessus. Un échantillon
inconnu rendrait la moyenne sans valeur.</p>
<h3>Parties écartées ({len(ecarts)})</h3>
{_liste(ecarts[:25], "Aucune.")}
<h3>Lignes de journal rejetées ({len(rejets)})</h3>
{_liste(rejets, "Aucune.")}

</body></html>
"""


def main() -> None:
    ap = argparse.ArgumentParser(description="Génère le tableau de bord de pilotage des ouvertures.")
    ap.add_argument("--out", type=Path, default=PILOTAGE_DIR / "tableau-de-bord.html")
    ap.add_argument("--games", type=Path, default=PARTIES_DIR)
    ap.add_argument("--journal", type=Path, default=JOURNAL)
    args = ap.parse_args()

    manquants = [f for f, *_ in CHAPITRES.values() if not (REPERTOIRE_DIR / f).is_file()]
    if manquants:
        print(f"Répertoire absent : {', '.join(manquants)}\n"
              f"Lance d'abord : uv run python scripts/build_repertoire.py", file=sys.stderr)
        raise SystemExit(1)

    reps = charger_repertoires()
    couv = couverture(reps)
    trouvees, ecarts = sorties(reps, args.games)
    texte = args.journal.read_text(encoding="utf-8") if args.journal.is_file() else ""
    seances, rejets = parse_journal(texte)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(rendre(trouvees, ecarts, couv, seances, rejets, date.today()), encoding="utf-8")

    for couleur, libelle in (("white", "Blancs"), ("black", "Noirs")):
        moyenne, n_sorties, n_dedans = moyenne_sortie(trouvees, couleur)
        chiffre = "—" if moyenne is None else f"coup {moyenne:.1f}"
        print(f"{libelle:7s} {n_sorties + n_dedans:3d} parties · {n_dedans} dans le répertoire · sortie {chiffre}")
    print(f"{len(seances)} séances déclarées · {len(rejets)} lignes rejetées · {len(ecarts)} parties écartées")
    print(f"→ {args.out}")


if __name__ == "__main__":
    main()
