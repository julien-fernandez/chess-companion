---
numero: 0007
titre: Le drill Listudy est déclaré à la main, jamais mesuré
statut: superseded-par-0011
date: 2026-09-17
concerne:
  - src/pilotage.py
  - scripts/pilotage.py
  - data/pilotage/journal.md
  - .gitignore
---

# 0007 — Le drill Listudy est déclaré à la main, jamais mesuré

## Contexte

Le spec du 2026-09-17 confie le statut `su` (« rappelé sans aide ») à un outil de rappel espacé
externe, en posant que le companion « lit le statut que ces outils exportent, il ne le calcule
pas ». Cette hypothèse n'avait pas été vérifiée.

Quatre pages de Listudy ont été sondées — `/studies`, `/profile/:username`, `/stats`,
`/achievements`. Aucune n'expose d'état de drill : la liste des études ne rend que des titres, le
profil ne liste que les études **publiques** (`get_public_studies_by_user!`), `/stats` donne des
statistiques du site depuis 2020, et les trophées sont huit badges binaires saturants.

La source, en revanche, montre que l'état existe et qu'il est riche. Listudy étant AGPL,
`assets/js/study.js` se lit : l'arbre Leitner vit en localStorage sous `<study_id>_tree`, avec un
horodatage `updated` par nœud, et `update_progress()` calcule déjà un pourcentage par chapitre via
`tree_progress(tree.root[0])`. Il est donc lisible par `chrome-relay js`.

Mais `setup_trees()` compare `string_hash(pgn + color)` au hash stocké et, à la moindre
différence, régénère l'arbre et écrase l'état. Le hash porte sur le **texte PGN entier** : ajouter
une branche, réordonner une ligne ou changer un espace remet la progression à zéro. Or la boucle
du spec ajoute une branche après chaque partie. Le pourcentage n'a donc aucune durée de vie, et
`clear_local_storage()` plafonne par ailleurs à dix arbres (éviction LRU).

## Décision

Le pourcentage de drill se **déclare** dans `data/pilotage/journal.md`, une ligne par séance
(`DATE CHAPITRE POURCENTAGE`), lue par `parse_journal`. Le tableau de bord l'affiche dans une
colonne marquée **déclaré**, distincte de la colonne **mesuré**.

Corollaire opératoire : **une étude Listudy importée ne se modifie plus.** Une branche nouvelle
part dans une nouvelle étude.

`data/pilotage/` devient la seconde exception à `data/*` dans `.gitignore`, après
`data/ontology/` : le journal est une source écrite à la main et non reproductible. Le `.html`
du tableau de bord, lui, reste ignoré — c'est un artefact généré.

## Conséquences

Le chiffre de drill est **auto-déclaré donc falsifiable**, et le tableau de bord le dit au lieu de
le maquiller en mesure. Le statut `su` du spec n'a pas de source automatique et reste non
implémenté.

Ce qui devient plus difficile : le répertoire ne peut plus s'étendre à chaque partie sans coût.
Chaque branche versée consomme une étude sur les dix disponibles, ce qui impose un critère
d'admission par fréquence — contrainte que le spec ignorait.

Le journal exige un geste manuel de cinq secondes après chaque séance. S'il n'est pas tenu, la
colonne reste vide : l'absence de donnée est visible, elle ne se confond pas avec un zéro.

## Alternatives écartées

**Lire l'arbre Leitner en localStorage via `chrome-relay js`.** Techniquement possible et bien
plus précis — les clés sont connues. Écartée parce que l'état est détruit à chaque mise à jour de
PGN : la mesure serait exacte et sans continuité, donc inutilisable en tendance. Elle reste
ouverte si le répertoire se stabilise assez pour que les PGN ne bougent plus.

**Lire la page profil.** Elle ne liste que les études publiques, ce qui obligerait à rendre le
répertoire public — une donnée personnelle — pour obtenir une liste de titres sans aucun progrès.

**Porter le rappel espacé dans le companion**, indexé par EPD (identité stable, ADR 0006) plutôt
que par hash de PGN. Réglerait la cause à la racine et supprimerait la contrainte des dix études.
Écartée pour l'instant : cela contredit le spec (« le companion ne réimplémente pas l'algorithme
de répétition ») et demande une interface de drill à construire. À rouvrir si le critère
d'admission par fréquence s'avère trop contraignant.

**Utiliser les trophées comme signal.** Huit badges binaires, dont « Student — Learn 3 opening
lines » : saturé dès la première semaine, aucune cadence mesurable.
