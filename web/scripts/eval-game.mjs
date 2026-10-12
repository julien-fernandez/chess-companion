/** Trace la courbe d'évaluation d'une partie et isole les plus grosses chutes. */
import { readFileSync } from 'node:fs'
import { Chess } from 'chess.js'
import { Engine, centipawns, toSan } from './uci-engine.mjs'

const DEPTH = Number(process.env.DEPTH || 18)
const SIDE = (process.env.SIDE || 'w').toLowerCase()

const pgnPath = process.argv[2]
if (!pgnPath) throw new Error('usage: node eval-game.mjs <fichier.pgn>')

const replay = new Chess()
replay.loadPgn(readFileSync(pgnPath, 'utf8'))
const moves = replay.history({ verbose: true })

const engine = new Engine({ depth: DEPTH })
const board = new Chess()
const curve = []

for (const move of moves) {
  const fen = board.fen()
  const mover = move.color
  const number = board.moveNumber()
  if (mover !== SIDE) {
    board.move(move.san)
    continue
  }

  const table = await engine.evaluate(fen)
  if (!table.length) throw new Error(`aucune ligne rendue au coup ${number}`)
  const best = centipawns(table[0])
  const topSans = table.map((entry) => toSan(fen, entry.move))

  board.move(move.san)
  let after
  const hit = table.find((entry) => toSan(fen, entry.move) === move.san)
  if (hit) {
    after = centipawns(hit)
  } else {
    const reply = await engine.evaluate(board.fen())
    if (!reply.length) throw new Error(`aucune ligne après ${number}.${move.san}`)
    after = -centipawns(reply[0])
  }

  curve.push({ number, san: move.san, best, after, loss: best - after, top: topSans, fen })
  console.log(
    `${String(number).padStart(2)}. ${move.san.padEnd(7)} ` +
      `avant ${String(best).padStart(6)} → après ${String(after).padStart(6)} ` +
      `perte ${String(best - after).padStart(5)}  top: ${topSans.slice(0, 3).join(', ')}`,
  )
}

engine.stop()

const ranked = [...curve].sort((a, b) => b.loss - a.loss)
console.log(`\n--- ${curve.length} coups évalués pour ${SIDE === 'w' ? 'les Blancs' : 'les Noirs'} (d${DEPTH})`)
console.log(`    perte moyenne : ${(curve.reduce((sum, m) => sum + Math.max(0, m.loss), 0) / curve.length).toFixed(0)} cp`)
console.log('\n--- Les cinq plus grosses chutes')
for (const move of ranked.slice(0, 5)) {
  console.log(`  ${move.number}. ${move.san.padEnd(7)} -${move.loss} cp   (meilleur : ${move.top[0]})`)
  console.log(`     ${move.fen}`)
}
