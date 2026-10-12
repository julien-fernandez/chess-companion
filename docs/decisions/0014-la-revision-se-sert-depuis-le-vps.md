---
numero: 0014
titre: La révision se sert depuis le VPS — API stdlib, PWA statique, connexion par lien
statut: accepté
date: 2026-09-26
concerne:
  - src/review_api.py
  - deploy/
  - web/src/components/Review.jsx
---

# 0014 — La révision se sert depuis le VPS : API stdlib, PWA statique, connexion par lien

## Contexte

La révision vocale (ADR 0011) doit marcher sur le téléphone : la PWA doit donc joindre la base
Postgres du VPS, qui n'écoute que sur 127.0.0.1, et la reconnaissance vocale du navigateur exige
HTTPS. Un seul utilisateur. Julien a refusé de taper un mot de passe aléatoire sur le téléphone.

## Décision

- **API** : `src/review_api.py`, `http.server` de la stdlib + psycopg, trois routes utiles
  (`variations`, `review`, `login`). Unit `chess-review` sur 127.0.0.1:8110, secrets en credstore.
  Le venv de la box n'installe que psycopg, pas les dépendances du projet (audio, pygame).
- **PWA** : buildée sur la box par `deploy/install.sh`, servie en statique par nginx sur
  `chess.example.org`, qui proxifie `/api/`.
- **Connexion** : un **lien** `/api/login?key=…` pose un cookie d'un an. La clé dérive du secret de
  session ; le lien est calculé et envoyé par Telegram **depuis la box**, et nginx ne journalise pas
  `/api/login`. Le mot de passe (PBKDF2) reste en secours.

## Conséquences

Rien à saisir sur un appareil : ouvrir le lien suffit, sur le téléphone comme sur le PC. Changer
`chess-review-secret` révoque d'un coup le lien et toutes les sessions. Le lien est un secret porteur :
quiconque l'a en main entre. Un redéploiement se fait par `git push` puis `deploy/install.sh`.

## Alternatives écartées

**FastAPI.** Idiomatique sur cette box, mais une dépendance de plus pour trois routes et un usager.

**Basic auth nginx.** C'est encore un mot de passe à taper, et sa fenêtre marche mal dans une PWA
installée.

**Aucune protection.** Le répertoire n'est pas sensible, mais l'API écrit des rappels : n'importe qui
connaissant l'URL fausserait le calendrier.

**API locale via le tunnel SSH.** Deux heures de moins, mais pas de révision sur le téléphone.
