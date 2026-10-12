---
numero: 0001
titre: L'ontologie de l'état du jeu passe par ontology-manager, en catégoriel pur
statut: accepté
date: 2026-09-04
concerne:
  - data/ontology/chess-vocabulary.yaml
  - web/src/chess/coach.js
---

# 0001 — L'ontologie de l'état du jeu passe par ontology-manager, en catégoriel pur

## Contexte

`coach.js` ne connaît aujourd'hui que la delta d'évaluation Stockfish (gaffe/imprécision +
meilleur coup) — aucun vocabulaire positionnel. Julien veut un vocabulaire structuré pour
décrire une position comme un GM lit un « paysage » (menaces, structure, sécurité du roi,
imbalances) plutôt qu'une suite de coups isolés.

Le repo `2026.07 Ontology Manager` porte déjà 6 domaines analogues (goût cinéma, emploi,
patrimoine, sorties, produit, vie) avec un motif réutilisable : entités + relations + axes
groupés par facette, chaque axe portant une `nature` (`factual` / `measured` / `judged`) et
un `status` (`probation` → `active`). Deux de ces domaines (`taste`, `job`) qualifient un
objet subjectif par des axes catégoriels jugés par LLM sur corpus — un modèle mal calibré
pour un usage temps réel : DecodeChess (référence dont Julien part) prend ~60s pour décoder
une seule position par LLM, ce qui est l'écueil précis à éviter pour un companion vocal.

## Décision

L'ontologie « état du jeu d'échecs » est un nouveau `kind: chess` dans `ontology-manager`
(module cloné de `taste.py`), avec deux contraintes qui la distinguent de `taste`/`job` :

1. **Aucun axe `judged`/LLM en v1.** Chaque axe a pour `value_source` `fen` (lecture directe
   du board), `rules` (calcul géométrique chess.js) ou `engine` (Stockfish) — jamais un appel
   LLM par position. La règle d'admission d'un axe n'est plus T1/T2 (discrimination sur
   corpus, propre à `taste`) mais : (a) nom établi dans la littérature stratégique classique
   et (b) règle de calcul déterministe vérifiable sur des positions de référence connues.
2. **Le YAML ne porte que du catégoriel.** Toute mesure continue (score matériel, mobilité,
   score moteur) est découpée en paliers à valeurs fermées dans l'ontologie ; le nombre brut
   reste dans le schéma pragmatique de l'app, jamais dans le YAML. L'ontologie donne le
   label, l'app garde la mesure à côté.

Source : `data/ontology/chess-vocabulary.yaml` dans ce repo (pas le vault — hors périmètre
coaches claude.ai, comme `taste`/`job`/`heritage`/`outing`). Consommateur : le JSON généré,
importé directement par `web/src/chess/*.js` (l'enum Python généré par cohérence avec le
moteur reste inutilisé ici, sans conséquence).

## Conséquences

- Le vocabulaire de l'app dépend d'un repo tiers (`ontology-manager`) pour sa génération —
  toute session qui édite `chess-vocabulary.yaml` doit régénérer et committer dans les deux
  repos (cf. skill `julien-ref-ontologies`).
- Exclure `judged`/LLM en v1 laisse de côté les concepts vraiment subjectifs (plans, qualité
  narrative d'une menace) — ils resteront hors ontologie tant qu'aucune règle déterministe ne
  les couvre, ce qui plafonne la richesse « paysage » par rapport à ce qu'un LLM pourrait
  décrire librement.
- Le découpage en paliers catégoriels perd la précision d'un score continu dans l'ontologie
  elle-même ; un consommateur qui veut la valeur exacte doit aller la chercher dans le schéma
  pragmatique de l'app, pas dans le vocabulaire.

## Alternatives écartées

- **Cloner `taste`/`job` tel quel (axes jugés, admission T1/T2 sur corpus)** — reproduirait le
  problème des 60s/position de DecodeChess : un usage temps réel voix ne peut pas attendre un
  appel LLM par position.
- **Étendre `ontology-manager` avec un type d'axe numérique continu** — plus fidèle à la
  nature de certaines mesures, mais modifie un moteur partagé par 6 autres domaines pour un
  besoin qui se résout sans ça (paliers catégoriels) ; reporté, pas nécessaire pour le MVP.
- **Schéma ad hoc dans ce seul repo, sans ontology-manager** — plus simple à court terme, mais
  perd la propagation/versioning déjà en place et diverge du reste de l'écosystème.
