import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blobToBase64, createCapture } from './audio-capture.js'
import { saveAttempt, utterancePayload } from './review-trace.js'

class FakeRecorder {
  constructor() { this.state = 'inactive'; this.mimeType = 'audio/webm;codecs=opus' }
  start() { this.state = 'recording' }
  stop() {
    this.state = 'inactive'
    this.ondataavailable({ data: new Blob(['abc']) })
    this.onstop()
  }
}

test('une réponse enregistrée rend son audio', async () => {
  const capture = createCapture({ getUserMedia: async () => ({}), Recorder: FakeRecorder })
  const blob = await capture.start().stop()
  assert.equal(blob.type, 'audio/webm;codecs=opus')
  assert.equal(await blobToBase64(blob), 'YWJj')
})

test('un micro refusé coupe la collecte sans rien casser', async () => {
  const capture = createCapture({ getUserMedia: async () => { throw new Error('refusé') }, Recorder: FakeRecorder })
  assert.equal(await capture.start().stop(), null)
  assert.equal(capture.disabled, true)
  assert.equal(await capture.start().stop(), null)
})

test('un micro encore en attente d\'autorisation ne bloque pas la révision', async () => {
  let grant
  const capture = createCapture({ getUserMedia: () => new Promise(resolve => { grant = resolve }), Recorder: FakeRecorder })
  const clip = capture.start()
  assert.equal(await clip.stop(), null)
  grant({})
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(await capture.start().stop() instanceof Blob, true)
})

test('le micro est rendu à la fin de la révision, et coupé dès que la collecte gêne', async () => {
  const stopped = []
  const stream = () => ({ getTracks: () => [{ stop: () => stopped.push('track') }] })
  let asked = 0
  const capture = createCapture({ getUserMedia: async () => { asked += 1; return stream() }, Recorder: FakeRecorder })
  await capture.start().stop()
  await capture.release()
  assert.deepEqual(stopped, ['track'])
  await capture.start().stop()
  assert.equal(asked, 2)
  await capture.disable()
  assert.deepEqual(stopped, ['track', 'track'])
})

test('sans MediaRecorder, la collecte est absente', async () => {
  const capture = createCapture({ getUserMedia: async () => ({}), Recorder: undefined })
  assert.equal(capture.disabled, true)
  assert.equal(await capture.start().stop(), null)
})

const MOVE = { epd: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -', san: 'e4' }
const RESOLVED = { san: 'e4', decider: 'phonetic', confidence: 1, confirmed: null,
  phoneticSan: 'e4', phoneticMargin: 0.17, latencyMs: 3 }

test('la trace porte les transcriptions, la décision et l\'audio', () => {
  const p = utterancePayload(MOVE, ['e quatre'], RESOLVED, { base64: 'YWJj', type: 'audio/webm' })
  assert.deepEqual(p, {
    epd: MOVE.epd, expected_san: 'e4', transcripts: ['e quatre'], phonetic_san: 'e4',
    phonetic_margin: 0.17, decider: 'phonetic', decided_san: 'e4', confidence: 1, confirmed: null,
    latency_ms: 3, audio: 'YWJj', audio_type: 'audio/webm',
  })
  assert.equal(utterancePayload(MOVE, [], RESOLVED).audio, null)
})

test('le rappel est relié à la trace qui l\'a produit', async () => {
  const calls = []
  const post = async (path, body) => { calls.push([path, body]); return { status: 201, data: { id: 7 } } }
  const r = await saveAttempt(post, { decider: 'phonetic' }, { epd: MOVE.epd, san: 'e4', outcome: 'recalled' })
  assert.deepEqual(r, { utteranceId: 7, failures: 0 })
  assert.equal(calls[1][1].utterance_id, 7)
})

test('une trace perdue n\'empêche pas le rappel, et chaque perte est comptée', async () => {
  const post = async path => {
    if (path === 'utterance') throw new Error('hors ligne')
    return { status: 201, data: { id: 1 } }
  }
  assert.deepEqual(await saveAttempt(post, {}, { san: 'e4' }), { utteranceId: null, failures: 1 })
  const refused = async () => ({ status: 400, data: null })
  assert.deepEqual(await saveAttempt(refused, {}, { san: 'e4' }), { utteranceId: null, failures: 2 })
  assert.deepEqual(await saveAttempt(refused, {}, null), { utteranceId: null, failures: 1 })
})
