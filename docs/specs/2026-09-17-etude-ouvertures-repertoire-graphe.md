# Spec — Étude des ouvertures : répertoire, rappel espacé, graphe de positions

- **Date** : 2026-09-17
- **Statut** : brique C (indexation EPD + détection de sortie) implémentée et testée sur transpositions synthétiques ; gate (validation sur parties réelles de Julien) non franchi
- **Source** : conversation claude.ai « Organiser l'étude des ouvertures aux échecs »
  (cf. `docs/rapports/2026.09.17_claude-ai_coaching-ouvertures.md`). La méthodologie y est
  posée ; ce spec la contraint en feature du companion et en paliers vérifiables.

## 1. Le but, et ce qui n'en est pas un

Permettre à Julien de **savoir, à quel coup il sort de sa préparation** dans une partie réelle, et
de **mesurer ce qu'il sait** (rappelé sans aide) plutôt que ce qu'il a vu (exploré). Le companion
porte le tableau de bord de ce qui est su, jamais la carte de toute la théorie.

Hors périmètre, explicitement :

- **la carte exhaustive des ouvertures** : 119 060 324 séquences après 3 coups de chaque camp.
  Aucun humain ne l'utilise ; la construire donnerait la sensation d'avancer sans mieux jouer ;
- **« gagnant au 5ᵉ-6ᵉ coup »** : dans les ouvertures sérieuses l'évaluation reste proche de l'égalité
  à ce stade. Ce qui gagne, ce sont les erreurs adverses — pas une ligne à mémoriser ;
- **l'unité-séquence** : deux ordres de coups différents aboutissent à la même position FEN et
  reçoivent deux noms d'ouverture. L'unité réelle est la **position**, pas la suite. L'« arbre »
  est un graphe.

## 2. Le constat qui fonde le travail

Julien a demandé à tracer « l'ensemble des coups » pour savoir ce qu'il a exploré, et identifier
les lignes gagnantes au 5ᵉ-6ᵉ coup. La conversation claude.ai a déconstruit six hypothèses :

| Hypothèse de départ | Remplacée par |
|---|---|
| Tout cartographier | Ce que **tes adversaires** jouent |
| Exploré = acquis | **Rappelé sans aide** = acquis |
| Lignes gagnantes au coup 6 | Position jouable + plan connu |
| Arbre de coups | **Graphe de positions** |
| Ouverture après ouverture | Un répertoire, élargi par tes parties |
| Mémoire défaillante | Méthode de relecture défaillante |

Le companion enregistre déjà des parties (OTB, dictée/photo) et analyse avec Stockfish. Ce qu'il
ne fait pas : rapprocher une partie jouée d'un **répertoire déclaré**, et signaler le premier coup
où la partie quitte ce répertoire. C'est ce rapprochement qui rend la progression mesurable.

⚠️ **Le constat n'est pas mesuré sur les parties de Julien.** Comme pour le spec
2026-09-06 (§ 2.1), l'hypothèse — « le goulot est la méthode de relecture, pas la mémoire » — est
testable et sera vérifiée à l'étape 2 : si les sorties de préparation se concentrent avant le
coup 3 ou ne corrèlent pas avec les défaites, le dispositif ne sert à rien et le spec tombe.

## 3. Architecture

Trois briques, chacune testable seule. Le companion n'en implémente que **B et C** ; A est un outil
externe dont il consomme la sortie.

| Brique | Rôle | Entrée → Sortie | Où |
|---|---|---|---|
| **A · OpeningTree** (externe) | construit l'arbre des parties jouées, pourcentages de réussite par coup | PGN Lichess/Chess.com → arbre | hors repo |
| **B · Répertoire minimal** | déclare 1 système blanc + 2 réponses noires (1…e4, 1…d4), limité à 6-8 coups, en PGN Lichess | choix de Julien → PGN épinglé | `data/repertoire/` (gitignoré) |
| **C · Graphe de positions** | transforme le PGN de B en graphe indexé par EPD, nœuds colorés par statut, alimenté par les parties jouées | PGN répertoire + parties → graphe | `src/` (Python, `python-chess`) |

**La règle d'architecture qui tient tout** : le graphe C est **indexé par EPD**, pas par FEN.
La FEN porte le compteur de demi-coup et le numéro de coup ; deux transpositions qui convergent
au même moment ont des FEN distinctes (`- 2 4` vs `- 0 4`) et ne fusionnent pas. L'EPD
(placement + trait + roque + prise en passant légale) est l'identité de position. **Constat
mesuré** au test `test_la_fen_naurait_pas_fusionne_la_transposition` : indexer par FEN aurait
silencieusement dupliqué chaque transposition. Un test le verrouille : deux PGN d'ordres
différents menant à la même position produisent un seul nœud EPD, pas deux.

**Le statut d'un nœud** remplace « exploré » — qui n'est pas mesurable — par quatre valeurs
observables :

| Statut | Définition observable |
|---|---|
| `non_vu` | la position n'est dans ni le répertoire ni une partie jouée |
| `vu` | la position est dans le répertoire (B) |
| `su` | rappelé sans aide lors d'un drill de rappel espacé |
| `rate` | la position a été jouée en partie et la suite réelle s'en est écartée |

Le statut `su` est produit par **rappel espacé** (Listudy ou Chessdriller, externes, consomment le
même PGN). Le companion ne réimplémente pas l'algorithme de répétition : il lit le statut que ces
outils exportent, il ne le calcule pas.

## 4. La boucle de coaching

**Geste après chaque partie enregistrée** — un seul :

1. le companion rejoue la partie avec `python-chess` (jamais à la main, jamais en lisant un
   écran — règle du CLAUDE.md) ;
2. il parcourt les FEN et signale le **premier nœud hors répertoire** : *« tu es sorti de ta
   préparation au coup N, position FEN … »* ;
3. Julien ajoute **uniquement** la branche qui s'en est écartée au PGN répertoire (B).

Le graphe C ne se construit qu'après une trentaine de parties, à partir de ces données. Avant, il
serait un squelette sans mesure.

**Métrique mensuelle** : la moyenne du **coup de sortie de préparation**, recalculée sur les
nouvelles parties. C'est l'unique chiffre que ce feature cherche à faire monter. Un dispositif qui
ne peut pas se faire démentir ne vaut rien : si Julien s'entraîne au rappel et que ce chiffre ne
monte pas, l'entraînement ne sert à rien et on change d'approche.

## 5. Gardes et tests

| Garde | Ce qu'il attrape |
|---|---|
| deux PGN d'ordres différents → même position (EPD) → un seul nœud | l'indexation par séquence **ou par FEN** au lieu d'EPD (la FEN éclate les transpositions) |
| position de départ dans le graphe → un seul nœud racine | les doublons de transposition initiale |
| le compagnon signale le coup de sortie **même s'il vaut 1** | le rapprochement qui rend zéro sur une partie courte |
| le PGN répertoire est rejoué, non lu tel quel, pour indexer | une position saisie à la main |
| `su` n'est jamais déduit de `vu` | la confusion exploré/acquis que ce feature existe pour casser |

## 6. Ordre de réalisation

**Le plan couvre les étapes 1 et 2.** L'étape 2 est un gate : elle valide ou détruit l'hypothèse
§ 2, et les étapes 3 à 5 ne se planifient qu'après.

1. **B · Répertoire minimal** — Julien fige 1 blanc + 2 noirs en étude Lichess (3 chapitres,
   6-8 coups), exporté en PGN dans `data/repertoire/`. Aucun code : un fichier.
2. **C · Indexation EPD** — script `python-chess` qui rejoue le PGN de B et produit le graphe
   initial de nœuds `vu`. Testé sur deux transpositions connues (garde § 5). C'est cette étape qui
   valide que l'unité-position tient — et qui a déjà démontré que la clé doit être l'EPD, pas la
   FEN.
3. **Détection de sortie de préparation** — sur une partie enregistrée (déjà rejouée par le
   companion), parcourir les FEN et signaler le premier hors-graphe. Testé sur une partie réelle
   de Julien.
4. **Statut `rate`** — colorer les nœuds atteints en partie puis quittés. Métrique mensuelle du
   coup de sortie.
5. **Statut `su`** — brancher l'export Listudy/Chessdriller. Non planifié avant que la métrique de
   l'étape 4 montre que le rapprochement sert à quelque chose.

L'étape A (OpeningTree) est un outil externe ; elle se branche quand Julien veut les pourcentages
de réussite par coup sur son historique Lichess, et n'entre pas dans le repo.

## 7. Ce qui reste ouvert

- **Répertoire blanc/noir concret** : Julien n'a pas encore choisi le système blanc ni les deux
  réponses noires. L'étape 1 est bloquée sur ce choix humain.
- **Source du statut `su`** : Listudy vs Chessdriller — décision ouverte, à trancher à l'étape 5.
- **Format d'export du statut par Listudy/Chessdriller** : non vérifié ; si aucun n'exporte un
  statut par position consommable, l'étape 5 exige un intermédiaire.
- **Lien avec le spec 2026-09-06 (perception)** : les deux features mesurent des choses différentes
  (coup de sortie vs faute sans coup forçant). Elles ne se combattent pas, mais leur priorité
  relative n'est pas tranchée.