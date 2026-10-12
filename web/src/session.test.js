import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ensureSession } from './session.js'

function env(status) {
  const store = {}
  const visited = []
  return {
    visited, store,
    deps: {
      fetchImpl: async () => { if (status === 'offline') throw new Error('hors ligne'); return { status } },
      location: { hash: '#revision', assign: url => visited.push(url) },
      storage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v }, removeItem: k => { delete store[k] } },
    },
  }
}

test('sans cookie, l’app passe une fois par la fenêtre du navigateur et revient sur sa page', async () => {
  const e = env(401)
  assert.equal(await ensureSession(e.deps), false)
  assert.deepEqual(e.visited, ['/api/connexion?retour=%23revision'])
})

test('un retour encore sans cookie ne boucle pas', async () => {
  const e = env(401)
  await ensureSession(e.deps)
  await ensureSession(e.deps)
  assert.equal(e.visited.length, 1)
})

test('avec le cookie, rien ne bouge, et une prochaine expiration pourra de nouveau rediriger', async () => {
  const e = env(401)
  await ensureSession(e.deps)
  const ok = env(200)
  ok.store['connexion.tentee'] = '1'
  assert.equal(await ensureSession(ok.deps), true)
  assert.deepEqual(ok.visited, [])
  assert.equal(ok.store['connexion.tentee'], undefined)
})

test('hors ligne, l’app s’ouvre quand même', async () => {
  const e = env('offline')
  assert.equal(await ensureSession(e.deps), true)
  assert.deepEqual(e.visited, [])
})
