/** État global de la partie et de sa lecture. */
import { create } from 'zustand'
import { Chess } from 'chess.js'
import { analyzePosition } from './chess/position-analysis'
import { logger } from './logger'

const MOD = 'position'

function readPosition(fen, history = null) {
  try {
    const analysis = analyzePosition(fen, { history })
    if (analysis.vocabularyDrift) logger.warn(MOD, 'dérive de vocabulaire', analysis.vocabularyDrift)
    return { analysis, analysisError: null }
  } catch (err) {
    logger.error(MOD, 'lecture de position impossible', err.message)
    return { analysis: null, analysisError: err.message }
  }
}

export const useStore = create((set, get) => ({
  chess: new Chess(),
  fen: new Chess().fen(),
  moveHistory: [],
  lastMove: null,
  ...readPosition(new Chess().fen()),
  playerColor: 'white',
  vsAI: false,
  engineThinking: false,
  startedAt: null,

  feedback: '',
  feedbackType: 'ok',
  logLines: [],

  listening: false,
  vadActive: false,
  micLevel: 0,
  coachEnabled: true,

  addLog(msg, type = 'info') {
    set(s => ({ logLines: [...s.logLines.slice(-5), { msg: msg.slice(0, 52), type }] }))
  },

  setFeedback(text, type = 'ok') {
    set({ feedback: text, feedbackType: type })
  },

  applyMove(uci) {
    const chess = get().chess
    const fenBefore = chess.fen()
    const move = chess.move({ from: uci.slice(0,2), to: uci.slice(2,4), promotion: uci[4] || undefined })
    if (!move) return null
    const record = { fenBefore, uci, san: move.san }
    set({
      fen: chess.fen(),
      lastMove: { from: move.from, to: move.to },
      moveHistory: [...get().moveHistory, record],
      ...readPosition(chess.fen(), [...get().moveHistory, record].map(r => r.san)),
    })
    return record
  },

  undoMove() {
    const chess = get().chess
    if (!chess.history().length) return
    chess.undo()
    const history = get().moveHistory.slice(0, -1)
    const last = history.at(-1)
    set({
      fen: chess.fen(),
      lastMove: last ? { from: last.uci.slice(0,2), to: last.uci.slice(2,4) } : null,
      moveHistory: history,
      feedback: '',
      ...readPosition(chess.fen(), history.map(r => r.san)),
    })
  },

  resetGame() {
    const chess = new Chess()
    set({
      chess,
      fen: chess.fen(),
      moveHistory: [],
      lastMove: null,
      feedback: '',
      logLines: [],
      startedAt: new Date(),
      engineThinking: false,
      ...readPosition(chess.fen()),
    })
  },

  setPlayerColor(color) { set({ playerColor: color }) },
  setVsAI(v) { set({ vsAI: v }) },
  setEngineThinking(v) { set({ engineThinking: v }) },
  setListening(v) { set({ listening: v }) },
  setVadActive(v) { set({ vadActive: v }) },
  setMicLevel(v) { set({ micLevel: v }) },
  setCoachEnabled(v) { set({ coachEnabled: v }) },
}))
