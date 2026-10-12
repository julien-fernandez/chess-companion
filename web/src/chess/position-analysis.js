/** Lecture d'une position en vocabulaire d'ontologie (kind: chess). */
import { Chess } from 'chess.js'
import { CHESS_VOCABULARY } from './chess-vocabulary.js'

const PINNED_VOCABULARY_VERSION = '0.8.0'

const FILES = 'abcdefgh'
const CENTRE = ['d4', 'd5', 'e4', 'e5']
const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
const EXCHANGE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 }
const ROOK_RAYS = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const BISHOP_RAYS = [[1, 1], [1, -1], [-1, 1], [-1, -1]]
const QUEEN_RAYS = [...ROOK_RAYS, ...BISHOP_RAYS]
const KNIGHT_STEPS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]
const SLIDER_RAYS = { r: ROOK_RAYS, b: BISHOP_RAYS, q: QUEEN_RAYS }
const MINORS = ['n', 'b']
const UNDETECTED_THREATS = ['zugzwang']
const MINOR_HOME = { w: { b1: 'n', g1: 'n', c1: 'b', f1: 'b' }, b: { b8: 'n', g8: 'n', c8: 'b', f8: 'b' } }

const AXIS_INDEX = new Map(CHESS_VOCABULARY.axes.map((a) => [a.key, a]))
const ALL_SQUARES = FILES.split('').flatMap((f) => [1, 2, 3, 4, 5, 6, 7, 8].map((r) => `${f}${r}`))

function parseBoard(fen) {
  const board = new Map()
  fen.split(' ')[0].split('/').forEach((row, index) => {
    const rank = 8 - index
    let file = 0
    for (const ch of row) {
      if (ch >= '1' && ch <= '9') {
        file += Number(ch)
        continue
      }
      board.set(`${FILES[file]}${rank}`, {
        type: ch.toLowerCase(),
        color: ch === ch.toUpperCase() ? 'w' : 'b',
        file,
        rank,
      })
      file += 1
    }
  })
  return board
}

const pieces = (board, color, type) =>
  [...board.values()].filter((p) => p.color === color && (type === undefined || p.type === type))

const pawnAt = (board, file, rank, color) =>
  file >= 0 && file <= 7 && rank >= 1 && rank <= 8 &&
  board.get(`${FILES[file]}${rank}`)?.type === 'p' &&
  board.get(`${FILES[file]}${rank}`)?.color === color

const kingOf = (board, color) => pieces(board, color, 'k')[0] ?? null

const advanced = (pawn) => (pawn.color === 'w' ? pawn.rank - 2 : 7 - pawn.rank)

function sideCompare(white, black, margin, whiteKey, blackKey, equalKey) {
  if (white - black >= margin) return whiteKey
  if (black - white >= margin) return blackKey
  return equalKey
}

function materialBalance(board) {
  const score = (color) => pieces(board, color).reduce((sum, p) => sum + PIECE_VALUE[p.type], 0)
  const diff = score('w') - score('b')
  const magnitude = Math.abs(diff)
  const tier =
    magnitude < 0.5 ? null : magnitude < 2 ? 'slight' : magnitude < 4.5 ? 'clear' : 'decisive'
  return {
    value: tier === null ? 'balanced' : `${diff > 0 ? 'white' : 'black'}_${tier}`,
    metrics: { materialDiffPawns: diff },
  }
}

function bishopPair(board) {
  const white = pieces(board, 'w', 'b').length
  const black = pieces(board, 'b', 'b').length
  const value = white >= 2 && black < 2 ? 'white' : black >= 2 && white < 2 ? 'black' : 'neither'
  return { value, metrics: { whiteBishops: white, blackBishops: black } }
}

function islandCount(board, color) {
  const occupied = new Set(pieces(board, color, 'p').map((p) => p.file))
  let islands = 0
  for (let file = 0; file <= 7; file += 1) {
    if (occupied.has(file) && !occupied.has(file - 1)) islands += 1
  }
  return islands
}

function pawnIslands(board) {
  const white = islandCount(board, 'w')
  const black = islandCount(board, 'b')
  return {
    value: sideCompare(black, white, 1, 'white_fewer', 'black_fewer', 'equal'),
    metrics: { whitePawnIslands: white, blackPawnIslands: black },
  }
}

function pawnDefects(board) {
  const found = []
  const counts = {}
  for (const color of ['w', 'b']) {
    const name = color === 'w' ? 'white' : 'black'
    const enemy = color === 'w' ? 'b' : 'w'
    const own = pieces(board, color, 'p')
    const files = new Set(own.map((p) => p.file))
    const forward = color === 'w' ? 1 : -1

    const isolated = own.filter((p) => !files.has(p.file - 1) && !files.has(p.file + 1))

    const doubledFiles = [...files].filter(
      (file) => own.filter((p) => p.file === file).length >= 2,
    )

    const backward = own.filter((p) => {
      const supportable = own.some(
        (other) =>
          Math.abs(other.file - p.file) === 1 &&
          (color === 'w' ? other.rank <= p.rank : other.rank >= p.rank),
      )
      if (supportable) return false
      const stop = p.rank + forward
      return (
        pawnAt(board, p.file - 1, stop + forward, enemy) ||
        pawnAt(board, p.file + 1, stop + forward, enemy)
      )
    })

    const halfOpen = (file) => !pieces(board, enemy, 'p').some((p) => p.file === file)
    const hanging = own.some((p) => {
      const partner = own.find((o) => o.file === p.file + 1)
      if (!partner) return false
      if (files.has(p.file - 1) || files.has(p.file + 2)) return false
      return halfOpen(p.file) && halfOpen(partner.file)
    })

    if (isolated.length) found.push(`${name}_isolated`)
    if (doubledFiles.length) found.push(`${name}_doubled`)
    if (backward.length) found.push(`${name}_backward`)
    if (hanging) found.push(`${name}_hanging`)

    counts[`${name}Isolated`] = isolated.length
    counts[`${name}Doubled`] = doubledFiles.length
    counts[`${name}Backward`] = backward.length
  }
  return { value: found, metrics: counts }
}

const squareOf = (file, rank) =>
  file >= 0 && file <= 7 && rank >= 1 && rank <= 8 ? `${FILES[file]}${rank}` : null

/** Un pion immobile : sa case d'arrivée est occupée et aucune prise ne s'offre à lui. */
function immobilePawns(board, color) {
  const forward = color === 'w' ? 1 : -1
  const enemy = other(color)
  return pieces(board, color, 'p').filter((pawn) => {
    const stop = squareOf(pawn.file, pawn.rank + forward)
    if (!stop || !board.has(stop)) return false
    return ![-1, 1].some((side) => {
      const target = squareOf(pawn.file + side, pawn.rank + forward)
      return target && board.get(target)?.color === enemy
    })
  })
}

function pawnImmobility(board) {
  const white = immobilePawns(board, 'w').length
  const black = immobilePawns(board, 'b').length
  let value = 'none'
  if (white || black) {
    value = white > black ? 'white_more' : black > white ? 'black_more' : 'mutual'
  }
  return { value, metrics: { whiteImmobilePawns: white, blackImmobilePawns: black } }
}

function passedPawns(board, color) {
  const enemy = color === 'w' ? 'b' : 'w'
  const enemyPawns = pieces(board, enemy, 'p')
  return pieces(board, color, 'p').filter(
    (p) =>
      !enemyPawns.some(
        (e) =>
          Math.abs(e.file - p.file) <= 1 &&
          (color === 'w' ? e.rank > p.rank : e.rank < p.rank),
      ),
  )
}

function passedPawnEdge(board) {
  const white = passedPawns(board, 'w')
  const black = passedPawns(board, 'b')
  const whiteBest = white.length ? Math.max(...white.map(advanced)) : -1
  const blackBest = black.length ? Math.max(...black.map(advanced)) : -1
  let value = 'none'
  if (whiteBest >= 0 || blackBest >= 0) {
    if (whiteBest > blackBest) value = 'white_better'
    else if (blackBest > whiteBest) value = 'black_better'
    else value = 'mutual'
  }
  return {
    value,
    metrics: { whitePassedPawns: white.length, blackPassedPawns: black.length },
  }
}

function pawnAdvanceEdge(board) {
  const reach = (color) => pieces(board, color, 'p').reduce((sum, p) => sum + advanced(p), 0)
  const white = reach('w')
  const black = reach('b')
  return {
    value: sideCompare(white, black, 2, 'white_advanced', 'black_advanced', 'equal'),
    metrics: { whitePawnReach: white, blackPawnReach: black },
  }
}

function terrainControl(chess) {
  const white = ALL_SQUARES.filter((sq) => chess.isAttacked(sq, 'w')).length
  const black = ALL_SQUARES.filter((sq) => chess.isAttacked(sq, 'b')).length
  return {
    value: sideCompare(white, black, 4, 'white_holds', 'black_holds', 'equal'),
    metrics: { whiteControlledSquares: white, blackControlledSquares: black },
  }
}

function centreCommand(board, chess) {
  const centrePawns = (color) =>
    CENTRE.filter((sq) => board.get(sq)?.type === 'p' && board.get(sq)?.color === color).length
  const attacks = (color) => CENTRE.filter((sq) => chess.isAttacked(sq, color)).length
  const white = centrePawns('w') * 2 + attacks('w')
  const black = centrePawns('b') * 2 + attacks('b')
  const dFilePawns = [...board.values()].filter((p) => p.type === 'p' && (p.file === 3 || p.file === 4))
  const value =
    centrePawns('w') + centrePawns('b') === 0 && dFilePawns.length === 0
      ? 'neutralised'
      : sideCompare(white, black, 2, 'white_owns', 'black_owns', 'contested')
  return { value, metrics: { whiteCentreScore: white, blackCentreScore: black } }
}

function developmentLead(board) {
  const developed = (color) =>
    Object.entries(MINOR_HOME[color]).filter(
      ([square, type]) => !(board.get(square)?.type === type && board.get(square)?.color === color),
    ).length
  const white = developed('w')
  const black = developed('b')
  return {
    value: sideCompare(white, black, 1, 'white', 'black', 'equal'),
    metrics: { whiteDevelopedMinors: white, blackDevelopedMinors: black },
  }
}

/** L'historique tranche ; à défaut, la case du roi n'est qu'un indice (un roi peut avoir marché). */
function castledWing(board, color, history) {
  if (history) {
    const own = history.filter((_, index) => (index % 2 === 0) === (color === 'w'))
    if (own.includes('O-O')) return 'kingside'
    if (own.includes('O-O-O')) return 'queenside'
    return null
  }
  const king = kingOf(board, color)
  if (!king) return null
  if (king.file >= 6) return 'kingside'
  if (king.file <= 2) return 'queenside'
  return null
}

function castlingState(board, history) {
  const white = castledWing(board, 'w', history)
  const black = castledWing(board, 'b', history)
  let value = 'neither'
  if (white && black) value = white === black ? 'both_castled' : 'opposite_wings'
  else if (white) value = 'white_only'
  else if (black) value = 'black_only'
  return {
    value,
    metrics: {
      whiteCastledWing: white,
      blackCastledWing: black,
      castlingSource: history ? 'history' : 'fen_heuristic',
    },
  }
}

function seventhRank(board) {
  const heavyOn = (color, rank) =>
    pieces(board, color).some((p) => (p.type === 'r' || p.type === 'q') && p.rank === rank)
  const white = heavyOn('w', 7)
  const black = heavyOn('b', 2)
  const whiteAbsolute = white && kingOf(board, 'b')?.rank === 8
  const blackAbsolute = black && kingOf(board, 'w')?.rank === 1
  let value = 'none'
  if (white && black) value = 'both'
  else if (white) value = whiteAbsolute ? 'white_absolute' : 'white_simple'
  else if (black) value = blackAbsolute ? 'black_absolute' : 'black_simple'
  return { value, metrics: { whiteOnSeventh: white, blackOnSeventh: black } }
}

function keyFileControl(board) {
  const heavies = (color, file) =>
    pieces(board, color).filter((p) => (p.type === 'r' || p.type === 'q') && p.file === file).length
  let white = 0
  let black = 0
  for (let file = 0; file <= 7; file += 1) {
    const hasPawn = [...board.values()].some((p) => p.type === 'p' && p.file === file)
    if (hasPawn) continue
    const w = heavies('w', file)
    const b = heavies('b', file)
    if (w > 0 && b === 0) white += 1
    if (b > 0 && w === 0) black += 1
  }
  let value = 'none'
  if (white > 0 && black > 0) value = 'shared'
  else if (white > 0) value = 'white'
  else if (black > 0) value = 'black'
  return { value, metrics: { whiteOpenFiles: white, blackOpenFiles: black } }
}

function positionCharacter(board) {
  const pawns = [...board.values()].filter((p) => p.type === 'p')
  const locked = pawns.filter(
    (p) => p.color === 'w' && pawnAt(board, p.file, p.rank + 1, 'b'),
  ).length
  const centrePawns = pawns.filter((p) => p.file === 3 || p.file === 4).length
  const openFiles = [0, 1, 2, 3, 4, 5, 6, 7].filter(
    (file) => !pawns.some((p) => p.file === file),
  ).length
  let value = 'semi_open'
  if (locked >= 3 && pawns.length >= 12) value = 'blocked'
  else if (openFiles === 0 && pawns.length >= 14) value = 'closed'
  else if (locked >= 2 && centrePawns >= 3) value = 'closed'
  else if (pawns.length <= 10 || openFiles >= 2) value = 'open'
  return {
    value,
    metrics: { pawnsOnBoard: pawns.length, lockedPawnPairs: locked, centrePawns, openFiles },
  }
}

function shelterBroken(board, color, history) {
  const wing = castledWing(board, color, history)
  if (!wing || pieces(board, color, 'p').length === 0) return null
  const king = kingOf(board, color)
  const shieldRanks = color === 'w' ? [2, 3] : [7, 6]
  const intact = [king.file - 1, king.file, king.file + 1].filter((file) =>
    shieldRanks.some((rank) => pawnAt(board, file, rank, color)),
  ).length
  return intact < 2
}

function shelterIntegrity(board, history) {
  const white = shelterBroken(board, 'w', history)
  const black = shelterBroken(board, 'b', history)
  let value = 'intact'
  if (white === null && black === null) value = 'not_castled'
  else if (white && black) value = 'both_broken'
  else if (white) value = 'white_broken'
  else if (black) value = 'black_broken'
  return { value, metrics: { whiteShelterBroken: white, blackShelterBroken: black } }
}

const squareName = (file, rank) =>
  file >= 0 && file <= 7 && rank >= 1 && rank <= 8 ? `${FILES[file]}${rank}` : null

const other = (color) => (color === 'w' ? 'b' : 'w')

const sideName = (color) => (color === 'w' ? 'white' : 'black')

/** Cases où la pièce peut aller, pseudo-légalement (clouages et échecs ignorés). */
function destinations(board, square) {
  const piece = board.get(square)
  if (!piece) return []
  const { type, color, file, rank } = piece
  const out = []
  const push = (f, r) => {
    const name = squareName(f, r)
    if (!name) return false
    const occupant = board.get(name)
    if (occupant?.color === color) return false
    out.push(name)
    return !occupant
  }
  if (type === 'p') {
    const forward = color === 'w' ? 1 : -1
    const start = color === 'w' ? 2 : 7
    const one = squareName(file, rank + forward)
    if (one && !board.get(one)) {
      out.push(one)
      const two = squareName(file, rank + 2 * forward)
      if (rank === start && two && !board.get(two)) out.push(two)
    }
    for (const side of [-1, 1]) {
      const name = squareName(file + side, rank + forward)
      if (name && board.get(name)?.color === other(color)) out.push(name)
    }
    return out
  }
  if (type === 'n') {
    for (const [df, dr] of KNIGHT_STEPS) push(file + df, rank + dr)
    return out
  }
  if (type === 'k') {
    for (const [df, dr] of QUEEN_RAYS) push(file + df, rank + dr)
    return out
  }
  for (const [df, dr] of SLIDER_RAYS[type]) {
    let f = file + df
    let r = rank + dr
    while (push(f, r)) {
      f += df
      r += dr
    }
  }
  return out
}

const defenders = (chess, square, color) => chess.attackers(square, color).length

const isHanging = (chess, board, square) => {
  const piece = board.get(square)
  if (!piece || piece.type === 'k') return false
  return (
    chess.attackers(square, other(piece.color)).length > 0 &&
    chess.attackers(square, piece.color).length === 0
  )
}

/** Pièces clouées contre leur roi, par la géométrie des rayons. */
function pinnedSquares(board, color) {
  const king = kingOf(board, color)
  if (!king) return []
  const found = []
  for (const [df, dr] of QUEEN_RAYS) {
    const diagonal = df !== 0 && dr !== 0
    let f = king.file + df
    let r = king.rank + dr
    let blocker = null
    while (squareName(f, r)) {
      const occupant = board.get(squareName(f, r))
      if (occupant) {
        if (!blocker) {
          if (occupant.color !== color) break
          blocker = squareName(f, r)
        } else {
          if (
            occupant.color !== color &&
            (occupant.type === 'q' || occupant.type === (diagonal ? 'b' : 'r'))
          ) {
            found.push(blocker)
          }
          break
        }
      }
      f += df
      r += dr
    }
  }
  return found
}

/** Enfilade en place : un attaquant à distance aligné sur deux hommes adverses décroissants. */
function skewerPresent(board, color) {
  for (const piece of pieces(board, color)) {
    const rays = SLIDER_RAYS[piece.type]
    if (!rays) continue
    for (const [df, dr] of rays) {
      let f = piece.file + df
      let r = piece.rank + dr
      const line = []
      while (squareName(f, r) && line.length < 2) {
        const occupant = board.get(squareName(f, r))
        if (occupant) {
          if (occupant.color === color) break
          line.push(occupant)
        }
        f += df
        r += dr
      }
      if (line.length !== 2) continue
      const [front, back] = line
      if (front.type === 'p' || back.type === 'p') continue
      if (front.type === 'k' || EXCHANGE_VALUE[front.type] > EXCHANGE_VALUE[back.type]) return true
    }
  }
  return false
}

/** Défenseur unique d'au moins deux hommes attaqués. */
function overloadedSquares(chess, board, color) {
  const load = new Map()
  for (const [square, piece] of board) {
    if (piece.color !== color || piece.type === 'k') continue
    if (chess.attackers(square, other(color)).length === 0) continue
    const guards = chess.attackers(square, color)
    if (guards.length !== 1) continue
    load.set(guards[0], (load.get(guards[0]) ?? 0) + 1)
  }
  return [...load.entries()].filter(([, count]) => count >= 2).map(([square]) => square)
}

function forkAvailable(chess) {
  for (const move of chess.moves({ verbose: true })) {
    const probe = new Chess(chess.fen())
    probe.move(move)
    const landed = probe.get(move.to)
    if (!landed) continue
    const board = parseBoard(probe.fen())
    const hit = destinations(board, move.to).filter((square) => {
      const victim = board.get(square)
      return (
        victim &&
        victim.color !== landed.color &&
        (victim.type === 'k' || EXCHANGE_VALUE[victim.type] >= EXCHANGE_VALUE[landed.type]) &&
        probe.attackers(square, landed.color === 'w' ? 'b' : 'w').length === 0
      )
    })
    if (hit.length >= 2) return true
  }
  return false
}

function discoveredAvailable(chess, board, color) {
  for (const piece of pieces(board, color)) {
    const rays = SLIDER_RAYS[piece.type]
    if (!rays) continue
    for (const [df, dr] of rays) {
      let f = piece.file + df
      let r = piece.rank + dr
      let screen = null
      while (squareName(f, r)) {
        const occupant = board.get(squareName(f, r))
        if (occupant) {
          if (!screen) {
            if (occupant.color !== color) break
            if (occupant.type === 'k') break
            screen = squareName(f, r)
          } else {
            const leavesRay = destinations(board, screen).some((square) => {
              const df2 = FILES.indexOf(square[0]) - piece.file
              const dr2 = Number(square[1]) - piece.rank
              return df2 * dr !== dr2 * df
            })
            const worthUncovering = occupant.type !== 'p' &&
              chess.attackers(squareName(f, r), other(color)).length <= 1
            if (occupant.color !== color && leavesRay && worthUncovering) return true
            break
          }
        }
        f += df
        r += dr
      }
    }
  }
  return false
}

function mateInOne(chess) {
  return chess.moves().some((san) => san.includes('#'))
}

/** Un clouage ne compte que s'il porte : une pièce, ou un pion réellement sous pression. */
function bindingPins(chess, board, color) {
  return pinnedSquares(board, color).filter((square) => {
    const piece = board.get(square)
    if (piece.type !== 'p') return true
    return chess.attackers(square, other(color)).length > chess.attackers(square, color).length
  })
}

/** Déviation : un défenseur UNIQUE délogeable de force, sa cible tombant alors avec gain. */
function deflectionAvailable(chess, board, color) {
  const enemy = other(color)
  for (const [square, man] of board.entries()) {
    if (man.color !== enemy || man.type === 'k') continue
    const attackers = chess.attackers(square, color)
    if (!attackers.length) continue
    const defences = chess.attackers(square, enemy)
    if (defences.length !== 1) continue
    const defender = board.get(defences[0])
    if (!defender || defender.type === 'k') continue

    const cheapest = Math.min(...attackers.map((from) => EXCHANGE_VALUE[board.get(from).type]))
    if (EXCHANGE_VALUE[man.type] < cheapest) continue

    const guardsOfDefender = chess.attackers(defences[0], enemy).length
    const evictable = chess.attackers(defences[0], color).some((from) => {
      const harasser = board.get(from)
      return (
        harasser &&
        (EXCHANGE_VALUE[harasser.type] < EXCHANGE_VALUE[defender.type] || guardsOfDefender === 0)
      )
    })
    if (evictable) return true
  }
  return false
}

function immediateThreats(chess, board) {
  const mover = chess.turn()
  const found = []
  if (forkAvailable(chess)) found.push('fork')
  if (bindingPins(chess, board, 'w').length || bindingPins(chess, board, 'b').length) found.push('pin')
  if (skewerPresent(board, 'w') || skewerPresent(board, 'b')) found.push('skewer')
  if (discoveredAvailable(chess, board, mover)) found.push('discovered_attack')
  if ([...board.keys()].some((square) => isHanging(chess, board, square))) found.push('hanging_piece')
  if (mateInOne(chess)) found.push('mate_net')
  if (overloadedSquares(chess, board, 'w').length || overloadedSquares(chess, board, 'b').length) {
    found.push('overload')
  }
  if (deflectionAvailable(chess, board, mover)) found.push('deflection')
  return {
    value: found,
    metrics: { threatsNotDetected: UNDETECTED_THREATS, sideToMove: sideName(mover) },
  }
}

const pressuredMen = (chess, board, color) =>
  [...board.entries()].filter(
    ([square, piece]) =>
      piece.color === color &&
      piece.type !== 'k' &&
      chess.attackers(square, other(color)).length > chess.attackers(square, color).length,
  ).length

function weakestLink(chess, board) {
  const white = pressuredMen(chess, board, 'w')
  const black = pressuredMen(chess, board, 'b')
  let value = 'none'
  if (white && black) value = 'mutual'
  else if (white) value = 'white_target'
  else if (black) value = 'black_target'
  return { value, metrics: { whitePressuredMen: white, blackPressuredMen: black } }
}

const defenceLinks = (chess, board, color) =>
  [...board.entries()]
    .filter(([, piece]) => piece.color === color && piece.type !== 'k')
    .reduce((sum, [square]) => sum + defenders(chess, square, color), 0)

function pieceCooperation(chess, board) {
  const white = defenceLinks(chess, board, 'w')
  const black = defenceLinks(chess, board, 'b')
  return {
    value: sideCompare(white, black, 3, 'white_better', 'black_better', 'equal'),
    metrics: { whiteDefenceLinks: white, blackDefenceLinks: black },
  }
}

function functionOverload(chess, board) {
  const white = overloadedSquares(chess, board, 'w').length
  const black = overloadedSquares(chess, board, 'b').length
  let value = 'none'
  if (white && black) value = 'both'
  else if (white) value = 'white'
  else if (black) value = 'black'
  return { value, metrics: { whiteOverloaded: white, blackOverloaded: black } }
}

const ZONE_FILES = { queenside: [0, 1, 2], centre: [3, 4], kingside: [5, 6, 7] }

/** Théâtres où un camp peut encore agir : une poussée de pion ET deux pièces qui y portent. */
function openTheatres(board, color) {
  const own = pieces(board, color)
  return Object.entries(ZONE_FILES).filter(([, files]) => {
    const pushes = own.some(
      (p) => p.type === 'p' && files.includes(p.file) && destinations(board, squareName(p.file, p.rank)).length > 0,
    )
    if (!pushes) return false
    const bearing = own.filter(
      (p) =>
        p.type !== 'p' &&
        p.type !== 'k' &&
        destinations(board, squareName(p.file, p.rank)).some((sq) => files.includes(FILES.indexOf(sq[0]))),
    ).length
    return bearing >= 2
  }).length
}

function planOpenness(board) {
  const white = openTheatres(board, 'w')
  const black = openTheatres(board, 'b')
  if (white <= 1 && black <= 1) {
    return { value: 'both_forced', metrics: { whiteOpenTheatres: white, blackOpenTheatres: black } }
  }
  return {
    value: sideCompare(white, black, 1, 'white_freer', 'black_freer', 'equal'),
    metrics: { whiteOpenTheatres: white, blackOpenTheatres: black },
  }
}

/** Pièce élastique : libre de son poste — ni clouée, ni défenseur unique, et deux cases au moins. */
function elasticPieces(chess, board, color) {
  const pinned = new Set(pinnedSquares(board, color))
  const sole = new Set(
    [...board.entries()]
      .filter(([, piece]) => piece.color === color && piece.type !== 'k')
      .filter(([square]) => chess.attackers(square, other(color)).length > 0)
      .flatMap(([square]) => {
        const guards = chess.attackers(square, color)
        return guards.length === 1 ? guards : []
      }),
  )
  return [...board.entries()].filter(
    ([square, piece]) =>
      piece.color === color &&
      piece.type !== 'k' &&
      piece.type !== 'p' &&
      !pinned.has(square) &&
      !sole.has(square) &&
      destinations(board, square).length >= 2,
  ).length
}

function pieceElasticity(chess, board) {
  const white = elasticPieces(chess, board, 'w')
  const black = elasticPieces(chess, board, 'b')
  return {
    value: sideCompare(white, black, 2, 'white_better', 'black_better', 'equal'),
    metrics: { whiteElasticPieces: white, blackElasticPieces: black },
  }
}

const strandedPieces = (board, color) =>
  [...board.entries()].filter(
    ([square, piece]) =>
      piece.color === color &&
      piece.type !== 'k' &&
      piece.type !== 'p' &&
      destinations(board, square).length <= 1,
  ).length

function worstPiece(board) {
  const white = strandedPieces(board, 'w')
  const black = strandedPieces(board, 'b')
  return {
    value: sideCompare(white, black, 1, 'white', 'black', 'none'),
    metrics: { whiteStrandedPieces: white, blackStrandedPieces: black },
  }
}

const HOME_RANK = { w: 1, b: 8 }

/** Une pièce encore sur sa rangée de départ n'est pas hors jeu : elle n'est pas développée. */
function piecesOutOfAction(board) {
  const frozen = (color) =>
    [...board.entries()].filter(
      ([square, piece]) =>
        piece.color === color &&
        piece.type !== 'k' &&
        piece.type !== 'p' &&
        piece.rank !== HOME_RANK[color] &&
        destinations(board, square).length === 0,
    ).length
  const white = frozen('w')
  const black = frozen('b')
  let value = 'none'
  if (white && black) value = 'both'
  else if (white) value = 'white_has'
  else if (black) value = 'black_has'
  return { value, metrics: { whiteFrozenPieces: white, blackFrozenPieces: black } }
}

const minorScope = (board, color) =>
  pieces(board, color)
    .filter((p) => MINORS.includes(p.type))
    .reduce((sum, p) => sum + destinations(board, squareName(p.file, p.rank)).length, 0)

function minorPieceFit(board) {
  const white = minorScope(board, 'w')
  const black = minorScope(board, 'b')
  return {
    value: sideCompare(white, black, 3, 'white_better', 'black_better', 'balanced'),
    metrics: { whiteMinorScope: white, blackMinorScope: black },
  }
}

/** Trou : case du camp adverse qu'aucun pion adverse ne pourra jamais défendre. */
function holesAgainst(board, color) {
  const victim = other(color)
  const ranks = victim === 'w' ? [3, 4, 5] : [6, 5, 4]
  const out = []
  for (const rank of ranks) {
    for (let file = 0; file <= 7; file += 1) {
      const name = squareName(file, rank)
      const occupant = board.get(name)
      if (occupant?.type === 'p' && occupant.color === victim) continue
      const guardable = [file - 1, file + 1].some((adjacent) =>
        pieces(board, victim, 'p').some(
          (p) => p.file === adjacent && (victim === 'w' ? p.rank < rank : p.rank > rank),
        ),
      )
      if (!guardable) out.push(name)
    }
  }
  return out
}

function holeOwnership(board) {
  const usable = (color) =>
    holesAgainst(board, color).length > 0 &&
    pieces(board, color).some((p) => MINORS.includes(p.type))
  const white = usable('w')
  const black = usable('b')
  let value = 'none'
  if (white && black) value = 'mutual'
  else if (white) value = 'white_exploits'
  else if (black) value = 'black_exploits'
  return {
    value,
    metrics: { whiteHolesAvailable: holesAgainst(board, 'w').length, blackHolesAvailable: holesAgainst(board, 'b').length },
  }
}

function advancePostHeld(board) {
  const held = (color) => {
    const holes = new Set(holesAgainst(board, color))
    return pieces(board, color).some(
      (p) => MINORS.includes(p.type) && holes.has(squareName(p.file, p.rank)),
    )
  }
  const white = held('w')
  const black = held('b')
  let value = 'none'
  if (white && black) value = 'both'
  else if (white) value = 'white'
  else if (black) value = 'black'
  return { value, metrics: { whiteHoldsPost: white, blackHoldsPost: black } }
}

function kingExposureScore(chess, board, color) {
  const king = kingOf(board, color)
  if (!king) return 0
  const enemy = other(color)
  const ring = QUEEN_RAYS.map(([df, dr]) => squareName(king.file + df, king.rank + dr)).filter(Boolean)
  const attacked = ring.filter((square) => chess.isAttacked(square, enemy)).length
  const shieldRanks = color === 'w' ? [2, 3] : [7, 6]
  const hasPawns = pieces(board, color, 'p').length > 0
  const missing = hasPawns
    ? [king.file - 1, king.file, king.file + 1].filter(
        (file) => file >= 0 && file <= 7 && !shieldRanks.some((rank) => pawnAt(board, file, rank, color)),
      ).length
    : 0
  const openTowardKing = [king.file - 1, king.file, king.file + 1].filter(
    (file) =>
      file >= 0 && file <= 7 &&
      !pieces(board, color, 'p').some((p) => p.file === file) &&
      pieces(board, enemy).some((p) => (p.type === 'r' || p.type === 'q') && p.file === file),
  ).length
  return attacked + missing + 2 * openTowardKing
}

function kingSafetyBalance(chess, board) {
  const white = kingExposureScore(chess, board, 'w')
  const black = kingExposureScore(chess, board, 'b')
  return {
    value: sideCompare(black, white, 2, 'white_safer', 'black_safer', 'equal'),
    metrics: { whiteKingExposure: white, blackKingExposure: black },
  }
}

function kingExposureMax(chess, board) {
  const white = kingExposureScore(chess, board, 'w')
  const black = kingExposureScore(chess, board, 'b')
  const exposed = [white, black].filter((score) => score >= 4).length
  let value = 'both_sheltered'
  if (Math.max(white, black) >= 7 && exposed === 1) value = 'one_critical'
  else if (exposed === 2) value = 'both_exposed'
  else if (exposed === 1) value = 'one_airy'
  return { value, metrics: { whiteKingExposure: white, blackKingExposure: black } }
}

/** Tension de Lasker : contacts de pions non résolus, et ce qu'une prise déciderait. */
function tensionState(chess, board) {
  const contacts = pieces(board, 'w', 'p').flatMap((white) =>
    pieces(board, 'b', 'p').filter(
      (black) => Math.abs(black.file - white.file) === 1 && black.rank === white.rank + 1,
    ),
  ).length
  const captures = chess.moves({ verbose: true }).filter((m) => m.captured)
  const centralPawnCapture = captures.some(
    (m) => m.piece === 'p' && m.captured === 'p' && FILES.indexOf(m.to[0]) >= 2 && FILES.indexOf(m.to[0]) <= 5,
  )
  const value = contacts === 0 ? 'released' : centralPawnCapture ? 'critical' : 'building'
  return {
    value,
    metrics: { pawnContacts: contacts, capturesAvailable: captures.length, centralPawnCapture },
  }
}

/** Durabilité : l'avantage tient-il à la structure (durable) ou au placement (volatil) ? */
function advantageDurability(axes) {
  const leans = (value, whiteKeys, blackKeys) =>
    whiteKeys.includes(value) ? 'w' : blackKeys.includes(value) ? 'b' : null
  const structural = [
    leans(axes.material_balance, ['white_slight', 'white_clear', 'white_decisive'], ['black_slight', 'black_clear', 'black_decisive']),
    leans(axes.pawn_islands, ['white_fewer'], ['black_fewer']),
    leans(axes.passed_pawn_edge, ['white_better'], ['black_better']),
  ].filter(Boolean)
  const dynamic = [
    leans(axes.terrain_control, ['white_holds'], ['black_holds']),
    leans(axes.key_file_control, ['white'], ['black']),
    leans(axes.development_lead, ['white'], ['black']),
    leans(axes.seventh_rank, ['white_simple', 'white_absolute'], ['black_simple', 'black_absolute']),
  ].filter(Boolean)
  const owner = (list) => {
    const white = list.filter((side) => side === 'w').length
    const black = list.filter((side) => side === 'b').length
    return white > black ? 'w' : black > white ? 'b' : null
  }
  const structuralOwner = owner(structural)
  const dynamicOwner = owner(dynamic)
  let value = 'none'
  if (structuralOwner && dynamicOwner && structuralOwner !== dynamicOwner) value = 'mixed'
  else if (structuralOwner) value = 'lasting'
  else if (dynamicOwner) value = 'volatile'
  return {
    value,
    metrics: { structuralOwner, dynamicOwner },
  }
}

function assertDeclared(axisKey, value) {
  const axis = AXIS_INDEX.get(axisKey)
  if (!axis) {
    throw new Error(`axe «${axisKey}» absent du vocabulaire tiré (v${CHESS_VOCABULARY.version})`)
  }
  const declared = new Set(axis.values.map((v) => v.key))
  for (const candidate of Array.isArray(value) ? value : [value]) {
    if (!declared.has(candidate)) {
      throw new Error(
        `axe «${axisKey}» : valeur «${candidate}» non déclarée dans le vocabulaire ` +
        `(déclarées : ${[...declared].join(', ')}). Ajouter la valeur à la source YAML, ` +
        `jamais forcer une valeur voisine.`,
      )
    }
  }
}

export function analyzePosition(fen, { history = null } = {}) {
  const chess = new Chess(fen)
  const board = parseBoard(fen)

  const computed = {
    material_balance: materialBalance(board),
    bishop_pair: bishopPair(board),
    pieces_out_of_action: piecesOutOfAction(board),
    pawn_islands: pawnIslands(board),
    pawn_defects: pawnDefects(board),
    pawn_immobility: pawnImmobility(board),
    passed_pawn_edge: passedPawnEdge(board),
    pawn_advance_edge: pawnAdvanceEdge(board),
    terrain_control: terrainControl(chess),
    centre_command: centreCommand(board, chess),
    development_lead: developmentLead(board),
    castling_state: castlingState(board, history),
    seventh_rank: seventhRank(board),
    key_file_control: keyFileControl(board),
    position_character: positionCharacter(board),
    shelter_integrity: shelterIntegrity(board, history),
    king_safety_balance: kingSafetyBalance(chess, board),
    king_exposure_max: kingExposureMax(chess, board),
    worst_piece: worstPiece(board),
    minor_piece_fit: minorPieceFit(board),
    hole_ownership: holeOwnership(board),
    advance_post_held: advancePostHeld(board),
    tension_state: tensionState(chess, board),
    plan_openness: planOpenness(board),
    piece_elasticity: pieceElasticity(chess, board),
    piece_cooperation: pieceCooperation(chess, board),
    function_overload: functionOverload(chess, board),
    immediate_threats: immediateThreats(chess, board),
    weakest_link: weakestLink(chess, board),
  }

  const axes = {}
  let metrics = {}
  for (const [key, result] of Object.entries(computed)) {
    assertDeclared(key, result.value)
    axes[key] = result.value
    metrics = { ...metrics, ...result.metrics }
  }

  const durability = advantageDurability(axes)
  assertDeclared('advantage_durability', durability.value)
  axes.advantage_durability = durability.value
  metrics = { ...metrics, ...durability.metrics }

  return {
    fen,
    axes,
    metrics,
    notImplemented: CHESS_VOCABULARY.axes
      .map((a) => a.key)
      .filter((key) => !(key in axes)),
    vocabularyVersion: CHESS_VOCABULARY.version,
    vocabularyDrift:
      CHESS_VOCABULARY.version === PINNED_VOCABULARY_VERSION
        ? null
        : `consommateur épinglé sur v${PINNED_VOCABULARY_VERSION}, vocabulaire tiré en v${CHESS_VOCABULARY.version}`,
  }
}

/** Les entités concrètes derrière les étiquettes — ce sur quoi un plan peut s'accrocher. */
export function inspectPosition(fen) {
  const chess = new Chess(fen)
  const board = parseBoard(fen)
  const side = (color) => {
    const enemy = other(color)
    const own = pieces(board, color)
    return {
      holes: holesAgainst(board, color),
      stranded: [...board.entries()]
        .filter(([, p]) => p.color === color && p.type !== 'k' && p.type !== 'p')
        .map(([square, p]) => ({ square, type: p.type, moves: destinations(board, square).length }))
        .sort((a, b) => a.moves - b.moves),
      pins: bindingPins(chess, board, color),
      hanging: [...board.keys()].filter(
        (square) => board.get(square).color === color && isHanging(chess, board, square),
      ),
      targets: [...board.entries()]
        .filter(
          ([square, p]) =>
            p.color === color &&
            p.type !== 'k' &&
            chess.attackers(square, enemy).length > chess.attackers(square, color).length,
        )
        .map(([square]) => square),
      minors: own.filter((p) => MINORS.includes(p.type)).map((p) => squareName(p.file, p.rank)),
      heavies: own
        .filter((p) => p.type === 'r' || p.type === 'q')
        .map((p) => squareName(p.file, p.rank)),
    }
  }
  const pawnFiles = (color) => new Set(pieces(board, color, 'p').map((p) => p.file))
  const white = pawnFiles('w')
  const black = pawnFiles('b')
  return {
    turn: chess.turn(),
    openFiles: [0, 1, 2, 3, 4, 5, 6, 7]
      .filter((file) => !white.has(file) && !black.has(file))
      .map((file) => FILES[file]),
    w: side('w'),
    b: side('b'),
  }
}

export function describeAxis(axisKey, valueKey) {
  const axis = AXIS_INDEX.get(axisKey)
  if (!axis) return null
  const value = axis.values.find((v) => v.key === valueKey)
  return value ? { facet: axis.facet, axis: axis.label, value: value.label } : null
}

const START_POSITION = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

export const IMPLEMENTED_AXES = Object.freeze(Object.keys(analyzePosition(START_POSITION).axes))

export const ENGINE_AXES = Object.freeze(['initiative_holder', 'position_regime', 'compensation'])

/** Primitives géométriques partagées — seul `position-relations.js` les consomme. */
export const GEOMETRY = Object.freeze({
  FILES,
  EXCHANGE_VALUE,
  SLIDER_RAYS,
  parseBoard,
  squareName,
  other,
  pieces,
  destinations,
  isHanging,
  holesAgainst,
  pinnedSquares,
  passedPawns,
  immobilePawns,
})
