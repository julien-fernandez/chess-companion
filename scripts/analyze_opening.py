"""Coup de sortie + branche à ajouter (ADR 0008). Usage: analyze_opening.py <x.pgn|-> [--as white|black]"""
from __future__ import annotations

import argparse
import io
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import chess.pgn

from src.games import is_finished
from src.pilotage import analyser_partie, charger_repertoires, positions_par_couleur


def analyze(pgn_text: str, force_color: str | None = None) -> None:
    union = positions_par_couleur(charger_repertoires())
    src = io.StringIO(pgn_text)
    n = 0
    while True:
        game = chess.pgn.read_game(src)
        if game is None:
            break
        n += 1
        if not is_finished(game):
            print(f"### Partie {n} écartée — en cours (Result « {game.headers.get('Result', '*')} ») : "
                  "on n'analyse qu'une partie finie.")
            continue
        resultat = analyser_partie(game, union, "-", n, couleur_forcee=force_color)
        if isinstance(resultat, str):
            print(f"### Partie {n} écartée — {resultat}")
            print("    (passe --as white|black si c'est bien ta partie)")
            continue
        camp = "Blancs" if resultat.couleur == "white" else "Noirs"
        side = f"{camp} · {resultat.libelle_chapitre}"
        if resultat.coup is None:
            print(f"### Partie {n} — {side} : DANS le répertoire (aucune sortie).")
            continue
        print(f"### Partie {n} — {side}")
        print(f"    Sortie au coup {resultat.coup}. Branche à ajouter au répertoire :")
        print(f"    {resultat.branche}")
        print()


def main() -> None:
    ap = argparse.ArgumentParser(description="Analyse une partie vs le répertoire d'ouvertures.")
    ap.add_argument("pgn", help="fichier PGN (ou '-' pour stdin)")
    ap.add_argument("--as", choices=["white", "black"], help="force la couleur de Julien")
    args = ap.parse_args()
    pgn_text = sys.stdin.read() if args.pgn == "-" else Path(args.pgn).read_text(encoding="utf-8")
    analyze(pgn_text, force_color=getattr(args, "as"))


if __name__ == "__main__":
    main()
