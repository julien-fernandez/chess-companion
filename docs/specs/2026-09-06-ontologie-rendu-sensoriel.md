# Spec — Ontologie du rendu sensoriel et entraînement de la perception

- **Date** : 2026-09-06
- **Issue** : #6 (3ᵉ ontologie), s'appuie sur #7 (relations) et #9 (corpus)
- **Statut** : validé en conception avec Julien le 2026-09-06, non implémenté

## 1. Le but, et ce qui n'en est pas un

Entraîner la **perception** d'une position — voir où elle se noue — et non la capacité de calcul.

Hors périmètre, explicitement :

- **le temps réel de la partie** : le rendu n'intervient qu'à l'entraînement ou à la revue ;
- **le son** : aucune source dans le corpus. À instruire séparément avant toute primitive sonore ;
- **conseiller un coup** : ce pont existe déjà (`move-suggestions.js`) et n'est pas l'objet ici.

## 2. Le constat qui fonde le travail — mesuré, pas supposé

### 2.1 L'écart entre ce que Julien calcule et ce qu'il voit

Relevé sur le compte Chess.com `jfernandezjlt` le 2026-09-06 :

| | |
|---|---|
| Tactique (puzzles) | **1399 – 1629** |
| Rapide (parties) | **782** aujourd'hui, 975 au mieux, 855 parties, 48 % de gains |
| Blitz | 461, 3 337 parties — **exclu de toute mesure** : mesure l'horloge, pas le jugement |

Un écart puzzle/partie de 200 à 400 points est banal — un puzzle annonce qu'il y a quelque chose à
trouver. **Celui-ci fait ~800.** Hypothèse de travail, testable sur les 855 parties : le goulot
n'est pas le calcul mais le fait de **remarquer qu'il y a quelque chose à calculer**.

Cette hypothèse doit être vérifiée à l'étape 2 du plan (§ 7). Si les fautes de Julien se concentrent au
contraire dans les positions **avec** suite forçante, tout ce spec tombe et il faut travailler le
calcul. Le dispositif doit pouvoir rendre ce verdict.

### 2.2 Ce que le companion dit des positions où Julien ne voit rien

Deux parties en cours, fournies par Julien le 2026-09-06.

**Partie 1010243546** — `r6r/4k3/8/R3Pp2/1P2p2p/p1n4P/P4KP1/R7 w - - 4 37`

- **0 axe actif** ;
- candidats : `Tc1`, `Tc5`, motivés par *« la colonne c est ouverte — l'occuper »* ;
- **44 relations**, dont 4 portantes noyées dans 21 `controls` et 16 `guards`.

Les deux candidats sont les deux meilleurs coups du moteur (`Tc1` −499 cp, `Tc5` −550 cp). **Le
coup est bon, la raison est fausse** : `Tc1` vaut parce qu'il attaque un cavalier que rien ne
défend (`attaquants blancs de c3 : [c1]`, `défenseurs noirs : []`), pas parce que la colonne c est
ouverte. Un bon coup avec une explication creuse n'enseigne rien et fait rejouer `Tc5` ailleurs.

Julien a relevé que `Tc1` **lâche a2**. Vérifié :

```
AVANT   a2 : défenseurs [a1] · attaquants [c3]   → tenu
Tc1     a2 : défenseurs []   · attaquants [c3]   → LÂCHÉ
Tc5     a2 : défenseurs [a1] · attaquants [c3]   → tenu
```

Et le moteur classe `Cxa2` **quatrième** réponse noire (370 cp) derrière `Txa5` (442). **Lâcher une
case n'est pas la perdre.** Un compteur d'attaquants seul aurait condamné le meilleur coup : c'est
la preuve qu'il faut deux primitives distinctes, le *poids* et l'*enjeu*.

**Partie 1019075022** — `3r1rk1/4qppp/p1npb3/1p2p3/B7/BP6/P1P2PPP/R2Q1RK1 w - - 2 16`

- **0 axe actif** ;
- **0 candidat** — le companion est muet ;
- 37 relations, dont `Fa3` et `Dd1` attaquent **d6**, `Td8` et `De7` le défendent.

Toute la position se joue sur d6, et rien ne le dit.

### 2.3 Le diagnostic

Le companion **a les bons faits et montre les mauvais**. Ce n'est pas un défaut de calcul, c'est
une **absence de hiérarchie** — exactement la panne de Julien, et exactement la contrainte de
Gœtz (1894) : *« ou bien nous nous représentons vaguement une grande surface, ou bien nous
détaillons minutieusement un petit coin. Les deux à la fois nous sont impossibles. »*

**Conséquence directrice : le travail de cette ontologie est de RETIRER, pas d'ajouter.**

## 3. Architecture

Quatre unités, chacune testable seule.

| Unité | Rôle | Entrée → Sortie |
|---|---|---|
| `web/src/chess/salience.js` | (1) classe les relations par ce qu'elles pèsent et jette le décor · (2) **rattache un coup à la relation qui le justifie** | 44 relations → 3-5 relations + une justification par coup |
| `data/ontology/rendering-vocabulary.yaml` | 3ᵉ ontologie : primitives de rendu | — |
| `web/src/chess/sensory-render.js` | applique une primitive à une position | position + primitive → scène |
| `web/src/chess/drill.js` | montrer · demander · révéler · noter | scène + mode de défaillance → score |

**La règle d'architecture qui tient tout** : `sensory-render` n'a **aucun accès** aux relations
brutes, seulement à la sortie de `salience`. Le décoratif devient impossible **par construction**,
pas par discipline. Un test le verrouille : `sensory-render` n'importe pas `position-relations`.

`salience.js` sert **immédiatement**, avant tout rendu — c'est lui qui aurait empêché « occupe la
colonne c » sur une position qui se joue sur la colonne a.

## 4. Le vocabulaire de rendu

Cinq primitives, nommées par Julien. Chacune déclare **ce qu'elle retire** ; une primitive qui ne
retire rien est refusée à l'entrée de l'ontologie, et un garde le vérifie.

⚠️ **Correction du 2026-09-06, après une démonstration ratée.** Ces primitives ne sont **pas des
sœurs interchangeables** : elles forment des **étages ordonnés**, du concret à l'abstrait, et
l'ordre est une contrainte vérifiable.

> **Un étage abstrait n'a jamais le droit de masquer un fait d'un étage inférieur.**

Le fait qui l'impose : une première version de la démonstration a flouté tout l'échiquier sauf
l'attracteur calculé (`d7`, une case vide) sur la position `2k2bnr/pp3pp1/2p4p/q3Nb2/2B5/2N1B3/PPP2PPP/3R1RK1 b`.
Elle a ainsi effacé le fait décisif : le cavalier blanc en `e5` était attaqué une fois, défendu
zéro fois — **gratuit**. `Dxe5` valait +291 cp, le coup joué −209. Un attracteur qui cache une
pièce en prise est pire que pas d'attracteur du tout.

L'ordre retenu, et ce que chaque étage efface :

| Étage | Montre | Efface |
|---|---|---|
| 0 · matériel | qui est en prise, attaquants contre défenseurs | les cases où rien ne peut être pris |
| 1 · contrôle | le solde d'influence case par case | les pièces — il ne reste que le terrain |
| 2 · fonctions | défenseur unique, clouage | les pièces libres de leurs mouvements |
| 3 · forces | les rayons des pièces à distance | les pièces elles-mêmes |
| 4 · attracteur | où la position se noue | le reste — **sauf ce que l'étage 0 a signalé** |

| Primitive | Ce qu'elle est, mécaniquement | Ce qu'elle EFFACE | Source |
|---|---|---|---|
| `forces` | les rayons des pièces à distance | les pièces elles-mêmes | Gœtz 1894 : *« un fou n'est pas une pièce, c'est une force oblique »* |
| `weight` | nombre de pièces des deux camps portant sur une case | les cases que personne ne dispute | Binet 1894 (lignes qui s'entrecroisent) |
| `stake` | ce qu'on perd si la case tombe | les cases sans conséquence | Lasker (« target ») |
| `weakness` | ce que rien ne peut plus défendre | ce qui est tenu | Nimzowitsch (trou), Lasker (fonction) |
| `attractor` | la zone de convergence des forces des deux camps | **le reste de l'échiquier** | **aucune — primitive originale du projet** |

### 4.1 L'attracteur — définition, et pourquoi il n'a pas d'ancêtre

Le mot n'est chez aucun auteur classique. Aucune source canonique contemporaine trouvée non plus :
seul existe *center of gravity*, repris de Clausewitz, attesté dans un billet de blog Chess.com —
**pas une autorité, donc pas cité comme telle**.

La surprotection de Nimzowitsch a d'abord été proposée comme ancêtre. **Écartée** : ce sont deux
concepts différents, et les confondre serait précisément le « rabattre sur une voisine » que le
CLAUDE.md interdit.

| | Surprotection (Nimzowitsch) | Attracteur |
|---|---|---|
| Nature | **prescription** — que faire d'un point fort à moi | **description** — où la position se noue |
| Portée | unilatérale | **bilatérale** : les deux camps y portent |
| Sur la partie 1 | ne s'applique pas | a2 : une **faiblesse** qui attire |

**Définition retenue** — l'attracteur est la case, ou le groupe d'**au plus 4 cases adjacentes**,
maximisant `weight × stake` sous la contrainte que **les deux camps y portent** (sinon rien n'y est
disputé).

- `weight(case)` = nombre de pièces distinctes des deux couleurs attaquant ou défendant la case ;
- `stake(case)` = ce qu'on perd si elle tombe, en unités de pion : valeur de l'homme qui l'occupe,
  distance à la promotion d'un pion passé dont elle barre le chemin, **contiguïté** à un roi, trou
  qu'aucun pion adverse ne peut plus défendre. Le barème exact se fixe à l'étape 4, sur le lot.

**Vérification sur les deux positions** (le seul corpus dont on dispose) :

| Position | Attracteur attendu | `weight` | `stake` |
|---|---|---|---|
| 1010243546 | **a2** | 2 (`Ta1` blanc, `Cc3` noir) | pion occupé + bloque le pion a3 à une case de la dame |
| 1019075022 | **d6** | 4 (`Fa3`, `Dd1` / `Td8`, `De7`) | pion arriéré sur colonne semi-ouverte |

⚠️ **Deux positions ne valident rien.** Cette définition est une hypothèse jusqu'à l'étape 4 du
plan. Elle doit être confrontée au lot Lichess avant d'être considérée comme acquise, et le spec
sera amendé si elle ne tient pas.

### 4.2 Le garde de silence

La position de départ ne doit rendre **aucun attracteur** : rien n'y est disputé. Une primitive qui
se déclenche partout ne discrimine rien — c'est l'assertion inverse, aussi importante que les
positives, déjà posée en règle dans le CLAUDE.md du projet.

## 4.3 Le protocole de balayage — la forme que prend l'exercice

Demandé par Julien le 2026-09-06 : les étages ne se consultent pas, ils **se parcourent**, toujours
dans le même ordre, jusqu'à ce que la séquence tourne sans effort.

Huit passages, mesurés sur les trois positions du § 2.2 :

| | Passage | Source |
|---|---|---|
| 1 | tes prises | ordre canonique échecs / prises / menaces |
| 2 | tes échecs | idem |
| 3 | **ses prises** | Heisman, *Real Chess* |
| 4 | **ses échecs** | Heisman, *Real Chess* |
| 5 | cases d'arrivée des cavaliers | *board vision drills*, de la Maza |
| 6 | cases d'arrivée des tours | idem |
| 7 | découvertes disponibles | premier étage à deux coups |
| 8 | attracteur | § 4.1 |

**Ce qui fonde le choix, et il est sourcé.** Dan Heisman nomme *Hope Chess* le fait de jouer sans
vérifier les échecs, prises et menaces adverses, et pose que personne ne dépasse durablement 1600
sans cette habitude. L'objectif de Julien est 1500 : il est exactement au mur décrit, et Heisman le
traite comme **une habitude à installer**, pas comme un trait.

⚠️ **Ce qui n'est PAS affirmé.** Julien avance que sa difficulté à parcourir le détail tient à un
mode de pensée, voire à sa personnalité. L'effet établi (Navon, 1977) est la **précédence
globale** — voir la forêt avant les arbres est le réglage par défaut de la perception humaine, pas
une particularité individuelle. La littérature consultée ne dit rien sur son entraînabilité : rien
ne sera donc affirmé là-dessus. Ce que ce spec entraîne est la **séquence**, pas la perception nue.

**Vérification du protocole sur les trois positions** (mesuré le 2026-09-06) :

| Position | tes prises | tes échecs | ses prises | ses échecs | découvertes |
|---|---|---|---|---|---|
| avant 12…Th7 | 4 | 0 | 5 | **2, dont `Td8+`** | 0 |
| colonne a | 2 | 1 | 2 | 2 | 1 |
| d6 | 3 | 0 | 2 | **0** | 0 |

Deux enseignements. D'abord, sur la position perdue, **le passage 1 contenait `Dxe5` et le passage 4
contenait `Td8+`** — le coup qui a gagné la partie deux coups plus tard était déjà énumérable. Ensuite,
la dernière ligne : ni prise en l'air ni échec, les passages concrets se taisent — c'est là que les
étages abstraits deviennent la seule lecture disponible.

## 5. La boucle d'entraînement

**Étage 1 — diagnostic, une fois, sur les 855 parties rapides de Julien**

Chaque faute est classée par un test mécanique déjà implémenté (`forcing-search.js`) :

```
une suite forçante existait   → faute de CALCUL      (Julien y est à ~1600, hors périmètre)
aucune suite forçante         → faute de PERCEPTION  (le terrain de ce spec)
```

Puis, parmi les fautes de perception, le mode de défaillance, contre la liste sourcée du corpus
(`docs/vocabulaire-perception-echecs.md` § 2.5) : point aveugle (Kotov), image retenue
(Krogius/Soltis), grain de 16-20 cases (Soltis).

**Étage 2 — exercice, sur le lot Lichess (gratuit en calcul, déjà annoté)**

Une position rendue avec une primitive qui retire. La question posée est :

> **« Où est le centre de gravité ? »** — clic sur une case ou une zone.

et non « quel est le meilleur coup ». Puis révélation. Sur la partie 1, la réponse est **la colonne
a et le cavalier c3**, pas la colonne c.

**Étage 3 — mesure**

Le **taux de faute dans les positions sans coup forçant**, recalculé chaque mois sur les nouvelles
parties rapides.

**L'exercice et la mesure sont délibérément découplés** : progresser au drill n'améliore pas
mécaniquement le chiffre. Si Julien devient bon aux exercices et que le taux ne bouge pas, **la
mesure dit que l'entraînement ne sert à rien**, et on change d'exercice. Un dispositif qui ne peut
pas se faire démentir ne vaut rien.

## 6. Gardes et tests

| Garde | Ce qu'il attrape |
|---|---|
| `sensory-render` n'importe pas `position-relations` | le décoratif réintroduit par une dépendance directe |
| toute primitive du YAML déclare un `removes` non vide | une primitive qui ajoute sans retirer |
| position de départ → aucun attracteur | une primitive qui se déclenche partout |
| chaque type de relation rendu est déclaré au vocabulaire | le rabattement sur une relation voisine |
| `salience` rend la justification `attacks c3` et **non** `key_file_control` sur la partie 1 | la bonne réponse pour la mauvaise raison |
| `PINNED_RENDERING_VERSION` épinglée | la dérive silencieuse entre le YAML et son consommateur |

## 7. Ordre de réalisation

**Le plan d'implémentation qui suit ce spec ne couvre que les étapes 1 et 2.** L'étape 2 est un
gate : elle valide ou détruit l'hypothèse du § 2.1, et les étapes 3 à 5 ne se planifient qu'après.

1. **`salience.js`** — indépendant du rendu, corrige un défaut mesuré aujourd'hui, testable sur
   les deux positions ci-dessus.
2. **Le diagnostic** sur les parties de Julien — c'est lui qui valide ou détruit l'hypothèse § 2.1,
   et rien d'autre ne doit être construit avant de savoir si elle tient.
3. **`rendering-vocabulary.yaml`** + propagation par ontology-manager (bump, régénération, tirage,
   épinglage).
4. **L'attracteur, confronté au lot Lichess** avant d'être figé.
5. **`sensory-render.js`**, puis **`drill.js`**.

Le son n'apparaît nulle part : il attend son corpus.

## 8. Ce qui reste ouvert

- Le corpus contemporain (GM post-moteurs) demandé par Julien le 2026-09-05 : issue à ouvrir. Le
  corpus actuel s'arrête à Silman/Soltis/Tisdall, années 1990-2010.
- Le plafond de 4 relations par type dans `move-relations.js` est arbitraire, non mesuré.
- Le pilote UCI ne remonte pas les variantes (`pv` vide) — gêne l'explication d'une réfutation.
