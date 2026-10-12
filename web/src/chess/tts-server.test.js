import { test } from 'node:test'
import assert from 'node:assert/strict'

// Chromium sous Linux : la synthèse existe, mais chaque phrase échoue en « synthesis-failed ».
const local = []
globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text } }
globalThis.speechSynthesis = {
  cancel() {},
  speak(utt) { local.push(utt.text); queueMicrotask(() => utt.onerror?.({ error: 'synthesis-failed' })) },
}
const store = {}
globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v) } }
const fetched = []
let serverDown = false
globalThis.fetch = async (url, init) => {
  fetched.push(JSON.parse(init.body).text)
  if (serverDown) return { ok: false, status: 502, blob: async () => null }
  return { ok: true, status: 200, blob: async () => ({ size: 3, type: 'audio/mpeg' }) }
}
globalThis.URL.createObjectURL = () => 'blob:voix'
globalThis.URL.revokeObjectURL = () => {}
const played = []
globalThis.Audio = class {
  constructor(src) { this.src = src }
  play() { played.push(this); return Promise.resolve() }
  pause() { this.paused = true }
}
const { say, speak, speaking } = await import('./tts.js')
const tick = () => new Promise(resolve => setTimeout(resolve, 0))

test('une synthèse du navigateur en panne passe la phrase au serveur, puis d’emblée', async () => {
  const done = say('Pas compris')
  await tick()
  assert.deepEqual(local, ['Pas compris'])
  assert.deepEqual(fetched, ['Pas compris'], 'la même phrase n’est pas perdue')
  assert.equal(speaking(), true, 'le micro ignore la voix du serveur')
  played.at(-1).onended()
  await done
  speak('Fou c 4 ?')
  await tick()
  assert.deepEqual(local, ['Pas compris'], 'le navigateur n’est plus essayé')
  assert.deepEqual(fetched, ['Pas compris', 'Fou c 4 ?'])
  assert.equal(store['tts.serveur'], '1', 'le choix survit au rechargement')
})

test('une nouvelle phrase coupe celle en cours', async () => {
  speak('Une longue phrase')
  await tick()
  const first = played.at(-1)
  speak('Écarté.')
  await tick()
  assert.equal(first.paused, true)
})

test('un serveur muet termine la phrase au lieu de bloquer la révision', async () => {
  serverDown = true
  await say('Encore')
  serverDown = false
})
