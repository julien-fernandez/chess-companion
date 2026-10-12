import { useCallback, useEffect, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import { judgeSan } from '../chess/review-session'
import { readYesNo, resolveMove } from '../chess/resolve-move'
import { blobToBase64, createCapture } from '../chess/audio-capture'
import { saveAttempt, utterancePayload } from '../chess/review-trace'
import { say, spokenSan } from '../chess/tts'
import { logger } from '../logger'
import { recognitionClass } from '../chess/recognition'
import { api } from '../api'
import './Review.css'

const MOD = 'review'
const SIDE_LABEL = { white: 'les Blancs', black: 'les Noirs' }
const VERDICT_LINE = {
  correct: () => 'Oui.',
  alternative: move => `Oui. Dans cette ligne : ${spokenSan(move.san)}.`,
  unrecognized: () => 'Pas compris, répète.',
  retry: () => 'Non. Encore.',
  failed: move => `C'était ${spokenSan(move.san)}.`,
  denied: () => 'D\'accord. Redis ton coup.',
}
const MIC_ERROR = {
  'no-speech': 'Rien entendu : appuie sur Parler',
  'not-allowed': 'Micro refusé par le navigateur',
  'audio-capture': 'Aucun micro disponible',
  network: 'Reconnaissance vocale injoignable : tape le coup',
}
const BOARD_KEY = 'revision.board'
/** Celle du navigateur, ou le serveur là où elle manque (Chromium sous Linux). */
const Recognition = recognitionClass()
const LAST_MOVE_STYLE = { backgroundColor: 'rgba(255, 214, 10, 0.4)' }

/** Le micro ouvert pendant que le téléphone parle encore est coupé (« aborted ») ou s'entend lui-même. */
async function speechDone() {
  const synth = typeof speechSynthesis === 'undefined' ? null : speechSynthesis
  for (let waited = 0; synth?.speaking && waited < 5000; waited += 100)
    await new Promise(r => setTimeout(r, 100))
  await new Promise(r => setTimeout(r, 250))
}

/** Des cases en fraction de pixel laissent passer le fond entre les rangées, sur écran de téléphone. */
function boardWidth() {
  return Math.floor(Math.min(448, window.innerWidth - 32) / 8) * 8
}

function readBoardPref() {
  try { return localStorage.getItem(BOARD_KEY) !== 'hidden' } catch { return true }
}

function writeBoardPref(shown) {
  try { localStorage.setItem(BOARD_KEY, shown ? 'shown' : 'hidden') } catch { /* réglage perdu, sans gravité */ }
}


function isDue(variation) {
  return variation.due_at !== null && new Date(variation.due_at) <= new Date()
}

export default function Review() {
  const [auth, setAuth] = useState('checking')
  const [password, setPassword] = useState('')
  const [variations, setVariations] = useState([])
  const [running, setRunning] = useState(null)
  const [status, setStatus] = useState('')
  const [waiting, setWaiting] = useState(false)
  const [micOn, setMicOn] = useState(false)
  const [typed, setTyped] = useState('')
  const [unsaved, setUnsaved] = useState(0)
  const [fen, setFen] = useState(new Chess().fen())
  const [lastMove, setLastMove] = useState(null)
  const [boardShown, setBoardShown] = useState(readBoardPref)
  const [boardPx, setBoardPx] = useState(boardWidth)
  const answerRef = useRef(null)
  const recognitionRef = useRef(null)
  const stopRef = useRef(false)
  const captureRef = useRef(null)
  const clipRef = useRef(null)
  const recordRef = useRef(false)
  const [confirming, setConfirming] = useState(null)

  const load = useCallback(() => api('variations').then(({ status: code, data }) => {
    if (code === 401) { setAuth('login'); return }
    if (code !== 200) { setStatus(`API en erreur (${code})`); return }
    setVariations(data)
    setAuth('ok')
  }), [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const fit = () => setBoardPx(boardWidth())
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  async function login(e) {
    e.preventDefault()
    const { status: code } = await api('login', { password })
    setPassword('')
    if (code === 200) load()
    else setStatus('Mot de passe refusé')
  }

  function listen() {
    recognitionRef.current?.abort()
    const r = new Recognition()
    recognitionRef.current = r
    r.lang = 'fr-FR'
    r.interimResults = false
    r.maxAlternatives = 5
    let heardSomething = false
    r.onresult = e => {
      heardSomething = true
      answerRef.current?.({
        transcripts: Array.from(e.results[0], a => a.transcript.trim().toLowerCase()).filter(Boolean),
        typed: false,
      })
    }
    r.onerror = e => {
      if (e.error === 'audio-capture') captureRef.current?.disable()
      logger.warn(MOD, 'reconnaissance', e.error)
      if (e.error !== 'aborted' && e.error !== 'no-speech') setStatus(MIC_ERROR[e.error] ?? `Micro : ${e.error}`)
    }
    r.onend = () => {
      if (recognitionRef.current !== r) return
      recognitionRef.current = null
      setMicOn(false)
      if (!heardSomething && answerRef.current) setStatus(MIC_ERROR['no-speech'])
    }
    if (recordRef.current) {
      clipRef.current?.stop()
      captureRef.current ??= createCapture()
      clipRef.current = captureRef.current.start()
    }
    setMicOn(true)
    r.start()
  }

  async function ask(record) {
    recordRef.current = record
    setWaiting(true)
    const answer = new Promise(resolve => { answerRef.current = resolve })
    await speechDone()
    if (answerRef.current) listen()
    return answer.finally(() => { answerRef.current = null; setWaiting(false) })
  }

  async function takeClip() {
    const clip = clipRef.current
    clipRef.current = null
    return clip ? clip.stop() : null
  }

  async function run(variation) {
    stopRef.current = false
    setRunning(variation)
    const chess = new Chess()
    const play = san => {
      const played = chess.move(san)
      setFen(chess.fen())
      setLastMove(played)
    }
    setFen(chess.fen())
    setLastMove(null)
    let firstTry = 0
    let asked = 0
    logger.info(MOD, 'variante', { id: variation.id, label: variation.label })
    await say(`${variation.chapter_label}. ${variation.label}. Tu as ${SIDE_LABEL[variation.side]}.`)
    for (const move of variation.moves) {
      if (stopRef.current) break
      if (!move.own) {
        setStatus(`Adversaire : ${spokenSan(move.san)}`)
        play(move.san)
        await say(spokenSan(move.san))
        continue
      }
      asked += 1
      let failed = 0
      for (;;) {
        setStatus('À toi')
        const answer = await ask(true)
        const blob = await takeClip()
        if (stopRef.current) break
        const resolved = await resolveMove(chess, answer.transcripts, {
          typed: answer.typed,
          resolveRemote: request => api('resolve', request).then(({ status: code, data }) => (code === 200 ? data : null)),
          confirm: async san => {
            // « Arrêter » pendant l'appel au décideur : ne pas poser la question ni rouvrir le micro.
            if (stopRef.current) return null
            setConfirming(san)
            setStatus(`Tu as dit ${spokenSan(san)} ?`)
            await say(`Tu as dit ${spokenSan(san)} ?`)
            if (stopRef.current) { setConfirming(null); return null }
            const reply = await ask(false)
            setConfirming(null)
            return stopRef.current ? null : readYesNo(reply.transcripts)
          },
        })
        if (stopRef.current) break
        const result = resolved.confirmed === false
          ? { verdict: 'denied', review: null }
          : judgeSan(resolved.san, move, failed)
        const audio = blob && !answer.typed ? { base64: await blobToBase64(blob), type: blob.type } : null
        const review = result.review
          ? { epd: move.epd, ...result.review, heard: answer.transcripts.join(' | ') }
          : null
        saveAttempt(api, utterancePayload(move, answer.transcripts, resolved, audio), review)
          .then(({ failures }) => {
            if (failures) {
              setUnsaved(n => n + failures)
              logger.error(MOD, 'trace ou rappel non enregistré', { failures })
            }
          })
        logger.info(MOD, 'réponse', { epd: move.epd, expected: move.san, transcripts: answer.transcripts,
          typed: answer.typed, san: resolved.san, decider: resolved.decider, verdict: result.verdict })
        const heardLabel = resolved.san ? spokenSan(resolved.san) : (answer.transcripts[0] ?? '')
        setStatus(`« ${heardLabel} » → ${VERDICT_LINE[result.verdict](move)}`)
        await say(VERDICT_LINE[result.verdict](move))
        if (result.verdict === 'retry') failed += 1
        if (['correct', 'alternative', 'failed'].includes(result.verdict)) {
          if (failed === 0 && result.verdict !== 'failed') firstTry += 1
          break
        }
      }
      if (stopRef.current) break
      play(move.san)
    }
    if (!stopRef.current) {
      const summary = `Variante terminée. ${firstTry} sur ${asked} du premier coup.`
      setStatus(summary)
      logger.info(MOD, 'variante terminée', { id: variation.id, firstTry, asked })
      await say(summary)
    }
    captureRef.current?.release()
    setRunning(null)
    load()
  }

  function submitTyped(e) {
    e.preventDefault()
    if (typed.trim()) answerRef.current?.({ transcripts: [typed.trim().toLowerCase()], typed: true })
    setTyped('')
  }

  function stop() {
    stopRef.current = true
    answerRef.current?.({ transcripts: [], typed: false })
    recognitionRef.current?.abort()
    clipRef.current?.stop()
    clipRef.current = null
    captureRef.current?.release()
  }

  function reply(word) {
    answerRef.current?.({ transcripts: [word], typed: false })
    recognitionRef.current?.abort()
  }

  function toggleBoard() {
    setBoardShown(shown => { writeBoardPref(!shown); return !shown })
  }

  if (auth === 'checking') return <div className="review"><p>Connexion…</p></div>

  if (auth === 'login') return (
    <div className="review">
      <h1>Révision</h1>
      <form onSubmit={login} className="review-form">
        <input type="password" value={password} onChange={e => setPassword(e.target.value)}
               placeholder="Mot de passe" autoComplete="current-password" />
        <button type="submit">Entrer</button>
      </form>
      <p className="review-status">{status}</p>
    </div>
  )

  const due = variations.filter(isDue)

  return (
    <div className="review">
      <h1>Révision</h1>
      {unsaved > 0 && <p className="review-alert">{unsaved} enregistrement(s) perdu(s)</p>}
      {running ? (
        <>
          <p className="review-running">{running.chapter_label} — {running.label}</p>
          {boardShown && (
            <div className="review-board" style={{ width: boardPx, height: boardPx }}>
              <Chessboard options={{
                position: fen,
                boardOrientation: running.side,
                allowDragging: false,
                animationDurationInMs: 200,
                squareStyles: lastMove ? { [lastMove.from]: LAST_MOVE_STYLE, [lastMove.to]: LAST_MOVE_STYLE } : {},
              }} />
            </div>
          )}
          <button className="review-toggle" onClick={toggleBoard}>
            {boardShown ? 'Masquer l\'échiquier' : 'Voir l\'échiquier'}
          </button>
          <p className="review-status">{status}</p>
          {waiting && (
            <>
              <button className="review-mic" onClick={listen} disabled={micOn}>
                {micOn ? 'J\'écoute…' : 'Parler'}
              </button>
              {confirming && (
                <div className="review-confirm">
                  <button onClick={() => reply('oui')}>Oui</button>
                  <button onClick={() => reply('non')}>Non</button>
                </div>
              )}
              <form onSubmit={submitTyped} className="review-form">
                <input value={typed} onChange={e => setTyped(e.target.value)} placeholder="ou tape : cavalier f3" />
              </form>
            </>
          )}
          <button className="review-stop" onClick={stop}>Arrêter</button>
        </>
      ) : (
        <>
          <p>{due.length} variante(s) à réviser sur {variations.length}.</p>
          {variations[0] && (
            <button className="review-mic" onClick={() => run(variations[0])}>
              Réviser : {variations[0].label}
            </button>
          )}
          <ul className="review-list">
            {variations.slice(1, 6).map(v => (
              <li key={v.id}><button onClick={() => run(v)}>{v.chapter_label} — {v.label}</button></li>
            ))}
          </ul>
          <p className="review-status">{status}</p>
        </>
      )}
    </div>
  )
}
