/** De la lecture d'état vers des coups candidats motivés — le « roadmap » de Silman. */
import { Chess } from 'chess.js'
import { inspectPosition } from './position-analysis.js'
import { concedes } from './forcing-search.js'

const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 }
const NAMES = { p: 'pion', n: 'cavalier', b: 'fou', r: 'tour', q: 'dame', k: 'roi' }
const MINORS = ['n', 'b']
const OCCUPIER_RANK = { n: 0, b: 1, p: 2, r: 3, q: 4, k: 5 }

const sideKey = (turn) => (turn === 'w' ? 'w' : 'b')

/** Un plan positionnel ne se paie pas en matériel : la pièce posée doit tenir sur sa case (ADR 0002). */
function survives(fen, move) {
  const after = new Chess(fen)
  after.move(move)
  const mine = move.color
  const enemy = mine === 'w' ? 'b' : 'w'
  const attackers = after.attackers(move.to, enemy)
  if (!attackers.length) return true
  const cheapest = Math.min(...attackers.map((square) => VALUE[after.get(square).type]))
  const gained = move.captured ? VALUE[move.captured] : 0
  if (cheapest < VALUE[move.piece] - gained) return false
  return after.attackers(move.to, mine).length >= attackers.length
}

function freedomGain(fen, move) {
  const before = new Chess(fen)
  const after = new Chess(fen)
  after.move(move)
  const reach = (chess, square, colour) =>
    chess.moves({ square, verbose: true }).length ||
    chess.moves({ verbose: true }).filter((m) => m.from === square && m.color === colour).length
  return reach(after, move.to, move.color) - reach(before, move.from, move.color)
}

const RULES = [
  {
    key: 'worst_piece',
    author: 'Aagaard — 2ᵉ question : quelle est ma pire pièce ?',
    apply(chess, axes, view, moves) {
      const me = view.turn === 'w' ? 'white' : 'black'
      if (axes.worst_piece !== me) return []
      const worst = view[sideKey(view.turn)].stranded[0]
      if (!worst || worst.moves > 1) return []
      return moves
        .filter((m) => m.from === worst.square)
        .map((m) => ({
          move: m,
          why: `ta pire pièce est le ${NAMES[worst.type]} en ${worst.square} (${worst.moves} case disponible) — l'activer est le plan`,
        }))
    },
  },
  {
    key: 'advance_post_held',
    author: 'Lasker « advance post » / Nimzowitsch « outpost »',
    apply(chess, axes, view, moves) {
      const mine = view[sideKey(view.turn)]
      const holes = new Set(mine.holes)
      if (!holes.size) return []
      return moves
        .filter((m) => MINORS.includes(m.piece) && holes.has(m.to))
        .map((m) => ({
          move: m,
          why: `${m.to} est un trou qu'aucun pion adverse ne peut plus défendre — y poser un ${NAMES[m.piece]} l'occupe durablement`,
        }))
    },
  },
  {
    key: 'key_file_control',
    author: 'Silman, 5ᵉ déséquilibre — « Roads for Rooks »',
    apply(chess, axes, view, moves) {
      if (!view.openFiles.length) return []
      const mine = view[sideKey(view.turn)]
      return moves
        .filter((m) => (m.piece === 'r' || m.piece === 'q') && view.openFiles.includes(m.to[0]))
        .map((m) => {
          const already = mine.heavies.filter((sq) => sq[0] === m.to[0] && sq !== m.from).length
          return {
            move: m,
            why: already
              ? `la colonne ${m.to[0]} est ouverte et tu y as déjà une pièce lourde — doubler`
              : `la colonne ${m.to[0]} est ouverte — l'occuper`,
          }
        })
    },
  },
  {
    key: 'seventh_rank',
    author: 'Nimzowitsch — la septième rangée, simple ou absolue',
    apply(chess, axes, view, moves) {
      const rank = view.turn === 'w' ? '7' : '2'
      return moves
        .filter((m) => (m.piece === 'r' || m.piece === 'q') && m.to[1] === rank)
        .map((m) => ({
          move: m,
          why: `${m.to} installe une pièce lourde sur la septième rangée`,
        }))
    },
  },
  {
    key: 'weakest_link',
    author: 'Lasker — « that Pawn therefore becomes the target »',
    apply(chess, axes, view, moves) {
      const enemy = view[view.turn === 'w' ? 'b' : 'w']
      const targets = new Set(enemy.targets)
      if (!targets.size) return []
      return moves
        .filter((m) => {
          const probe = new Chess(chess.fen())
          probe.move(m)
          return [...targets].some(
            (square) => probe.get(square) && probe.attackers(square, m.color).includes(m.to),
          )
        })
        .map((m) => ({ move: m, why: `ajoute un attaquant sur une cible déjà sous pression` }))
    },
  },
  {
    key: 'tension_state',
    author: 'Lasker — la tension se décharge « like an electric current »',
    apply(chess, axes, view, moves) {
      if (axes.tension_state !== 'critical') return []
      return moves
        .filter((m) => m.captured && m.piece === 'p')
        .map((m) => ({
          move: m,
          why: 'la tension est critique — cette prise décide de la structure, la laisser se décide aussi',
        }))
    },
  },
  {
    key: 'immediate_threats',
    author: 'motif tactique en place',
    apply(chess, axes, view, moves) {
      const enemy = view[view.turn === 'w' ? 'b' : 'w']
      const loose = new Set(enemy.hanging)
      return moves
        .filter((m) => loose.has(m.to))
        .map((m) => ({ move: m, why: `le ${NAMES[m.captured]} en ${m.to} est attaqué et sans défenseur` }))
    },
  },
  {
    key: 'pieces_out_of_action',
    author: 'Capablanca — une pièce hors jeu compte comme du matériel absent',
    apply(chess, axes, view, moves) {
      const frozen = view[sideKey(view.turn)].stranded.filter((p) => p.moves === 0)
      if (!frozen.length) return []
      const squares = new Set(frozen.map((p) => p.square))
      return moves
        .filter((m) => {
          const probe = new Chess(chess.fen())
          probe.move(m)
          return [...squares].some(
            (square) => probe.get(square) && probe.moves({ square }).length > 0,
          )
        })
        .map((m) => ({ move: m, why: `libère une pièce qui n'avait aucune case` }))
    },
  },
]

const advancement = (move) =>
  move.color === 'w' ? Number(move.to[1]) : 9 - Number(move.to[1])

/** Une règle ne propose qu'un coup par pièce : celui qui pénètre le plus loin (ADR 0002). */
function bestPerPiece(hits) {
  const best = new Map()
  for (const hit of hits) {
    const key = hit.move.from
    const held = best.get(key)
    if (!held || advancement(hit.move) > advancement(held.move)) best.set(key, hit)
  }
  const bySquare = new Map()
  for (const hit of best.values()) {
    const held = bySquare.get(hit.move.to)
    if (!held || OCCUPIER_RANK[hit.move.piece] < OCCUPIER_RANK[held.move.piece]) {
      bySquare.set(hit.move.to, hit)
    }
  }
  return [...bySquare.values()]
}

/** Coups candidats, chacun rattaché à l'axe et à l'auteur qui le motivent. */
export function suggestMoves(fen, axes, { limit = 5 } = {}) {
  const chess = new Chess(fen)
  const view = inspectPosition(fen)
  const moves = chess.moves({ verbose: true }).filter((move) => survives(fen, move))
  const bySan = new Map()

  for (const rule of RULES) {
    for (const hit of bestPerPiece(rule.apply(chess, axes, view, moves))) {
      const entry = bySan.get(hit.move.san) ?? {
        san: hit.move.san,
        from: hit.move.from,
        to: hit.move.to,
        reasons: [],
      }
      entry.reasons.push({ axis: rule.key, author: rule.author, why: hit.why })
      bySan.set(hit.move.san, entry)
    }
  }

  return [...bySan.values()]
    .filter((entry) => !concedes(fen, entry.san))
    .map((entry) => ({
      ...entry,
      freedom: freedomGain(fen, { from: entry.from, to: entry.to }),
    }))
    .sort((a, b) => b.reasons.length - a.reasons.length || b.freedom - a.freedom)
    .slice(0, limit)
}
