# 0015 — Les omissions se détectent sans recherche

- **Date** : 2026-10-06
- **Statut** : acceptée
- **Contexte** : spec `docs/specs/2026-10-06-cartes-de-jugement.md`, ADR 0004.

## Décision

`forgoes` (renonce) et `ignores` (laisse) se lisent sur la position AVANT le coup, par les seuls
détecteurs statiques : pièce attaquée sans défenseur (`inspectPosition().hanging`) et mat en un.
Aucune recherche de variantes, pas même `forcing-search.js`, ne les produit.

## Conséquences

- Conforme à l'ADR 0004 : la recherche ne sert qu'à retirer un candidat, jamais à justifier.
- Une combinaison au-delà d'un coup n'est pas vue : 34.Te8+ (mat en 3) ne s'explique pas par
  `forgoes` ; 34.Fe4 rend `forgoes Fxh7`, vrai mais secondaire. Ces cas se signalent par le bouton
  « raison fausse » et nourrissent l'évolution de l'ontologie, au lieu d'être devinés.
- Une pièce « en l'air » prise peut parfois coûter ailleurs : le détecteur l'ignore, comme
  `hanging_piece` aujourd'hui.
