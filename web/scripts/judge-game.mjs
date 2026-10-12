/** Juge une partie coup par coup et choisit ses cartes (spec 2026-10-06). JSON sur stdout. */
import { readFileSync } from 'node:fs'
import { Chess } from 'chess.js'
import { Engine, centipawns, lineToSan } from './uci-engine.mjs'
import { judgeGame } from '../src/chess/judgment.js'
import { moveReason } from '../src/chess/move-reason.js'
import { CHESS_VOCABULARY } from '../src/chess/chess-vocabulary.js'

const DEPTH = Number(process.env.DEPTH || 20)
const MATE = 10000
const [source, side] = process.argv.slice(2)
if (!source || !['white', 'black'].includes(side)) {
  throw new Error('usage : node scripts/judge-game.mjs <partie.pgn|-> <white|black>')
}

const replay = new Chess()
replay.loadPgn(readFileSync(source === '-' ? 0 : source, 'utf8'))
const sans = replay.history()

/** Éval du point de vue des Blancs ; une position finale se juge sans moteur. */
async function evaluateWhite(engine, board) {
  if (board.isCheckmate()) return { cp: board.turn() === 'w' ? -MATE : MATE, pv: [] }
  if (board.isDraw()) return { cp: 0, pv: [] }
  const [best] = await engine.evaluate(board.fen())
  if (!best) throw new Error(`aucune ligne rendue sur ${board.fen()}`)
  const cp = centipawns(best)
  return { cp: board.turn() === 'w' ? cp : -cp, pv: lineToSan(board.fen(), best.line) }
}

const engine = new Engine({ depth: DEPTH, multipv: 1, threads: 1 })
const board = new Chess()
const evaluations = []
try {
  for (let i = 0; i <= sans.length; i += 1) {
    evaluations.push(await evaluateWhite(engine, board))
    if (i < sans.length) board.move(sans[i])
  }
} finally {
  engine.stop()
}

const { plies, cards } = judgeGame(sans, evaluations, side === 'white' ? 'w' : 'b')
const withReasons = cards.map((card) => {
  const ply = plies[card.ply - 1]
  return { ...card, reason: card.verdict === 'kept' ? null : moveReason(ply.fen, ply.san) }
})
process.stdout.write(JSON.stringify({
  engine: 'stockfish', depth: DEPTH, vocabularyVersion: CHESS_VOCABULARY.version, plies, cards: withReasons,
}))
