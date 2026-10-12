/** Pilote du Stockfish WASM embarqué dans la PWA. */
import { Chess } from 'chess.js'
import { logger } from '../logger.js'

const MOD = 'coach'
const BLUNDER_THRESHOLD = 2.0
const MISTAKE_THRESHOLD = 0.5
const DEPTH = 15

let _worker = null
let _ready = false
const _queue = []

function getWorker() {
  if (_worker) return _worker
  logger.info(MOD, 'initialisation Stockfish Worker…')
  _worker = new Worker('/stockfish.js')
  _worker.onmessage = (e) => {
    const line = e.data
    logger.debug(MOD, 'stockfish →', line.slice(0, 120))
    if (line === 'readyok') {
      _ready = true
      logger.info(MOD, 'Stockfish prêt')
      _flushQueue()
      return
    }
    if (_queue.length > 0 && typeof _queue[0].onLine === 'function') {
      _queue[0].onLine(line)
    }
  }
  _worker.onerror = (e) => logger.error(MOD, 'Worker error', e.message)
  _worker.postMessage('uci')
  _worker.postMessage('isready')
  return _worker
}

function _flushQueue() {
  if (_queue.length > 0) _queue[0].run()
}

function _evalFen(fen) {
  return new Promise((resolve) => {
    const w = getWorker()
    let bestScore = null
    let bestMove = null

    const task = {
      onLine(line) {
        const infoMatch = line.match(/^info.*\bscore\s+(cp|mate)\s+(-?\d+).*\bpv\s+(\S+)/)
        if (infoMatch) {
          const type = infoMatch[1], val = parseInt(infoMatch[2])
          bestScore = type === 'cp' ? val / 100.0 : (val > 0 ? 100 : -100)
          bestMove = infoMatch[3]
        }
        if (line.startsWith('bestmove')) {
          if (!bestMove) bestMove = line.split(' ')[1]
          logger.debug(MOD, 'bestmove', { bestMove, score: bestScore, fen: fen.slice(0, 40) })
          _queue.shift()
          resolve({ score: bestScore, bestMove })
          if (_queue.length > 0) _queue[0].run()
        }
      },
      run() {
        logger.debug(MOD, '← Stockfish', `position fen ${fen.slice(0, 40)}… | go depth ${DEPTH}`)
        w.postMessage(`position fen ${fen}`)
        w.postMessage(`go depth ${DEPTH}`)
      },
      resolve,
    }
    _queue.push(task)
    if (_ready && _queue.length === 1) task.run()
  })
}

function _fenTurn(fen) { return fen.split(' ')[1] }

export async function assessMove(fenBefore, uci) {
  logger.info(MOD, 'assessMove', { uci, fen: fenBefore.slice(0, 40) })
  const { score: rawBefore, bestMove: bm } = await _evalFen(fenBefore)
  const turn = _fenTurn(fenBefore)
  const scoreBefore = turn === 'w' ? rawBefore : -rawBefore

  const tmp = new Chess(fenBefore)
  tmp.move({ from: uci.slice(0,2), to: uci.slice(2,4), promotion: uci[4] || undefined })
  const fenAfter = tmp.fen()

  const { score: rawAfter } = await _evalFen(fenAfter)
  const scoreAfter = turn === 'w' ? -rawAfter : rawAfter
  const delta = Math.max(0, scoreBefore - scoreAfter)

  const isBlunder = delta >= BLUNDER_THRESHOLD
  const isMistake = delta >= MISTAKE_THRESHOLD && !isBlunder
  let feedback = ''
  if (isBlunder) feedback = `Gaffe ! Perd ${delta.toFixed(1)} pions. Mieux : ${bm ?? '?'}.`
  else if (isMistake) feedback = `Imprécision. Perd ${delta.toFixed(1)} pions. ${bm ?? '?'} était mieux.`

  logger.info(MOD, 'évaluation', { uci, delta: delta.toFixed(2), isBlunder, isMistake, feedback: feedback || 'bon coup' })
  return { delta, isBlunder, isMistake, feedback, bestMove: bm }
}

export async function bestMove(fen) {
  logger.info(MOD, 'bestMove demandé', { fen: fen.slice(0, 40) })
  const { bestMove: mv } = await _evalFen(fen)
  logger.info(MOD, 'bestMove résultat', { mv })
  return mv
}

export async function analyzeGame(history, topN = 3) {
  logger.info(MOD, 'analyzeGame', { moves: history.length, topN })
  const results = []
  for (const { fenBefore, uci, san } of history) {
    try {
      const ev = await assessMove(fenBefore, uci)
      results.push({ fenBefore, uci, san, ...ev })
    } catch (e) {
      logger.warn(MOD, 'analyzeGame skip', { uci, err: e.message })
    }
  }
  const sorted = results.sort((a, b) => b.delta - a.delta).slice(0, topN)
  logger.info(MOD, 'analyzeGame terminé', sorted.map(r => ({ san: r.san, delta: r.delta.toFixed(2) })))
  return sorted
}

getWorker()
