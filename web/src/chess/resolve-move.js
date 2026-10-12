/** Décide le coup dit, du moins cher au plus cher : phonétique, décideur distant, confirmation. */
import { phoneticMatch, spokenForms } from './phonetic-match.js'
import { heardToSan } from './review-session.js'

export const DECIDER_MIN_CONFIDENCE = 0.7
export const CANDIDATE_MIN_CONFIDENCE = 0.3
export const CANDIDATE_MIN_PHONETIC = 0.5

const YES = ['oui', 'ouais', 'ouai', 'c est ça', 'c est ca', 'exact', 'exactement', 'voilà', 'voila']
const NO = ['non', 'nan', 'pas du tout', 'faux']

/** Oui, non, ou null si aucune transcription ne se lit comme l'un des deux. */
export function readYesNo(transcripts) {
  for (const t of transcripts) {
    const words = ` ${t.toLowerCase().replace(/['’.,!?]/g, ' ').replace(/\s+/g, ' ').trim()} `
    if (NO.some(w => words.includes(` ${w} `))) return false
    if (YES.some(w => words.includes(` ${w} `))) return true
  }
  return null
}

/** Requête pour `/api/resolve` : coups légaux en français parlé, sans le coup attendu. */
export function resolveRequest(chess, transcripts, ranking) {
  return {
    fen: chess.fen(),
    transcripts,
    options: chess.moves({ verbose: true }).map(m => ({ san: m.san, spoken: spokenForms(m)[0] })),
    phonetic: ranking.slice(0, 5),
  }
}

/**
 * Rend `{ san, decider, confidence, confirmed, phoneticSan, phoneticMargin, latencyMs }`.
 * `resolveRemote(request)` rend `{ san, confidence, decider }` ; `confirm(san)` rend true, false ou null.
 */
export async function resolveMove(chess, transcripts, { typed = false, resolveRemote, confirm, now = Date.now }) {
  const started = now()
  const done = fields => ({ confidence: null, confirmed: null, ...fields, latencyMs: Math.round(now() - started) })
  if (typed) {
    return done({ san: heardToSan(chess, transcripts[0] ?? ''), decider: 'typed', phoneticSan: null, phoneticMargin: null })
  }
  const { ranking, decided, margin } = phoneticMatch(chess, transcripts)
  const phonetic = { phoneticSan: ranking[0]?.san ?? null, phoneticMargin: ranking.length ? margin : null }
  if (decided) return done({ san: decided, decider: 'phonetic', confidence: ranking[0].score, ...phonetic })

  const legal = new Set(ranking.map(r => r.san))
  let remote
  try {
    remote = await resolveRemote(resolveRequest(chess, transcripts, ranking))
  } catch {
    remote = null
  }
  const remoteSan = remote && legal.has(remote.san) ? remote.san : null
  if (remoteSan && remote.confidence >= DECIDER_MIN_CONFIDENCE) {
    return done({ san: remoteSan, decider: remote.decider, confidence: remote.confidence, ...phonetic })
  }

  const candidate = remoteSan && remote.confidence >= CANDIDATE_MIN_CONFIDENCE ? remoteSan
    : ranking[0]?.score >= CANDIDATE_MIN_PHONETIC ? ranking[0].san : null
  if (!candidate) return done({ san: null, decider: 'none', ...phonetic })
  const answer = await confirm(candidate)
  if (answer === null) return done({ san: null, decider: 'none', ...phonetic })
  return done({ san: answer ? candidate : null, decider: 'confirmation', confirmed: answer, ...phonetic })
}
