---
title: Cas d'usage par panneau — Chess Companion
axis: usage
proof_level: provisional
upstream: [../../CLAUDE.md, ../vision-entraineur-aveugle.md]
downstream: [julien-test-case-design, web/src/**/*.test.js, tests/]
status: draft
date: 2026-10-06
inspired_by: waaker/docs/conception/USE_CASES.md, product-conception-toolkit/docs/MODEL_usage.md
---

# Cas d'usage par panneau

> 100 situations concrètes, numérotées globalement, organisées par panneau. Chaque situation
> porte une **couverture** (modélisé / partiel / absent) et le **rôle** qu'elle engage.
>
> Le but n'est pas de décrire l'interface mais de cataloguer les **situations réelles** auxquelles
> le companion doit répondre, y compris celles qu'il ne modélise pas encore.

Légende couverture : **M** = modélisé · **P** = partiel · **A** = absent.

**Niveau de preuve : provisoire.** La couverture vient d'une lecture du code au 2026-10-06
(`main` à `c0c0e11`), pas d'un test de bout en bout par situation. « Non vérifié » le dit quand la
lecture ne suffit pas. Il n'existe pas encore de `MOMENTS.md` : les rôles ci-dessous en tiennent
lieu, à extraire quand les scénarios de test en sortiront.

## Rôles — une seule personne, huit casquettes

Ce qui distingue un rôle, c'est la situation et la **contrainte matérielle**, pas la personne :
Julien les porte tous, à des heures différentes.

| Rôle | Situation | Contrainte matérielle |
|---|---|---|
| **R1. Le joueur à la table** | Partie sur l'échiquier physique | Mains sur les pièces, yeux sur le plateau, pendule : la voix seule, pas d'écran à lire |
| **R2. L'entraîné face à la machine** | Partie contre Stockfish, à la maison | Écran visible, assis ; échiquier physique ou à l'écran |
| **R3. Le réviseur en mouvement** | Révision du répertoire | Marche, transports, écouteurs, téléphone en poche ; pas d'échiquier, bruit ambiant |
| **R4. Le juge de ses parties** | Après une partie, revoir ses coups | Assis, téléphone, une dizaine de minutes |
| **R5. Le pilote** | Mesurer l'apprentissage des ouvertures | Ordinateur, au calme, onglet chess.com ouvert |
| **R6. Le bâtisseur de répertoire** | Extraire des lignes d'une vidéo de coach | Ordinateur, vidéo en pause, PGN à écrire |
| **R7. Le gardien de l'ontologie** | Faire évoluer le vocabulaire | Julien valide, Claude propose et mesure ; deux dépôts |
| **R8. L'exploitant** | Déployer, tenir les secrets | Terminal, ssh vers la box |

Partie prenante qui n'ouvre jamais l'app : **l'adversaire humain**. Il subit le companion (voix,
téléphone sur la table) et c'est pour lui qu'existe l'anti-usage.

**Anti-usage** : toute aide pendant une partie **en cours** contre un humain, en ligne ou à la
table. Le companion juge une partie finie, jamais une partie qui se joue encore (cas 92).

---

## A. Saisie des coups à la voix, devant l'échiquier (14 cas)

Le socle de l'enregistrement par-dessus l'échiquier physique. Rôle principal : **R1**.

| # | Situation | Cvt | Rôle | Système actuel |
|---|---|---|---|---|
| 1 | Dire un coup en français (« cavalier f3 ») → joué | M | R1 | `voice-input.js`, `normalizeFr` |
| 2 | Parler en appuyant sur Espace (push-to-talk) | M | R1 | `MicControls` |
| 3 | Micro ouvert en continu (détection d'activité vocale) | M | R1 | `MicControls`, mode VAD |
| 4 | Choisir le micro parmi plusieurs | M | R1 | `MicControls`, sélecteur |
| 5 | Coup illégal dicté → refusé, le dire à voix haute | M | R1 | « Pas compris : … », « Coup illégal. » dits ; la voix de l'app est ignorée par le micro (`speaking`) |
| 6 | Coup mal entendu (« fou c'est quatre » pour Fc4) → corrigé par la phonétique | M | R1 | `game-voice.js` : règles si chaque mot est compris, puis phonétique, puis confirmation parlée (« Fou c4 ? ») |
| 7 | Coup ambigu (deux cavaliers peuvent aller en d2) → demander lequel | M | R1 | Dit « Quel cavalier ? c3 ou d4 », affiché « Précise la case… » |
| 8 | Promotion dictée (« e8 dame ») | P | R1 | Le coup UCI porte la promotion ; la dictée n'est pas vérifiée |
| 9 | Roque dicté (« petit roque », « grand roque ») | M | R1 | `voice-input.js`, table des roques |
| 10 | Annuler le dernier coup (mauvaise saisie) | M | R1 | `undoMove`, bouton du panneau |
| 11 | Entendre le coup répété avant qu'il compte (confirmation) | P | R1 | Le coup est annoncé (`speak`) après coup, sans demande de confirmation |
| 12 | Saisie au clic quand la voix échoue | M | R1 | Clic case départ / case d'arrivée sur l'échiquier |
| 13 | Reconnaître la position par une photo de l'échiquier | A | R1 | Promis par `CLAUDE.md`, rien d'implémenté |
| 14 | Bruit de salle (club, tournoi) → saisie qui tient | A | R1 | Non mesuré ; la trace des énoncés n'existe que pour la révision |

## B. Partie contre Stockfish et coach en direct (10 cas)

Rôle principal : **R2**. Le coach parle pendant la partie : c'est ici que l'anti-usage pèse.

| # | Situation | Cvt | Rôle | Système actuel |
|---|---|---|---|---|
| 15 | Choisir sa couleur avant la partie | M | R2 | `ColorPicker` |
| 16 | Jouer contre Stockfish, qui répond à voix haute | M | R2 | `triggerEngine`, `speak(describeMove)` |
| 17 | Régler la force de Stockfish à son niveau | A | R2 | Aucun réglage de niveau |
| 18 | Après mon coup, le coach signale une gaffe | M | R2 | `assessMove`, retour « blunder » |
| 19 | Sans erreur, le coach décrit la position (le « paysage ») | M | R2 | `describeLandscape`, onglet Paysage |
| 20 | Couper le coach pour jouer sans aide | M | R2 | `coachEnabled` |
| 21 | Demander « qu'est-ce que je joue ? » → coups candidats expliqués | P | R2 | `suggestMoves` existe et se mesure par harnais ; pas branché à la voix |
| 22 | Une suggestion retirée parce qu'une recherche forçante la réfute | M | R2 | `forcing-search.js` (ADR 0004 : retirer, jamais produire) |
| 23 | Le coach ne masque jamais un fait inférieur (pièce en prise) pour un étage abstrait | P | R2 | Règle du `CLAUDE.md` ; aucun test d'écran |
| 24 | Partie terminée (mat, pat, abandon) → bilan parlé | P | R2 | Bouton « Terminer » ; aucun bilan vocal |

## C. Enregistrement des parties à la table (8 cas)

Rôles : **R1** pendant la partie, **R4** après.

| # | Situation | Cvt | Rôle | Système actuel |
|---|---|---|---|---|
| 25 | Enregistrer une partie jouée à la table, coup par coup à la voix | M | R1 | `game-recorder.js`, `saveGame` |
| 26 | Exporter la partie en PGN | M | R1 | `exportPgn`, bouton du panneau |
| 27 | Saisir l'adversaire, la cadence, le résultat dans les en-têtes | P | R1 | Résultat seulement ; pas d'adversaire ni de cadence |
| 28 | Revoir la liste des parties enregistrées | P | R4 | `listGames` existe ; aucune vue dédiée |
| 29 | Une partie de la table rejoint la base Postgres (comme les parties chess.com) | A | R4 | La base ne reçoit que les parties tirées de chess.com |
| 30 | Reprendre une partie interrompue (onglet fermé, batterie) | A | R1 | Non vérifié ; rien ne restaure une partie en cours |
| 31 | Noter le temps à la pendule à chaque coup | A | R1 | Aucune notion de temps |
| 32 | Corriger un coup trois coups plus tard (mauvaise saisie remarquée tard) | P | R1 | Annuler coup par coup seulement |

## D. Révision vocale du répertoire, à l'aveugle (16 cas)

`#revision`. Rôle principal : **R3** : la révision doit tenir sans regarder l'écran.

| # | Situation | Cvt | Rôle | Système actuel |
|---|---|---|---|---|
| 33 | Lancer la révision et recevoir les cartes dues | M | R3 | `GET /api/variations`, vue `card_schedule` |
| 34 | L'app annonce la position à voix haute, j'énonce ma réponse | M | R3 | `speechSynthesis`, puis micro |
| 35 | Le micro ne s'ouvre qu'après la fin de la synthèse | M | R3 | Corrige « Micro : aborted » |
| 36 | Bonne réponse → carte suivante, rappel noté | M | R3 | `POST /api/review` |
| 37 | Mauvaise réponse → « Non. Encore. », nouvel essai | M | R3 | `judge`, `failedAttempts` |
| 38 | Deux réponses admises à une même position | M | R3 | `intended_alternative` |
| 39 | Afficher ou masquer l'échiquier pendant la révision | M | R3 | Réglage mémorisé (`localStorage`) |
| 40 | Le calendrier se dérive de l'historique, jamais stocké | M | R3 | `card_schedule` (ADR 0011) |
| 41 | Aucune carte due → le dire, proposer autre chose | P | R3 | Non vérifié |
| 42 | Autorisation micro encore demandée → la révision ne se bloque pas | M | R3 | Collecte audio abandonnée après 300 ms |
| 43 | Révision mains libres complète (écouteurs, téléphone en poche) | P | R3 | Les étapes parlent ; aucun test bout en bout poche fermée |
| 44 | Réseau qui tombe dans le métro → les réponses ne se perdent pas | A | R3 | Aucune file hors ligne |
| 45 | Réviser une seule ouverture (« seulement l'écossaise ») | A | R3 | Pas de filtre |
| 46 | Révision « sparring » : l'app joue le camp adverse, je trouve mes coups | A | R3 | Issue #17 |
| 47 | Réviser depuis une vidéo YouTube de coach | A | R3 | Issue #17, second temps |
| 48 | Porter la révision à l'aveugle dans `web/`, adossée à la base | P | R3 | Issue #15 encore ouverte |

## E. Correction de la transcription vocale (9 cas)

Spec `2026-09-30-correction-transcription.md`. Rôle : **R3**.

| # | Situation | Cvt | Rôle | Système actuel |
|---|---|---|---|---|
| 49 | Le navigateur entend « fou c'est quatre » → Fc4 par la phonétique | M | R3 | `phonetic-match.js` |
| 50 | Cinq transcriptions candidates, toutes gardées | M | R3 | `review.heard` |
| 51 | Candidat phonétique incertain → confirmation vocale (« Fc4 ? ») | M | R3 | `confirming` dans `Review.jsx` |
| 52 | Le coup attendu n'entre jamais dans la décision | M | R3 | Règle `resolve_move`, testée |
| 53 | Décideur Laya coupé → `/api/resolve` rend `none` aussitôt | M | R3 | `CHESS_DECIDER_ENABLED=0` |
| 54 | Chaque énoncé tracé avec son audio | M | R3 | `utterance`, `/var/lib/chess-review/audio/` |
| 55 | Rejouer les énoncés confirmés pour mesurer un étage | M | R7 | `replay_utterances.py` |
| 56 | Basculer vers Jev cloud | P | R8 | Réglages prêts (`CHESS_DECIDER_URL`…) ; aucun compte |
| 57 | Accent ou débit propres à Julien appris au fil des énoncés | A | R3 | Rien n'apprend des énoncés tracés |

## F. Cartes de jugement (12 cas)

`#jugement`, spec `2026-10-06-cartes-de-jugement.md`. Rôle principal : **R4**.

| # | Situation | Cvt | Rôle | Système actuel |
|---|---|---|---|---|
| 58 | Juger une partie chess.com par son lien | M | R4 | `judge_game.py --link` (~10 min) |
| 59 | Rejuger la même partie → rien de dupliqué | M | R4 | `ON CONFLICT DO NOTHING` |
| 60 | Recto : position et coup joué ; je dis Conservé / Glissé / Erreur / Gaffe | M | R4 | `Judgment.jsx` |
| 61 | Verso : le verdict du moteur, la perte, le meilleur coup | M | R4 | `judgment_card` |
| 62 | La raison du verdict, tirée de l'ontologie, en notation française | M | R4 | `moveReason`, étage 0 |
| 63 | Aucune raison connue → le dire, montrer les changements « sans sens connu » | M | R4 | `changes` (ADR 0016) |
| 64 | Signaler une raison fausse ou en choisir une autre | M | R4 | `/api/judgment-annotation`, boutons du verso |
| 65 | Coups témoins (bien joués) mêlés aux erreurs | P | R4 | Répartis sur la partie, pas « des mêmes phases » (écart déclaré) |
| 66 | Cadeaux de l'adversaire non punis | M | R4 | Rôle `opponent_gift` |
| 67 | Une nouvelle version du vocabulaire rafraîchit les raisons déjà en base | A | R4 | Mise à jour à la main (carte 9.Dxf5, 2026-10-06) |
| 68 | Une combinaison en plusieurs coups reçoit une raison | A | R4 | Déclarée hors de portée (ADR 0015) |
| 69 | Juger une partie jouée à la table (PGN local) | P | R4 | `judge_game.py --pgn` existe ; la partie de la table n'y arrive pas seule (cas 29) |

## G. Pilotage des ouvertures et analyse de parties (10 cas)

Skill `julien-chess-pilotage`. Rôle principal : **R5**.

| # | Situation | Cvt | Rôle | Système actuel |
|---|---|---|---|---|
| 70 | Tirer ses parties chess.com des quatre derniers mois | M | R5 | `pull_games.py` (exige un onglet chess.com) |
| 71 | Trouver le coup où une partie quitte le répertoire | M | R5 | Vue `game_exit` |
| 72 | Une partie restée dans le répertoire rend une ligne, pas un vide | M | R5 | `exit_ply` à NULL |
| 73 | Proposer la branche à ajouter après une sortie | M | R5 | `analyze_opening.py` |
| 74 | Tableau de bord de l'apprentissage | M | R5 | `pilotage.py` → HTML |
| 75 | Courbe d'évaluation d'une partie | M | R5 | `eval-game.mjs` |
| 76 | Mesurer la qualité des conseils sur un corpus | P | R5 | Harnais ; corpus étroit (issue #9) |
| 77 | Parties d'amateurs pour valider les règles | P | R5 | Échantillon Lichess (`fetch-lichess-sample.mjs`) ; issue #9 ouverte |
| 78 | Déclarer un journal d'entraînement non reproductible | M | R5 | `data/pilotage/` |
| 79 | Voir sur quelles ouvertures je perds le plus de points | A | R5 | Non agrégé |

## H. Construction du répertoire (7 cas)

Rôle principal : **R6**.

| # | Situation | Cvt | Rôle | Système actuel |
|---|---|---|---|---|
| 80 | Extraire un répertoire d'une vidéo de coach | M | R6 | Doctrine de la skill (ADR 0007 à 0009) |
| 81 | Deux transpositions convergentes fusionnent en une position | M | R6 | Indexation par EPD (ADR 0006) |
| 82 | Deux réponses de Julien à une position, non déclarées → signalées | M | R6 | `own_move_conflict` |
| 83 | Exporter le répertoire pour l'historique git | M | R6 | `export_repertoire.py` |
| 84 | Ajouter une branche sans casser une base peuplée | P | R6 | `migrate_repertoire.py` refuse une base peuplée ; ajout à la main |
| 85 | Un titre de chapitre contient un identifiant YouTube → PGN lisible | M | R6 | En-tête commenté par `;` |
| 86 | Ajouter une branche à la voix, sans ordinateur | A | R6 | — |

## I. Évolution de l'ontologie (6 cas)

Spec cartes de jugement §5. Rôle principal : **R7**.

| # | Situation | Cvt | Rôle | Système actuel |
|---|---|---|---|---|
| 87 | Une perte sans raison devient l'entrée de la boucle | M | R7 | Rapport pilote, sonde du tour 1 |
| 88 | Proposer un concept avec son auteur, ou le déclarer sans source | M | R7 | `trades_queens_behind` (Capablanca), ADR 0017 |
| 89 | Mesurer un détecteur candidat sur une partie entière avant de l'ajouter | P | R7 | Sonde jetable, hors dépôt |
| 90 | Chaque concept a son test inverse (la position de départ ne rend rien) | M | R7 | Tests `queenTrade`, omissions |
| 91 | Monter la version, tirer, épingler, sans dérive | M | R7 | `pull:ontology`, `PINNED_VOCABULARY_VERSION` |
| 92 | Refuser d'analyser une partie qui se joue encore (partie daily en cours) | M | R7 | `is_finished` : `judge_game.py` refuse, `analyze_opening.py` écarte (PR #26) |

## J. Accès et exploitation (8 cas)

Rôles : **R8**, et tout rôle au moment d'entrer.

| # | Situation | Cvt | Rôle | Système actuel |
|---|---|---|---|---|
| 93 | Se connecter par un lien, sans mot de passe | M | R3 | `/api/login?key=` (ADR 0014) |
| 94 | Lien reçu par Telegram, jamais par la session | M | R8 | Envoi depuis la box |
| 95 | Le lien marche aussi sur un appareil déjà venu | M | R3 | `navigateFallbackDenylist` (PR #19) |
| 96 | Tourner le secret : l'ancien lien rend 401 | M | R8 | Rotation du 2026-10-06 (#20) |
| 97 | La clé du lien n'apparaît dans aucun journal | M | R8 | `log_message` masqué (#21), `access_log off` |
| 98 | Redéployer en une commande | M | R8 | `deploy/install.sh` |
| 99 | Installer la PWA sur le téléphone, icône sur l'écran d'accueil | P | R3 | Service worker Workbox ; installation non vérifiée |
| 100 | Sauvegarder la base hors du VPS | A | R8 | Aucune sauvegarde ; la bisync est suspendue |

---

## Couverture globale

| État | Nombre | Part |
|---|---|---|
| **Modélisé** (M) | 65 | 65 % |
| **Partiel** (P) | 19 | 19 % |
| **Absent** (A) | 16 | 16 % |

## Angles morts (absent)

| # | Situation | Panneau | Impact |
|---|---|---|---|
| 100 | Sauvegarde de la base | J | Le répertoire, les rappels et les énoncés n'existent qu'au VPS |
| 44 | Réponses hors ligne | D | Révision en transports : une coupure perd le rappel |
| 13 | Position par photo | A | Promesse du `CLAUDE.md`, aucune ligne de code |
| 67 | Rafraîchir les raisons à chaque version | F | Chaque tour de la boucle laisse des cartes en retard |
| 29 | Parties de la table dans la base | C | Le jugement et le pilotage ne voient que chess.com |

## Partiels à muscler (priorisation)

1. **#11** — Confirmer aussi un coup sûr, au choix du joueur (seul l'incertain se confirme aujourd'hui).
2. **#43** — Révision mains libres testée de bout en bout, téléphone en poche.
3. **#21** — Brancher les coups candidats sur la voix (« qu'est-ce que je joue ? »).
4. **#48** — Fermer l'issue #15.
5. **#99** — Vérifier l'installation de la PWA sur le téléphone.
