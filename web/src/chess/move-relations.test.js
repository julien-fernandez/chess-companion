import test from 'node:test'
import assert from 'node:assert/strict'
import { Chess } from 'chess.js'
import { moveOmissions, moveRelations, moveRelationsByType, queenTrade } from './move-relations.js'
import { PILOT_SANS, fenBeforePly } from './pilot-game.fixture.js'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

const typesOf = (fen, san) => new Set(moveRelations(fen, san).map((r) => r.type))
const sansOf = (fen, san, type) =>
  moveRelations(fen, san).filter((r) => r.type === type).map((r) => r.to.san)

test('permet — un coup qui ouvre une ligne à MES pièces', () => {
  const enabled = sansOf(START, 'e4', 'enables')
  assert.ok(enabled.includes('Qe2'), 'e4 ouvre e2 à la dame')
  assert.ok(enabled.includes('Qh5'), 'e4 ouvre la diagonale d1-h5')
})

test('exclut — un coup qui me prive d’un de MES coups', () => {
  const excluded = sansOf(START, 'Nf3', 'excludes')
  assert.ok(excluded.includes('f4'), 'le cavalier en f3 bloque la poussée f4')
  assert.ok(!excluded.includes('Nc3'), 'un coup d’une autre pièce n’est pas exclu')
})

test('libère — la case quittée, et qui peut la reprendre', () => {
  const freed = moveRelations(START, 'Nf3').filter((r) => r.type === 'frees')
  assert.equal(freed.length, 1)
  assert.equal(freed[0].to.square, 'g1')
  assert.match(freed[0].why, /la tour en h1/)
})

test('prévient — occuper une case la retire à l’adversaire', () => {
  const fen = 'rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'
  assert.deepEqual(sansOf(fen, 'a3', 'prevents'), ['Ba3'], 'a3 prive le fou noir de a3')
})

test('concède — le même coup offre la PRISE de ce qu’il vient de poser', () => {
  const fen = 'rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'
  assert.deepEqual(sansOf(fen, 'a3', 'allows'), ['Bxa3'], 'le pion a3 devient prenable')
})

test('concède — avancer une pièce sous une prise de pion', () => {
  const fen = 'rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'
  assert.ok(sansOf(fen, 'Nd4', 'allows').includes('exd4'), 'Nd4 s’offre au pion e5')
})

test('sait se taire — un coup de pion tranquille ne fabrique pas de relation adverse', () => {
  const types = typesOf(START, 'a3')
  assert.ok(!types.has('prevents'), 'a3 ne retire aucun coup à l’adversaire')
  assert.ok(!types.has('allows'), 'a3 n’en offre aucun')
})

test('ne compte jamais les coups de la pièce qui vient de bouger', () => {
  for (const san of ['e4', 'Nf3', 'a3']) {
    for (const relation of moveRelations(START, san)) {
      if (relation.type !== 'enables' && relation.type !== 'excludes') continue
      assert.notEqual(relation.to.san, san, `${san} ne se cite pas lui-même`)
    }
  }
})

test('refuse un coup illégal au lieu de rendre une liste vide', () => {
  assert.throws(() => moveRelations(START, 'Qh5'), /Invalid move|illégal/)
})

test('le groupement par type ne perd aucune relation', () => {
  const flat = moveRelations(START, 'e4')
  const grouped = moveRelationsByType(START, 'e4')
  const total = [...grouped.values()].reduce((sum, list) => sum + list.length, 0)
  assert.equal(total, flat.length)
})

test('chaque type rendu est déclaré par le vocabulaire', () => {
  const declared = new Set(['enables', 'excludes', 'prevents', 'allows', 'frees'])
  for (const fen of [START, 'r1bq1r1k/1p3p1p/8/p3pp2/BP1n4/2N5/P1P2PPP/R2Q1RK1 w - - 2 14']) {
    const first = new Set(moveRelations(fen, fen === START ? 'e4' : 'Re1').map((r) => r.type))
    for (const type of first) assert.ok(declared.has(type), `${type} n’est pas de l’étage plan`)
  }
})

import { CHESS_VOCABULARY } from './chess-vocabulary.js'

test('les omissions sont déclarées par le vocabulaire (0.7.0)', () => {
  const keys = new Set(CHESS_VOCABULARY.relationship_types.map((r) => r.key))
  assert.ok(keys.has('forgoes'), 'forgoes absent du vocabulaire tiré')
  assert.ok(keys.has('ignores'), 'ignores absent du vocabulaire tiré')
})

const omitted = (ply, type) =>
  moveOmissions(fenBeforePly(PILOT_SANS, ply), PILOT_SANS[ply - 1])
    .filter((r) => r.type === type).map((r) => r.to.san)

test('renonce — 36.Te7+ passe à côté du cavalier b4 sans défenseur', () => {
  assert.deepEqual(omitted(71, 'forgoes'), ['Rxb4'])
})

test('renonce — 34.Fe4 passe à côté du pion h7 sans défenseur', () => {
  assert.deepEqual(omitted(67, 'forgoes'), ['Bxh7'])
})

test('laisse — 5.Df3 pare g2 mais laisse e5 : …Dxe5+', () => {
  assert.deepEqual(omitted(9, 'ignores'), ['Qxe5+'])
})

test('laisse — 34.Fe4 laisse le pion a2 : …Cxa2', () => {
  assert.deepEqual(omitted(67, 'ignores'), ['Nxa2'])
})

test('laisse — un mat en un adverse non paré', () => {
  const fen = 'r1b1k1nr/pppp1ppp/2n5/2b1p3/2B1P2q/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 1'
  const ignored = moveOmissions(fen, 'a3').filter((r) => r.type === 'ignores')
  assert.ok(ignored.some((r) => r.to.san === 'Qxf2#' && r.to.square === null))
})

test('renonce — un mat en un non joué', () => {
  const fen = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1'
  const forgone = moveOmissions(fen, 'h3').filter((r) => r.type === 'forgoes')
  assert.deepEqual(forgone.map((r) => [r.to.san, r.to.square]), [['Ra8#', null]])
})

test('sait se taire — 10.Ff4 et la position de départ ne rendent aucune omission', () => {
  assert.deepEqual(moveOmissions(fenBeforePly(PILOT_SANS, 19), 'Bf4'), [])
  assert.deepEqual(moveOmissions(START, 'e4'), [])
})

test('prendre la pièce en l’air n’est pas y renoncer', () => {
  assert.deepEqual(moveOmissions(fenBeforePly(PILOT_SANS, 71), 'Rxb4').filter((r) => r.type === 'forgoes'), [])
})

test('la dame échangée en retard est déclarée par le vocabulaire (0.8.0)', () => {
  const keys = new Set(CHESS_VOCABULARY.relationship_types.map((r) => r.key))
  assert.ok(keys.has('trades_queens_behind'), 'trades_queens_behind absent du vocabulaire tiré')
})

const replayed = (sans) => {
  const board = new Chess()
  for (const san of sans) board.move(san)
  return board.fen()
}

test('échange les dames en retard — 9.Dxf5, un pion de moins, la dame est reprise en f5', () => {
  const found = queenTrade(fenBeforePly(PILOT_SANS, 17), 'Qxf5')
  assert.deepEqual(found.map((r) => [r.type, r.to.square, r.deficit]), [['trades_queens_behind', 'f5', 1]])
})

test('sait se taire — un échange de dames à matériel égal', () => {
  const fen = replayed(['e4', 'e5', 'd4', 'exd4', 'Qxd4', 'Qf6'])
  assert.deepEqual(queenTrade(fen, 'Qxf6'), [])
})

test('sait se taire — la reprise …gxf5 et les 20 coups de la position de départ', () => {
  assert.deepEqual(queenTrade(fenBeforePly(PILOT_SANS, 18), 'gxf5'), [])
  for (const san of new Chess(START).moves()) assert.deepEqual(queenTrade(START, san), [], san)
})

test('sait se taire — un échange de dames en avance de matériel', () => {
  const fen = replayed(['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Qe7', 'Qxe5', 'Nf6'])
  assert.deepEqual(queenTrade(fen, 'Qxe7+'), [])
})
