import { logger } from '../logger.js'

const MOD = 'tts'
const PIECE_NAMES = { p:'pion', n:'cavalier', b:'fou', r:'tour', q:'dame', k:'roi' }

export function describeMove(chess, move) {
  const piece = chess.get(move.from)
  if (!piece) return 'coup invalide'
  const name = PIECE_NAMES[piece.type] || 'pièce'
  const { from, to, flags } = move
  if (flags?.includes('k')) return 'petit roque'
  if (flags?.includes('q')) return 'grand roque'
  let text = `${name} ${from} ${to}`
  if (flags?.includes('c') || flags?.includes('e')) text += ', prend'
  if (move.promotion) text += `, promotion en ${PIECE_NAMES[move.promotion] || 'dame'}`
  return text
}

const SAN_PIECES = { K: 'roi', Q: 'dame', R: 'tour', B: 'fou', N: 'cavalier' }

export function spokenSan(san) {
  if (san.startsWith('O-O-O')) return 'grand roque'
  if (san.startsWith('O-O')) return 'petit roque'
  const m = san.match(/^([KQRBN])?([a-h])?([1-8])?(x)?([a-h][1-8])(?:=([QRBN]))?/)
  if (!m) return san
  const [, piece, fromFile, fromRank, capture, to, promo] = m
  const words = [piece ? SAN_PIECES[piece] : '', fromFile || '', fromRank || '', capture ? 'prend' : '', `${to[0]} ${to[1]}`]
  if (promo) words.push(`promotion ${SAN_PIECES[promo]}`)
  if (san.includes('#')) words.push('échec et mat')
  else if (san.includes('+')) words.push('échec')
  return words.filter(Boolean).join(' ')
}

let _synth = null
function getSynth() {
  if (!_synth && typeof speechSynthesis !== 'undefined') _synth = speechSynthesis
  return _synth
}

/** Après la fin d'une phrase, le micro peut encore l'entendre (écho de la pièce, latence de la reconnaissance). */
export const ECHO_MARGIN_MS = 700
let _ownVoiceUntil = 0

/** Vrai tant que l'app parle, et un court instant après : ce que le micro entend alors est sa propre voix. */
export const speaking = (now = Date.now()) => now < _ownVoiceUntil

/**
 * Chromium sous Linux expose la synthèse sans moteur : chaque phrase échoue en « synthesis-failed ».
 * Elle part alors à `/api/speak` (edge-tts), et ce choix est retenu pour la suite.
 */
const STORE_KEY = 'tts.serveur'
const UNAVAILABLE = new Set(['synthesis-failed', 'synthesis-unavailable', 'audio-hardware', 'language-unavailable', 'voice-unavailable'])
const remembered = () => { try { return globalThis.localStorage?.getItem(STORE_KEY) === '1' } catch { return false } }
const remember = () => { try { globalThis.localStorage?.setItem(STORE_KEY, '1') } catch { /* navigation privée */ } }

/** Une phrase par tour : une nouvelle coupe la précédente, dont la fin ne touche plus à la voix en cours. */
let _turn = 0
let _audio = null

function stopAudio() {
  const audio = _audio
  _audio = null
  if (audio) { audio.pause(); audio.finish?.() }
}

async function speakOnServer(text, turn, ended) {
  // L'aller-retour au serveur s'ajoute à la phrase : le micro reste sourd assez longtemps pour les deux.
  _ownVoiceUntil = Math.max(_ownVoiceUntil, Date.now() + 4000 + text.length * 90)
  try {
    const res = await fetch('/api/speak', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    if (turn !== _turn) { ended(); return }
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    audio.finish = () => { URL.revokeObjectURL(url); if (_audio === audio) _audio = null; ended() }
    audio.onended = audio.finish
    audio.onerror = () => { logger.error(MOD, 'voix serveur illisible'); audio.finish() }
    _audio = audio
    await audio.play()
  } catch (e) {
    logger.error(MOD, 'voix serveur', e.message)
    ended()
  }
}

export function speak(text, onEnd) {
  logger.info(MOD, 'speak', text)
  const turn = ++_turn
  stopAudio()
  const synth = getSynth()
  synth?.cancel()
  // Borne haute si la synthèse ne signale jamais sa fin : le micro ne reste pas sourd pour toujours.
  _ownVoiceUntil = Date.now() + 1500 + text.length * 90
  let done = false
  const ended = () => {
    if (done) return
    done = true
    if (turn === _turn) _ownVoiceUntil = Date.now() + ECHO_MARGIN_MS
    onEnd?.()
  }
  if (!synth || remembered()) { speakOnServer(text, turn, ended); return }
  const utt = new SpeechSynthesisUtterance(text)
  utt.lang = 'fr-FR'
  utt.rate = 1.1
  utt.onend = ended
  utt.onerror = (e) => {
    if (UNAVAILABLE.has(e.error) && turn === _turn) {
      remember()
      logger.warn(MOD, 'synthèse du navigateur indisponible : passage au serveur', { error: e.error })
      speakOnServer(text, turn, ended)
      return
    }
    logger.error(MOD, 'SpeechSynthesis error', e.error)
    ended()
  }
  synth.speak(utt)
}

export function say(text) {
  return new Promise(resolve => {
    const fallback = setTimeout(resolve, 4000 + text.length * 90)
    speak(text, () => { clearTimeout(fallback); resolve() })
  })
}
