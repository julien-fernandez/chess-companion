# Documentation — Chess Companion

## Vivant (se met à jour)

| Document | Ce qu'il porte |
|---|---|
| [`vocabulaire-perception-echecs.md`](vocabulaire-perception-echecs.md) | Corpus sourcé de ce que les joueurs disent *voir* — Binet 1894, Nimzowitsch, Lasker, Capablanca, Silman, Soltis, Tisdall. Le § 2.5 recense les modes de défaillance de la vision. |
| [`annotateur-et-machine.html`](annotateur-et-machine.html) | Comparaison du companion aux annotateurs humains et aux moteurs. |
| [`point-aveugle.html`](point-aveugle.html) | Le protocole de balayage en huit passages, sur trois positions réelles. Publié comme artifact. |
| [`conception/USE_CASES.md`](conception/USE_CASES.md) | 100 cas d'usage par panneau, huit rôles, couverture modélisé / partiel / absent (provisoire). |
| [`vision-entraineur-aveugle.md`](vision-entraineur-aveugle.md) | Vision de l'ancienne learning app : mémoriser une partie par séquences (chunking), mode non porté. |

## Décisions (immuables — un renversement supersède, ne corrige pas)

`docs/decisions/` — voir [`julien-adr`](../CLAUDE.md) pour la doctrine.

| ADR | Décision |
|---|---|
| [0001](decisions/0001-ontologie-etat-du-jeu-via-ontology-manager.md) | L'ontologie d'état vit ici et se diffuse par ontology-manager |
| [0002](decisions/0002-pont-etat-vers-coups-candidats.md) | Le pont état → coups candidats |
| [0003](decisions/0003-instanciation-des-relations.md) | L'instanciation des relations, unité du modèle |
| [0004](decisions/0004-recherche-forcante-avant-de-conseiller.md) | Une recherche forçante retire un candidat, ne le produit jamais |
| [0005](decisions/0005-etage-plan-explication-jamais-filtre.md) | L'étage plan explique, il ne retire pas |
| [0006](decisions/0006-noeud-de-repertoire-indexe-par-epd.md) | Un nœud de répertoire s'indexe par EPD, jamais par FEN |
| [0007](decisions/0007-le-drill-listudy-est-declare-jamais-mesure.md) | Le drill Listudy est déclaré à la main, jamais mesuré |
| [0008](decisions/0008-la-sortie-se-mesure-contre-l-union-des-chapitres.md) | La sortie de préparation se mesure contre l'union des chapitres d'une couleur |
| [0009](decisions/0009-une-ligne-extraite-d-une-video-franchit-deux-gardes.md) | Une ligne extraite d'une vidéo franchit deux gardes, et aucun moteur |
| [0010](decisions/0010-un-seul-depot-pour-les-echecs.md) | Un seul dépôt pour l'entraînement aux échecs, les anciens importés puis triés sous `legacy/` |
| [0011](decisions/0011-le-rappel-espace-vit-dans-le-companion.md) | Le rappel espacé vit dans le companion, indexé par EPD (remplace 0007) |
| [0012](decisions/0012-le-repertoire-vit-en-base-l-ontologie-en-derive-le-schema.md) | Le répertoire vit en base, l'ontologie en dérive le schéma |
| [0013](decisions/0013-deux-reponses-a-une-position-se-declarent.md) | Deux réponses de Julien à une même position se déclarent, la révision accepte chacune |
| [0014](decisions/0014-la-revision-se-sert-depuis-le-vps.md) | La révision se sert depuis le VPS : API stdlib, PWA statique, connexion par lien |
| [0015](decisions/0015-les-omissions-se-detectent-sans-recherche.md) | Les omissions (`forgoes`, `ignores`) se détectent sans recherche |
| [0016](decisions/0016-la-raison-d-un-coup-ne-compte-que-le-gain-materiel.md) | La raison d'un coup ne compte que le gain matériel ; les diffs d'axes ne sont pas des raisons |
| [0017](decisions/0017-une-regle-sourcee-du-bilan-materiel-est-une-raison.md) | Une règle sourcée sur le bilan matériel (`trades_queens_behind`) est une raison d'étage 0 |

## Spécifications (datées, valables jusqu'à leur mise en œuvre)

`docs/specs/` — une spec est amendée tant qu'elle n'est pas livrée.

| Spec | Sujet |
|---|---|
| [2026-09-06](specs/2026-09-06-ontologie-rendu-sensoriel.md) | Ontologie du rendu sensoriel, étages de lecture, protocole de balayage |
| [2026-09-17](specs/2026-09-17-etude-ouvertures-repertoire-graphe.md) | Étude des ouvertures : répertoire minimal, rappel espacé, graphe de positions FEN |
| [2026-09-30](specs/2026-09-30-correction-transcription.md) | Le coup dit se décide en étages : phonétique, décideur, confirmation vocale |
| [2026-10-06](specs/2026-10-06-cartes-de-jugement.md) | Cartes de jugement tirées de mes parties (livrée, PR #18) |

## Journaux de session (datés, jamais modifiés après coup)

`docs/rapports/` — un fichier par session, nommé `AAAA.MM.JJ_HH.MM_<hash>_SESSION_<sujet>.md`.
Le plus récent porte le handoff de la session suivante.

## Données

`data/ontology/chess-vocabulary.yaml` est la **source** du vocabulaire d'état ; tout le reste de
`data/` est gitignoré. `docs/data-point-aveugle.json` est généré : il alimente `point-aveugle.html`.

La base Postgres (`chess` sur le VPS) est la source du répertoire, des parties et des rappels
(ADR 0012) ; `export/repertoire.json` en est la trace versionnée. `data/repertoire/*.pgn` est
généré et non versionné.

`data/pilotage/journal.md` est au contraire une **source** écrite à la main et non reproductible :
c'est la seconde exception à `data/*` dans `.gitignore`, après `data/ontology/`. Le tableau de
bord `data/pilotage/tableau-de-bord.html` y reste ignoré, étant généré par `scripts/pilotage.py`.

`docs/artifacts.json` est le log des artifacts claude.ai publiés depuis ce dépôt : il fait
autorité sur ce qui est un artifact, et le `sha256` qu'il porte est celui de la version **en
ligne**, pas du fichier courant.
