# 0002 — Le pont de l'état vers les coups candidats

- **Statut** : accepté
- **Date** : 2026-09-05
- **Contexte** : ADR [0001](0001-ontologie-etat-du-jeu-via-ontology-manager.md)

## Contexte

L'ontologie d'état (`data/ontology/chess-vocabulary.yaml`) rend des étiquettes qui qualifient
la position entière. Julien, après lecture de la première restitution :

> tes commentaires n'apportent rien pour comprendre quel(s) coup(s) sont intéressants à jouer

Le constat est juste, et il n'appelle pas un axe de plus. Le YAML écrit lui-même que
l'ontologie « ne dit pas comment AGRÉGER ses facettes » et qu'elle « décrit UNE position,
pas une trajectoire ». Une étiquette comme `terrain_control = white_holds` ne désigne aucun
objet sur lequel agir.

Le même YAML cite pourtant deux fois la brique manquante sans jamais la construire :
Silman — « the imbalances act as a **roadmap that shows each side what to do** » — et la
2ᵉ question d'Aagaard, « quelle est ma pire pièce ? ».

## Décision

Un **étage séparé**, `web/src/chess/move-suggestions.js`, traduit une lecture d'état en coups
candidats. Il ne modifie pas l'ontologie et ne consomme aucun moteur.

Chaque règle porte l'axe qui la déclenche **et** l'auteur qui la fonde. Une règle sans
attestation n'entre pas — c'est la règle A1 de l'ADR 0001, appliquée à l'étage plan.

Trois contraintes de sélection, décidées au contact de la mesure :

1. **Un plan positionnel ne se paie pas en matériel.** Un candidat dont la pièce ne survit pas
   sur sa case d'arrivée est écarté, par un échange statique (attaquant le moins cher contre
   valeur déplacée, puis compte des défenseurs). Conséquence assumée : les vrais sacrifices
   sont écartés aussi. Ces règles cherchent des plans, pas des combinaisons — les combinaisons
   sont le travail de Stockfish, déjà présent dans `coach.js`.

2. **Une règle ne propose qu'un coup par pièce**, celui qui pénètre le plus loin. Sans cette
   contrainte, « occupe la colonne ouverte » produisait `Rh2 Rh3 Rh4 Rh5 Rh6 Rh8` — six
   variantes d'un même plan, dont une seule bonne. La pénétration est le but de la colonne
   ouverte chez Nimzowitsch, la septième rangée en étant l'aboutissement.

3. **Sur une case disputée, le cavalier passe avant le fou.** Cavalier et fou valent tous deux
   3 : trier par valeur ne tranche pas, et le premier arrivé gagnait. Un ordre d'occupation
   explicite (`n < b < p < r < q`) est nécessaire — sur un trou c'est le cavalier qui va
   (Silman, « Homes for Horses »).

## Vérification

Le juge n'est **pas** le coup joué par le maître — Julien : « aujourd'hui on a les ordinateurs,
on peut les calculer, et on peut avoir plusieurs coups candidats ». Le juge est Stockfish en
multi-PV, et la question posée est « ce candidat perd-il quelque chose ? », pas « est-ce le
coup unique ».

`web/scripts/eval-suggestions.mjs` mesure les candidats sur 8 positions de parties annotées,
à profondeur 18, MultiPV 5. Mesure du 2026-09-05 :

| | v1 | v2 (survie) | v3 (unicité + cavalier) |
|---|---|---|---|
| candidats produits | 33 | 27 | 19 |
| dans le top-5 Stockfish | 4 | 4 | **6** |
| sains (perte ≤ 50 cp) | 6 | 6 | 7 |
| au-dessus du seuil | 27 | 21 | **12** |

`Ne5` (Nimzowitsch), `Nd3` (Kasparov) et `Rh7` (Alekhine) — les coups que ces joueurs
commentent eux-mêmes — sortent en tête de Stockfish, trouvés par `advance_post_held` et
`seventh_rank`.

## Conséquences

- **Le module n'est pas livrable en l'état** : 12 candidats sur 19 perdent plus de 50 cp. Un
  conseiller qui a tort deux fois sur trois nuit.
- Le reliquat de bruit vient de `key_file_control`, qui dit « occupe la colonne ouverte » sans
  regarder où elle mène.
- **Le correctif n'est pas un réglage de plus.** L'ontologie déclare 20 types de relations et
  l'analyseur n'en calcule aucune ; c'est la cause racine de l'absence de prise. Voir
  [issue #7](https://github.com/julien-fernandez/chess-companion/issues/7).
- `inspectPosition()` est ajouté à `position-analysis.js` pour exposer les entités concrètes
  (trous, pièces coincées, clouages, cibles, colonnes ouvertes) — sans lui, aucune règle ne
  peut s'accrocher à autre chose qu'une étiquette.

## Alternatives rejetées

- **Ajouter des axes à l'ontologie d'état.** Un axe reste une étiquette globale ; le problème
  est le niveau de description, pas le nombre d'étiquettes.
- **Faire trancher un LLM.** Contrainte C1 de l'ADR 0001. Confirmée le 2026-09-05 par
  l'observation de DecodeChess, produit commercial : sur une partie de 25 coups, leur décodage
  n'avait couvert que 2 positions, avec un message d'erreur de connexion.
- **Juger les candidats sur le coup joué par le maître.** Le coup du maître n'est pas
  nécessairement le meilleur, et plusieurs coups sont souvent acceptables.
