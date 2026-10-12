/** Appel à l'API de révision ; tout échec part au journal (donc dans journald en production). */
import { logger } from './logger.js'

export async function api(path, body) {
  let res
  try {
    res = await fetch(`/api/${path}`, body === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
  } catch (e) {
    logger.error('api', 'injoignable', { path, error: e.message })
    throw e
  }
  const data = await res.json().catch(() => null)
  // 401 sur la première page chargée est le parcours normal de connexion, pas une erreur.
  if (res.status >= 400 && res.status !== 401) logger.warn('api', 'refusé', { path, status: res.status, error: data?.error })
  return { status: res.status, data }
}
