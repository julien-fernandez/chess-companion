/**
 * Reconnaissance vocale de remplacement, de même forme que `SpeechRecognition`.
 * Chromium sous Linux expose l'API sans clé Google : elle échoue en « network » sur chaque énoncé.
 * L'énoncé part alors à `/api/transcribe` (Whisper), et ce choix est retenu pour la suite.
 */
import { api } from '../api.js'
import { logger } from '../logger.js'
import { blobToBase64 } from './audio-capture.js'
import { createEndpointer } from './endpoint.js'

const MOD = 'stt'
const STORE_KEY = 'stt.serveur'
const TICK_MS = 50
/** Le service du navigateur est absent ; un refus du micro, lui, vaudrait aussi pour le serveur. */
const UNAVAILABLE = new Set(['network', 'service-not-allowed', 'language-not-supported'])

/**
 * Le micro choisi dans le panneau, retenu pour toutes les pages. Le micro par défaut du système peut
 * enregistrer du silence (sur le portable Omarchy : la source virtuelle d'omavoice, branchée sur une
 * entrée USB muette) ; la reconnaissance du navigateur, elle, ne laisse pas choisir.
 */
const MIC_KEY = 'mic.deviceId'

export function chosenMic(storage = globalThis.localStorage) {
  try { return storage?.getItem(MIC_KEY) || '' } catch { return '' }
}

export function chooseMic(deviceId, storage = globalThis.localStorage) {
  try { storage?.setItem(MIC_KEY, deviceId) } catch { /* navigation privée */ }
}

export function micConstraints(deviceId = chosenMic()) {
  return { audio: deviceId ? { deviceId: { exact: deviceId } } : true }
}

/** Un énoncé, du micro à la fin de parole ; rend `{ blob }` ou `{ error }` au sens de `SpeechRecognition`. */
export async function captureUtterance(control, {
  getUserMedia = c => navigator.mediaDevices.getUserMedia(c),
  Recorder = globalThis.MediaRecorder,
  AudioCtx = globalThis.AudioContext,
} = {}) {
  if (!Recorder || !AudioCtx) return { error: 'audio-capture' }
  let stream
  try {
    stream = await getUserMedia(micConstraints()).catch(e => {
      // Un micro retenu puis débranché : le défaut vaut mieux que pas de micro du tout.
      if (e?.name === 'OverconstrainedError' || e?.name === 'NotFoundError') return getUserMedia(micConstraints(''))
      throw e
    })
  } catch (e) {
    return { error: e?.name === 'NotAllowedError' ? 'not-allowed' : 'audio-capture' }
  }
  const ctx = new AudioCtx()
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 1024
  ctx.createMediaStreamSource(stream).connect(analyser)
  const samples = new Float32Array(analyser.fftSize)
  const chunks = []
  const recorder = new Recorder(stream)
  recorder.ondataavailable = e => { if (e.data?.size) chunks.push(e.data) }
  recorder.start()
  const endpointer = createEndpointer()
  const started = performance.now()

  const outcome = await new Promise(resolve => {
    const timer = setInterval(() => {
      analyser.getFloatTimeDomainData(samples)
      const rms = Math.sqrt(samples.reduce((s, v) => s + v * v, 0) / samples.length)
      const before = endpointer.state
      const state = endpointer.push(rms, performance.now() - started)
      if (before === 'waiting' && state === 'speech') control.onspeechstart?.()
      const end = control.aborted ? 'aborted' : control.stopped ? (state === 'waiting' ? 'no-speech' : 'done') : state
      if (end === 'waiting' || end === 'speech') return
      clearInterval(timer)
      resolve(end)
    }, TICK_MS)
  })

  const stopped = new Promise(resolve => { recorder.onstop = resolve })
  if (recorder.state !== 'inactive') recorder.stop()
  await stopped
  stream.getTracks().forEach(t => t.stop())
  ctx.close().catch(() => {})
  if (outcome !== 'done') return { error: outcome }
  return { blob: new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }) }
}

/** Envoie l'énoncé au serveur ; rend ses transcriptions, ou lève si le service est indisponible. */
export async function transcribeOnServer(blob) {
  const { status, data } = await api('transcribe', { audio: await blobToBase64(blob), mime: blob.type })
  if (status !== 200) throw new Error(data?.error ?? `HTTP ${status}`)
  logger.info(MOD, 'transcription', { transcripts: data.transcripts, latency_ms: data.latency_ms })
  return data.transcripts
}

/** Même interface que `SpeechRecognition`, un énoncé par `start()` : le mode continu redémarre à `onend`. */
export class ServerRecognition {
  constructor({ capture = captureUtterance, transcribe = transcribeOnServer } = {}) {
    this.lang = 'fr-FR'
    this.continuous = false
    this.interimResults = false
    this.maxAlternatives = 1
    this._capture = capture
    this._transcribe = transcribe
    this._control = null
  }

  start() {
    const control = { stopped: false, aborted: false, onspeechstart: () => this.onspeechstart?.() }
    this._control = control
    const finish = error => {
      if (this._control !== control) return
      this._control = null
      if (error) this.onerror?.({ error })
      this.onend?.()
    }
    this.onstart?.()
    Promise.resolve(this._capture(control)).then(async ({ blob, error }) => {
      if (control.aborted) return
      if (error) return finish(error)
      this.onspeechend?.()
      let transcripts
      try {
        transcripts = (await this._transcribe(blob)).filter(t => t && t.trim())
      } catch (e) {
        logger.warn(MOD, 'serveur indisponible', e.message)
        return finish('network')
      }
      if (control.aborted) return
      if (!transcripts.length) return finish('no-speech')
      const results = [transcripts.map(transcript => ({ transcript, confidence: 1 }))]
      results[0].isFinal = true
      this.onresult?.({ results, resultIndex: 0 })
      finish(null)
    })
  }

  stop() { if (this._control) this._control.stopped = true }

  abort() {
    const control = this._control
    if (!control) return
    control.aborted = true
    this._control = null
    this.onerror?.({ error: 'aborted' })
    this.onend?.()
  }
}

const HANDLERS = ['onstart', 'onresult', 'onerror', 'onend', 'onnomatch', 'onsoundstart', 'onspeechstart', 'onspeechend']

/**
 * Rend un constructeur à utiliser comme `SpeechRecognition` : celui du navigateur tant qu'il marche,
 * le serveur dès qu'il se dit indisponible, sans perdre l'énoncé en cours.
 */
export function recognitionClass({
  Native = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition,
  server = {},
  storage = globalThis.localStorage,
} = {}) {
  const remembered = () => { try { return storage?.getItem(STORE_KEY) === '1' } catch { return false } }
  const remember = () => { try { storage?.setItem(STORE_KEY, '1') } catch { /* navigation privée */ } }

  return class HybridRecognition {
    constructor() {
      this.lang = 'fr-FR'
      this.continuous = false
      this.interimResults = false
      this.maxAlternatives = 1
      this._engine = null
    }

    _wire(engine) {
      for (const key of ['lang', 'continuous', 'interimResults', 'maxAlternatives']) engine[key] = this[key]
      for (const handler of HANDLERS) engine[handler] = e => this[handler]?.(e)
      this._engine = engine
      return engine
    }

    _startServer() {
      this._wire(new ServerRecognition(server)).start()
    }

    start() {
      if (!Native || remembered()) { this._startServer(); return }
      const native = this._wire(new Native())
      let heard = false
      let switched = false
      native.onresult = e => { heard = true; this.onresult?.(e) }
      native.onerror = e => {
        if (!heard && UNAVAILABLE.has(e.error)) {
          switched = true
          remember()
          logger.warn(MOD, 'reconnaissance du navigateur indisponible : passage au serveur', { error: e.error })
          this._startServer()
          return
        }
        this.onerror?.(e)
      }
      native.onend = e => { if (!switched) this.onend?.(e) }
      native.start()
    }

    stop() { this._engine?.stop() }
    abort() { this._engine?.abort() }
  }
}
