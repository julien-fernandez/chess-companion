/** Mesure les coups candidats de l'ontologie contre Stockfish en multi-PV. */
import { spawn } from 'node:child_process'
import { Chess } from 'chess.js'
import { analyzePosition } from '../src/chess/position-analysis.js'
import { suggestMoves } from '../src/chess/move-suggestions.js'

const ENGINE = process.env.STOCKFISH_PATH || 'stockfish'
const DEPTH = Number(process.env.DEPTH || 18)
const MULTIPV = 5
const SOUND_LOSS = 50

const POSITIONS = [
  ['Nimzowitsch–Salwe, avant 14.Nf3', 'r4rk1/pp1bb1pp/1q2pn2/3pB3/1P6/2PB4/P2N1PPP/R2Q1RK1 w - - 3 14', 'Nf3'],
  ['Nimzowitsch–Salwe, avant 17.Ne5', '2r2rk1/ppqb2pp/3bpn2/3p4/1P1B4/2PB1N2/P3QPPP/R4RK1 w - - 9 17', 'Ne5'],
  ['Nimzowitsch–Salwe, avant 21.Qc2', '2r2rk1/pp1b2pp/2q1pn2/3p4/1P1B4/2PB4/P3QPPP/4RRK1 w - - 3 21', 'Qc2'],
  ['Capablanca–Tartakower, avant 27.h5', '4k3/p1p2r1p/1p4p1/n2p4/P2P1P1P/2PB2P1/6K1/R7 w - - 0 27', 'h5'],
  ['Capablanca–Tartakower, avant 30.Rh7', '5k2/p1p5/1p3rp1/n2p4/P2P1P2/2PB2P1/6K1/7R w - - 2 30', 'Rh7'],
  ['Capablanca–Tartakower, avant 35.Kg3', '5k2/p1p4R/1pr5/3p1pP1/P2P1P2/2P2K2/8/8 w - - 0 35', 'Kg3'],
  ['Karpov–Kasparov, avant 16…Nd3', 'r2qr1k1/5ppp/p4n2/1pbP1bB1/1n6/N1N2B2/PP1Q1PPP/3R1RK1 b - - 1 16', 'Nd3'],
  ['Botvinnik–Capablanca, avant 30.Ba3', '8/p3q1kp/1p2Pnp1/3pQ3/2pP4/1nP3N1/1B4PP/6K1 w - - 5 30', 'Ba3'],
]

function uci(fen) {
  return new Promise((resolve, reject) => {
    const engine = spawn(ENGINE, [])
    const lines = new Map()
    let buffer = ''
    const timer = setTimeout(() => {
      engine.kill()
      reject(new Error('Stockfish ne répond pas'))
    }, 60000)

    engine.stdout.on('data', (chunk) => {
      buffer += chunk.toString()
      const parts = buffer.split('\n')
      buffer = parts.pop()
      for (const line of parts) {
        const pv = line.match(/multipv (\d+).*score (cp|mate) (-?\d+).*? pv (\S+)/)
        if (pv) lines.set(Number(pv[1]), { kind: pv[2], score: Number(pv[3]), move: pv[4] })
        if (line.startsWith('bestmove')) {
          clearTimeout(timer)
          engine.kill()
          resolve([...lines.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v))
        }
      }
    })
    engine.on('error', reject)
    engine.stdin.write(`setoption name MultiPV value ${MULTIPV}\nposition fen ${fen}\ngo depth ${DEPTH}\n`)
  })
}

const centipawns = (entry) =>
  entry.kind === 'mate' ? (entry.score > 0 ? 10000 : -10000) : entry.score

function toSan(fen, move) {
  const chess = new Chess(fen)
  const played = chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] })
  return played?.san ?? move
}

function lossOf(fen, san, best, table) {
  const hit = table.find((entry) => toSan(fen, entry.move) === san)
  if (hit) return best - centipawns(hit)
  return null
}

const results = []
for (const [label, fen, played] of POSITIONS) {
  const table = await uci(fen)
  if (!table.length) throw new Error(`aucune ligne rendue pour ${label}`)
  const best = centipawns(table[0])
  const topSans = table.map((entry) => toSan(fen, entry.move))
  const analysis = analyzePosition(fen)
  const candidates = suggestMoves(fen, analysis.axes, { limit: 5 })

  const scored = []
  for (const candidate of candidates) {
    let loss = lossOf(fen, candidate.san, best, table)
    if (loss === null) {
      const chess = new Chess(fen)
      chess.move(candidate.san)
      const reply = await uci(chess.fen())
      loss = reply.length ? best + centipawns(reply[0]) : null
    }
    scored.push({ ...candidate, loss, inTop: topSans.includes(candidate.san) })
  }

  results.push({ label, fen, played, topSans, playedLoss: lossOf(fen, played, best, table), scored })

  console.log(`\n=== ${label}`)
  console.log(`  Stockfish top-${MULTIPV} (d${DEPTH}) : ${topSans.join(', ')}`)
  console.log(`  Coup joué : ${played}${topSans.includes(played) ? ' — dans le top' : ''}`)
  if (!candidates.length) console.log('  Aucun candidat proposé.')
  for (const c of scored) {
    const verdict = c.inTop ? 'TOP' : c.loss === null ? '?' : c.loss <= SOUND_LOSS ? 'sain' : `-${c.loss}cp`
    console.log(`  ${c.san.padEnd(7)} [${verdict}] ${c.reasons.map((r) => r.axis).join('+')}`)
    console.log(`          ${c.reasons[0].why}`)
  }
}

const all = results.flatMap((r) => r.scored)
const inTop = all.filter((c) => c.inTop).length
const sound = all.filter((c) => c.loss !== null && c.loss <= SOUND_LOSS).length
console.log(`\n--- ${all.length} candidats sur ${results.length} positions`)
console.log(`    ${inTop} dans le top-${MULTIPV} de Stockfish`)
console.log(`    ${sound} sains (perte <= ${SOUND_LOSS} cp)`)
console.log(`    ${all.length - sound} au-dessus du seuil`)
console.log(`    positions sans candidat : ${results.filter((r) => !r.scored.length).length}`)
