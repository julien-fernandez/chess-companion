---
numero: 0009
titre: Une ligne extraite d'une vidéo franchit deux gardes, et aucun moteur
statut: accepté
date: 2026-09-17
concerne:
  - scripts/build_repertoire.py
---

# 0009 — Une ligne extraite d'une vidéo franchit deux gardes, et aucun moteur

## Contexte

Le répertoire se construit à partir de vidéos de coach, qui donnent ce qu'aucune base ne donne :
ce que jouent réellement les adversaires d'une tranche Elo, avec les réfutations et leur
fréquence. La source est le transcript automatique YouTube.

Ce transcript corrompt la notation française. Relevé sur deux vidéos : « défend avec **K6** » pour
`Cc6`, « **dame des c** échec » pour `Dd5+`, « il fait **K prend D4** » pour `Cxd4`, « le coup
**dame 7** » pour `De7`.

Le rejeu par `board.push_san()` attrape une partie de ces corruptions. Mesuré sur 16 lignes
extraites : deux erreurs levées, un `Ce7` **ambigu** (les cavaliers de c6 et de g8 atteignent tous
deux e7, d'où `Cge7`) et un coup attribué au mauvais numéro (`b5`, cité près du coup 4, jouable
seulement au coup 8 car il exige un cavalier déjà en c6).

Mais il en laisse passer une troisième espèce : le **légal-mais-faux**. Sur la punition de
`5...De7`, deux ordres de coups sont légaux et un seul gagne la dame. Le rejeu accepte les deux.
Ce qui a tranché est l'effet que le commentaire prête au coup — « le clouage qui remporte la dame
noire » — vérifié par `is_attacked_by` et `is_pinned` : vrais dans l'ordre de la narration, et la
dame absente de l'échiquier dans l'autre, qui décrivait donc une autre position.

Stockfish est disponible dans le dépôt (`web/scripts/uci-engine.mjs`) et se présentait comme la
barrière évidente. Il ne l'est pas : il évalue la vérité objective, alors que l'auteur affirme une
valeur pratique à une tranche Elo. Un piège peut valoir `+0,3` au moteur et faire perdre 23 % des
joueurs à 1000 Elo, parce que ce qui gagne est l'erreur humaine.

## Décision

Une ligne extraite franchit deux gardes, dans cet ordre.

**Le rejeu valide la légalité** : toute ligne se construit par `board.push_san()`, jamais à la
main. Il lève sur l'illégal et sur l'ambigu.

**La narration valide la vérité** : l'effet que le commentaire prête au coup se vérifie
programmatiquement avec python-chess — `is_attacked_by`, `is_pinned`, `is_checkmate`, le compte de
matériel.

Les affirmations de l'auteur se trient par nature. « Échec », « clouage », « on remporte la dame »,
« mat en h7 » sont **objectives** et se vérifient. « Position totalement gagnante », « fait des
ravages » sont des **jugements humains**, et « 23 % des joueurs », « gagnant jusqu'à 1500 Elo » des
**statistiques de population** : ces deux dernières familles se **citent avec leur tranche Elo**
dans le libellé de la ligne, et ne se valident pas.

Aucun moteur n'est la barrière d'aucune des trois.

## Conséquences

Une ligne dont l'auteur n'annonce aucun effet mesurable ne passe que la première garde. C'est
assumé pour les lignes de développement calme, où il n'y a rien à vérifier.

L'extraction exige de relever l'**effet annoncé** en même temps que les coups. Sans lui la seconde
garde est impossible, et la ligne est invérifiable — c'est la contrainte la plus coûteuse de cette
décision sur le travail d'extraction.

Ce qui devient plus difficile : plus rien ne filtre l'objectivité d'un piège. Une ligne
pratiquement rentable mais objectivement douteuse entre dans le répertoire, et c'est voulu.

Une ligne écrite à la main, sans auteur ni partie pour l'attester, porte `(sans source)` dans son
libellé. Lui prêter l'autorité du transcript lui ferait hériter de garanties qu'elle n'a pas.

## Alternatives écartées

**Stockfish en barrière.** Rejetterait précisément les lignes les plus rentables, celles dont la
valeur est humaine et non objective. Conforme par ailleurs à l'ADR 0004 : une recherche de
variantes ne sert qu'à *retirer* un candidat, jamais à le justifier.

**Le rejeu seul.** Suffisant pour la légalité, aveugle au légal-mais-faux — la seule des trois
espèces d'erreur qui ressemble à un succès.

**Faire relire chaque ligne par Julien.** Reporte la charge sur lui pour un contrôle qu'une
assertion exécute mieux, et ne laisse aucune trace rejouable.
