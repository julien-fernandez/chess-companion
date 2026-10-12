/** Pilote UCI à processus persistant — un seul Stockfish pour toute une passe. */
import { spawn } from 'node:child_process'
import { Chess } from 'chess.js'

export class Engine {
  constructor({ path = process.env.STOCKFISH_PATH || 'stockfish', multipv = 5, depth = 18, threads = null } = {}) {
    this.depth = depth
    this.process = spawn(path, [])
    this.buffer = ''
    this.pending = null
    this.process.stdout.on('data', (chunk) => this.consume(chunk.toString()))
    this.process.stdin.write(`setoption name MultiPV value ${multipv}\n`)
    if (threads) this.process.stdin.write(`setoption name Threads value ${threads}\n`)
  }

  consume(chunk) {
    this.buffer += chunk
    const parts = this.buffer.split('\n')
    this.buffer = parts.pop()
    for (const line of parts) {
      if (!this.pending) continue
      const pv = line.match(/multipv (\d+).*score (cp|mate) (-?\d+).*? pv (.+)$/)
      if (pv) {
        const moves = pv[4].trim().split(/\s+/)
        this.pending.lines.set(Number(pv[1]), { kind: pv[2], score: Number(pv[3]), move: moves[0], line: moves })
      }
      if (line.startsWith('bestmove')) {
        const { lines, resolve } = this.pending
        this.pending = null
        resolve([...lines.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v))
      }
    }
  }

  evaluate(fen) {
    return new Promise((resolve, reject) => {
      if (this.pending) return reject(new Error('moteur déjà occupé'))
      this.pending = { lines: new Map(), resolve }
      this.process.stdin.write(`position fen ${fen}\ngo depth ${this.depth}\n`)
    })
  }

  stop() {
    this.process.kill()
  }
}

export const centipawns = (entry) =>
  entry.kind === 'mate'
    ? (entry.score > 0 ? 10000 - entry.score * 10 : -10000 - entry.score * 10)
    : entry.score

export function toSan(fen, uciMove) {
  const chess = new Chess(fen)
  const played = chess.move({ from: uciMove.slice(0, 2), to: uciMove.slice(2, 4), promotion: uciMove[4] })
  return played?.san ?? uciMove
}

/** Ligne UCI → SAN, rejouée sur l'échiquier dont elle vient ; s'arrête au premier coup illisible. */
export function lineToSan(fen, uciMoves) {
  const chess = new Chess(fen)
  const out = []
  for (const uci of uciMoves) {
    try {
      out.push(chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san)
    } catch {
      break
    }
  }
  return out
}
