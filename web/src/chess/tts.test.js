import { test } from 'node:test'
import assert from 'node:assert/strict'

// Synthèse factice : le navigateur n'existe pas sous Node.
const spoken = []
globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text } }
globalThis.speechSynthesis = { cancel() {}, speak(utt) { spoken.push(utt) } }
const { speak, speaking, ECHO_MARGIN_MS } = await import('./tts.js')

test('ce que l’app dit, et un court instant après, est sa propre voix : le micro l’ignore', () => {
  assert.equal(speaking(), false)
  speak('Pas compris')
  assert.equal(speaking(), true, 'pendant la phrase')
  const ended = Date.now()
  spoken.at(-1).onend()
  assert.equal(speaking(ended + ECHO_MARGIN_MS - 50), true, 'la fin de phrase résonne encore')
  assert.equal(speaking(ended + ECHO_MARGIN_MS + 50), false, 'ensuite le micro reprend')
})

test('une synthèse qui ne signale jamais sa fin ne coupe pas le micro pour toujours', () => {
  speak('Quel cavalier ? c3 ou d4')
  assert.equal(speaking(Date.now() + 60_000), false)
})
