/** Tire un lot de parties Lichess (CC0) filtrable par Elo, sans télécharger l'archive entière. */
import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createZstdDecompress } from 'node:zlib'
import { Readable, Transform } from 'node:stream'
import { createInterface } from 'node:readline'

const SKIPPABLE_MASK = 0x184d2a50
const FRAME_HEADER = 8

/** Lichess prefixe l'archive d'une frame « skippable » que node:zlib refuse, contrairement au CLI. */
function stripLeadingSkippableFrames() {
  let head = Buffer.alloc(0)
  let done = false
  return new Transform({
    transform(chunk, _enc, next) {
      if (done) return next(null, chunk)
      head = Buffer.concat([head, chunk])
      while (head.length >= FRAME_HEADER) {
        const magic = head.readUInt32LE(0)
        if ((magic & 0xfffffff0) !== SKIPPABLE_MASK) {
          done = true
          return next(null, head)
        }
        const total = FRAME_HEADER + head.readUInt32LE(4)
        if (head.length < total) return next()
        head = head.subarray(total)
      }
      next()
    },
  })
}

const MONTH = process.env.MONTH || '2026-07'
const ELO_MIN = Number(process.env.ELO_MIN || 1200)
const ELO_MAX = Number(process.env.ELO_MAX || 1599)
const MIN_CLOCK_S = Number(process.env.MIN_CLOCK_S || 600)
const MIN_PLIES = Number(process.env.MIN_PLIES || 40)
const WANT = Number(process.env.GAMES || 200)
const REQUIRE_EVAL = process.env.REQUIRE_EVAL !== '0'
const PREFIX_BYTES = Number(process.env.PREFIX_BYTES || 80_000_000)

const url = `https://database.lichess.org/standard/lichess_db_standard_rated_${MONTH}.pgn.zst`
const out = process.argv[2]
if (!out) throw new Error('usage: node fetch-lichess-sample.mjs <sortie.pgn>')

const clockSeconds = (value) => {
  const base = String(value).split('+')[0]
  return /^\d+$/.test(base) ? Number(base) : 0
}

const response = await fetch(url, { headers: { Range: `bytes=0-${PREFIX_BYTES - 1}` } })
if (!response.ok && response.status !== 206) {
  throw new Error(`Lichess a répondu ${response.status} — archive ${MONTH} absente ?`)
}
if (response.status !== 206) {
  throw new Error('le serveur a ignoré Range : il enverrait les 27 Gio, on renonce')
}

await mkdir(dirname(out), { recursive: true })
const sink = createWriteStream(out)
const unzip = createZstdDecompress()
unzip.on('error', (error) => {
  if (error.code !== 'ZSTD_error_srcSize_wrong' && error.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
    throw error
  }
})
const lines = createInterface({
  input: Readable.fromWeb(response.body).pipe(stripLeadingSkippableFrames()).pipe(unzip),
  crlfDelay: Infinity,
})

let headers = []
let tags = {}
let kept = 0
let seen = 0

const accepted = (moves) => {
  const white = Number(tags.WhiteElo)
  const black = Number(tags.BlackElo)
  if (!white || !black) return false
  if (Math.min(white, black) < ELO_MIN || Math.max(white, black) > ELO_MAX) return false
  if (clockSeconds(tags.TimeControl) < MIN_CLOCK_S) return false
  if (tags.Termination !== 'Normal') return false
  if (REQUIRE_EVAL && !moves.includes('%eval')) return false
  return (moves.match(/\d+\.\s/g) || []).length * 2 >= MIN_PLIES
}

for await (const line of lines) {
  if (line.startsWith('[')) {
    const tag = line.match(/^\[(\w+)\s+"(.*)"\]$/)
    if (tag) tags[tag[1]] = tag[2]
    headers.push(line)
    continue
  }
  if (!line.trim()) continue
  seen += 1
  if (accepted(line)) {
    sink.write(`${headers.join('\n')}\n\n${line}\n\n`)
    kept += 1
  }
  headers = []
  tags = {}
  if (kept >= WANT) break
}

lines.close()
await new Promise((resolve) => sink.end(resolve))

if (kept < WANT) {
  console.error(
    `ATTENTION : ${kept} parties seulement sur ${WANT} demandées, ` +
      `le préfixe de ${PREFIX_BYTES} octets est épuisé — augmenter PREFIX_BYTES.`,
  )
}
console.log(`${kept} parties écrites dans ${out}, lues sur ${seen} parties du préfixe.`)
console.log(`  source ${url} (CC0), Elo ${ELO_MIN}-${ELO_MAX}, cadence >= ${MIN_CLOCK_S}s` +
  `, >= ${MIN_PLIES} demi-coups${REQUIRE_EVAL ? ', annotées [%eval]' : ''}`)
