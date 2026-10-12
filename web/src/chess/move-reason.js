/** Pourquoi un coup a perdu : lecture avant/après, étage 0 = raisons, étages 1 à 3 = `changes` (spec 2026-10-06 §4, ADR 0016). */
import { Chess } from 'chess.js'
import { CHESS_VOCABULARY } from './chess-vocabulary.js'
import { ENGINE_AXES, analyzePosition, describeAxis, inspectPosition } from './position-analysis.js'
import { moveOmissions, moveRelations, queenTrade } from './move-relations.js'
import { frenchSan } from './judgment.js'
const AXIS_LAYERS = [
  { layer: 1, label: 'contrôle', facets: ['space', 'square_control', 'line_control'] },
  { layer: 2, label: 'fonctions', facets: ['cooperation', 'threats'] },
  { layer: 3, label: 'forces', facets: ['king_safety', 'piece_quality', 'elasticity', 'development',
    'pawn_structure', 'statics_dynamics', 'initiative'] },
]
const SIDE_TO_MOVE_AXES = new Set(['immediate_threats'])
const FACET_OF = new Map(CHESS_VOCABULARY.axes.map((a) => [a.key, a.facet]))

const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 }
const capturedPieceSquare = (m) => (m.flags.includes('e') ? m.to[0] + m.from[1] : m.to)

function materialLayer(fen, san, afterFen, mover) {
  const items = []
  for (const r of moveOmissions(fen, san)) {
    const verb = r.type === 'forgoes' ? 'renonce à' : 'laisse'
    const detail = r.to.square ? ` : rien ne défend ${r.to.square}` : ' : mat en un'
    items.push({ type: r.type, san: r.to.san, square: r.to.square,
      why: `${frenchSan(san)} ${verb} ${frenchSan(r.to.san)}${detail}` })
  }
  for (const r of queenTrade(fen, san)) {
    const behind = r.deficit === 1 ? 'un pion' : `${r.deficit} points de matériel`
    items.push({ type: r.type, san: r.to.san, square: r.to.square,
      why: `${frenchSan(san)} échange les dames avec ${behind} de moins : la dame est reprise en ${r.to.square}` })
  }
  const ownGain = VALUE[new Chess(fen).move(san).captured] ?? 0
  const afterBoard = new Chess(afterFen)
  const hangingAfter = new Set(inspectPosition(afterFen)[mover].hanging)
  const replies = afterBoard.moves({ verbose: true })
  const offered = moveRelations(fen, san, { limit: Infinity })
    .filter((r) => r.type === 'allows' && r.to.san.includes('x'))
  for (const r of offered) {
    const m = replies.find((c) => c.san === r.to.san)
    if (!m) continue
    const square = capturedPieceSquare(m)
    const gross = hangingAfter.has(square) ? VALUE[m.captured] : VALUE[m.captured] - VALUE[m.piece]
    if (gross - ownGain <= 0) continue
    items.push({ type: 'allows', san: r.to.san, square,
      why: `${frenchSan(san)} offre ${frenchSan(r.to.san)} à l'adversaire` })
  }
  const covered = new Set(items.map((i) => i.square).filter(Boolean))
  const was = new Set(inspectPosition(fen)[mover].hanging)
  for (const square of inspectPosition(afterFen)[mover].hanging) {
    if (was.has(square) || covered.has(square)) continue
    if (VALUE[afterBoard.get(square).type] - ownGain <= 0) continue
    items.push({ type: 'hanging_piece', square, why: `après ${frenchSan(san)}, rien ne défend ${square}` })
  }
  return items
}

function axisLayers(fen, afterFen) {
  const before = analyzePosition(fen).axes
  const after = analyzePosition(afterFen).axes
  return AXIS_LAYERS.map(({ layer, label, facets }) => {
    const items = []
    for (const key of Object.keys(before)) {
      if (ENGINE_AXES.includes(key) || SIDE_TO_MOVE_AXES.has(key)) continue
      if (!facets.includes(FACET_OF.get(key))) continue
      if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue
      const was = describeAxis(key, before[key])
      const now = describeAxis(key, after[key])
      if (!was || !now) continue
      items.push({ type: key, why: `${now.axis} : ${was.value} → ${now.value}` })
    }
    return { layer, label, items }
  })
}

export function moveReason(fen, san) {
  const mover = new Chess(fen).turn()
  const after = new Chess(fen)
  after.move(san)
  const layers = [
    { layer: 0, label: 'matériel', items: materialLayer(fen, san, after.fen(), mover) },
  ].filter((l) => l.items.length > 0)
  const changes = axisLayers(fen, after.fen()).filter((l) => l.items.length > 0)
  return { layers, primary: layers[0]?.layer ?? null, changes, vocabularyVersion: CHESS_VOCABULARY.version }
}
