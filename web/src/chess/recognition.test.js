import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chooseMic, chosenMic, micConstraints, recognitionClass, ServerRecognition } from './recognition.js'

/** Reconnaissance du navigateur factice : `outcome` dit ce qu'elle fera au démarrage. */
function nativeClass(outcome) {
  return class {
    start() {
      queueMicrotask(() => {
        if (outcome.error) this.onerror?.({ error: outcome.error })
        else this.onresult?.({ results: [[{ transcript: outcome.text, confidence: 0.9 }]] })
        this.onend?.()
      })
    }
    stop() {}
    abort() {}
  }
}

function memoryStorage() {
  const data = {}
  return { getItem: k => data[k] ?? null, setItem: (k, v) => { data[k] = String(v) } }
}

/** Écoute jusqu'à `onend` ; rend ce qui a été entendu, les erreurs, et le nombre de fins. */
function run(SR) {
  return new Promise(resolve => {
    const r = new SR()
    const seen = { texts: [], errors: [], ends: 0 }
    r.onresult = e => seen.texts.push(...Array.from(e.results[0], a => a.transcript))
    r.onerror = e => seen.errors.push(e.error)
    r.onend = () => { seen.ends += 1; queueMicrotask(() => resolve(seen)) }
    r.start()
  })
}

const serverSaying = text => ({ capture: async () => ({ blob: { size: 3 } }), transcribe: async () => [text] })

test('sans reconnaissance dans le navigateur, le serveur écoute', async () => {
  const SR = recognitionClass({ Native: null, server: serverSaying('e4'), storage: memoryStorage() })
  assert.deepEqual(await run(SR), { texts: ['e4'], errors: [], ends: 1 })
})

test('une reconnaissance du navigateur qui fonctionne reste seule', async () => {
  const SR = recognitionClass({ Native: nativeClass({ text: 'cavalier f3' }), server: serverSaying('jamais'), storage: memoryStorage() })
  assert.deepEqual(await run(SR), { texts: ['cavalier f3'], errors: [], ends: 1 })
})

test('Chromium sous Linux (« network ») passe au serveur sur le même énoncé, puis d’emblée', async () => {
  const storage = memoryStorage()
  let nativeStarts = 0
  const Broken = class extends nativeClass({ error: 'network' }) { start() { nativeStarts += 1; super.start() } }
  const SR = recognitionClass({ Native: Broken, server: serverSaying('e4'), storage })
  assert.deepEqual(await run(SR), { texts: ['e4'], errors: [], ends: 1 }, 'ni erreur ni fin du navigateur')
  await run(SR)
  assert.equal(nativeStarts, 1, 'le navigateur n’est plus essayé')
  const again = recognitionClass({ Native: Broken, server: serverSaying('e4'), storage })
  await run(again)
  assert.equal(nativeStarts, 1, 'le choix survit au rechargement')
})

test('un refus du micro ne bascule pas au serveur : il se dit tel quel', async () => {
  const SR = recognitionClass({ Native: nativeClass({ error: 'not-allowed' }), server: serverSaying('e4'), storage: memoryStorage() })
  assert.deepEqual(await run(SR), { texts: [], errors: ['not-allowed'], ends: 1 })
})

test('le serveur : rien entendu, ou une transcription vide, se dit « no-speech »', async () => {
  const silent = new ServerRecognition({ capture: async () => ({ error: 'no-speech' }), transcribe: async () => ['x'] })
  const empty = new ServerRecognition({ capture: async () => ({ blob: { size: 3 } }), transcribe: async () => [] })
  for (const r of [silent, empty]) {
    const seen = await run(function () { return r })
    assert.deepEqual(seen, { texts: [], errors: ['no-speech'], ends: 1 })
  }
})

test('le serveur en panne se dit « network », sans rien inventer', async () => {
  const r = new ServerRecognition({ capture: async () => ({ blob: { size: 3 } }), transcribe: async () => { throw new Error('HTTP 502') } })
  assert.deepEqual(await run(function () { return r }), { texts: [], errors: ['network'], ends: 1 })
})

test('le micro choisi dans le panneau sert à enregistrer, le défaut sinon', () => {
  const storage = memoryStorage()
  assert.deepEqual(micConstraints(chosenMic(storage)), { audio: true })
  chooseMic('usb-muet', storage)
  chooseMic('mic1', storage)
  assert.deepEqual(micConstraints(chosenMic(storage)), { audio: { deviceId: { exact: 'mic1' } } })
})

test('une écoute interrompue ne rend rien, même si la transcription arrive après', async () => {
  let release
  const r = new ServerRecognition({
    capture: async () => ({ blob: { size: 3 } }),
    transcribe: () => new Promise(resolve => { release = () => resolve(['e4']) }),
  })
  const seen = { texts: [], errors: [], ends: 0 }
  r.onresult = e => seen.texts.push(e.results[0][0].transcript)
  r.onerror = e => seen.errors.push(e.error)
  r.onend = () => { seen.ends += 1 }
  r.start()
  await new Promise(resolve => setTimeout(resolve, 0))
  r.abort()
  release()
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.deepEqual(seen, { texts: [], errors: ['aborted'], ends: 1 })
})
