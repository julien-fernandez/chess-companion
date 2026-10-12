# Spec — Correction de la transcription vocale en révision

- **Date** : 2026-09-30
- **Statut** : design validé en brainstorming, non implémenté
- **Issue liée** : #15 (révision vocale à l'aveugle)
- **Remplace** : le jugement direct de la première transcription (`judge` sur `e.results[0][0]`),
  corrigé en partie par `judgeHeard` (première des 5 transcriptions lisible comme coup légal)

## 1. Le constat

Première révision réelle au téléphone (gambit écossais, 30/09) : au premier coup (1.e4), la
reconnaissance de Chrome a rendu **« fouad »**. Le parseur n'y a lu aucun coup, et la révision est
restée bloquée. Les tentatives suivantes se sont arrêtées sur « Micro : aborted », parce que le micro
s'ouvrait pendant que le téléphone parlait encore (corrigé par a55cfc7). Seule la première
transcription était gardée : on ne sait pas ce que Julien a vraiment dit.

Aujourd'hui, un essai compris mais faux (« Non. Encore. ») n'est **pas enregistré du tout** : la
base ne voit que les issues qui produisent un rappel.

## 2. Le but, et ce qui n'en est pas un

Réviser à la voix sans buter sur la transcription. Critère :
- sur une révision réelle, presque aucun « Pas compris » ;
- **zéro rappel validé sur un coup que Julien n'a pas dit**.

Priorité : **la justesse d'abord** (un aller-retour de 300 à 500 ms vers le VPS est acceptable),
**la vitesse ensuite**.

Hors périmètre :
- **la reconnaissance sur l'audio** (Whisper ou un autre moteur guidé par la liste des coups) :
  on collecte l'audio, on décidera sur mesure ;
- **la transcription libre** : on ne cherche jamais le texte exact, seulement le coup parmi une
  liste finie ;
- **le reste de l'app** (partie jouée, coach) : seule la révision (`#revision`) change.

## 3. Le principe : choisir parmi une liste, jamais écrire

À chaque demande de coup, l'ensemble des réponses est **fini et connu** : les coups légaux de la
position, entre 20 et 40 en ouverture, au plus 218. On ne transcrit donc pas : on **choisit**, du
moins cher au plus cher.

1. **Étage 1 — rapprochement phonétique**, dans le navigateur, 0 ms.
2. **Étage 3 — modèle de décision** au format de Jev (TypeSafe AI) : un choix typé parmi les
   coups légaux, avec une confiance calibrée, en une seule passe. Laya (open source, multilingue)
   hébergé sur le VPS en premier ; Jev cloud en alternative interchangeable.
3. **Confirmation vocale** quand aucun étage n'est sûr.

L'étage 2 (reconnaissance guidée par la liste sur l'audio) est différé : on collecte l'audio dès
maintenant pour le mesurer plus tard.

## 4. Architecture

```
Téléphone                                    VPS (API chess-review)
─────────                                    ──────────────────────
 micro ──► Chrome : 5 transcriptions
   │         │
   │         ▼
   │     Étage 1, phonétique (local, 0 ms)
   │         ├─ net ─────────────────► coup décidé
   │         └─ hésite ── POST /api/resolve ──► chess-decider (Laya, 127.0.0.1)
   │                         ◄── coup + confiance ──┘
   │         ▼
   │     confiance ≥ seuil ► coup décidé   /   sinon ► « Tu as dit fou c 4 ? »
   │
   └─► audio (MediaRecorder) ── POST /api/utterance ──► /var/lib/chess-review/audio/*.webm
                                                        + ligne dans la table utterance
```

### 4.1 `web/src/chess/phonetic-match.js` (nouveau)

- **Entrée** : un `Chess` (la position) et la liste des transcriptions, dans l'ordre de confiance.
- **Sortie** : les coups légaux classés, chacun avec un score dans [0, 1], plus un verdict
  `decided` (le premier coup) ou `undecided`.
- **Formes parlées** : chaque coup légal se décline en ses formes françaises plausibles, par
  exemple « fou c 4 », « fou prend c 4 », « f c 4 », « c 4 » (pour un pion), « petit roque ».
  La génération réutilise `spokenSan` de `tts.js`.
- **Distance** : la transcription et les formes passent par la normalisation de `normalizeFr`
  (`voice-input.js`), puis on les compare par une distance d'édition sur une clé phonétique
  française (voyelles rapprochées, lettres muettes retirées, homophones de colonne : « si »/« c »,
  « g »/« j »…). Chaque coup garde son meilleur score toutes transcriptions confondues.
- **Décision** : le premier coup est `decided` si son score ≥ `PHONETIC_MIN` **et** s'il devance le
  deuxième d'au moins `PHONETIC_MARGIN`. Les deux seuils sont des constantes du module, réglées
  sur le corpus (§ 7).
- **Neutralité** : le module **ne reçoit pas** le coup attendu. Il ne peut donc pas le favoriser.

### 4.2 `POST /api/resolve` (dans `src/review_api.py`)

- **Requête** : `{ fen, transcripts: [...], options: [{ san, spoken }], phonetic: [{ san, score }] }`.
  Les options sont les coups légaux avec leur forme parlée française ; `phonetic` porte les 5
  meilleurs coups de l'étage 1. Le coup attendu n'est **pas** transmis.
- **Appel** : la route construit une requête `/v1/systemone` pour le décideur (question de type
  « choix », les options en forme parlée, l'état = les transcriptions et le classement
  phonétique), par `urllib` : l'API reste en stdlib + psycopg.
- **Réponse** : `{ san, confidence, decider, latency_ms }`, ou `{ san: null, decider: "none" }`
  si le décideur est absent, en erreur, ou ne répond pas sous `CHESS_DECIDER_TIMEOUT`
  (1,5 s par défaut).
- **Réglages** (variables d'environnement, lues par `setting()` qui les nettoie) :
  `CHESS_DECIDER_URL` (défaut `http://127.0.0.1:8111`), `CHESS_DECIDER_KEY` (vide pour Laya,
  clé du credstore pour Jev), `CHESS_DECIDER_TIMEOUT`.

### 4.3 Service `chess-decider` (VPS)

- Le paquet `laya` (PyPI, Apache-2.0) et son serveur HTTP, qui parle le même format que Jev.
- Checkpoint **multilingue** (mmBERT-base, 322 M de paramètres, environ 1,3 Go en mémoire).
- Venv dédié `/opt/chess-decider/.venv`, unit systemd `chess-decider`, écoute sur 127.0.0.1:8111
  seulement. L'API de révision garde son venv minimal.
- `deploy/install.sh` installe le venv, copie l'unit, redémarre le service et contrôle qu'il répond.

### 4.4 Confirmation vocale (`Review.jsx`)

- Après un étage 3 indécis ou sous le seuil, l'app dit « Tu as dit *coup en français* ? » avec le
  meilleur candidat (Laya, sinon étage 1).
- La réponse (« oui », « non », ou les boutons Oui/Non à l'écran) passe par une liste fermée
  (« oui », « ouais », « c'est ça » / « non », « pas du tout »…).
- **Oui** : le coup est décidé. **Non** : Julien redit son coup, **sans que ça coûte un essai**.
  Pas de réponse lisible : rien n'est décidé, on revient à « Pas compris, répète » (sans coût
  d'essai, comme tout énoncé incompris).

### 4.5 Collecte audio

- `MediaRecorder` démarre avec la reconnaissance et s'arrête avec elle ; le clip (webm/opus,
  environ 10 Ko) part avec la trace par `POST /api/utterance`, encodé en base64 dans le JSON.
- Fichiers dans `/var/lib/chess-review/audio/AAAA-MM/<id>.webm`, jamais dans git ni dans la base.
  La base ne garde que le nom du fichier.
- Si le navigateur refuse l'enregistrement, ou si l'envoi échoue, la trace est écrite sans fichier.

### 4.6 Jugement

Le coup décidé passe au jugement actuel de `review-session.js`, sans changement : correct,
alternative déclarée (`intended_alternative`, ADR 0013), à réessayer, échoué. `judgeHeard` est
remplacé par l'enchaînement étage 1 → étage 3 → confirmation.

## 5. Données

### 5.1 Table `utterance` : une ligne par énoncé

| colonne | type | contenu |
|---|---|---|
| `id` | bigint | clé |
| `said_at` | timestamptz | moment de l'énoncé |
| `epd` | text | position |
| `expected_san` | text | coup attendu (pour la mesure, jamais pour décider) |
| `transcripts` | text[] | transcriptions de Chrome, dans l'ordre de confiance ; `{texte tapé}` pour une saisie |
| `phonetic_san` | text, NULL | premier coup de l'étage 1 |
| `phonetic_margin` | real, NULL | écart avec le deuxième |
| `decider` | enum `utterance_decider` | `phonetic`, `laya`, `jev`, `confirmation`, `typed`, `none` |
| `decided_san` | text, NULL | coup retenu, NULL si rien n'a été décidé |
| `confidence` | real, NULL | confiance du décideur |
| `confirmed` | boolean, NULL | réponse au « Tu as dit… ? », NULL si pas posée |
| `latency_ms` | integer, NULL | temps de décision, du résultat de Chrome au coup décidé |
| `audio_file` | text, NULL | nom du fichier audio |
| `review_id` | bigint, NULL | rappel produit (FK `review`), NULL pour un essai sans rappel |

- `review` ne change pas ; `heard` reste pour les lignes existantes.
- La table et l'enum se déclarent dans `data/ontology/chess-repertoire-vocabulary.yaml`, et
  `scripts/generate_ddl.py` régénère `sql/schema.sql` (ADR 0012). Le test de dérive
  `test_schema.py` la couvre.
- **Bases existantes** : `migrate_repertoire.py` refuse une base peuplée. Un script d'ajout seul,
  `sql/migrations/0001_utterance.sql` (création de l'enum et de la table, rien d'autre), se passe à
  la main sur la base du VPS (`chess` sur `postgresql-shared`) et sur la base locale (55432).

### 5.2 Routes

- `POST /api/utterance` : écrit la trace (et le fichier audio s'il y en a un), rend son `id`.
- `POST /api/review` : accepte en plus un `utterance_id` facultatif, pour relier le rappel à
  l'énoncé qui l'a produit.

## 6. Pannes : aucune ne bloque la révision

| Panne | Comportement |
|---|---|
| Décideur absent, lent (> timeout) ou en erreur | `/api/resolve` rend `decider: "none"` → confirmation vocale |
| Envoi de l'audio raté ou enregistrement refusé | trace écrite sans fichier |
| Écriture de la trace ratée | comptée à l'écran, comme « rappel(s) non enregistré(s) » |
| Micro refusé | saisie au clavier, `decider: "typed"` |
| VPS saturé, latence Laya > 1,5 s de façon durable | basculer `CHESS_DECIDER_URL` vers Jev cloud (clé à créer par Julien) |

## 7. Tests et mesure

- **Étage 1** (`phonetic-match.test.js`, `node --test`) :
  - cas réels : « fouad », « fou c'est quatre », « phoque c 4 », « e quatre », « cavalière f3 » ;
  - **assertions inverses** : une phrase sans rapport (« bonjour », « quelle heure est-il »)
    ne décide rien ; une position sans coup de fou ne rend aucun coup de fou ;
  - **neutralité** : le classement ne dépend que de la position et des transcriptions (le module
    n'a pas accès au coup attendu ; un test le vérifie sur la signature).
- **`/api/resolve`** (`tests/test_review_api.py`) : faux décideur local qui répond, qui dépasse le
  timeout, qui renvoie une erreur ; la route rend chaque fois une réponse exploitable.
- **Schéma** : `test_schema.py` (dérive ontologie → DDL).
- **Mesure** : `scripts/replay_utterances.py` rejoue les énoncés de `utterance` sur l'étage 1
  seul, sur étage 1 + Laya, et sur étage 1 + Jev si une clé est fournie. Il rend la justesse, la
  part de confirmations demandées et la latence. **La vérité de référence** est `decided_san`
  quand `confirmed = true`, ou le coup tapé (`decider = typed`) ; un énoncé sans vérité est exclu
  du calcul de justesse, pas compté comme juste. **Les seuils `PHONETIC_MIN`, `PHONETIC_MARGIN` et celui de
  confiance de l'étage 3 se règlent sur ces chiffres, jamais au jugé.**

## 8. Ordre de livraison

Chaque étape est déployable seule et apporte déjà quelque chose.

1. **Trace et collecte audio** : table `utterance`, migration, `POST /api/utterance`,
   `MediaRecorder`. Chaque révision alimente le corpus dès maintenant.
2. **Étage 1 et confirmation vocale** : règle le cas « fouad » sans aucun modèle.
3. **Service `chess-decider` (Laya) et `/api/resolve`.**
4. **Script de mesure**, puis réglage des seuils sur le corpus de Julien.

## 9. Risques

- **Laya compare des sens, pas des sons** : « fouad » et « fou c 4 » se ressemblent à l'oreille, pas
  par le sens. L'étage 1 reste indispensable ; l'apport de Laya est à mesurer (transcriptions
  contradictoires ou bruitées), pas à supposer.
- **Français** : Laya multilingue annonce plus de 100 langues ; la justesse sur des coups d'échecs
  dits en français n'est pas documentée. Le script de mesure tranche.
- **Charge du VPS** : 4 cœurs, environ 5,6 Go de mémoire libre ; Laya en prend environ 1,3 Go. La
  latence réelle est surveillée dès l'étape 3.
- **Disque** : 90 % occupé (20 Go libres) ; l'audio pèse environ 10 Ko par énoncé, négligeable.
