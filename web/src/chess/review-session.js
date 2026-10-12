/** Jugement d'une réponse dictée pendant la révision d'une variante (ADR 0011). */
import { VoiceInput } from './voice-input.js'

export const MAX_ATTEMPTS = 3

export function heardToSan(chess, heard) {
  const uci = new VoiceInput(chess).parse(heard)
  if (!uci || uci === 'quit' || uci === 'undo' || uci.startsWith('AMBIG:')) return null
  const move = chess.moves({ verbose: true })
    .find(m => m.from + m.to === uci || m.from + m.to + (m.promotion || '') === uci)
  return move ? move.san : null
}

/** Juge un coup déjà décidé (ou null si rien n'a été compris) contre le coup de la variante. */
export function judgeSan(san, move, failedAttempts) {
  if (!san) return { verdict: 'unrecognized', review: { san: move.san, outcome: 'unrecognized' } }
  const recalled = failedAttempts === 0 ? 'recalled' : 'recalled_after_retry'
  if (san === move.san) return { verdict: 'correct', san, review: { san, outcome: recalled } }
  if (move.answers.includes(san)) return { verdict: 'alternative', san, review: { san, outcome: recalled } }
  if (failedAttempts + 1 >= MAX_ATTEMPTS) return { verdict: 'failed', san, review: { san: move.san, outcome: 'failed' } }
  return { verdict: 'retry', san, review: null }
}

export function judge(chess, heard, move, failedAttempts) {
  return judgeSan(heardToSan(chess, heard), move, failedAttempts)
}
