/** Ce qu'un coup abandonne : recherche des seuls coups forçants, sans moteur externe. */
import { Chess } from 'chess.js'

const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
const MATE = 1000

export const DEFAULT_PLY = 4
export const QUALITY = 2

const material = (chess, colour) =>
  chess.board().flat().filter(Boolean)
    .reduce((sum, man) => sum + (man.color === colour ? 1 : -1) * VALUE[man.type], 0)

const forcingMoves = (chess, all) =>
  chess.moves({ verbose: true })
    .filter((m) => all || chess.isCheck() || m.captured || m.san.includes('+') || m.san.includes('#'))
    .map((m) => m.san)

function search(chess, colour, ply, alpha, beta, root) {
  if (chess.isCheckmate()) return chess.turn() === colour ? -MATE : MATE
  if (ply === 0 || chess.isDraw()) return material(chess, colour)
  const candidates = forcingMoves(chess, root)
  if (!candidates.length) return material(chess, colour)

  const maximising = chess.turn() === colour
  let best = chess.isCheck() ? (maximising ? -Infinity : Infinity) : material(chess, colour)
  if (maximising) alpha = Math.max(alpha, best)
  else beta = Math.min(beta, best)

  for (const san of candidates) {
    chess.move(san)
    const score = search(chess, colour, ply - 1, alpha, beta, false)
    chess.undo()
    if (maximising) {
      best = Math.max(best, score)
      alpha = Math.max(alpha, best)
    } else {
      best = Math.min(best, score)
      beta = Math.min(beta, best)
    }
    if (beta <= alpha) break
  }
  return Number.isFinite(best) ? best : material(chess, colour)
}

/** Matériel que le camp au trait garde après les suites forçantes, en unités de pion. */
export function forcingOutcome(fen, san, { ply = DEFAULT_PLY } = {}) {
  const before = new Chess(fen)
  const colour = before.turn()
  const after = new Chess(fen)
  try {
    if (!after.move(san)) return null
  } catch {
    return null
  }
  return {
    before: material(before, colour),
    after: search(after, colour, ply, -Infinity, Infinity, true),
  }
}

/** Un coup CONCÈDE quand une suite forçante lui coûte au moins une qualité (mat compris). */
export function concedes(fen, san, { threshold = QUALITY, ply = DEFAULT_PLY } = {}) {
  const outcome = forcingOutcome(fen, san, { ply })
  if (!outcome) return false
  return outcome.before - outcome.after >= threshold
}
