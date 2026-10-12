"""Génère les PGN du répertoire par rejeu (ADR 0009). Run: uv run python scripts/build_repertoire.py"""
from __future__ import annotations

import sys
import chess
import chess.pgn
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

REPERTOIRE_DIR = Path(__file__).parent.parent / "data" / "repertoire"

BLANC = [
    "blanc-gambit-ecossais.pgn",
    "Gambit écossais (Blancs) — d'après Julien Song, YouTube LEb3n5ZVJew",
    [
        ("4...Fc5 (23% des adversaires) : le piège 6.Fxf7+ 7.Dd5+", [
            "e4", "e5", "Nf3", "Nc6", "d4", "exd4", "Bc4", "Bc5",
            "c3", "dxc3", "Bxf7+", "Kxf7", "Qd5+", "Kf8", "Qxc5+",
        ]),
        ("4...h6 (20% des adversaires) : reprendre simplement le pion", [
            "e4", "e5", "Nf3", "Nc6", "d4", "exd4", "Bc4", "h6",
            "Nxd4", "Nxd4", "Qxd4", "d6", "O-O",
        ]),
        ("4...Cf6 (meilleur coup) : 5.e5 d5 6.Fb5, ligne principale", [
            "e4", "e5", "Nf3", "Nc6", "d4", "exd4", "Bc4", "Nf6",
            "e5", "d5", "Bb5", "Ne4", "Nxd4", "Bd7", "Bxc6", "bxc6", "O-O",
        ]),
        ("4...Cf6 5.e5 : plan d'aile-roi après 9...Fe7 10.f3 puis f4", [
            "e4", "e5", "Nf3", "Nc6", "d4", "exd4", "Bc4", "Nf6",
            "e5", "d5", "Bb5", "Ne4", "Nxd4", "Bd7", "Bxc6", "bxc6", "O-O", "Be7", "f3",
        ]),
        ("4...Cf6 5.e5 De7?? : le pion est tabou, Te1 cloue la dame", [
            "e4", "e5", "Nf3", "Nc6", "d4", "exd4", "Bc4", "Nf6",
            "e5", "Qe7", "O-O", "Ncxe5", "Nxe5", "Qxe5", "Re1",
        ]),
        ("4...Cf6 5.e5 Ce4 (imprécision) : 6.De2 interdit d5", [
            "e4", "e5", "Nf3", "Nc6", "d4", "exd4", "Bc4", "Nf6",
            "e5", "Ne4", "Qe2",
        ]),
        ("4...Cf6 5.e5 Cg4 : 6.O-O, jamais Cxd4 ni Fxf7+", [
            "e4", "e5", "Nf3", "Nc6", "d4", "exd4", "Bc4", "Nf6",
            "e5", "Ng4", "O-O",
        ]),
        ("4...Cf6 5.e5 Cg4 6.O-O Cxe5?? : Te1 puis f4 gagne la pièce", [
            "e4", "e5", "Nf3", "Nc6", "d4", "exd4", "Bc4", "Nf6",
            "e5", "Ng4", "O-O", "Ncxe5", "Nxe5", "Nxe5", "Re1", "d6", "f4",
        ]),
        ("4...d6 (passif) : reprendre le pion et roquer", [
            "e4", "e5", "Nf3", "Nc6", "d4", "exd4", "Bc4", "d6",
            "Nxd4", "Nxd4", "Qxd4", "Nf6", "O-O",
        ]),
        ("Noir refuse le gambit : 3...Cf6 (sans source)", [
            "e4", "e5", "Nf3", "Nc6", "d4", "Nf6", "dxe5", "Nxe4", "Qd5",
        ]),
        ("Noir joue 4...Fb4+ (sans source)", [
            "e4", "e5", "Nf3", "Nc6", "d4", "exd4", "Bc4", "Bb4+", "c3", "Nf6",
        ]),
        ("Noir joue 1...d5 (Scandinave, miroir)", [
            "e4", "d5", "exd5", "Qxd5", "Nc3", "Qa5", "d4", "Nf6", "Nf3", "c6",
        ]),
        ("Après 1...e5, 2...d6 (Philidor)", [
            "e4", "e5", "Nf3", "d6", "d4", "exd4", "Nxd4", "Nf6",
        ]),
        ("Après 1...e5, 2...Cf6 (Petroff)", [
            "e4", "e5", "Nf3", "Nf6", "Nxe5", "d6", "Nf3", "Nxe4", "d4",
        ]),
        ("Après 1...e5, 2...Fc5 (Italienne)", [
            "e4", "e5", "Nf3", "Bc5", "Bc4", "Nf6", "d3", "d6",
        ]),
    ],
]

BLANC_LONDRES = [
    "blanc-londres.pgn",
    "Système de Londres (Blancs) — d'après Blitzstream Facile, YouTube YE9Mo4TqT8g (400-1000 Elo)",
    [
        ("3...Fb4+ (4 fois dans la vidéo) : c3 gagne un temps sur le fou", [
            "d4", "d5", "Bf4", "Nf6", "e3", "e6", "Nf3", "Bb4+", "c3",
        ]),
        ("...Ff5 et ...Cb4 (3 fois) : Db5+ puis Dxb7", [
            "d4", "d5", "Bf4", "Nc6", "Nf3", "Nf6", "e3", "Bf5", "Bd3", "Bxd3",
            "Qxd3", "Nb4", "Qb5+", "Nc6", "Qxb7",
        ]),
        ("...Fd6 (2 fois) : Fg3, reprendre hxg3 ouvre la colonne h", [
            "d4", "d5", "Bf4", "Nf6", "e3", "e6", "Nf3", "Bd6", "Bg3", "Bxg3", "hxg3",
        ]),
        ("...Ch5 chasse le fou (2 fois) : Fg3, reprendre hxg3", [
            "d4", "d5", "Bf4", "Nf6", "e3", "e6", "Nf3", "Nh5", "Bg3", "Nxg3", "hxg3",
        ]),
        ("...Fg4 cloue le cavalier (2 fois) : Fd3 puis Cbd2", [
            "d4", "d5", "Bf4", "Nc6", "Nf3", "Nf6", "e3", "Bg4", "Bd3", "e6", "Nbd2",
        ]),
        ("...e5 en poussée centrale : dxe5, un pion de plus", [
            "d4", "d5", "Bf4", "Nc6", "e3", "e5", "dxe5",
        ]),
        ("1...e5 (2 fois) : dxe5, Cf3 défend le pion", [
            "d4", "e5", "dxe5", "Nc6", "Nf3",
        ]),
        ("1...Cf6 ...Ch5 : Fg3, hxg3 puis d5 chasse le cavalier", [
            "d4", "Nf6", "Bf4", "Nc6", "Nf3", "Nh5", "Bg3", "Nxg3", "hxg3", "g6", "d5",
        ]),
    ],
]

NOIR_SCANDI = [
    "noir-scandinave.pgn",
    "Scandinave (Noirs, 1.e4 d5)",
    [
        ("Ligne principale : 3...Da5 4.d4 Cf6 5.Cf3 c6 (sans source)", [
            "e4", "d5", "exd5", "Qxd5", "Nc3", "Qa5", "d4", "Nf6", "Nf3", "c6",
        ]),
        ("Variante moderne : 3...Dd6 (sans source)", [
            "e4", "d5", "exd5", "Qxd5", "Nc3", "Qd6", "d4", "Nf6", "Nf3", "Bg4",
        ]),
        ("Blanc évite 3.Cc3 : 3.Cf3 (sans source)", [
            "e4", "d5", "exd5", "Qxd5", "Nf3", "Nf6", "d4", "Bg4",
        ]),
        ("Après 3...Da5, 4.Cf3 au lieu de 4.d4 (parties réelles)", [
            "e4", "d5", "exd5", "Qxd5", "Nc3", "Qa5", "Nf3", "Nf6", "d4", "c6",
        ]),
        ("Après 3...Da5, 4.Fc4 au lieu de 4.d4 (parties réelles)", [
            "e4", "d5", "exd5", "Qxd5", "Nc3", "Qa5", "Bc4", "Nf6", "Nf3", "Bg4",
        ]),
        ("2...Cf6, variante moderne par transposition (parties réelles)", [
            "e4", "d5", "exd5", "Nf6", "d4", "Nxd5", "Nf3", "Bg4",
        ]),
        ("2.e5, Scandinave avancée (parties réelles)", [
            "e4", "d5", "e5", "Nc6", "d4", "Bg4",
        ]),
        ("2.d4, Scandinave avec 2.d4 (parties réelles)", [
            "e4", "d5", "d4", "dxe4", "Nc3", "Nf6",
        ]),
    ],
]

BLANC_FRANCAISE = [
    "blanc-vs-francaise.pgn",
    "Gambit de l'aile contre la française (Blancs) — d'après Julien Song, YouTube dvbfA94nlak",
    [
        ("Française 4.b4 cxb4 5.a3 bxa3 6.d4 : 11.Cg5 h6 12.Dh5", [
            "e4", "e6", "Nf3", "d5", "e5", "c5", "b4", "cxb4", "a3", "bxa3", "d4",
            "Nc6", "c3", "Bd7", "Bd3", "a6", "O-O", "b5", "Nxa3", "Na5", "Ng5", "h6", "Qh5",
        ]),
        ("Française : sur Cf5, petit roque puis la poussée g4", [
            "e4", "e6", "Nf3", "d5", "e5", "c5", "b4", "cxb4", "a3", "bxa3", "d4",
            "Nc6", "c3", "Nge7", "Bd3", "Nf5", "O-O", "Be7", "g4",
        ]),
        ("Française : sur Cg6, la poussée h4 chasse le cavalier", [
            "e4", "e6", "Nf3", "d5", "e5", "c5", "b4", "cxb4", "a3", "bxa3", "d4",
            "Nc6", "c3", "Nge7", "Bd3", "Ng6", "h4",
        ]),
        ("Française 5...Cc6 6.axb4 Cxb4 7.c3 : le centre quand même", [
            "e4", "e6", "Nf3", "d5", "e5", "c5", "b4", "cxb4", "a3", "Nc6", "axb4",
            "Nxb4", "c3", "Nc6", "d4", "Nge7", "Bd3",
        ]),
        ("Française : le cadeau grec 10.Fxh7+ après un petit roque hâtif", [
            "e4", "e6", "Nf3", "d5", "e5", "c5", "b4", "cxb4", "a3", "Nc6", "axb4",
            "Bxb4", "c3", "Ba5", "d4", "Nge7", "Bd3", "O-O", "Bxh7+", "Kxh7",
            "Ng5+", "Kg8", "Qh5",
        ]),
        ("Française 4...Cc6 : 5.bxc5 Fxc5 6.d4 Fb6 7.c3", [
            "e4", "e6", "Nf3", "d5", "e5", "c5", "b4", "Nc6", "bxc5", "Bxc5", "d4",
            "Bb6", "c3",
        ]),
    ],
]

NOIR_D4 = [
    "noir-vs-d4.pgn",
    "Contre 1.d4 (Noirs)",
    [
        ("Gambit dame refusé : 1.d4 d5 2.c4 e6 3.Cc3 Cf6 (sans source)", [
            "d4", "d5", "c4", "e6", "Nc3", "Nf6", "Bg5", "Be7",
        ]),
        ("London : 1.d4 d5 2.Ff4 Cf6 3.e3 e6 (sans source)", [
            "d4", "d5", "Bf4", "Nf6", "e3", "e6", "Nf3", "c5", "c3", "Nc6",
        ]),
        ("Veresov : 1.d4 Cf6 2.Cc3 d5 (sans source)", [
            "d4", "Nf6", "Nc3", "d5", "Bf4", "Nbd7", "e3", "e6",
        ]),
    ],
]


REPERTOIRE = (BLANC, BLANC_FRANCAISE, BLANC_LONDRES, NOIR_SCANDI, NOIR_D4)


def build_line(sans: list[str]) -> chess.pgn.Game:
    """Rejoue la suite SAN et rend un Game. Lève si un coup est illégal."""
    board = chess.Board()
    game = chess.pgn.Game()
    node = game
    for san in sans:
        move = board.parse_san(san)
        node = node.add_main_variation(move, comment="")
        board.push(move)
    game.headers["White"] = "Repertoire"
    game.headers["Black"] = "Repertoire"
    game.headers["Result"] = "*"
    return game


def write_repertoire(filename: str, title: str, lines: list[tuple[str, list[str]]]) -> None:
    REPERTOIRE_DIR.mkdir(parents=True, exist_ok=True)
    path = REPERTOIRE_DIR / filename
    parts = [f"; {title}\n"]
    for line_name, sans in lines:
        game = build_line(sans)
        game.headers["Event"] = line_name
        parts.append(str(game))
        parts.append("\n\n")
    path.write_text("\n".join(parts), encoding="utf-8")
    from src.repertoire_graph import repertoire_positions
    n = len(repertoire_positions(path.read_text(encoding="utf-8")))
    print(f"  {filename}: {len(lines)} lignes, {n} positions indexées -> OK")


def main() -> None:
    for rep in REPERTOIRE:
        write_repertoire(*rep)
    print("Répertoire écrit dans", REPERTOIRE_DIR)


if __name__ == "__main__":
    main()