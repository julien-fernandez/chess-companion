---
numero: 0013
titre: Deux réponses de Julien à une même position se déclarent, la révision accepte chacune
statut: accepté
date: 2026-09-26
concerne:
  - scripts/generate_ddl.py
  - sql/schema.sql
  - scripts/export_repertoire.py
  - web/src/chess/review-session.js
---

# 0013 — Deux réponses de Julien à une même position se déclarent, la révision accepte chacune

## Contexte

La vue `own_move_conflict` (ADR 0012) a rendu 5 positions où le répertoire donne à Julien deux coups
différents : le départ (1.e4 / 1.d4), le Londres après 2…Cc6 (3.Cf3 / 3.e3), la Scandinave après
2.exd5 et après 3.Cc3, et 1.d4 côté Noirs (1…d5 / 1…Cf6). Une carte est un couple (EPD, SAN) : deux
réponses font deux cartes concurrentes, et une révision qui n'attend qu'un coup compterait l'autre
comme une erreur.

Les vidéos de coach proposent souvent deux options au même coup ; Julien les a toutes gardées.

## Décision

Une paire de réponses n'est admise que **déclarée**, avec sa raison, dans la table
`intended_alternative (side, epd, reason)`. `own_move_conflict` exclut les positions déclarées et
ne rend donc plus que les doubles accidentels. Les déclarations vivent en base et sortent dans
`export/repertoire.json` (`intended_alternatives`), comme le reste du contenu.

Pendant la révision, toute réponse du répertoire à la position est acceptée ; le rappel est noté sur
la carte **effectivement dite**, puis la variante continue par son propre coup.

## Conséquences

Un double introduit par une nouvelle variante reste visible, puisque la vue ne tait que ce qui est
déclaré. La révision ne punit plus un coup juste. Le coût : une table de plus, à appliquer aussi aux
bases existantes, que `migrate_repertoire.py` ne met pas à jour.

## Alternatives écartées

**Une seule réponse par position.** Plus simple à réviser, mais contraire à ce que Julien veut jouer.

**Tolérer tous les doubles sans déclaration.** La vue deviendrait inutile : un double accidentel
(deux variantes mal fusionnées) ne se distinguerait plus d'un choix.
