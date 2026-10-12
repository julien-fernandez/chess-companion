---
numero: 0008
titre: La sortie de préparation se mesure contre l'union des chapitres d'une couleur
statut: accepté
date: 2026-09-17
concerne:
  - src/pilotage.py
  - scripts/analyze_opening.py
---

# 0008 — La sortie de préparation se mesure contre l'union des chapitres d'une couleur

## Contexte

Le répertoire est découpé en chapitres, chacun déclenché par le premier coup de l'adversaire :
Scandinave contre `1.e4`, vs-d4 contre `1.d4`, Gambit écossais contre `1...e5`, Gambit de l'aile
contre `1...e6`. La première implémentation choisissait le chapitre par ce déclencheur, puis
cherchait la sortie **dans ce seul chapitre**.

Deux conséquences se sont manifestées dès la première partie réelle.

Aucun chapitre ne se déclenche pour une ouverture non couverte — une sicilienne subie, ou un
`1.d4` joué par Julien alors que son répertoire blanc commence par `1.e4`. La partie était alors
**écartée du calcul** et rangée dans les écarts. Le comportement était honnête au sens où l'écart
était affiché, mais la moyenne se calculait sur un échantillon filtré : les parties hors
répertoire, qui sont précisément les pires, disparaissaient de la moyenne au lieu de la plomber.

Le constat est chiffré : 7 parties sur 31 aux blancs commencent par `1.d4`. Les écarter faisait
monter la sortie moyenne sans qu'aucune préparation ne s'allonge.

Second défaut, de même origine : `premier_coup` rendait le premier demi-coup de la partie dans
tous les cas. Pour une partie où Julien a les blancs, cela rendait **son propre coup** en
l'annonçant « ce que joue l'adversaire », et rendait `1...e5` indiscernable de `1...e6` — donc
l'écossaise indiscernable de la française.

## Décision

La sortie se mesure contre l'**union des positions de tous les chapitres de la couleur**
(`positions_par_couleur`). Le déclencheur ne sert plus qu'à **nommer** la branche dans le rapport ;
une partie sans chapitre déclenché porte le libellé `hors chapitre` et reste mesurée.

Le déclencheur se lit sur le **premier coup de l'adversaire** : demi-coup 2 quand Julien a les
blancs, demi-coup 1 quand il a les noirs (`premier_coup_adverse`).

Le rapprochement d'une partie vit dans une seule fonction, `analyser_partie`, appelée par le
tableau de bord et par `analyze_opening.py`.

## Conséquences

Un `1.d4` joué contre un répertoire `1.e4` compte pour ce qu'il est : une sortie au coup 1. La
moyenne cesse de flatter, et elle se dégrade à la mesure des parties hors préparation — ce qui est
l'effet recherché.

Ce qui devient plus difficile : la moyenne mélange des parties de natures différentes (préparation
quittée en cours de ligne, et préparation jamais appliquée). Les distinguer demanderait un second
chiffre, non introduit ici.

La fonction unique de rapprochement rend les deux sorties cohérentes, mais tout changement de
sémantique les affecte ensemble.

## Alternatives écartées

**Mesurer par chapitre déclenché.** C'était l'implémentation d'origine. Écartée parce qu'elle
produit une moyenne dont l'échantillon exclut les cas les plus coûteux, sans jamais échouer.

**Compter une partie hors chapitre comme sortie au coup 0.** Rejetée : `0` se lirait comme un coup
joué, alors qu'il s'agit de l'absence de couverture. L'union rend le vrai numéro — 1 — sans
convention à retenir.

**Ajouter un chapitre attrape-tout par couleur, déclencheur `None`.** Essayé : le chapitre par
défaut avale les parties d'un chapitre plus spécifique selon l'ordre du dictionnaire, en silence.
L'union supprime le besoin d'un défaut.
