/** Enregistre chaque réponse dite pendant que Chrome l'écoute ; l'audio est une collecte, jamais une dépendance. */

/** Un micro dont l'autorisation est encore demandée ne rend jamais son flux : la révision ne l'attend pas. */
const STREAM_WAIT_MS = 300

export function createCapture({
  getUserMedia = constraints => navigator.mediaDevices.getUserMedia(constraints),
  Recorder = globalThis.MediaRecorder,
} = {}) {
  let disabled = !Recorder
  let streamPromise = null

  /** Rend le micro : c'est la piste ouverte, pas l'enregistreur, qui le dispute à la reconnaissance. */
  async function release() {
    const pending = streamPromise
    streamPromise = null
    const stream = pending ? await pending : null
    stream?.getTracks?.().forEach(track => track.stop())
  }

  return {
    get disabled() { return disabled },
    disable() { disabled = true; return release() },
    release,
    start() {
      if (disabled) return { stop: async () => null }
      streamPromise ??= Promise.resolve()
        .then(() => getUserMedia({ audio: true }))
        .catch(() => { disabled = true; return null })
      const chunks = []
      let recorder = null
      let abandoned = false
      const ready = streamPromise.then(stream => {
        if (!stream || disabled || abandoned) return
        recorder = new Recorder(stream)
        recorder.ondataavailable = e => { if (e.data?.size) chunks.push(e.data) }
        recorder.start()
      }).catch(() => { recorder = null })
      return {
        async stop() {
          let timer
          await Promise.race([ready, new Promise(resolve => { timer = setTimeout(resolve, STREAM_WAIT_MS) })])
          clearTimeout(timer)
          abandoned = true
          if (!recorder || recorder.state === 'inactive') return null
          const stopped = new Promise(resolve => { recorder.onstop = resolve })
          recorder.stop()
          await stopped
          return chunks.length ? new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }) : null
        },
      }
    },
  }
}

export async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}
