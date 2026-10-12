/** Instancie les relations déclarées par le vocabulaire — l'unité du modèle (issue #7). */
import { Chess } from 'chess.js'
import { CHESS_VOCABULARY } from './chess-vocabulary.js'
import { GEOMETRY } from './position-analysis.js'

const {
  FILES, EXCHANGE_VALUE, SLIDER_RAYS,
  parseBoard, squareName, other, pieces, destinations, holesAgainst, pinnedSquares, passedPawns,
} = GEOMETRY

const RELATION_INDEX = new Map(CHESS_VOCABULARY.relationship_types.map((r) => [r.key, r]))

const PIECE_NAME = { p: 'pion', n: 'cavalier', b: 'fou', r: 'tour', q: 'dame', k: 'roi' }
const COLOUR_NAME = { w: 'blanc', b: 'noir' }
const CENTRE_SQUARES = new Set(['c4', 'c5', 'd4', 'd5', 'e4', 'e5', 'f4', 'f5'])

const name = (piece) => `${PIECE_NAME[piece.type]} ${COLOUR_NAME[piece.color]}`

function relation(type, from, to, why) {
  if (!RELATION_INDEX.has(type)) {
    throw new Error(`relation «${type}» absente du vocabulaire — ne pas rabattre sur une voisine`)
  }
  return { type, from, to, why }
}

const at = (board, square) => {
  const piece = board.get(square)
  return { square, type: piece.type, color: piece.color, label: `${name(piece)} en ${square}` }
}

/** Attaques : toute pièce adverse touchée. Concret par construction, aucun filtre requis. */
function attackRelations(chess, board) {
  const out = []
  for (const [square, piece] of board.entries()) {
    for (const from of chess.attackers(square, other(piece.color))) {
      out.push(relation('attacks', at(board, from), at(board, square),
        `${name(board.get(from))} en ${from} attaque ${name(piece)} en ${square}`))
    }
  }
  return out
}

/** Défenses : uniquement sur un homme RÉELLEMENT attaqué — sinon c'est du décor. */
function defenceRelations(chess, board) {
  const out = []
  for (const [square, piece] of board.entries()) {
    if (piece.type === 'k') continue
    if (!chess.attackers(square, other(piece.color)).length) continue
    for (const from of chess.attackers(square, piece.color)) {
      out.push(relation('defends', at(board, from), at(board, square),
        `${name(board.get(from))} en ${from} défend ${name(piece)} en ${square}, qui est attaqué`))
    }
  }
  return out
}

/** Clouages : le cloueur et le cloué, avec l'écran derrière (Nimzowitsch). */
function pinRelations(chess, board) {
  const out = []
  for (const color of ['w', 'b']) {
    for (const square of pinnedSquares(board, color)) {
      const victim = board.get(square)
      if (victim.type === 'p' &&
        chess.attackers(square, other(color)).length <= chess.attackers(square, color).length) {
        continue
      }
      for (const from of chess.attackers(square, other(color))) {
        const pinner = board.get(from)
        if (!SLIDER_RAYS[pinner.type]) continue
        out.push(relation('pins', at(board, from), at(board, square),
          `${name(pinner)} en ${from} cloue ${name(victim)} en ${square}`))
      }
    }
  }
  return out
}

/** Écrantage (x-ray) : un rayon traverse un homme et porte sur une PIÈCE adverse derrière. */
function screenRelations(board) {
  const out = []
  for (const [square, piece] of board.entries()) {
    const rays = SLIDER_RAYS[piece.type]
    if (!rays) continue
    for (const [df, dr] of rays) {
      let file = piece.file + df
      let rank = piece.rank + dr
      let screen = null
      let target = squareName(file, rank)
      while (target) {
        const occupant = board.get(target)
        if (occupant) {
          if (!screen) {
            screen = { square: target, piece: occupant }
          } else {
            if (occupant.color !== piece.color && occupant.type !== 'p') {
              out.push(relation('screens', at(board, square), at(board, target),
                `${name(piece)} en ${square} porte à travers ${screen.square} sur ${name(occupant)} en ${target}`))
            }
            break
          }
        }
        file += df
        rank += dr
        target = squareName(file, rank)
      }
    }
  }
  return out
}

/** Blocus : une pièce assise sur la case d'arrêt d'un pion passé adverse (Nimzowitsch). */
function blockadeRelations(board) {
  const out = []
  for (const color of ['w', 'b']) {
    for (const pawn of passedPawns(board, color)) {
      const stop = squareName(pawn.file, pawn.rank + (color === 'w' ? 1 : -1))
      const blocker = stop && board.get(stop)
      if (!blocker || blocker.color === color) continue
      out.push(relation('blockades', at(board, stop),
        { square: squareName(pawn.file, pawn.rank), label: `pion passé ${COLOUR_NAME[color]} en ${squareName(pawn.file, pawn.rank)}` },
        `${name(blocker)} en ${stop} bloque le pion passé ${COLOUR_NAME[color]}`))
    }
  }
  return out
}

/** Contrôle : borné aux TROUS et au centre — sinon la relation compte 200 arêtes de décor. */
function controlRelations(chess, board) {
  const out = []
  const worth = new Set([...holesAgainst(board, 'w'), ...holesAgainst(board, 'b'), ...CENTRE_SQUARES])
  for (const square of worth) {
    if (board.has(square)) continue
    for (const color of ['w', 'b']) {
      for (const from of chess.attackers(square, color)) {
        out.push(relation('controls', at(board, from), { square, label: `la case ${square}` },
          `${name(board.get(from))} en ${from} contrôle ${square}`))
      }
    }
  }
  return out
}

/** Surprotection (Nimzowitsch) : trois défenseurs ou plus sur une case qui vaut la peine. */
function overprotectRelations(chess, board) {
  const out = []
  const worth = new Set([...holesAgainst(board, 'w'), ...holesAgainst(board, 'b'), ...CENTRE_SQUARES])
  for (const square of worth) {
    for (const color of ['w', 'b']) {
      const guards = chess.attackers(square, color)
      if (guards.length < 3) continue
      for (const from of guards) {
        out.push(relation('overprotects', at(board, from), { square, label: `la case ${square}` },
          `${square} est surprotégée ${guards.length} fois par les ${COLOUR_NAME[color]}s`))
      }
    }
  }
  return out
}

/** Garde (Lasker « function ») : SEUL défenseur d'une case que l'adversaire vise déjà. */
function guardRelations(chess, board) {
  const out = []
  const worth = new Set([...holesAgainst(board, 'w'), ...holesAgainst(board, 'b'), ...CENTRE_SQUARES])
  for (const square of worth) {
    for (const color of ['w', 'b']) {
      const guards = chess.attackers(square, color)
      if (guards.length !== 1) continue
      if (!chess.attackers(square, other(color)).length) continue
      out.push(relation('guards', at(board, guards[0]), { square, label: `la case ${square}` },
        `${name(board.get(guards[0]))} en ${guards[0]} est le seul à garder ${square}, que l'adversaire vise`))
    }
  }
  return out
}

/** Porter sur une ligne (Lasker « bear on ») : tour ou dame sur une colonne ouverte ou semi-ouverte. */
function lineRelations(board) {
  const out = []
  const pawnsOn = (file, color) => pieces(board, color, 'p').some((p) => p.file === file)
  for (const [square, piece] of board.entries()) {
    if (piece.type !== 'r' && piece.type !== 'q') continue
    if (pawnsOn(piece.file, piece.color)) continue
    const file = FILES[piece.file]
    const open = !pawnsOn(piece.file, other(piece.color))
    out.push(relation('bears_on', at(board, square),
      { line: file, label: `la colonne ${file}` },
      `${name(piece)} en ${square} porte sur la colonne ${file}, ${open ? 'ouverte' : 'semi-ouverte'}`))
  }
  return out
}

/** Contact (Nimzowitsch) : deux pions qui se touchent — c'est là que la tension vit. */
function contactRelations(board) {
  const out = []
  for (const [square, piece] of board.entries()) {
    if (piece.type !== 'p') continue
    const forward = piece.color === 'w' ? 1 : -1
    for (const side of [-1, 1]) {
      const target = squareName(piece.file + side, piece.rank + forward)
      const occupant = target && board.get(target)
      if (!occupant || occupant.color === piece.color || occupant.type !== 'p') continue
      out.push(relation('contacts', at(board, square), at(board, target),
        `le pion ${COLOUR_NAME[piece.color]} en ${square} est en contact avec le pion en ${target}`))
    }
  }
  return out
}

/** Cible : un homme adverse plus attaqué que défendu — ce sur quoi un plan s'accroche. */
function targetRelations(chess, board) {
  const out = []
  for (const [square, piece] of board.entries()) {
    if (piece.type === 'k') continue
    const attackers = chess.attackers(square, other(piece.color))
    if (attackers.length <= chess.attackers(square, piece.color).length) continue
    const cheapest = Math.min(...attackers.map((from) => EXCHANGE_VALUE[board.get(from).type]))
    if (EXCHANGE_VALUE[piece.type] < cheapest) continue
    for (const from of attackers) {
      out.push(relation('targets', at(board, from), at(board, square),
        `${name(board.get(from))} en ${from} vise ${name(piece)} en ${square}, sous-défendu`))
    }
  }
  return out
}

/** Manœuvre : chemin d'une pièce vers un trou en 3 coups au plus, en largeur sur les cases vides. */
function maneuvers(board, color, { depth = 3, limit = 12 } = {}) {
  const goals = new Set(
    holesAgainst(board, other(color)).filter((square) => !board.has(square)),
  )
  if (!goals.size) return []
  const out = []
  for (const [start, piece] of board.entries()) {
    if (piece.color !== color || piece.type === 'k' || piece.type === 'p') continue
    if (goals.has(start)) continue
    const seen = new Set([start])
    let frontier = [[start, []]]
    for (let step = 1; step <= depth && frontier.length; step += 1) {
      const next = []
      for (const [square, path] of frontier) {
        for (const target of destinations(board, square)) {
          if (board.has(target) || seen.has(target)) continue
          seen.add(target)
          const route = [...path, target]
          if (goals.has(target)) {
            out.push({
              piece: at(board, start),
              path: route,
              moves: route.length,
              goal: target,
              why: `le ${name(piece)} en ${start} atteint le trou ${target} en ${route.length} coup${route.length > 1 ? 's' : ''} (${route.join('-')})`,
            })
          } else {
            next.push([target, route])
          }
        }
      }
      frontier = next
    }
  }
  return out.sort((a, b) => a.moves - b.moves).slice(0, limit)
}

/** Toutes les relations instanciées d'une position, groupées par pièce. */
export function relatePosition(fen) {
  const chess = new Chess(fen)
  const board = parseBoard(fen)

  const relations = [
    ...attackRelations(chess, board),
    ...defenceRelations(chess, board),
    ...pinRelations(chess, board),
    ...screenRelations(board),
    ...blockadeRelations(board),
    ...controlRelations(chess, board),
    ...overprotectRelations(chess, board),
    ...guardRelations(chess, board),
    ...lineRelations(board),
    ...contactRelations(board),
    ...targetRelations(chess, board),
  ]

  const byPiece = new Map()
  for (const edge of relations) {
    const key = edge.from.square
    if (!byPiece.has(key)) byPiece.set(key, { piece: edge.from, relations: [] })
    byPiece.get(key).relations.push(edge)
  }

  return {
    fen,
    turn: chess.turn(),
    relations,
    byPiece: [...byPiece.values()].sort((a, b) => b.relations.length - a.relations.length),
    maneuvers: { w: maneuvers(board, 'w'), b: maneuvers(board, 'b') },
    typesInstantiated: [...new Set(relations.map((r) => r.type))].sort(),
    typesDeclared: CHESS_VOCABULARY.relationship_types.map((r) => r.key).sort(),
  }
}

/** Ce que la position dit d'UNE pièce — le niveau où un conseil donne prise. */
export function describePiece(fen, square) {
  const found = relatePosition(fen).byPiece.find((entry) => entry.piece.square === square)
  return found ? found.relations.map((r) => r.why) : []
}
