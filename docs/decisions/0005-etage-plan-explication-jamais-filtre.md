# 0005 — L'étage plan explique un coup, il n'en retire jamais

- **Date** : 2026-09-06
- **Statut** : accepté
- **Contexte** : issue #7 point 4, ADR [0004](0004-recherche-forcante-avant-de-conseiller.md), issue #9

## La question

L'ADR 0004 a fait entrer une recherche de variantes dans le modèle, avec une frontière stricte :
elle **retire** un candidat, elle n'en produit ni n'en justifie aucun. Restaient quatre
catastrophes qu'elle n'attrape pas, parce qu'elles perdent par la position et non par une suite
forçante.

L'étage plan — les relations coup → coup (`enables`, `excludes`, `prevents`, `allows`, `frees`) —
devait-il devenir un second filtre ?

## Ce que la mesure dit

Sur les deux catastrophes restantes de la partie du 2026-09-04, mesuré avant de construire :

| Candidat | Règle | Perte | Coups adverses NOUVEAUX après le coup |
|---|---|---|---|
| `Ch4` | `advance_post_held` | −396 cp | **0** |
| `Te1` | `worst_piece` | −342 cp | **0** |

Et les réfutations du moteur — `Db6` et `axb4` — étaient **déjà légales avant** le candidat.

Ces coups ne créent rien. Ils **ignorent une position qui demandait autre chose**. Aucune relation
coup → coup ne peut donc les attraper : il n'y a pas de coup neuf à signaler.

Une hypothèse d'urgence a aussi été testée — « l'adversaire disposait déjà d'une prise nette » —
et ne sépare rien de probant : 1 perdant sur 3 candidats en position urgente, 3 sur 33 en position
calme.

## La décision

**L'étage plan est de l'explication. Il ne retire aucun candidat.**

Trois raisons, dans cet ordre :

1. **Il n'attraperait rien.** Mesuré ci-dessus : zéro coup neuf sur les deux cas visés.
2. **Le calibrer sur deux points referait l'erreur que l'issue #9 dénonce.** Un seuil réglé sur un
   échantillon de un est une coïncidence en attente d'être démentie. Le corpus de parties de club
   n'existe pas encore.
3. **La frontière de l'ADR 0004 reste plus lisible avec un seul organe qui retire.** Deux filtres
   aux critères différents rendraient inexplicable pourquoi un candidat a disparu.

L'étage redeviendra candidat au filtrage quand le banc de l'issue #9 existera, et seulement si la
mesure sur ce banc le justifie.

## Ce que la décision coûte

Les quatre catastrophes positionnelles restent. On les laisse passer sciemment, plutôt que
d'inventer un garde-fou dont on ne saurait pas dire s'il fonctionne.

## Le piège rencontré, à ne pas reproduire

Comparer les coups de l'adversaire exige un **coup nul** — inverser le trait dans le FEN. Ce coup
nul est **illégal si le camp qui vient de jouer laisse son roi en échec**. Sans ce garde, la
comparaison ne lève aucune erreur : elle rend simplement zéro relation, et se lit comme « ce coup
ne concède rien ». C'est la famille de panne que le CLAUDE.md global nomme *un signal absent n'est
pas un signal vert*.
