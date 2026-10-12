---
numero: 0011
titre: Le rappel espacé vit dans le companion, indexé par EPD
statut: accepté
date: 2026-09-25
supersede: 0007
concerne:
  - data/ontology/chess-repertoire-vocabulary.yaml
  - scripts/generate_ddl.py
  - sql/schema.sql
---

# 0011 — Le rappel espacé vit dans le companion, indexé par EPD

## Contexte

L'ADR 0007 confiait le rappel espacé à Listudy et faisait **déclarer** le pourcentage de drill à
la main, faute de pouvoir le lire. Il laissait ouverte l'alternative « porter le rappel espacé dans
le companion » tant que le critère d'admission par fréquence ne devenait pas trop contraignant.

Trois faits ont changé la balance. Le besoin retrouvé le 2026-09-23 est de réviser son répertoire
**à la voix, sans échiquier** : Listudy ne le permet pas. Aucune étude Listudy n'a été importée
(#12 ouverte depuis le 17/09), donc aucune progression ne serait perdue. Et chaque branche versée
remettait l'arbre Leitner de Listudy à zéro, puisqu'il est indexé sur un hash du texte PGN.

## Décision

Le companion porte le rappel espacé. Une **carte** est un couple (EPD, SAN) où c'est à Julien de
jouer ; chaque rappel est une ligne de la table `review`, et le calendrier se **dérive** de cet
historique par la vue `card_schedule` (boîtes de Leitner, intervalle doublé à chaque rappel réussi
d'affilée, remis à zéro par un oubli). Aucun état de planification n'est stocké.

Un rappel `unrecognized` (voix non comprise) n'entre pas dans le calcul : il ne dit rien de la
mémoire.

## Conséquences

L'identité EPD d'une carte survit à l'ajout d'une branche, à un réordonnancement, à une
transposition : la progression ne se remet plus à zéro, et le plafond de dix études disparaît.
Le statut `known` (« su ») du spec 2026-09-17 devient **mesuré**, alors qu'il n'avait aucune source.

Ce qui devient plus difficile : l'interface de révision est à construire (portage de
`legacy/learning-app/`), et le spec perd sa phrase « le companion ne réimplémente pas l'algorithme
de répétition ». Une carte dont la variante est retirée garde son historique ; la retirer du
calendrier reste à décider quand le cas se présentera.

Le journal déclaré de `data/pilotage/journal.md` reste lu tant que la révision vocale n'existe pas.

## Alternatives écartées

**Garder Listudy (ADR 0007).** Zéro code, mais pas de voix, remise à zéro à chaque branche, et un
chiffre seulement déclaré.

**Chessdriller.** Open source et branché sur Lichess, mais son état vit hors du dépôt et sans voix :
les deux défauts de Listudy.

**Stocker l'état de la carte (boîte, échéance) dans une colonne.** Plus simple à lire, mais un
second foyer pour une information que l'historique porte déjà : les deux divergeraient au premier
rappel mal enregistré.
