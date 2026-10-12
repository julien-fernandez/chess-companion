import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createEndpointer } from './endpoint.js'

/** Pousse un niveau constant de `from` à `to` ms, par pas de 50 ms ; rend le dernier état. */
function feed(ep, rms, from, to) {
  let state
  for (let t = from; t < to; t += 50) state = ep.push(rms, t)
  return state
}

test('un coup dit puis un silence termine l’énoncé', () => {
  const ep = createEndpointer()
  assert.equal(feed(ep, 0.002, 0, 300), 'waiting', 'bruit de fond')
  assert.equal(feed(ep, 0.05, 300, 900), 'speech')
  assert.equal(feed(ep, 0.002, 900, 1400), 'speech', 'une pause courte entre « cavalier » et « f3 »')
  assert.equal(feed(ep, 0.002, 1400, 2000), 'done')
})

test('rien dit : l’écoute s’arrête seule, sans rien envoyer', () => {
  const ep = createEndpointer()
  assert.equal(feed(ep, 0.002, 0, 6000), 'no-speech')
})

test('une parole qui ne s’arrête pas est coupée au plafond', () => {
  const ep = createEndpointer()
  assert.equal(feed(ep, 0.05, 0, 9000), 'done')
})

test('un claquement isolé n’ouvre pas l’énoncé', () => {
  const ep = createEndpointer()
  feed(ep, 0.002, 0, 300)
  assert.equal(ep.push(0.3, 300), 'waiting')
  assert.equal(feed(ep, 0.002, 350, 600), 'waiting')
})
