# Spec — Cartes de jugement tirées de mes parties

- **Date** : 2026-10-06
- **Statut** : design validé par interview (grilling), non implémenté
- **Pilote** : partie quotidienne (3 j) contre Shiasushi, Blancs, abandon au coup 39
  (une partie en ligne en différé, précision 62 %)
- **Hors périmètre v1** : la carte « retrouve le coup raté » (34.Te8+, 36.Txb4), reprise après usage

## 1. Le constat

« Je ne vois pas quand je dégrade une position. » Sur la partie pilote, Stockfish 19 (profondeur 20)
le confirme : la partie ne se perd pas sur une gaffe unique, mais sur deux choses mêlées.

**Des dégradations franches** (perte de probabilité de gain, formule Lichess) :

| Coup | Éval avant → après | Perte | Mieux |
|---|---|---|---|
| 5.Df3 | +2,45 → −1,49 | 35 % | 5.Cxd5 |
| 9.Dxf5 | +1,39 → −0,54 | 18 % | 9.Ff4 |
| 18.Cg3 | −2,08 → −5,68 | 21 % | 18.c5 |
| 28.Tc3 | +1,18 → −0,53 | 16 % | 28.Fg4+ |
| 29.h3 | −0,31 → −3,10 | 23 % | 29.Fh5 |
| 32.Ff5 | −1,48 → −3,81 | 17 % | 32.T1e2 |

**Des cadeaux adverses non saisis** : 33…Th2 laissait 34.Te8+ Fxe8 35.Fg5+ f6 36.Fxf6# (mat en
3), joué 34.Fe4 ; 35…Rd7 laissait 36.Txb4 (cavalier gratuit, +3,25), joué 36.Te7+ (−6,8).

**Des glissements qu'on ne sent pas** : 10.Ff4, 11.Cb5, 12.O-O, 27.Fc1 perdent chacun 5 à 6 % sans
aucune prise, aucun échec ni aucune pièce en l'air avant ou après (vérifié avec python-chess).

Fait de doctrine : pour un moteur, un coup n'**améliore** presque jamais une position — le meilleur
la conserve, tout autre en perd. Aucun coup de Julien n'a gagné plus de 1 % ; les remontées de la
partie (23…Re6, 30…Rd8) sont des erreurs adverses. D'où la référence du verdict (§3).

## 2. Le but

Entraîner le **jugement du signe d'un coup** sur ses propres positions : ce coup a-t-il conservé ou
dégradé la position, et de combien — puis **pourquoi**, dans le vocabulaire de l'ontologie.

## 3. La carte

- **Recto** : échiquier visible, position avant le coup, le coup joué.
- **Réponse** : quatre boutons, la perte mesurée contre le meilleur coup :
  **Conservé** (< 5 %) · **Glissé** (5–10 %) · **Erreur** (10–20 %) · **Gaffe** (> 20 %).
  Seuils plus bas que Lichess (10/20/30) exprès : 5 % attrape les glissements de §1.
- **Pourquoi** (facultatif) : un bouton de la liste « ce que le coup a fait » (§5), plus une note
  libre.
- **Verso** : éval avant → après, perte, meilleur coup et sa ligne moteur, **raison calculée par
  l'ontologie** (§4), bouton « raison fausse ».

Notation française au recto et au verso ; SAN anglais en base et dans le code.

### Notation de la révision

| Réponse | `review_outcome` |
|---|---|
| niveau exact | `recalled` |
| niveau adjacent (Glissé ↔ Erreur…) | `recalled_after_retry` (remet l'intervalle à zéro) |
| mauvais sens (Conservé ↔ une perte) | `failed` |

Calendrier : même règle de Leitner que le répertoire, **dérivé** par une vue (ADR 0011).

## 4. La raison, tirée de l'ontologie

Le « pourquoi » est porté par les axes et relations de l'ontologie, jamais par la ligne moteur
(ADR 0004) : le verso **montre** la ligne, il n'en tire pas la raison.

- Calcul : différence **avant / après** le coup, **étage de lecture par étage**, du plus bas au plus
  haut (0 matériel → 1 contrôle → 2 fonctions → 3 forces → 4 attracteur). Le premier étage qui change
  donne la raison principale ; les suivants s'affichent dessous. Un étage abstrait ne masque jamais
  un fait d'un étage inférieur.
- Briques existantes : `moveRelations(fen, san)` (seul diff avant/après aujourd'hui, avec `why` en
  français), `analyzePosition` et ses détecteurs (`isHanging`, `forkAvailable`, `mateInOne`…),
  `relatePosition` / `describePiece`. Nouveau : un diff d'axes avant/après — rien ne le calcule.
- **Aucune raison détectée** → le verso le dit, sans voisine plausible, et le coup ouvre une
  **évolution de l'ontologie** (§5). Cas connu : 10.Ff4.
- Un détecteur peut se taire là où la perte est réelle (30.Fg4+ : …Txg4 gagne, une recherche naïve
  de prises gagnantes ne le voit pas). Le silence n'est pas une absence de raison prouvée.

> **Note du 2026-10-06 (implémentation).** Les étages 1 à 3 (diffs d'axes) ne sont pas des raisons tant
> que le vocabulaire ne donne aucune polarité aux valeurs d'axe : `moveReason` les rend dans `changes`,
> affichés au verso sous « Ce qui a changé (sans sens connu) ». `allows` et `hanging_piece` se comptent
> nets du gain matériel. Voir ADR 0016, le gotcha de CLAUDE.md et le rapport pilote
> (`docs/rapports/2026.10.06_cartes-de-jugement-pilote.md`).

## 5. Évolution de l'ontologie

Décidé : **on fait évoluer l'ontologie partout où mes erreurs l'exigent.**

- **Deux relations de coup nouvelles**, famille de `allows` / `excludes` :
  - `forgoes` — *renonce* : le coup passe à côté d'un meilleur coup à moi (prise, échec, mat).
    36.Te7+ renonce à Txb4 ; 34.Fe4 renonce à Te8+.
  - `ignores` — *laisse* : le coup laisse debout une menace adverse qui existait déjà.
    5.Df3 laisse …Dxe5+ ; côté adverse, 33…Th2 laisse Te8+.
  - Sources : Heisman (*blunder check*), de la Maza (balayage). `allows` ne couvre pas ces cas :
    …Dxe5+ existait avant 5.Df3.
- **Liste « ce que le coup a fait »** (boutons de Julien) : pièce laissée en l'air · offre un coup à
  l'adversaire (`allows`) · renonce à un meilleur coup (`forgoes`) · laisse une menace (`ignores`) ·
  affaiblit une case (`weakens`) · abri du roi (`shelter_integrity`) · pièce surchargée
  (`function_overload`) · autre. Les libellés viennent du vocabulaire généré.
- **Boucle** : toute perte sans raison détectée, et toute « raison fausse » signalée en révision,
  alimente une évolution : un concept proposé **avec son auteur** (ou déclaré sans source), validé par
  Julien, ajouté dans `2026.07 Ontology Manager`, version montée, `npm run pull:ontology`, puis
  `PINNED_VOCABULARY_VERSION`.
- Chaque concept nouveau porte ses tests **inverses** : la position de départ ne rend ni `forgoes`
  ni `ignores`.

## 6. Quels coups deviennent des cartes

- **Mes coups** : ceux qui perdent > 5 %, plus autant de coups sains (perte < 2 %) **après le
  coup 8**, tirés des mêmes phases. Sans témoins, la réponse serait toujours « pire ».
- **Coups adverses** : seulement les **cadeaux non punis**, jugés sur la même échelle, de leur côté.
  Un cadeau est *non puni* quand ma réponse rend au moins la moitié de ce qu'il m'offrait
  (hypothèse posée par Claude, non tranchée en interview).
  Seuil du cadeau : > 5 %. Pilote, calculé : 4…Dg5 (5.Df3 rend tout), 10…Rd8, 27…b5, 33…Th2,
  35…Rd7 ; punis : 7…g6, 22…Rd7, 23…Re6 (24.Cxg7+), 30…Rd8.
- La borne du coup 8 ne vaut que pour les **témoins** : une erreur réelle de l'ouverture (5.Df3)
  reste une carte.

## 7. Stockage

Tables neuves, reliées à `game_move`, **générées** depuis `chess-repertoire-vocabulary.yaml`
(`scripts/generate_ddl.py`), migration `sql/migrations/NNNN_*.sql` recopiée à l'identique et passée
à la main sur les deux bases (rôle `chess` au VPS) :

```
move_eval(game_id, ply, engine, depth, eval_before_cp, eval_after_cp,
          best_san, best_pv, win_pct_lost)          FK (game_id, ply) → game_move
judgment_card(game_id, ply, expected_verdict, generated_reason, vocabulary_version, created_at)
judgment_review(id, game_id, ply, reviewed_at, verdict, reason_tag, note, reason_wrong, outcome)
vue judgment_card_schedule                           -- même règle de Leitner que card_schedule
```

Pas de colonne `kind` sur `card` : la clé `(epd, san)` y entrerait en collision (1.e4 rappel contre
1.e4 jugement).

## 8. Flux

1. Après une partie qui vaut d'être apprise : une commande par partie (lien chess.com).
2. Stockfish natif, là où Julien est, profondeur 20 (`web/scripts/uci-engine.mjs`, processus
   persistant) ; la raison se calcule en JS (l'ontologie est en JS) ; le tout est versé en base.
3. Les cartes apparaissent dans un onglet PWA **`#jugement`**, échiquier visible, boutons.
   `#revision` (vocal) reste intact.

## 9. Ce qui reste ouvert

- Les noms des étages et des boutons en interface, à régler sur le premier rendu.
- Le concept qui expliquera 10.Ff4 : premier passage de la boucle §5.
- La carte « retrouve le coup raté » : après une semaine d'usage du jugement.
