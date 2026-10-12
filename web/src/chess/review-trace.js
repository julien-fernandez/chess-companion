/** Trace d'un énoncé de révision, puis le rappel qu'il a produit ; une trace perdue n'empêche jamais le rappel. */

export function utterancePayload(move, transcripts, resolved, audio = null) {
  return {
    epd: move.epd,
    expected_san: move.san,
    transcripts,
    phonetic_san: resolved.phoneticSan,
    phonetic_margin: resolved.phoneticMargin,
    decider: resolved.decider,
    decided_san: resolved.san,
    confidence: resolved.confidence,
    confirmed: resolved.confirmed,
    latency_ms: resolved.latencyMs,
    audio: audio?.base64 ?? null,
    audio_type: audio?.type ?? null,
  }
}

/** `post(path, body)` rend `{ status, data }` ; rend `{ utteranceId, failures }`. */
export async function saveAttempt(post, utterance, review) {
  let failures = 0
  let utteranceId = null
  try {
    const res = await post('utterance', utterance)
    if (res.status === 201) utteranceId = res.data?.id ?? null
    else failures += 1
  } catch {
    failures += 1
  }
  if (review) {
    try {
      const res = await post('review', { ...review, utterance_id: utteranceId })
      if (res.status !== 201) failures += 1
    } catch {
      failures += 1
    }
  }
  return { utteranceId, failures }
}
