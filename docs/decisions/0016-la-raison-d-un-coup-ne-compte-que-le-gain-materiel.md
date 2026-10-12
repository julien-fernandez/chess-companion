# 0016 — Seul le gain matériel statique est une raison

- **Date** : 2026-10-06
- **Statut** : acceptée
- **Contexte** : spec `docs/specs/2026-10-06-cartes-de-jugement.md` §4, ADR 0004, ADR 0015.

## Décision

`moveReason` (`web/src/chess/move-reason.js`) ne rend comme **raison** que l'étage 0 (matériel) :

1. `allows` et `hanging_piece` ne comptent qu'une prise statiquement **gagnante**, nette de ce que
   le coup a lui-même pris : la pièce prise est en l'air après le coup, ou vaut plus que la pièce
   qui prend, moins la valeur prise par le coup. Sans cela, une reprise ou un échange (17.Dxf5 gxf5,
   2.d4 exd4) se lit comme une raison.
2. Les étages 1 à 3 (diffs d'axes) ne sont **pas** des raisons : le vocabulaire ne donne aucune
   polarité aux valeurs d'axe, un changement peut aider celui qui joue. Ils vont dans `changes`,
   affichés sous « Ce qui a changé (sans sens connu) ».
3. Le rattachement des facettes aux étages (1 contrôle : `space`, `square_control`, `line_control` ;
   2 fonctions : `cooperation`, `threats` ; 3 forces : le reste, hors `material` et attracteur) est
   une **convention d'implémentation SANS SOURCE**, déclarée comme telle. `material` en est exclu
   (une prise améliore le matériel de celui qui joue), l'étage 4 (attracteur) n'a aucun calcul, et
   `immediate_threats` est écarté, car il dépend du camp au trait.

## Conséquences

- Conforme à l'ADR 0004 : le « pourquoi » reste porté par l'ontologie, jamais deviné.
- Faire d'un étage 1 à 3 une raison exige d'abord une évolution de l'ontologie (spec §5).
- Un coup sans perte matérielle statique n'a aucune raison : l'écran montre les changements, sans
  les présenter comme cause.
- Le jeu d'essai du pilote (`pilot-game.fixture.js`) vient du rapport pilote ; ce n'est pas la
  vérité du moteur.

## Alternative rejetée

Les diffs d'axes non orientés comme raisons : 10.Ff4 a reçu une raison plausible mais fausse.
