/** Le coup dit pendant une partie : règles d'abord, puis phonétique, puis confirmation (cas d'usage #6). */
import { normalizeFr } from './voice-input.js'
import { phoneticMatch } from './phonetic-match.js'
import { CANDIDATE_MIN_PHONETIC, readYesNo } from './resolve-move.js'

/**
 * Réponse à « Fc4 ? (oui / non) » : `yes`, `no`, ou `other` — une phrase qui n'est ni oui ni non
 * est un nouveau coup, redit par le joueur ; l'écarter avec la proposition la perdrait.
 */
export function confirmationAnswer(transcripts) {
  const answer = readYesNo(transcripts)
  return answer === true ? 'yes' : answer === false ? 'no' : 'other'
}

const KNOWN_WORDS = new Set(['roi', 'dame', 'tour', 'fou', 'cavalier', 'pion', 'prend', 'prends', 'x', 'petit', 'grand',
  'roque', 'promotion', 'en', 'passant', 'quitter', 'quit', 'stop', 'fin', 'annuler', 'undo', 'retour',
  // Mots de liaison entre la pièce et la case : « fou recule en a4 », « dame va sur d5 ».
  'va', 'vient', 'recule', 'avance', 'sur', 'vers', 'joue', 'à'])

/** Les règles ne lisent qu'une partie de la phrase : « phoque c4 » y devient le pion c4. Tout mot doit être compris. */
function understood(transcript) {
  const words = normalizeFr(transcript).replace(/[.,!?;:]/g, ' ').split(/\s+/).filter(Boolean)
  return words.length > 0 && words.every((w) => KNOWN_WORDS.has(w) || /^[a-h][1-8]?$/.test(w))
}

const verbose = (chess, test) => chess.moves({ verbose: true }).find(test)

const PIECE_TYPES = { roi: 'k', dame: 'q', tour: 'r', fou: 'b', cavalier: 'n', pion: 'p' }
const PIECE_NAMES = Object.fromEntries(Object.entries(PIECE_TYPES).map(([name, type]) => [type, name]))

/**
 * « Je prends le cavalier f6 » : la pièce nommée est celle qu'on prend, pas celle qui joue.
 * Ne vaut que si la pièce nommée ne peut pas aller sur la case (sinon les règles ont joué) ;
 * une seule prise se confirme, plusieurs du même type se précisent, sinon rien ne se devine.
 */
function namedTarget(chess, transcripts) {
  for (const transcript of transcripts) {
    const said = normalizeFr(transcript).match(/\b(roi|dame|tour|fou|cavalier|pion)\b.*?\b([a-h][1-8])\b/)
    if (!said) continue
    const [, name, square] = said
    const target = chess.get(square)
    if (!target || target.color === chess.turn() || target.type !== PIECE_TYPES[name]) continue
    const moves = chess.moves({ verbose: true })
    if (moves.some((m) => m.to === square && m.piece === PIECE_TYPES[name])) continue
    const takers = moves.filter((m) => m.to === square)
    if (takers.length === 1) {
      const [m] = takers
      return { kind: 'confirm', uci: m.from + m.to + (m.promotion ?? ''), san: m.san }
    }
    const types = new Set(takers.map((m) => m.piece))
    if (types.size === 1) {
      return { kind: 'ambiguous', piece: PIECE_NAMES[takers[0].piece], squares: takers.map((m) => m.from).sort().join(', ') }
    }
  }
  return null
}

/**
 * Rend `{ kind: 'move', uci, san, source }`, `{ kind: 'confirm', uci, san }`, `{ kind: 'command', command }`,
 * `{ kind: 'ambiguous', piece, squares }` ou `{ kind: 'none' }`.
 */
export function decideGameMove(chess, transcripts, voice) {
  for (const transcript of transcripts) {
    if (!understood(transcript)) continue
    const parsed = voice.parse(transcript)
    if (!parsed) continue
    if (parsed === 'quit' || parsed === 'undo') return { kind: 'command', command: parsed }
    if (parsed.startsWith('AMBIG:')) {
      const [, piece, squares] = parsed.split(':')
      return { kind: 'ambiguous', piece, squares }
    }
    const move = verbose(chess, (m) => m.from + m.to + (m.promotion ?? '') === parsed || m.from + m.to === parsed)
    if (move) return { kind: 'move', uci: parsed, san: move.san, source: 'rules' }
  }
  const capture = namedTarget(chess, transcripts)
  if (capture) return capture
  const { ranking, decided } = phoneticMatch(chess, transcripts)
  const san = decided ?? (ranking[0]?.score >= CANDIDATE_MIN_PHONETIC ? ranking[0].san : null)
  if (!san) return { kind: 'none' }
  const move = verbose(chess, (m) => m.san === san)
  const uci = move.from + move.to + (move.promotion ?? '')
  return decided ? { kind: 'move', uci, san, source: 'phonetic' } : { kind: 'confirm', uci, san }
}
