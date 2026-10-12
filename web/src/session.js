/**
 * Une seule connexion : la fenêtre du navigateur. Sans cookie de l'API, l'app passe par
 * `/api/connexion`, derrière l'authentification basique de nginx, qui pose le cookie et ramène
 * sur la page. Une seule tentative par onglet : un cookie refusé ne fait pas boucler.
 */
const TRIED = 'connexion.tentee'

export async function ensureSession({
  fetchImpl = (...a) => fetch(...a),
  location = window.location,
  storage = globalThis.sessionStorage,
} = {}) {
  let status
  try {
    status = (await fetchImpl('/api/session')).status
  } catch {
    return true // hors ligne : l'app s'ouvre sur sa copie
  }
  if (status !== 401) {
    try { storage?.removeItem(TRIED) } catch { /* navigation privée */ }
    return true
  }
  try {
    if (storage?.getItem(TRIED)) return false
    storage?.setItem(TRIED, '1')
  } catch { return false }
  location.assign(`/api/connexion?retour=${encodeURIComponent(location.hash)}`)
  return false
}
