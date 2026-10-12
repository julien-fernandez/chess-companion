# 0006 — Un nœud de répertoire s'indexe par EPD, jamais par FEN

- **Date** : 2026-09-17
- **Statut** : accepté
- **Contexte** : spec [2026-09-17](../specs/2026-09-17-etude-ouvertures-repertoire-graphe.md),
  brique C (graphe de positions du répertoire)

## Le fait qui force la décision

La méthodologie d'étude des ouvertures pose que l'unité réelle est la **position**, pas la
séquence : deux ordres de coups différents aboutissent à la même position et doivent fusionner en
un seul nœud. L'« arbre » d'ouvertures est un graphe.

La traduction naïve est « indexer par FEN ». Elle est fausse, et le test l'a montré avant que le
code parte en production.

Deux ordres de coups du Gambit dame refusé, convergeant après trois coups :

```
1.d4 d5 2.c4 e6 3.Cc3 Cf6   →  rnbqkb1r/ppp2ppp/4pn2/3p4/2PP4/2N5/PP2PPPP/R1BQKBNR w KQkq - 2 4
1.d4 Cf6 2.c4 e6 3.Cc3 d5   →  rnbqkb1r/ppp2ppp/4pn2/3p4/2PP4/2N5/PP2PPPP/R1BQKBNR w KQkq - 0 4
```

Le placement des pièces, le trait, les droits de roque et la prise en passant sont **identiques**.
Les deux derniers champs ne le sont pas : `2 4` contre `0 4`. Le compteur de demi-coup diffère
parce que les deux chemins n'ont pas joué leurs coups de pion au même moment.

**Indexer par FEN aurait donc créé deux nœuds pour une seule position** — silencieusement. Le
graphe aurait grossi, la fusion des transpositions n'aurait jamais eu lieu, et rien n'aurait
échoué : le répertoire se serait simplement mis à mentir sur ce qu'il couvre.

## Décision

La clé d'un nœud est l'**EPD** (`board.epd()`), soit les quatre premiers champs de la FEN :
placement, trait, droits de roque, prise en passant légale. Les compteurs de demi-coup et de
numéro de coup en sont exclus.

`repertoire_positions()` et `first_exit()` (`src/repertoire_graph.py`) comparent des EPD.

La FEN reste utilisée là où elle est juste : `first_exit()` **retourne** la FEN complète de la
position de sortie, parce qu'un affichage et un débogage ont besoin du numéro de coup. Elle ne
sert jamais de clé.

## Ce qui verrouille la décision

Deux tests, dont un **négatif** — celui qui échouerait si quelqu'un revenait à la FEN :

| Test | Ce qu'il tient |
|---|---|
| `test_la_fen_naurait_pas_fusionne_la_transposition` | affirme que les deux FEN **diffèrent** et que les deux EPD **coïncident** — c'est le constat lui-même, gravé |
| `test_transposition_fusionne_en_un_seul_noeud` | l'union de deux répertoires d'ordres différents ne contient qu'une fois le nœud convergé |

Le premier est le plus important : il documente *pourquoi* la clé n'est pas la FEN, et il tombe si
l'on change d'avis sans le dire.

## Ce que cette décision coûte

Deux positions identiques au sens EPD mais atteintes avec des compteurs de demi-coup différents
sont traitées comme une seule. C'est correct pour un répertoire d'ouverture — la règle des 50
coups n'a aucune portée au dixième demi-coup. Ce serait faux pour un graphe de **finales**, où le
compteur de demi-coup fait partie de l'évaluation. Si le projet indexe un jour des finales, cette
décision ne s'y transporte pas telle quelle et devra être supersédée pour ce domaine.

La prise en passant reste dans la clé, et c'est voulu : deux positions identiques dont l'une
autorise une prise en passant légale ne sont pas la même position. `board.epd()` n'émet le champ
que lorsque la prise est effectivement légale, ce qui évite de scinder des nœuds sur un droit
théorique que personne ne peut exercer.

## Portée

La décision porte sur le graphe de répertoire. Elle ne dit rien du stockage des parties jouées
(`data/games.db`), qui conserve le PGN intégral, ni de l'ontologie d'état, qui travaille sur une
position déjà chargée et n'a pas besoin de clé d'indexation.

Elle rejoint la règle déjà posée au `CLAUDE.md` du projet : **toute position se génère par rejeu
avec python-chess, jamais à la main ni en lisant un écran.** L'EPD d'un nœud est produit par
`board.epd()` après `board.push(move)` — jamais recopié.