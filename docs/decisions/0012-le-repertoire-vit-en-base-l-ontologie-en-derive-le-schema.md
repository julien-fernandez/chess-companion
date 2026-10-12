---
numero: 0012
titre: Le répertoire vit en base, l'ontologie en dérive le schéma
statut: accepté
date: 2026-09-25
concerne:
  - data/ontology/chess-repertoire-vocabulary.yaml
  - scripts/generate_ddl.py
  - scripts/migrate_repertoire.py
  - sql/schema.sql
  - scripts/build_repertoire.py
---

# 0012 — Le répertoire vit en base, l'ontologie en dérive le schéma

## Contexte

Le répertoire était écrit en constantes Python dans `scripts/build_repertoire.py`, d'où sortaient
des PGN. Ce format ne porte ni la source d'une variante (vidéo, auteur, tranche Elo), ni le motif
de son admission, ni les affirmations de l'auteur et leur vérification (ADR 0009), ni l'historique
des rappels (ADR 0011). Chacune de ces notions vivait dans un libellé libre, comme
« (sans source) » ou « (23% des adversaires) ».

Le glossaire `chess-vocabulary` (kind `chess`) ne peut pas les accueillir : ce kind n'admet que
des axes qui qualifient une **position** et se **calculent** depuis le FEN, les règles ou le
moteur. Il y employait par ailleurs `line` pour une ligne géométrique (colonne, diagonale).

## Décision

1. Le vocabulaire du répertoire est une ontologie à part, `chess-repertoire-vocabulary`
   (kind `ops`), déclarée dans Ontology Manager. Clés en anglais, libellés en français. Une
   « ligne de répertoire » s'y nomme `variation`, pour ne pas heurter `line`.
2. `scripts/generate_ddl.py` rend `sql/schema.sql` depuis cette source : un enum Postgres par
   axe, les tables et les vues. Un test échoue si le fichier versionné dérive du rendu.
3. La base Postgres (instance partagée du VPS) devient la **source** du répertoire, des parties
   et des rappels. Le dépôt garde la doctrine (ontologie, schéma) et un **export généré versionné**
   du contenu.
4. Les positions sont indexées par EPD (ADR 0006). Les arêtes du graphe, le rôle d'un coup
   (à savoir / à anticiper), les cartes manquantes, la sortie d'une partie et le statut d'une
   position sont des **vues**, jamais des colonnes recopiées.

## Conséquences

Ce que la base rend visible dès la migration : cinq positions où le répertoire donne deux réponses
différentes à Julien (vue `own_move_conflict`), et un écart de métrique entre la vue `game_exit`
et `first_exit` qui a révélé que ce dernier comptait une sortie sur un coup noir au coup suivant.

Ce qui devient plus difficile : il faut une base joignable pour réviser ou verser une variante, donc
un déploiement et un accès depuis la PWA. `build_repertoire.py` ne sert plus qu'à la migration
initiale ; l'export versionné le remplace comme trace git du contenu.

Le schéma est testé sur Postgres 16 en local ; l'instance du VPS est en 17.

## Alternatives écartées

**Étendre `chess-vocabulary`.** Un seul glossaire, mais il faudrait y admettre des axes déclarés
qui ne qualifient pas une position, contre la garde du kind `chess`.

**SQLite local.** Zéro infrastructure, mais la PWA sur téléphone ne l'atteint pas.

**IndexedDB dans la PWA.** Révision hors ligne, mais les scripts Python de pilotage ne liraient
plus les rappels.

**Base seule, sans export dans git.** Plus simple, mais le contenu du répertoire perdrait ses diffs
et son historique.
