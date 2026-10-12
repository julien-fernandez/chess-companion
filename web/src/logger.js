/**
 * Logger universel : console partout, panneau UI ; fichier via vite-dev-logs en dev ;
 * en production, info/warn/error partent par lot vers `/api/log`, donc dans journald sur la box.
 */

const IS_DEV = import.meta.env?.DEV
const SHIPS = typeof window !== 'undefined' && !IS_DEV
const SHIP_DELAY_MS = 3000
const SHIP_BATCH = 20
/** Une session par chargement de page : suit une partie ou une révision de bout en bout. */
const SESSION = globalThis.crypto?.randomUUID?.()
  ?? `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

const _queue = []
let _timer = null

function _drain() {
  _timer = null
  if (!_queue.length) return
  const batch = _queue.splice(0, 20)
  for (const entry of batch) {
    fetch('/dev-logger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ log: entry }),
    }).catch(() => {})
  }
}

function _schedule() {
  if (!_timer) _timer = setTimeout(_drain, 150)
}

const _shipQueue = []
let _shipTimer = null
let _shipOff = false

/** Envoie le lot en attente ; rendu attendable pour les tests et la fermeture de page. */
export async function flushLogs() {
  clearTimeout(_shipTimer)
  _shipTimer = null
  if (_shipOff || !_shipQueue.length) return
  const entries = _shipQueue.splice(0, 50)
  try {
    const res = await fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: SESSION, page: window.location?.hash ?? '', entries }),
      keepalive: true,
    })
    // Sans session connectée, chaque lot rendrait 401 : inutile d'insister jusqu'au rechargement.
    if (res.status === 401) _shipOff = true
  } catch { /* réseau coupé : le lot est perdu, jamais de boucle de réessai */ }
  if (_shipQueue.length) _scheduleShip()
}

function _scheduleShip() {
  if (!_shipTimer) _shipTimer = setTimeout(flushLogs, SHIP_DELAY_MS)
}

/** Une Error ne se sérialise pas en JSON (elle rend `{}`) : garder message et pile. */
const _plain = (data) => (data instanceof Error ? { message: data.message, stack: data.stack } : data ?? null)

function _log(level, mod, msg, data) {
  const ts = new Date().toISOString()
  const prefix = `[${mod}]`

  if (level === 'error')      console.error(prefix, msg, data ?? '')
  else if (level === 'warn')  console.warn(prefix, msg, data ?? '')
  else if (level === 'debug') console.debug(prefix, msg, data ?? '')
  else                        console.info(prefix, msg, data ?? '')

  import('./store.js').then(({ useStore }) => {
    const type = level === 'error' ? 'err' : level === 'warn' ? 'err' : level === 'debug' ? 'dim' : 'info'
    const dataStr = data != null ? ' ' + (typeof data === 'string' ? data : JSON.stringify(data)) : ''
    useStore.getState().addLog(`[${mod}] ${msg}${dataStr}`.slice(0, 52), type)
  }).catch(() => {})

  if (SHIPS && level !== 'debug' && !_shipOff) {
    _shipQueue.push({ ts, level, module: mod, msg: String(msg), data: _plain(data) })
    if (_shipQueue.length >= SHIP_BATCH) flushLogs()
    else _scheduleShip()
  }

  if (!IS_DEV) return
  _queue.push({ ts, level, module: mod, msg, data: data ?? null })
  _schedule()
}

export const logger = {
  debug: (mod, msg, data) => _log('debug', mod, msg, data),
  info:  (mod, msg, data) => _log('info',  mod, msg, data),
  warn:  (mod, msg, data) => _log('warn',  mod, msg, data),
  error: (mod, msg, data) => _log('error', mod, msg, data),
}

/** Erreurs non rattrapées et promesses rejetées : journalisées, et le lot part quand la page se cache. */
export function installErrorCapture() {
  if (typeof window === 'undefined') return
  window.addEventListener('error', (e) => {
    logger.error('window', e.message, { source: e.filename, line: e.lineno, col: e.colno, stack: e.error?.stack })
  })
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason
    logger.error('window', reason?.message ?? String(reason), { stack: reason?.stack })
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushLogs()
  })
}
