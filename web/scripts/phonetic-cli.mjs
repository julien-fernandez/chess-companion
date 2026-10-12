/** Rejoue l'étage 1 sur des énoncés `[{ id, epd, transcripts }]` lus sur stdin ; écrit le résultat sur stdout. */
import { Chess } from 'chess.js'
import { phoneticMatch } from '../src/chess/phonetic-match.js'
import { resolveRequest } from '../src/chess/resolve-move.js'

// normalizeFr journalise sur la console : stdout doit rester du JSON pur.
console.info = console.debug = console.warn = () => {}

let input = ''
for await (const chunk of process.stdin) input += chunk
const out = JSON.parse(input).map(u => {
  const chess = new Chess(`${u.epd} 0 1`)
  const { ranking, decided } = phoneticMatch(chess, u.transcripts)
  return { id: u.id, decided, request: resolveRequest(chess, u.transcripts, ranking) }
})
process.stdout.write(JSON.stringify(out))
