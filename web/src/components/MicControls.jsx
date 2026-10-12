import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { VoiceInput } from '../chess/voice-input'
import { confirmationAnswer, decideGameMove } from '../chess/game-voice'
import { describeMove, speak, speaking } from '../chess/tts'
import { frenchSan } from '../chess/judgment'
import { logger } from '../logger'
import { chooseMic, chosenMic, recognitionClass } from '../chess/recognition'

const MOD = 'mic'
/** Celle du navigateur, ou le serveur là où elle manque (Chromium sous Linux). */
const Recognition = recognitionClass()

export default function MicControls({ onMove }) {
  const {
    chess, listening, vadActive, micLevel, vsAI,
    setListening, setVadActive, setMicLevel, setVsAI,
    setFeedback,
  } = useStore()

  const [textInput, setTextInput] = useState('')
  const [devices, setDevices] = useState([])
  const [selectedDeviceId, setSelectedDeviceId] = useState(chosenMic)
  const voiceRef = useRef(null)
  const pendingRef = useRef(null)
  const recognRef = useRef(null)
  const audioCtxRef = useRef(null)
  const animRef = useRef(null)
  const streamRef = useRef(null)

  function getVoice() {
    if (!voiceRef.current || voiceRef.current._chess !== chess) {
      voiceRef.current = new VoiceInput(chess)
    }
    return voiceRef.current
  }

  async function refreshDevices() {
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      const inputs = all.filter(d => d.kind === 'audioinput')
      setDevices(inputs)
      logger.info(MOD, 'devices audio', { count: inputs.length, labels: inputs.map(d => d.label || d.deviceId) })
    } catch (e) {
      logger.error(MOD, 'enumerateDevices erreur', e.message)
    }
  }

  useEffect(() => {
    let active = true
    async function startMeter() {
      try {
        const constraints = { audio: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true }
        logger.info(MOD, 'demande permission micro…', { deviceId: selectedDeviceId || 'default' })
        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        streamRef.current = stream
        await refreshDevices()
        const ctx = new AudioContext()
        audioCtxRef.current = ctx
        const src = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 512
        src.connect(analyser)
        const buf = new Float32Array(analyser.fftSize)
        const track = stream.getAudioTracks()[0]
        logger.info(MOD, 'level meter démarré', { sampleRate: ctx.sampleRate, label: track?.label || '?' })
        function tick() {
          if (!active) return
          analyser.getFloatTimeDomainData(buf)
          const rms = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length)
          setMicLevel(Math.min(1, rms / 0.08))
          animRef.current = requestAnimationFrame(tick)
        }
        tick()
      } catch (e) {
        logger.error(MOD, 'permission micro refusée', e.message)
      }
    }
    startMeter()
    return () => {
      active = false
      cancelAnimationFrame(animRef.current)
      audioCtxRef.current?.close()
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [selectedDeviceId])

  function startListening() {
    if (listening) return
    const r = new Recognition()
    r.lang = 'fr-FR'
    r.interimResults = false
    r.maxAlternatives = 5
    recognRef.current = r
    setListening(true)
    logger.info(MOD, 'PTT start')
    r.onstart = () => logger.info(MOD, 'PTT recognition started')
    r.onresult = (e) => {
      const alternatives = Array.from(e.results[0]).map(a => ({ t: a.transcript, c: a.confidence.toFixed(3) }))
      logger.info(MOD, 'PTT résultat', { alternatives })
      handleVoiceResult(Array.from(e.results[0]).map(a => a.transcript.toLowerCase()))
    }
    r.onnomatch = () => logger.warn(MOD, 'PTT no match')
    r.onerror = (e) => {
      if (e.error === 'no-speech') {
        logger.info(MOD, 'PTT — rien capté (silence normal)')
        tell('Rien capté — réessaie', 'Rien capté.')
      } else {
        logger.error(MOD, 'PTT erreur', { error: e.error })
        setFeedback(`Micro erreur : ${e.error}`)
      }
      setListening(false)
    }
    r.onend = () => { logger.info(MOD, 'PTT end'); setListening(false) }
    r.start()
  }

  function toggleVad() {
    if (vadActive) {
      recognRef.current?.stop()
      recognRef.current = null
      setVadActive(false)
      logger.info(MOD, 'VAD désactivé')
      return
    }
    const r = new Recognition()
    r.lang = 'fr-FR'
    r.continuous = true
    r.interimResults = false
    r.maxAlternatives = 5
    recognRef.current = r
    r.onstart = () => logger.info(MOD, 'VAD recognition started')
    r.onresult = (e) => {
      const result = e.results[e.results.length - 1]
      const alternatives = Array.from(result).map(a => ({ t: a.transcript, c: a.confidence.toFixed(3) }))
      logger.info(MOD, 'VAD résultat', { alternatives })
      handleVoiceResult(Array.from(result).map(a => a.transcript.toLowerCase()))
    }
    r.onsoundstart  = () => logger.debug(MOD, 'VAD sound detected')
    r.onspeechstart = () => logger.debug(MOD, 'VAD speech detected')
    r.onspeechend   = () => logger.debug(MOD, 'VAD speech end')
    r.onnomatch     = () => logger.warn(MOD, 'VAD no match')
    r.onerror = (e) => {
      if (e.error === 'no-speech') logger.debug(MOD, 'VAD silence (normal)')
      else logger.error(MOD, 'VAD erreur', { error: e.error })
    }
    r.onend = () => {
      logger.debug(MOD, 'VAD recognition ended — redémarrage si actif')
      if (useStore.getState().vadActive) r.start()
    }
    r.start()
    setVadActive(true)
    logger.info(MOD, 'VAD activé')
  }

  /** À la table, le joueur regarde l'échiquier, pas l'écran : tout refus se dit aussi (cas d'usage #5, #7). */
  function tell(shown, spoken = shown) {
    setFeedback(shown)
    speak(spoken)
  }

  /** Règles, puis phonétique ; un coup incertain se confirme à voix haute. */
  function handleVoiceResult(transcripts) {
    if (speaking()) { logger.debug(MOD, 'voix de l\'app ignorée', { transcripts }); return }
    const pending = pendingRef.current
    if (pending) {
      pendingRef.current = null
      const answer = confirmationAnswer(transcripts)
      if (answer === 'yes') { logger.info(MOD, 'confirmé', { uci: pending.uci }); onMove(pending.uci); return }
      if (answer === 'no') { tell(`${frenchSan(pending.san)} écarté`, 'Écarté.'); return }
      // Ni oui ni non : le joueur redit son coup, qui remplace la proposition.
      logger.info(MOD, 'proposition remplacée', { san: pending.san, transcripts })
    }
    const live = useStore.getState().chess
    const decision = decideGameMove(live, transcripts, getVoice())
    logger.info(MOD, 'décision', { transcripts, decision })
    if (decision.kind === 'none') {
      tell(`Non reconnu : ${transcripts[0] ?? ''}`, `Pas compris : ${transcripts[0] ?? ''}`)
      return
    }
    if (decision.kind === 'command') { if (decision.command === 'undo') onMove('undo'); return }
    if (decision.kind === 'ambiguous') {
      tell(`Précise la case pour le ${decision.piece} : ${decision.squares}`,
        `Quel ${decision.piece} ? ${decision.squares.split(', ').join(' ou ')}`)
      return
    }
    if (decision.kind === 'confirm') {
      const move = live.moves({ verbose: true }).find(m => m.san === decision.san)
      pendingRef.current = decision
      tell(`${frenchSan(decision.san)} ? (oui / non)`, `${describeMove(live, move)} ?`)
      return
    }
    logger.info(MOD, 'move envoyé', { uci: decision.uci, source: decision.source })
    onMove(decision.uci)
  }

  function handleTextSubmit(e) {
    e.preventDefault()
    const text = textInput.trim().toLowerCase()
    setTextInput('')
    if (!text) return
    logger.info(MOD, 'text input', { text })
    if (['quit','q','exit'].includes(text)) return
    if (['undo','u'].includes(text)) { onMove('undo'); return }
    const voice = getVoice()
    const uci = voice.parse(text)
    if (uci && !['quit','undo'].includes(uci)) {
      if (uci.startsWith('AMBIG:')) {
        const [, piece, squares] = uci.split(':')
        setFeedback(`Précise la case pour le ${piece} : ${squares}`)
        return
      }
      onMove(uci)
    } else {
      setFeedback(`Non reconnu : ${text}`)
    }
  }

  useEffect(() => {
    function onKey(e) {
      if (e.code === 'Space' && e.target.tagName !== 'INPUT') {
        e.preventDefault()
        startListening()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [listening])

  const levelPct = Math.round(micLevel * 100)
  const levelColor = micLevel < 0.7 ? '#50be50' : micLevel < 0.9 ? '#d49a32' : '#d44'

  return (
    <div className="mic-controls">
      <div className="section-label">MICROPHONE</div>

      {devices.length > 1 && (
        <select
          className="mic-select"
          value={selectedDeviceId}
          onChange={e => { logger.info(MOD, 'device sélectionné', { deviceId: e.target.value }); chooseMic(e.target.value); setSelectedDeviceId(e.target.value) }}
          title="Choisir le micro"
        >
          {devices.map(d => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Micro ${d.deviceId.slice(0, 8)}`}
            </option>
          ))}
        </select>
      )}

      <div className="level-bar-container">
        <div className="level-bar" style={{ width: `${levelPct}%`, backgroundColor: levelColor }} />
      </div>
      <div className="level-pct">Niveau : {levelPct}%</div>

      <div className="mic-btns">
        <button
          className={`btn-ptt ${listening ? 'btn-active' : ''}`}
          onMouseDown={startListening}
          title="Push-to-talk [Espace]"
        >
          {listening ? '🔴 Écoute…' : '🎤 [Spc]'}
        </button>
        <button
          className={`btn-vad ${vadActive ? 'btn-active' : ''}`}
          onClick={toggleVad}
          title="Voice Activity Detection continu"
        >
          {vadActive ? 'VAD ON' : 'VAD'}
        </button>
        <button
          className={`btn-vsai ${vsAI ? 'btn-active' : ''}`}
          onClick={() => { logger.info(MOD, 'toggle VS IA', { was: vsAI }); setVsAI(!vsAI) }}
          title="Jouer contre Stockfish"
        >
          {vsAI ? 'IA ON' : 'VS IA'}
        </button>
      </div>

      <form className="text-input-form" onSubmit={handleTextSubmit}>
        <input
          type="text"
          value={textInput}
          onChange={e => setTextInput(e.target.value)}
          placeholder="e4 · cavalier f3 · undo…"
          className="text-input"
          autoComplete="off"
        />
      </form>
      <div className="input-hint">clique · [Spc]=micro · [Enter] · undo · quit</div>
    </div>
  )
}
