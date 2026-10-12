# 0017 — Une règle sourcée sur le bilan matériel est une raison d'étage 0

- **Date** : 2026-10-06
- **Statut** : acceptée
- **Contexte** : spec `docs/specs/2026-10-06-cartes-de-jugement.md` §5 (boucle d'évolution),
  ADR 0016, rapport `docs/rapports/2026.10.06_ontologie-boucle-1-sonde.md`.

## Décision

L'étage 0 de `moveReason` admet, en plus du gain matériel statique (ADR 0016), une **règle sur le
bilan matériel portée par un auteur**. La première est `trades_queens_behind` (vocabulaire 0.8.0) :
la dame prend la dame, la reprise est possible, et le camp qui joue a moins de matériel avant le
coup. Source : Capablanca, *Chess Fundamentals*, partie Petroff : « The fact that he has to
exchange Queens when he is a Pawn behind shows that Black's game is lost. »

Détection statique (`queenTrade`, `web/src/chess/move-relations.js`) : lue sur la position avant le
coup, sans recherche (ADR 0004, ADR 0015).

## Conséquences

- 9.Dxf5 du pilote, perte de 17 % jusque-là sans raison, en reçoit une ; aucun des 77 autres
  demi-coups de la partie n'en reçoit.
- Déclaré, non couvert : une dame **offerte** à l'échange (placée où la dame adverse peut la prendre)
  ne déclenche rien. Seule la prise compte.
- Le seuil est « moins de matériel », sans palier : Capablanca parle d'un pion. Un palier plus
  haut serait une convention sans source.
- Une règle sans auteur reste exclue de l'étage 0 : la pièce chassable et le roque perdu, mesurés
  au même rapport, attendent une source ou un second exemplaire.

## Alternative rejetée

Tout échange de pièces égales en retard de matériel : il se déclenchait aussi sur 24.Cxg7+, un
coup conservé, et la source ne parle que des dames.
