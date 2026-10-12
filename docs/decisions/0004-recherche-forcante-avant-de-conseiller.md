# 0004 — Un conseil passe par une recherche forçante courte avant d'être prononcé

- **Date** : 2026-09-05
- **Statut** : accepté
- **Contexte** : mesure sur la partie de Julien du 2026-09-04, ADR [0002](0002-pont-etat-vers-coups-candidats.md) et [0003](0003-instanciation-des-relations.md)

## Le fait qui force la décision

Première mesure du pont état → coups sur une partie réelle entière, et non plus sur huit
positions choisies. Sur les 32 coups blancs, l'ontologie a proposé 49 candidats :

| | Nombre |
|---|---|
| Dans le top-5 de Stockfish | 15 |
| Sains (perte ≤ 50 cp) | 21 |
| **Qui perdent la partie (≥ 300 cp)** | **15** |

**Un conseil sur trois faisait perdre.** Au coup 22, le candidat proposé était `Rd3`, qui permet
`Qxe1#` — mat immédiat, alors que 33 des 39 coups légaux l'évitaient.

L'attribution par règle donne le point décisif : `key_file_control` produit **11 des 15 excellents
conseils** et **10 des 15 catastrophes**. C'est simultanément la meilleure et la pire règle. On ne
peut donc ni la garder telle quelle, ni la supprimer.

## Deux hypothèses testées et écartées

1. **« Le problème est quelle pièce occupe la colonne »** (hypothèse de Julien). Réfutée par la
   mesure : la tour — la pièce « correcte » selon le principe — perd dans 35 % des cas, la dame
   dans 25 %. La règle classait déjà la tour avant la dame. Ce n'est pas là que ça casse.
2. **« Le problème est ce que le coup laisse en prise »** (analyse statique à un demi-coup).
   Précise mais insuffisante : 75 % de ce qu'elle signale est mauvais, mais elle n'attrape que
   **3 catastrophes sur 10**. `Rxc5` lui échappe, parce que ce coup *gagne* une tour avant de
   perdre sur mat au coup suivant.

## Décision

Avant qu'un candidat soit prononcé, il passe par `web/src/chess/forcing-search.js` : un négamax
avec élagage alpha-bêta qui n'explore que les **coups forçants** — prises, échecs, et toutes les
parades quand un camp est en échec. Évaluation matérielle seule, mat à ±1000. Un candidat qui
concède au moins **une qualité (2 points)** est retiré de la liste.

Le camp au trait peut toujours **ne pas prendre** (« stand pat »), sauf s'il est en échec.

## Résultat mesuré, partie entière rejouée

| | Avant | Après |
|---|---|---|
| Candidats proposés | 49 | 36 |
| Dans le top-5 du moteur | 15 | 14 |
| Sains (≤ 50 cp) | 21 | 21 |
| **Qui perdent la partie (≥ 300 cp)** | **15** | **4** |
| Positions sans aucun candidat | 9 | 13 |

**Onze catastrophes sur quinze éliminées, pour un seul excellent coup perdu**, et aucun conseil
sain sacrifié. Le companion se tait sur quatre positions de plus : c'est le prix, et c'est le bon
comportement — se taire vaut mieux que conseiller un mat.

Vérifié sur les trois positions qui décident : au coup 22 (mat en un) et au coup 31 (mat en deux)
le companion ne propose plus rien ; au coup 11 il propose toujours `Qd3`, le meilleur coup du
moteur.

Coût : 0,4 à 0,7 s par position, compatible avec l'usage vocal.

Les quatre catastrophes restantes ne viennent plus principalement de `key_file_control` : deux
sur quatre sont produites par `advance_post_held` et `worst_piece`, qui n'avaient pas été
instruites. Elles perdent par la position, pas par une suite forçante — hors de portée de ce
filtre par construction.

## Le résultat qui borne la décision : sur le corpus de maîtres, le filtre ne change RIEN

Rejoué sur les 8 positions de Nimzowitsch, Capablanca, Karpov–Kasparov et Botvinnik : **19
candidats, 6 dans le top-5, 7 sains, 12 au-dessus du seuil — chiffres identiques à avant.** Pas
une élimination, pas une régression.

Ce n'est pas un échec du filtre, c'est sa définition qui apparaît. Les mauvais candidats de ce
corpus (`Qf4` à −612 cp chez Botvinnik, `Qe7` à −377 chez Kasparov) ne perdent par **aucune suite
forçante** : ils perdent par la position. Une recherche matérielle ne peut rien y voir.

D'où deux conséquences à tenir :

1. **Le filtre traite les désastres tactiques, pas les mauvais plans.** Annoncer un taux global
   sans dire sur quel corpus il a été mesuré serait un chiffre faux.
2. **Un corpus de maîtres ne peut pas valider un détecteur de gaffes** — il n'en contient
   presque pas. C'est ce qui fonde l'issue #9, et l'intuition de Julien qui l'a ouverte.

## Ce que cette décision coûte au modèle

La contrainte **C1** du vocabulaire interdit toute source LLM et exige le déterminisme ; elle
nomme trois sources : `fen`, `rules`, `engine`. Une recherche forçante reste déterministe et
calculable en local, mais elle n'est plus de la pure lecture de position : **le companion
calcule désormais des variantes pour se taire, pas pour parler.**

La frontière tenue est celle-ci : la recherche ne sert **jamais** à produire un conseil ni à
justifier un coup. Elle ne sert qu'à **retirer** un candidat que les règles ont produit. Le
« pourquoi » reste intégralement porté par les axes et les auteurs. Un companion qui expliquerait
un coup par une variante aurait cessé d'être ce projet.

## Deux défauts trouvés en construisant, et ce qu'ils enseignent

1. **Sans « stand pat », la recherche condamnait tout le monde** — le camp au trait était forcé de
   prendre, donc toute ligne finissait en désastre. Le filtre signalait 24 candidats sur 32 :
   inutilisable, et pourtant il *semblait* fonctionner puisqu'il attrapait bien les vrais perdants.
2. **Un camp en échec n'avait pas le droit de parer** — une parade n'est ni une prise ni un échec,
   donc la recherche croyait la ligne terminée et rendait le matériel courant. C'est exactement ce
   qui masquait le mat de `Rxc5`.

Les deux ont la même forme, celle des « signaux absents » : la recherche **rendait un nombre**
dans les deux cas. Rien n'échouait. Ils n'ont été trouvés qu'en confrontant le verdict du filtre à
un verdict extérieur — Stockfish — sur des positions dont on connaissait déjà la réponse.

## Portée

Réglé et mesuré sur **une seule partie**. Un seuil calé sur un échantillon de un n'est pas un
seuil. Le corpus de validation est à constituer (issue #9), et il doit comporter des parties
**d'amateurs** : une partie de maître contient trop peu de gaffes pour éprouver un détecteur de
gaffes.
