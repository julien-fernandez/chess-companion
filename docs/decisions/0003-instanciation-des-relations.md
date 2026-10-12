# 0003 — Instancier les relations déclarées, et les borner pour qu'elles ne soient pas du décor

- **Date** : 2026-09-05
- **Statut** : accepté
- **Contexte** : issue #7, ADR [0001](0001-ontologie-etat-du-jeu-via-ontology-manager.md) et [0002](0002-pont-etat-vers-coups-candidats.md)

## Contexte

`chess-vocabulary.yaml` déclare 20 `relationship_types` et affirme que « l'unité de cette
ontologie n'est PAS la case : c'est la relation ». L'analyseur n'en calculait aucune : il ne
rendait que des axes globaux qui qualifient la position entière.

Un axe global ne désigne aucun objet sur lequel agir. « `terrain_control = white_holds` » ne dit
à personne quoi faire. Constat de Julien le 2026-09-05 : « tes commentaires n'apportent rien pour
comprendre quel(s) coup(s) sont intéressants à jouer ».

## Décision

Un module dédié, `web/src/chess/position-relations.js`, instancie les relations depuis le FEN et
la géométrie des coups légaux, chacune portant **ses deux extrémités et sa raison en clair**. La
restitution se fait **au niveau de la pièce** (`describePiece`), pas de la position.

Onze types sont instanciés : `attacks`, `defends`, `pins`, `screens`, `blockades`, `controls`,
`overprotects`, `guards`, `bears_on`, `contacts`, `targets`. S'y ajoutent les **manœuvres** —
chemin d'une pièce vers un trou en trois coups au plus, recherche en largeur sur les cases vides.

Un type instancié hors vocabulaire lève une exception : on n'écrit pas une relation en rabattant
sur une voisine.

## Ce qui porte la décision : une relation non bornée est du bruit

C'est le point qui a coûté la session précédente (le pion f2 « cloué » contre g1, vrai dans tout
petit roque et sans valeur). Une relation exacte peut ne rien dire. Trois bornes posées :

1. **`defends` seulement sur un homme réellement attaqué.** Compter toutes les défenses rend des
   dizaines d'arêtes de décor dès la position de départ.
2. **`screens` seulement vers une PIÈCE adverse.** Sans cette borne, une tour en a8 « traverse »
   son propre pion a7 pour viser le pion a2 — vrai, présent dans la position de départ, et muet.
3. **`controls` et `overprotects` bornés aux trous et au centre.** Le contrôle brut compte plus de
   deux cents arêtes par position ; seules celles qui portent sur une case disputée informent.

**Le contrôle qui rend ces bornes vérifiables** : la position de départ doit rendre **zéro
relation**. Un détecteur qui ne sait pas se taire ne sait rien dire. C'est une assertion de test,
pas une intention.

## Ce que la décision ne couvre pas

- Les **relations coup → coup** (permet / empêche / prévient / libère / exclut) — point 4 de
  l'issue #7, non traité. C'est ce qui manque pour qu'un candidat sache qu'il ouvre une ligne
  mortelle : mesuré sur la partie de Julien du 2026-09-04, où l'ontologie proposait `Rxc5` en
  disant « la colonne c est ouverte — l'occuper », coup qui perd sur mat en deux.
- Neuf types déclarés restent non instanciés — `belongs_to`, `carries`, `creates`, `located_in`,
  `occupies`, `partitions`, `posts`, `spans`, `weakens`. Ils portent sur des entités (zone,
  corridor, constellation) que le modèle ne construit pas encore. Leur absence est **hors
  périmètre**, pas une lacune à combler par défaut.

## Conséquences

- `position-analysis.js` exporte `GEOMETRY`, un jeu de primitives partagées, plutôt que de voir
  ses fonctions dupliquées. Seul `position-relations.js` le consomme.
- `IMPLEMENTED_AXES` n'est plus une liste énumérée à la main mais **dérivée** de ce que
  `analyzePosition` calcule réellement : elle avait déjà raté un axe en silence.
