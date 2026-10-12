/** Étage 1 : rapproche des transcriptions des coups légaux par le son, sans connaître le coup attendu. */
import { spokenSan } from './tts.js'
import { normalizeFr } from './voice-input.js'

export const PHONETIC_MIN = 0.75
export const PHONETIC_MARGIN = 0.12

const LETTER_SOUND = { a: 'a', b: 'be', c: 'se', d: 'de', e: 'e', f: 'ef', g: 'je', h: 'ach' }
const DIGIT_SOUND = { 1: 'un', 2: 'de', 3: 'troa', 4: 'katr', 5: 'sink', 6: 'sis', 7: 'set', 8: 'uit' }
const PIECE_WORD = { n: 'cavalier', b: 'fou', r: 'tour', q: 'dame', k: 'roi' }

const SPELLING = [
  [/[àâä]/g, 'a'], [/[éèêë]/g, 'e'], [/[îï]/g, 'i'], [/[ôö]/g, 'o'], [/[ùûü]/g, 'u'], [/ç/g, 's'],
  [/ph/g, 'f'], [/qu/g, 'k'], [/eau|au/g, 'o'], [/ai|ei/g, 'e'], [/oi/g, 'oa'], [/ou/g, 'u'],
  [/c(?=[eiy])/g, 's'], [/c/g, 'k'], [/h/g, ''], [/(.)\1+/g, '$1'],
]

function spellWord(word) {
  let w = word
  for (const [pattern, sound] of SPELLING) w = w.replace(pattern, sound)
  if (w.length > 2) w = w.replace(/(?<=.)[stdx]+$/, '').replace(/(?<=..)e$/, '')
  return w.replace(/[1-8]/g, digit => DIGIT_SOUND[digit])
}

/** Clé phonétique française d'une phrase : cases et chiffres épelés, orthographe rapprochée du son. */
export function phoneticKey(text) {
  return normalizeFr(text.replace(/['’.,!?;:-]/g, ' '))
    .split(/\s+/)
    .filter(Boolean)
    .map(token => {
      const square = token.match(/^([a-h])([1-8])$/)
      if (square) return LETTER_SOUND[square[1]] + DIGIT_SOUND[square[2]]
      if (/^[1-8]$/.test(token)) return DIGIT_SOUND[token]
      if (/^[a-h]$/.test(token)) return LETTER_SOUND[token]
      return spellWord(token)
    })
    .join('')
    .replace(/(.)\1+/g, '$1')
}

/** Formes françaises plausibles d'un coup légal (objet verbeux de chess.js). */
export function spokenForms(move) {
  if (move.flags.includes('k')) return ['petit roque', 'roque']
  if (move.flags.includes('q')) return ['grand roque']
  const to = `${move.to[0]} ${move.to[1]}`
  const forms = new Set([spokenSan(move.san).replace(/ (échec|échec et mat)$/, '')])
  if (move.piece === 'p') {
    forms.add(to)
    forms.add(`pion ${to}`)
    if (move.captured) forms.add(`${move.from[0]} prend ${to}`)
  } else {
    forms.add(`${PIECE_WORD[move.piece]} ${to}`)
    if (move.captured) forms.add(`${PIECE_WORD[move.piece]} prend ${to}`)
  }
  return [...forms]
}

function similarity(a, b) {
  if (!a || !b) return 0
  const row = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const above = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1))
      diagonal = above
    }
  }
  return 1 - row[b.length] / Math.max(a.length, b.length)
}

/**
 * Classe les coups légaux par proximité sonore avec les transcriptions.
 * Rend `{ ranking: [{ san, score }], decided: san | null, margin }` ; le coup attendu n'entre pas.
 */
export function phoneticMatch(chess, transcripts) {
  const heard = transcripts
    .map(t => ({ key: phoneticKey(t), squares: squaresSaid(t) }))
    .filter(h => h.key)
  const squareMismatch = new Set()
  const ranking = chess.moves({ verbose: true })
    .map(move => {
      const formKeys = spokenForms(move).map(phoneticKey)
      const scores = heard.map(h => Math.max(0, ...formKeys.map(f => similarity(h.key, f))))
      const score = Math.max(0, ...scores)
      // « fou c5 » est à un son de « fou b5 » : une case dite qui n'est pas celle du coup interdit de le décider.
      const backers = heard.filter((_, i) => scores[i] === score)
      if (backers.length && backers.every(h => h.squares.length && !h.squares.includes(move.to))) squareMismatch.add(move.san)
      return { san: move.san, score }
    })
    .sort((x, y) => y.score - x.score)
  const [first, second] = ranking
  const margin = first ? first.score - (second?.score ?? 0) : 0
  const decided = first && first.score >= PHONETIC_MIN && margin >= PHONETIC_MARGIN
    && !squareMismatch.has(first.san) ? first.san : null
  return { ranking, decided, margin }
}

/** Cases lues sans ambiguïté dans une transcription (« fou c5 » → c5 ; « fou c'est quatre » → aucune). */
function squaresSaid(text) {
  return normalizeFr(text.replace(/['’.,!?;:-]/g, ' ')).split(/\s+/).filter(t => /^[a-h][1-8]$/.test(t))
}
