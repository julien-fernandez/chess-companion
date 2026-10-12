/** Juge les coups candidats de l'ontologie sur TOUS les coups d'une partie réelle. */
import { readFileSync } from 'node:fs'
import { Chess } from 'chess.js'
import { Engine, centipawns, toSan } from './uci-engine.mjs'
import { analyzePosition } from '../src/chess/position-analysis.js'
import { suggestMoves } from '../src/chess/move-suggestions.js'

const DEPTH = Number(process.env.DEPTH || 18)
const SOUND_LOSS = 50
const BLUNDER_LOSS = 300
const SIDE = (process.env.SIDE || 'w').toLowerCase()

const pgnPath = process.argv[2]
if (!pgnPath) throw new Error('usage: node eval-game-suggestions.mjs <fichier.pgn>')

const replay = new Chess()
replay.loadPgn(readFileSync(pgnPath, 'utf8'))
const moves = replay.history({ verbose: true })

const engine = new Engine({ depth: DEPTH })
const board = new Chess()
const rows = []

for (const move of moves) {
  const fen = board.fen()
  const number = board.moveNumber()
  if (move.color !== SIDE) {
    board.move(move.san)
    continue
  }

  const table = await engine.evaluate(fen)
  if (!table.length) throw new Error(`aucune ligne rendue au coup ${number}`)
  const best = centipawns(table[0])
  const topSans = table.map((entry) => toSan(fen, entry.move))

  const analysis = analyzePosition(fen, { history: board.history() })
  const candidates = suggestMoves(fen, analysis.axes, { limit: 5 })

  const scored = []
  for (const candidate of candidates) {
    const hit = table.find((entry) => toSan(fen, entry.move) === candidate.san)
    let loss
    if (hit) {
      loss = best - centipawns(hit)
    } else {
      const probe = new Chess(fen)
      probe.move(candidate.san)
      const reply = await engine.evaluate(probe.fen())
      loss = reply.length ? best + centipawns(reply[0]) : null
    }
    scored.push({ ...candidate, loss, inTop: topSans.includes(candidate.san) })
  }

  const playedHit = table.find((entry) => toSan(fen, entry.move) === move.san)
  rows.push({
    number,
    played: move.san,
    playedLoss: playedHit ? best - centipawns(playedHit) : null,
    topSans,
    scored,
  })

  const verdicts = scored.map((c) => {
    const tag = c.inTop ? 'TOP' : c.loss === null ? '?' : c.loss <= SOUND_LOSS ? 'sain' : `-${c.loss}`
    return `${c.san}[${tag}]`
  })
  console.log(
    `${String(number).padStart(2)}. joué ${move.san.padEnd(7)} ` +
      `| moteur ${topSans[0].padEnd(7)} | candidats : ${verdicts.join(' ') || 'aucun'}`,
  )
  board.move(move.san)
}

engine.stop()

const all = rows.flatMap((r) => r.scored)
const rated = all.filter((c) => c.loss !== null)
const inTop = all.filter((c) => c.inTop).length
const sound = rated.filter((c) => c.loss <= SOUND_LOSS).length
const blunders = rated.filter((c) => c.loss >= BLUNDER_LOSS)
const silent = rows.filter((r) => !r.scored.length).length
const covered = rows.filter((r) => r.scored.some((c) => c.inTop)).length

console.log(`\n--- ${rows.length} positions, ${all.length} candidats proposés (d${DEPTH})`)
console.log(`    ${silent} positions sans aucun candidat`)
console.log(`    ${covered} positions où un candidat est dans le top-5 du moteur`)
console.log(`    ${inTop} candidats dans le top-5`)
console.log(`    ${sound} candidats sains (perte <= ${SOUND_LOSS} cp)`)
console.log(`    ${rated.length - sound} candidats au-dessus du seuil`)
console.log(`    ${blunders.length} candidats qui PERDENT la partie (perte >= ${BLUNDER_LOSS} cp)`)

if (blunders.length) {
  console.log('\n--- Les candidats dangereux, avec la règle qui les a produits')
  for (const row of rows) {
    for (const c of row.scored.filter((x) => x.loss !== null && x.loss >= BLUNDER_LOSS)) {
      console.log(`  coup ${row.number} : ${c.san} perd ${c.loss} cp — règle « ${c.reasons[0].axis} »`)
      console.log(`     ${c.reasons[0].why}`)
    }
  }
}
