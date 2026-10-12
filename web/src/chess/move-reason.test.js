import test from 'node:test'
import assert from 'node:assert/strict'
import { Chess } from 'chess.js'
import { moveReason } from './move-reason.js'
import { PILOT_SANS, fenBeforePly } from './pilot-game.fixture.js'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const reasonOf = (ply) => moveReason(fenBeforePly(PILOT_SANS, ply), PILOT_SANS[ply - 1])
const layer0 = (reason) => reason.layers.find((l) => l.layer === 0)?.items ?? []

test('36.Te7+ — étage 0 : renonce à Txb4, en notation française', () => {
  const reason = reasonOf(71)
  assert.equal(reason.primary, 0)
  const item = layer0(reason).find((i) => i.type === 'forgoes')
  assert.equal(item.san, 'Rxb4')
  assert.match(item.why, /Te7\+ renonce à Txb4/)
})

test('5.Df3 — étage 0 : laisse …Dxe5+', () => {
  const items = layer0(reasonOf(9))
  assert.ok(items.some((i) => i.type === 'ignores' && i.san === 'Qxe5+'))
  assert.ok(items.every((i) => !/Q|N|B|K/.test(i.why.replace(/O-O/g, ''))), 'pas de SAN anglais dans why')
})

test('10.Ff4 — aucune raison : les changements d’axe restent du contexte, sans polarité', () => {
  const reason = reasonOf(19)
  assert.equal(reason.primary, null)
  assert.deepEqual(reason.layers, [])
})

test('17.Dxf5 — l’échange égal n’est pas une raison : aucun allows à l’étage 0', () => {
  assert.ok(layer0(reasonOf(17)).every((i) => i.type !== 'allows'))
})

test('9.Dxf5 — la dame laissée en prise après avoir pris une dame est un échange : ni allows ni pièce en l’air', () => {
  assert.deepEqual(layer0(reasonOf(17)).map((i) => i.type), ['trades_queens_behind'])
})

test('9.Dxf5 — étage 0 : échange les dames avec un pion de moins, en notation française', () => {
  const reason = reasonOf(17)
  assert.equal(reason.primary, 0)
  const [item] = layer0(reason)
  assert.equal(item.square, 'f5')
  assert.equal(item.why, 'Dxf5 échange les dames avec un pion de moins : la dame est reprise en f5')
})

test('un coup qui ne prend rien et retire le défenseur : hanging_piece rapporté', () => {
  const g = new Chess('4k3/1b6/8/8/4N3/3B4/8/4K3 w - - 0 1')
  const items = layer0(moveReason(g.fen(), 'Bc4'))
  assert.ok(items.some((i) => i.type === 'hanging_piece' && i.square === 'e4'), JSON.stringify(items))
})

test('1.e4 e5 2.d4 — d4 offre exd4 mais c’est un échange : aucun allows', () => {
  const g = new Chess()
  g.move('e4'); g.move('e5')
  assert.ok(layer0(moveReason(g.fen(), 'd4')).every((i) => i.type !== 'allows'))
})

test('layers ne porte que l’étage 0 ; changes, étages 1 à 3 en ordre croissant', () => {
  let nonEmpty = 0
  for (const ply of [9, 19, 57, 71]) {
    const reason = reasonOf(ply)
    assert.ok(reason.layers.every((l) => l.layer === 0 && l.items.length > 0))
    const nums = reason.changes.map((l) => l.layer)
    assert.deepEqual(nums, [...nums].sort((a, b) => a - b))
    assert.ok(nums.every((n) => n >= 1 && n <= 3))
    assert.ok(reason.changes.every((l) => l.items.length > 0))
    if (nums.length) nonEmpty++
  }
  assert.ok(nonEmpty > 0, 'au moins une partie avec des changements')
})

test('sait se taire — 1.e4 n’a rien à l’étage 0', () => {
  assert.deepEqual(moveReason(START, 'e4').layers, [])
})

test('une pièce laissée en l’air et la prise offerte ne se comptent qu’une fois', () => {
  const fen = 'rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'
  const onD4 = layer0(moveReason(fen, 'Nd4')).filter((i) => i.square === 'd4' || /xd4/.test(i.san ?? ''))
  assert.equal(onD4.length, 1)
})
