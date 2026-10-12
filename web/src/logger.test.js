import { test } from 'node:test'
import assert from 'node:assert/strict'

// Navigateur factice : le journal n'est expédié que là où une fenêtre existe.
const listeners = {}
const posted = []
globalThis.window = { addEventListener: (type, fn) => { listeners[type] = fn }, location: { hash: '#revision' } }
globalThis.document = { visibilityState: 'visible', addEventListener: (type, fn) => { listeners[type] = fn } }
globalThis.fetch = async (url, init) => { posted.push({ url, body: JSON.parse(init.body) }); return { status: 204 } }
const { logger, flushLogs, installErrorCapture } = await import('./logger.js')

test('info, warn et error partent vers /api/log par lot ; debug reste dans la console', async () => {
  logger.debug('mic', 'bruit')
  logger.info('mic', 'décision', { san: 'Bc4' })
  logger.error('review', 'API injoignable')
  await flushLogs()
  const [batch] = posted.splice(0)
  assert.equal(batch.url, '/api/log')
  assert.equal(batch.body.page, '#revision')
  assert.match(batch.body.session, /\S{8,}/)
  assert.deepEqual(batch.body.entries.map(e => [e.level, e.module, e.msg]),
    [['info', 'mic', 'décision'], ['error', 'review', 'API injoignable']])
})

test('une erreur non rattrapée du navigateur est journalisée', async () => {
  installErrorCapture()
  listeners.error({ message: 'x is undefined', filename: 'App.jsx', lineno: 12, colno: 3, error: { stack: 'at App' } })
  listeners.unhandledrejection({ reason: new Error('fetch failed') })
  await flushLogs()
  const entries = posted.splice(0).flatMap(b => b.body.entries)
  assert.deepEqual(entries.map(e => [e.level, e.module, e.msg]),
    [['error', 'window', 'x is undefined'], ['error', 'window', 'fetch failed']])
})

test('sans session connectée (401), le journal cesse d’insister', async () => {
  globalThis.fetch = async (url, init) => { posted.push({ url }); return { status: 401 } }
  logger.warn('mic', 'premier')
  await flushLogs()
  logger.warn('mic', 'second')
  await flushLogs()
  assert.equal(posted.splice(0).length, 1)
})
