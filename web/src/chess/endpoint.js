/** Fin d'énoncé par le niveau du micro : la reconnaissance serveur ne reçoit qu'un énoncé fini. */

// Seuil fixe : un bruit de fond mesuré à l'ouverture du micro mesure souvent le joueur, qui parle déjà.
export const ENDPOINT = {
  threshold: 0.015,   // RMS de la parole, micro de téléphone ou de portable
  minSpeechMs: 100,   // un claquement plus court n'ouvre pas l'énoncé
  silenceMs: 800,     // la pause entre « cavalier » et « f3 » reste plus courte
  noSpeechMs: 5000,
  maxMs: 8000,
}

/** `push(rms, tMs)` rend `waiting`, `speech`, puis `done` ou `no-speech`. */
export function createEndpointer(options = {}) {
  const o = { ...ENDPOINT, ...options }
  let start = null
  let loudSince = null
  let lastLoud = null
  let state = 'waiting'

  return {
    get state() { return state },
    push(rms, t) {
      if (state === 'done' || state === 'no-speech') return state
      start ??= t
      const loud = rms > o.threshold
      if (state === 'waiting') {
        loudSince = loud ? loudSince ?? t : null
        if (loud && t - loudSince >= o.minSpeechMs) { state = 'speech'; lastLoud = t }
        else if (t - start >= o.noSpeechMs) state = 'no-speech'
        return state
      }
      if (loud) lastLoud = t
      if (t - lastLoud >= o.silenceMs || t - start >= o.maxMs) state = 'done'
      return state
    },
  }
}
