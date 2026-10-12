---
numero: 0010
titre: Un seul dépôt pour l'entraînement aux échecs, les anciens importés puis triés sous legacy/
statut: accepté
date: 2026-09-25
concerne:
  - legacy/
  - CLAUDE.md
---

# 0010 — Un seul dépôt pour l'entraînement aux échecs

## Contexte

Cinq dossiers portaient des projets d'échecs, dont quatre avec un dépôt GitHub :
`chess-with-voice` (2024.10), `blind-chess-learning` (2024.11.28), `chess-learning-app` (2025.07),
`chess-vizualizer` (2026.06), et celui-ci.

Deux consolidations avaient déjà eu lieu, chacune dans un sens différent. En février 2026, une
session pi a gardé `chess-learning-app` comme survivant et « supprimé » les deux dossiers 2024 :
Dropbox les a ressuscités, avec un `.git` réduit à sa config. En mai 2026, le diary
`2026.05.21_18.22_77b065b` a posé « un seul repo » ici mais **écarté** la fusion avec la learning
app, jugée hors périmètre.

Les sessions pi du 2026-09-17 et la conversation claude.ai du 2026-09-23
(`docs/rapports/2026.09.23_claude-ai_entraineur-vocal-aveugle.md`) ont déplacé le besoin :
répertoire tiré des vidéos de coach, pilotage mesuré, et **révision vocale à l'aveugle** du
répertoire. Cette dernière brique est exactement ce que décrivent les trois anciens dépôts
d'entraînement. Le motif du refus de mai ne tient plus.

L'état local de la learning app n'était pas celui de GitHub : une suite e2e Playwright jamais
commitée, et `src/data/default-games.ts` exclu par un `data/` non ancré dans son `.gitignore`
alors que l'app l'importe — la version GitHub ne compilait pas.

## Décision

`chess-companion` est **le seul dépôt d'entraînement** aux échecs. `chess-with-voice`,
`blind-chess-learning` et `chess-learning-app` y entrent par `git subtree add`, **historique
compris**, sous `legacy/<dépôt>/`. L'état local non commité de la learning app a été commité dans
son propre historique avant l'import (commit `9fc28b3`), avec le motif `.gitignore` ancré.

Ne reste ensuite dans l'arbre que ce qui sert la révision vocale à l'aveugle :

| Gardé sous `legacy/learning-app/` | Rôle |
|---|---|
| `chess-trainer/src/lib/chess-voice.ts` | SAN ↔ parole FR/EN, rapprochement d'une phrase avec les coups légaux |
| `chess-trainer/src/hooks/useTraining.ts` | boucle écoute → restitution → résultat |
| `chess-trainer/src/hooks/useSpeech.ts` | TTS et STT par la Web Speech API |
| `chess-trainer/src/lib/types.ts` | types dont dépendent les trois fichiers ci-dessus |
| `03_Chess_Trainer_Vision.md` | méthode des séquences de 5, 10, 20 coups |

Tout le reste est retiré de l'arbre : interface, bibliothèque, statistiques, stockage, i18n,
tests e2e liés à cette interface, script Python, specs à backend et maquettes de gamification.

`chess-vizualizer` **reste un dépôt séparé** : un poster de partie n'est pas de l'entraînement.
Son import a été annulé.

`legacy/` est une **zone de transit** : une brique utile se porte dans `web/` ou `src/`, puis
sort de `legacy/`. Le garde des commentaires ne l'analyse pas.

## Conséquences

Rien n'est perdu : les fichiers retirés restent atteignables par les commits de merge.
`git blame` remonte aux commits d'origine. `git log -- legacy/<dépôt>` ne montre que le merge, les
chemins d'origine étant à la racine : l'historique d'un dépôt importé se lit par
`git log <merge>^2` (learning app : `git log e958c84^2`).

Les fichiers gardés sont du TS/React (Vite, Tailwind), `web/` est en JS : le portage les réécrit,
il ne les copie pas. Les tests e2e retirés ne se portent pas, ils se réécrivent en `node --test`.

Les dépôts GitHub `chess-with-voice`, `blind-chess-learning`, `chess-learning-app` et leurs
dossiers locaux deviennent redondants. Leur archivage est une action séparée, confirmée à part.

## Alternatives écartées

**Copier les fichiers sans historique.** Plus court d'une commande, mais perd le `blame` du code
vocal, précisément ce qu'on va porter.

**Tout garder sous `legacy/`.** Soixante fichiers sans usage dans l'arbre, qu'il faudrait relire à
chaque recherche ; leur historique suffit.

**Porter immédiatement le code dans `web/`.** Mélange fusion et conception : la brique de
révision vocale doit d'abord trancher le rappel espacé (ADR 0007 le laisse ouvert).

**Fusionner aussi `chess-vizualizer`.** Importé puis retiré à la demande de Julien : il ne sert
pas l'entraînement et vit mieux seul.
