/** Recolle les pertes déjà mesurées avec la règle et la pièce qui ont produit chaque candidat. */
import { readFileSync } from 'node:fs'
import { Chess } from 'chess.js'
import { analyzePosition } from '../src/chess/position-analysis.js'
import { suggestMoves } from '../src/chess/move-suggestions.js'

const NAMES = { p: 'pion', n: 'cavalier', b: 'fou', r: 'tour', q: 'dame', k: 'roi' }
const SOUND_LOSS = 50
const BLUNDER_LOSS = 300

const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 }

const hangingMen = (chess, colour, ignore) =>
  chess.board().flat().filter(Boolean)
    .filter((man) => man.color === colour && man.type !== 'k' && man.square !== ignore)
    .filter((man) =>
      chess.attackers(man.square, colour === 'w' ? 'b' : 'w').length >
      chess.attackers(man.square, colour).length)
    .map((man) => `${man.type}${man.square}`)

const mateAvailable = (chess) => chess.moves().some((san) => san.includes('#'))

const freeLoot = (chess, colour) => {
  const enemy = colour === 'w' ? 'b' : 'w'
  const exposed = chess.board().flat().filter(Boolean)
    .filter((man) => man.color === colour && man.type !== 'k')
    .filter((man) => chess.attackers(man.square, enemy).length > chess.attackers(man.square, colour).length)
  return exposed.length ? Math.max(...exposed.map((man) => VALUE[man.type])) : 0
}

const material = (chess, colour) =>
  chess.board().flat().filter(Boolean)
    .reduce((sum, man) => sum + (man.type === 'k' ? 0 : (man.color === colour ? 1 : -1) * VALUE[man.type]), 0)

const forcingMoves = (chess, all) =>
  chess.moves({ verbose: true })
    .filter((m) => all || chess.isCheck() || m.captured || m.san.includes('+') || m.san.includes('#'))
    .map((m) => m.san)

/** Recherche des seuls coups FORÇANTS, avec élagage — ce qu'un companion peut se payer. */
function forcingSearch(chess, colour, ply, alpha = -Infinity, beta = Infinity, root = true) {
  if (chess.isCheckmate()) return chess.turn() === colour ? -1000 : 1000
  if (ply === 0 || chess.isDraw()) return material(chess, colour)
  const candidates = forcingMoves(chess, root)
  if (!candidates.length) return material(chess, colour)
  const maximising = chess.turn() === colour
  let best = chess.isCheck() ? (maximising ? -Infinity : Infinity) : material(chess, colour)
  if (maximising) alpha = Math.max(alpha, best)
  else beta = Math.min(beta, best)
  for (const san of candidates) {
    chess.move(san)
    const score = forcingSearch(chess, colour, ply - 1, alpha, beta, false)
    chess.undo()
    if (maximising) {
      best = Math.max(best, score)
      alpha = Math.max(alpha, best)
    } else {
      best = Math.min(best, score)
      beta = Math.min(beta, best)
    }
    if (beta <= alpha) break
  }
  return Number.isFinite(best) ? best : material(chess, colour)
}

/** Ce que le coup ABANDONNE — les signaux testés contre les verdicts du moteur. */
function abandonment(fen, san) {
  const before = new Chess(fen)
  const mine = before.turn()
  const after = new Chess(fen)
  const move = after.move(san)

  const wasHanging = new Set(hangingMen(before, mine, move.from))
  const nowHanging = hangingMen(after, mine, move.to).filter((man) => !wasHanging.has(man))

  return {
    newlyHanging: nowHanging.length,
    allowsMate: mateAvailable(after),
    lootBefore: freeLoot(before, mine),
    lootAfter: freeLoot(after, mine),
    searchBefore: material(before, mine),
    searchAfter: forcingSearch(after, mine, 4),
  }
}

const [pgnPath, logPath] = process.argv.slice(2)
if (!pgnPath || !logPath) throw new Error('usage: node attribute-suggestions.mjs <pgn> <log>')

const verdicts = new Map()
for (const line of readFileSync(logPath, 'utf8').split('\n')) {
  const head = line.match(/^\s*(\d+)\. joué \S+\s+\| moteur \S+\s+\| candidats : (.+)$/)
  if (!head) continue
  if (head[2].trim() === 'aucun') continue
  for (const token of head[2].trim().split(/\s+/)) {
    const parsed = token.match(/^(.+)\[(TOP|sain|\?|-\d+)\]$/)
    if (!parsed) throw new Error(`verdict illisible : ${token}`)
    verdicts.set(`${head[1]}:${parsed[1]}`, parsed[2])
  }
}

const replay = new Chess()
replay.loadPgn(readFileSync(pgnPath, 'utf8'))
const played = replay.history()

const board = new Chess()
const rows = []
for (const san of played) {
  if (board.turn() === 'w') {
    const number = board.moveNumber()
    const fen = board.fen()
    const analysis = analyzePosition(fen, { history: board.history() })
    for (const candidate of suggestMoves(fen, analysis.axes, { limit: 5 })) {
      const verdict = verdicts.get(`${number}:${candidate.san}`)
      if (verdict === undefined) throw new Error(`candidat ${number}.${candidate.san} absent du log`)
      const probe = new Chess(fen)
      rows.push({
        number,
        san: candidate.san,
        verdict,
        loss: verdict.startsWith('-') ? Number(verdict.slice(1)) : verdict === 'TOP' ? 0 : SOUND_LOSS,
        rule: candidate.reasons[0].axis,
        piece: probe.move(candidate.san).piece,
        ...abandonment(fen, candidate.san),
      })
    }
  }
  board.move(san)
}

if (rows.length !== verdicts.size) {
  throw new Error(`désaccord : ${rows.length} candidats rejoués, ${verdicts.size} dans le log`)
}

const URGENCY = 3
const urgent = (r) => r.lootBefore >= URGENCY
console.log(`
=== URGENCE : la position offrait-elle DÉJÀ une prise nette à l'adversaire (>= ${URGENCY}) ?`)
for (const [label, set] of [
  ['positions urgentes ', rows.filter(urgent)],
  ['positions calmes   ', rows.filter((r) => !urgent(r))],
]) {
  const blunders = set.filter((r) => r.loss >= BLUNDER_LOSS).length
  const tops = set.filter((r) => r.verdict === 'TOP').length
  const sound = set.filter((r) => r.loss <= SOUND_LOSS).length
  console.log(`  ${label} ${String(set.length).padStart(3)} candidats | ${tops} top | ${sound} sains | ${blunders} PERDANTS`)
}

const table = (label, keyOf) => {
  const groups = new Map()
  for (const row of rows) {
    const key = keyOf(row)
    if (!groups.has(key)) groups.set(key, { total: 0, top: 0, sound: 0, blunder: 0 })
    const bucket = groups.get(key)
    bucket.total += 1
    if (row.verdict === 'TOP') bucket.top += 1
    if (row.loss <= SOUND_LOSS) bucket.sound += 1
    if (row.loss >= BLUNDER_LOSS) bucket.blunder += 1
  }
  console.log(`\n--- ${label}`)
  console.log('    '.padEnd(30) + 'total   top   sains   PERDANTS')
  for (const [key, b] of [...groups].sort((a, b) => b[1].blunder - a[1].blunder)) {
    console.log(
      `    ${String(key).padEnd(28)}${String(b.total).padStart(4)}${String(b.top).padStart(6)}` +
        `${String(b.sound).padStart(8)}${String(b.blunder).padStart(10)}`,
    )
  }
}

console.log(`${rows.length} candidats rejoués et appariés au log, sans relancer le moteur.`)
table('par RÈGLE', (r) => r.rule)
table('par PIÈCE déplacée', (r) => NAMES[r.piece])
table('par RÈGLE × PIÈCE', (r) => `${r.rule} / ${NAMES[r.piece]}`)

const TARGET_RULE = process.env.RULE || 'key_file_control'
const file = rows.filter((r) => r.rule === TARGET_RULE)
if (!file.length) throw new Error(`aucun candidat pour la règle « ${TARGET_RULE} »`)
console.log(`\n=== HYPOTHÈSE D'ABANDON, sur les ${file.length} candidats de ${TARGET_RULE}`)

const split = (label, predicate) => {
  const hit = file.filter(predicate)
  const miss = file.filter((r) => !predicate(r))
  const rate = (set) => (set.length ? `${Math.round((set.filter((r) => r.loss >= BLUNDER_LOSS).length / set.length) * 100)}%` : '—')
  console.log(
    `  ${label.padEnd(34)} signal présent : ${String(hit.length).padStart(2)} candidats, ` +
      `${String(hit.filter((r) => r.loss >= BLUNDER_LOSS).length).padStart(2)} perdants (${rate(hit)})` +
      `   | absent : ${String(miss.length).padStart(2)}, ` +
      `${String(miss.filter((r) => r.loss >= BLUNDER_LOSS).length).padStart(2)} perdants (${rate(miss)})`,
  )
}

split('laisse un homme en prise', (r) => r.newlyHanging > 0)
split('permet un mat en 1', (r) => r.allowsMate)
split('aggrave le butin adverse', (r) => r.lootAfter > r.lootBefore)
split('butin adverse >= une tour après', (r) => r.lootAfter >= 5)
split('l’un ou l’autre (statique)', (r) => r.newlyHanging > 0 || r.allowsMate || r.lootAfter > r.lootBefore)
split('recherche 3 demi-coups : perd du matériel', (r) => r.searchAfter < r.searchBefore)
split('recherche : perd au moins un pion', (r) => r.searchAfter <= r.searchBefore - 1)
split('recherche : perd au moins une qualité', (r) => r.searchAfter <= r.searchBefore - 2)

const caught = (r) =>
  r.newlyHanging > 0 || r.allowsMate || r.lootAfter > r.lootBefore || r.searchAfter < r.searchBefore

console.log('\n--- Les perdants que AUCUN signal n’attrape')
for (const r of file.filter((x) => x.loss >= BLUNDER_LOSS && !caught(x))) {
  console.log(`  coup ${r.number} : ${r.san} (${r.verdict}) — recherche ${r.searchBefore} → ${r.searchAfter}`)
}

console.log('\n--- Les EXCELLENTS que les signaux élimineraient à tort')
for (const r of file.filter((x) => x.verdict === 'TOP' && caught(x))) {
  console.log(`  coup ${r.number} : ${r.san} — recherche ${r.searchBefore} → ${r.searchAfter}`)
}
