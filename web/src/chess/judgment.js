/** Cartes de jugement (spec 2026-10-06) : ce qu'un coup a perdu, et quels coups deviennent des cartes. */
import { Chess } from 'chess.js'
import { CHESS_VOCABULARY } from './chess-vocabulary.js'

export const VERDICTS = ['kept', 'slipped', 'mistake', 'blunder']
export const VERDICT_LABEL = { kept: 'Conservé', slipped: 'Glissé', mistake: 'Erreur', blunder: 'Gaffe' }
export const THRESHOLDS = { slipped: 5, mistake: 10, blunder: 20 }
const CONTROL_MAX_LOSS = 2
const CONTROL_FIRST_MOVE = 9
const GIFT_MIN = 5

/** Probabilité de gain des Blancs, en %, pour une éval en centipions (formule Lichess). */
export const winPct = (cp) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1)

/** Ce que le camp `mover` a perdu, contre le meilleur coup ; évals du point de vue des Blancs. */
export function lossFor(mover, evalBefore, evalAfter) {
  const sign = mover === 'w' ? 1 : -1
  return winPct(sign * evalBefore) - winPct(sign * evalAfter)
}

export function verdictOf(lost) {
  if (lost < THRESHOLDS.slipped) return 'kept'
  if (lost < THRESHOLDS.mistake) return 'slipped'
  if (lost < THRESHOLDS.blunder) return 'mistake'
  return 'blunder'
}

/** `count` éléments répartis sur toute la liste, pas groupés au début : même tirage à chaque passage. */
function spread(pool, count) {
  if (count >= pool.length) return pool
  return Array.from({ length: count }, (_, k) => pool[Math.floor(((k + 0.5) * pool.length) / count)])
}

/** Les cartes d'une partie : erreurs de Julien, témoins sains et cadeaux adverses non punis (spec 2026-10-06). `plies` : tous les demi-coups, sans trou. */
export function selectCards(plies, julien) {
  const mine = plies.filter((p) => p.mover === julien)
  const errors = mine.filter((p) => p.winPctLost >= THRESHOLDS.slipped)
  const pool = mine.filter((p) => p.winPctLost < CONTROL_MAX_LOSS && Math.ceil(p.ply / 2) >= CONTROL_FIRST_MOVE)
  const gifts = plies.filter((p, i) => p.mover !== julien && p.winPctLost > GIFT_MIN &&
    plies[i + 1] !== undefined && plies[i + 1].winPctLost >= p.winPctLost / 2)
  return [
    ...errors.map((p) => ({ ply: p.ply, role: 'own' })),
    ...spread(pool, errors.length).map((p) => ({ ply: p.ply, role: 'control' })),
    ...gifts.map((p) => ({ ply: p.ply, role: 'opponent_gift' })),
  ].sort((a, b) => a.ply - b.ply)
}

const FRENCH_PIECE = { K: 'R', Q: 'D', R: 'T', B: 'F', N: 'C' }

/** SAN anglais → notation française. En SAN, seules les pièces sont des majuscules (hors O du roque). */
export const frenchSan = (san) => san.replace(/[KQRBN]/g, (letter) => FRENCH_PIECE[letter])

/** Boutons du verso, dans l'ordre de l'enum `judgment_reason` (tests/test_judgment_vocabulary.py). */
export const REASON_TAGS = ['hanging_piece', 'allows', 'forgoes', 'ignores', 'weakens',
  'shelter_integrity', 'function_overload', 'other']

const short = (label) => label.split(/ — | \(/)[0]

export function reasonLabel(tag) {
  if (tag === 'other') return 'Autre'
  const relation = CHESS_VOCABULARY.relationship_types.find((r) => r.key === tag)
  if (relation) return short(relation.label)
  const axis = CHESS_VOCABULARY.axes.find((a) => a.key === tag)
  if (axis) return short(axis.label)
  const threat = CHESS_VOCABULARY.entity_types.flatMap((e) => e.subtypes ?? []).find((s) => s.key === tag)
  return threat ? short(threat.label) : null
}

const round1 = (x) => Math.round(x * 10) / 10

/** Juge chaque demi-coup ; `evaluations[i]` : éval et ligne principale avant le demi-coup i+1 (une de plus que de coups). */
export function judgeGame(sans, evaluations, julien) {
  if (evaluations.length !== sans.length + 1) {
    throw new Error(`${sans.length + 1} évaluations attendues, ${evaluations.length} reçues`)
  }
  const board = new Chess()
  const plies = sans.map((san, i) => {
    const fen = board.fen()
    const mover = board.turn()
    board.move(san)
    const lost = round1(lossFor(mover, evaluations[i].cp, evaluations[i + 1].cp))
    return {
      ply: i + 1, san, mover, fen,
      evalBefore: evaluations[i].cp, evalAfter: evaluations[i + 1].cp,
      bestSan: evaluations[i].pv[0] ?? san, bestPv: evaluations[i].pv,
      winPctLost: lost, verdict: verdictOf(lost),
    }
  })
  const cards = selectCards(plies, julien).map((card) => ({ ...card, verdict: plies[card.ply - 1].verdict }))
  return { plies, cards }
}
