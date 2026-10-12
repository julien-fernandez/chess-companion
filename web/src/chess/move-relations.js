/** Étage plan : ce qu'un coup fait au champ des coups possibles (issue #7 point 4). */
import { Chess } from 'chess.js'
import { CHESS_VOCABULARY } from './chess-vocabulary.js'
import { inspectPosition } from './position-analysis.js'

const RELATION_INDEX = new Map(CHESS_VOCABULARY.relationship_types.map((r) => [r.key, r]))

const PIECE_NAME = { p: 'pion', n: 'cavalier', b: 'fou', r: 'tour', q: 'dame', k: 'roi' }
const FEMININE = new Set(['r', 'q'])

const named = (type, square) => `${FEMININE.has(type) ? 'la' : 'le'} ${PIECE_NAME[type]} en ${square}`

function relation(type, from, to, why) {
  if (!RELATION_INDEX.has(type)) {
    throw new Error(`relation «${type}» absente du vocabulaire — ne pas rabattre sur une voisine`)
  }
  return { type, from, to, why }
}

/** Le camp qui n'a pas le trait, comme s'il l'avait — impossible s'il laisse son roi en échec. */
function asIfItWereTheirTurn(fen) {
  const parts = fen.split(' ')
  parts[1] = parts[1] === 'w' ? 'b' : 'w'
  parts[3] = '-'
  try {
    const board = new Chess(parts.join(' '))
    return board.isCheck() ? null : board
  } catch {
    return null
  }
}

const sansOf = (board) => new Set(board.moves())

/** Les coups d'une pièce déménagent avec elle : les compter serait du bruit, pas une perte. */
const notTheMover = (fen, movedFrom) => (san) => {
  const probe = new Chess(fen)
  try {
    return probe.move(san).from !== movedFrom
  } catch {
    throw new Error(`coup ${san} illisible sur ${fen} — l'échiquier de comparaison est le mauvais`)
  }
}

export function moveRelations(fen, san, { limit = 4 } = {}) {
  const before = new Chess(fen)
  const mover = before.turn()
  const after = new Chess(fen)
  const move = after.move(san)
  if (!move) throw new Error(`coup illégal : ${san}`)

  const relations = []
  const mine = { square: move.to, label: named(move.piece, move.to), san }

  const myBefore = sansOf(before)
  const myAfterBoard = asIfItWereTheirTurn(after.fen())
  const myAfter = myAfterBoard ? sansOf(myAfterBoard) : null

  if (myAfter) {
    const keep = notTheMover(myAfterBoard.fen(), move.to)
    for (const candidate of [...myAfter].filter((s) => !myBefore.has(s)).filter(keep).slice(0, limit)) {
      relations.push(relation('enables', mine, { san: candidate },
        `${san} rend ${candidate} disponible`))
    }
    const gone = [...myBefore].filter((s) => !myAfter.has(s)).filter(notTheMover(fen, move.from))
    for (const candidate of gone.slice(0, limit)) {
      relations.push(relation('excludes', mine, { san: candidate },
        `${san} me prive de ${candidate}`))
    }
  }

  const theirBoard = asIfItWereTheirTurn(fen)
  if (theirBoard) {
    const theirBefore = sansOf(theirBoard)
    const theirAfter = sansOf(after)
    for (const candidate of [...theirBefore].filter((s) => !theirAfter.has(s)).slice(0, limit)) {
      relations.push(relation('prevents', mine, { san: candidate },
        `${san} retire ${candidate} à l'adversaire`))
    }
    for (const candidate of [...theirAfter].filter((s) => !theirBefore.has(s)).slice(0, limit)) {
      relations.push(relation('allows', mine, { san: candidate },
        `${san} offre ${candidate} à l'adversaire`))
    }
  }

  const takers = after.board().flat().filter(Boolean)
    .filter((man) => man.color === mover && man.square !== move.to)
    .filter((man) => after.attackers(move.from, mover).includes(man.square))
  if (takers.length) {
    relations.push(relation('frees', mine, { square: move.from },
      `${san} libère ${move.from}, que ${takers.map((m) => named(m.type, m.square)).join(' ou ')} peut reprendre`))
  }

  return relations
}

/** Les relations d'un coup, groupées par type — la forme que consomme une restitution. */
export function moveRelationsByType(fen, san, options) {
  const grouped = new Map()
  for (const item of moveRelations(fen, san, options)) {
    if (!grouped.has(item.type)) grouped.set(item.type, [])
    grouped.get(item.type).push(item)
  }
  return grouped
}

const enemyOf = (color) => (color === 'w' ? 'b' : 'w')
const mateIn = (board) => board.moves().find((s) => s.endsWith('#')) ?? null
const captureOn = (board, square) =>
  board.moves({ verbose: true }).find((m) => m.to === square && m.captured)?.san ?? null

const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
const materialOf = (board, color) => board.board().flat().filter(Boolean)
  .reduce((sum, man) => sum + (man.color === color ? VALUE[man.type] : -VALUE[man.type]), 0)

/** La dame prend la dame, reprise possible, alors que le camp qui joue a moins de matériel (Capablanca, ADR 0017). */
export function queenTrade(fen, san) {
  const before = new Chess(fen)
  const deficit = -materialOf(before, before.turn())
  const after = new Chess(fen)
  const move = after.move(san)
  if (!move) throw new Error(`coup illégal : ${san}`)
  if (move.piece !== 'q' || move.captured !== 'q' || deficit <= 0) return []
  const recapture = after.moves({ verbose: true })
    .filter((m) => m.to === move.to && m.captured)
    .sort((a, b) => VALUE[a.piece] - VALUE[b.piece])[0]
  if (!recapture) return []
  const mine = { square: move.to, label: named(move.piece, move.to), san }
  return [{ ...relation('trades_queens_behind', mine, { san: recapture.san, square: move.to },
    `${san} échange les dames avec ${deficit} de matériel en moins : la dame est reprise en ${move.to}`), deficit }]
}

/** Ce qu'un coup NE fait PAS : renoncer à un gain, laisser une menace ; lu avant le coup, sans recherche (ADR 0015). */
export function moveOmissions(fen, san) {
  const before = new Chess(fen)
  const mover = before.turn()
  const enemy = enemyOf(mover)
  const after = new Chess(fen)
  const move = after.move(san)
  if (!move) throw new Error(`coup illégal : ${san}`)

  const was = inspectPosition(fen)
  const now = inspectPosition(after.fen())
  const mine = { square: move.to, label: named(move.piece, move.to), san }
  const found = []

  const mate = mateIn(before)
  if (mate && !move.san.endsWith('#')) {
    found.push(relation('forgoes', mine, { san: mate, square: null }, `${san} renonce au mat ${mate}`))
  }
  for (const square of was[enemy].hanging) {
    if (square === move.to) continue
    const take = captureOn(before, square)
    if (take) {
      const man = before.get(square)
      found.push(relation('forgoes', mine, { san: take, square },
        `${san} renonce à ${take} : ${named(man.type, square)} n'avait aucun défenseur`))
    }
  }

  for (const square of was[mover].hanging) {
    if (square === move.from || !now[mover].hanging.includes(square)) continue
    const take = captureOn(after, square)
    if (take) {
      const man = after.get(square)
      found.push(relation('ignores', mine, { san: take, square },
        `${san} laisse ${take} : ${named(man.type, square)} reste sans défenseur`))
    }
  }
  const theirs = asIfItWereTheirTurn(fen)
  const theirMate = theirs && mateIn(theirs)
  const stillMate = theirMate && mateIn(after)
  if (stillMate) {
    found.push(relation('ignores', mine, { san: stillMate, square: null }, `${san} laisse le mat ${stillMate}`))
  }
  return found
}
