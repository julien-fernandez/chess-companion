"""Pilotage de l'apprentissage des ouvertures (ADR 0007, ADR 0008)."""
from __future__ import annotations

import io
import re
from dataclasses import dataclass
from pathlib import Path

import chess
import chess.pgn

from src.repertoire_graph import first_exit, repertoire_positions

ME = "jfernandezjlt"
ALIAS = (ME, "leer fernandez", "julien fernandez")

RACINE = Path(__file__).resolve().parent.parent
REPERTOIRE_DIR = RACINE / "data" / "repertoire"
PARTIES_DIR = RACINE / "data" / "games"
PILOTAGE_DIR = RACINE / "data" / "pilotage"
JOURNAL = PILOTAGE_DIR / "journal.md"

CHAPITRES: dict[str, tuple[str, str, str, tuple[str, ...]]] = {
    "francaise": ("blanc-vs-francaise.pgn", "Gambit de l'aile vs française", "white", ("e4", "e6")),
    "ecossais": ("blanc-gambit-ecossais.pgn", "Gambit écossais", "white", ("e4", "e5")),
    "londres": ("blanc-londres.pgn", "Système de Londres", "white", ("d4",)),
    "scandinave": ("noir-scandinave.pgn", "Scandinave", "black", ("e4",)),
    "vs-d4": ("noir-vs-d4.pgn", "vs 1.d4", "black", ("d4",)),
}

LIGNE_JOURNAL = re.compile(r"^(\d{4}-\d{2}-\d{2})\s+([A-Za-z0-9_-]+)\s+(\d{1,3})\s*%?$")
PREFIXES_MARKDOWN = ("#", ">", "|", "-", "*")


@dataclass(frozen=True)
class Session:
    """Une séance de drill déclarée à la main."""

    date: str
    chapitre: str
    pourcentage: int


@dataclass(frozen=True)
class Sortie:
    """Rapprochement d'une partie jouée avec le répertoire déclaré."""

    fichier: str
    n_partie: int
    couleur: str
    chapitre: str | None
    coup: int | None
    branche: str

    @property
    def libelle_chapitre(self) -> str:
        """Libellé du chapitre déclenché, ou « hors chapitre »."""
        return CHAPITRES[self.chapitre][1] if self.chapitre else "hors chapitre"


def positions_par_couleur(repertoires: dict[str, set[str]]) -> dict[str, set[str]]:
    """couleur → union des positions de tous ses chapitres (ADR 0008)."""
    union: dict[str, set[str]] = {"white": set(), "black": set()}
    for slug, (_f, _lib, couleur, _decl) in CHAPITRES.items():
        union[couleur] |= repertoires[slug]
    return union


def charger_repertoires() -> dict[str, set[str]]:
    """slug → EPD de chaque position du chapitre, par rejeu."""
    return {
        slug: repertoire_positions((REPERTOIRE_DIR / fichier).read_text(encoding="utf-8"))
        for slug, (fichier, _lib, _coul, _decl) in CHAPITRES.items()
    }


def detecter_couleur(game: chess.pgn.Game) -> str | None:
    """Couleur de Julien sous l'un de ses ALIAS, ou None si la partie n'est pas de lui."""
    blanc = (game.headers.get("White", "") or "").lower()
    noir = (game.headers.get("Black", "") or "").lower()
    if any(a in blanc for a in ALIAS):
        return "white"
    if any(a in noir for a in ALIAS):
        return "black"
    return None


def opening_moves(game: chess.pgn.Game, count: int = 2) -> list[str]:
    """SAN des `count` premiers demi-coups de la partie, moins si elle est plus courte."""
    board = game.board()
    sans: list[str] = []
    for move in game.mainline_moves():
        if len(sans) == count:
            break
        sans.append(board.san(move))
        board.push(move)
    return sans


def choisir_chapitre(couleur: str, opening: list[str]) -> str | None:
    """Chapitre de la couleur dont le préfixe d'ouverture est le plus long à correspondre."""
    matches = [
        (len(prefix), slug)
        for slug, (_f, _lib, color, prefix) in CHAPITRES.items()
        if color == couleur and tuple(opening[:len(prefix)]) == prefix
    ]
    return max(matches)[1] if matches else None


def en_francais(san: str) -> str:
    """SAN anglais → notation française, en préservant x, +, # et O-O."""
    sortie = san
    for anglais, francais in (("N", "C"), ("B", "F"), ("R", "T"), ("Q", "D"), ("K", "R")):
        sortie = sortie.replace(anglais, francais)
    return sortie


def branche_jusqua(game: chess.pgn.Game, epd_sortie: str | None) -> list[str]:
    """SAN joués jusqu'à la position de sortie incluse."""
    board = game.board()
    sans: list[str] = []
    for move in game.mainline_moves():
        sans.append(board.san(move))
        board.push(move)
        if epd_sortie and board.epd() == epd_sortie:
            break
    return sans


def analyser_partie(game: chess.pgn.Game, union: dict[str, set[str]],
                    fichier: str = "-", n: int = 1,
                    couleur_forcee: str | None = None) -> Sortie | str:
    """Rend une Sortie mesurée contre l'union de la couleur, ou la raison de l'écart (ADR 0008)."""
    couleur = couleur_forcee or detecter_couleur(game)
    if couleur is None:
        return (f"{fichier} #{n} : pas une partie de Julien "
                f"({game.headers.get('White', '?')} vs {game.headers.get('Black', '?')})")
    slug = choisir_chapitre(couleur, opening_moves(game))
    sortie = first_exit(str(game), union[couleur])
    if sortie is None:
        return Sortie(fichier, n, couleur, slug, None, "")
    coup, epd, _fen = sortie
    branche = " ".join(en_francais(s) for s in branche_jusqua(game, epd))
    return Sortie(fichier, n, couleur, slug, coup, branche)


def parse_journal(texte: str) -> tuple[list[Session], list[str]]:
    """Journal déclaré → (séances, lignes rejetées) — une ligne illisible ressort, ADR 0007."""
    seances: list[Session] = []
    rejets: list[str] = []
    for n, brute in enumerate(texte.splitlines(), start=1):
        ligne = brute.strip()
        if not ligne or ligne.startswith(PREFIXES_MARKDOWN):
            continue
        trouve = LIGNE_JOURNAL.match(ligne)
        if trouve is None:
            rejets.append(f"ligne {n} illisible : {ligne!r}")
            continue
        date, chapitre, pourcent = trouve.groups()
        if chapitre not in CHAPITRES:
            rejets.append(f"ligne {n} chapitre inconnu {chapitre!r} "
                          f"(attendus : {', '.join(CHAPITRES)})")
            continue
        valeur = int(pourcent)
        if valeur > 100:
            rejets.append(f"ligne {n} pourcentage hors bornes : {valeur}")
            continue
        seances.append(Session(date=date, chapitre=chapitre, pourcentage=valeur))
    return seances, rejets


def derniere_par_chapitre(seances: list[Session]) -> dict[str, Session]:
    """Séance la plus récente de chaque chapitre."""
    dernieres: dict[str, Session] = {}
    for s in seances:
        courante = dernieres.get(s.chapitre)
        if courante is None or s.date >= courante.date:
            dernieres[s.chapitre] = s
    return dernieres


def couverture(repertoires: dict[str, set[str]]) -> dict[str, tuple[int, int]]:
    """slug → (nombre de lignes déclarées, nombre de positions distinctes)."""
    resultat: dict[str, tuple[int, int]] = {}
    for slug, (fichier, _lib, _coul, _decl) in CHAPITRES.items():
        texte = (REPERTOIRE_DIR / fichier).read_text(encoding="utf-8")
        resultat[slug] = (texte.count("[Event "), len(repertoires[slug]))
    return resultat


def sorties(repertoires: dict[str, set[str]],
            dossier: Path | None = None) -> tuple[list[Sortie], list[str]]:
    """Rejoue les PGN du dossier contre le répertoire → (sorties, écarts dits un par un)."""
    dossier = dossier or PARTIES_DIR
    union = positions_par_couleur(repertoires)
    trouvees: list[Sortie] = []
    ecarts: list[str] = []
    if not dossier.is_dir():
        return trouvees, [f"dossier absent : {dossier}"]
    for chemin in sorted(dossier.glob("*.pgn")):
        src = io.StringIO(chemin.read_text(encoding="utf-8", errors="replace"))
        n = 0
        while True:
            game = chess.pgn.read_game(src)
            if game is None:
                break
            n += 1
            resultat = analyser_partie(game, union, chemin.name, n)
            if isinstance(resultat, str):
                ecarts.append(resultat)
            else:
                trouvees.append(resultat)
    return trouvees, ecarts


def moyenne_sortie(trouvees: list[Sortie], couleur: str) -> tuple[float | None, int, int]:
    """(moyenne des seules parties sorties, nb sorties, nb restées dans le répertoire)."""
    de_la_couleur = [s for s in trouvees if s.couleur == couleur]
    sorties_reelles = [s.coup for s in de_la_couleur if s.coup is not None]
    dedans = len(de_la_couleur) - len(sorties_reelles)
    if not sorties_reelles:
        return None, 0, dedans
    return sum(sorties_reelles) / len(sorties_reelles), len(sorties_reelles), dedans
