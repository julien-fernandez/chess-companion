import test from 'node:test'
import assert from 'node:assert/strict'
import { REASON_TAGS, frenchSan, judgeGame, lossFor, reasonLabel, selectCards, verdictOf, winPct } from './judgment.js'
import { PILOT_LOSSES_STOCKFISH19_D20 } from './pilot-game.fixture.js'

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.1, `${actual} ≠ ${expected}`)

test('win % — formule Lichess, symétrique autour de 50', () => {
  near(winPct(0), 50)
  near(winPct(245) + winPct(-245), 100)
})

test('perte — 5.Df3 : +2,45 → −1,49 coûte 34,5 % aux Blancs', () => {
  near(lossFor('w', 245, -149), 34.5)
})

test('perte — côté noir, le signe s’inverse : 33…Th2 coûte 88,6 % aux Noirs', () => {
  near(lossFor('b', -556, 9997), 88.6)
  assert.ok(lossFor('b', -556, -600) < 0, 'un coup noir qui améliore n’est pas une perte')
})

test('perte — un mat manqué sature au lieu de rendre NaN', () => {
  const lost = lossFor('w', 9997, -730)
  assert.ok(Number.isFinite(lost) && lost > 90)
  assert.equal(verdictOf(lost), 'blunder')
})

test('verdict — bornes 5 / 10 / 20', () => {
  assert.deepEqual([0, 4.9, 5, 9.9, 10, 19.9, 20, 88].map(verdictOf),
    ['kept', 'kept', 'slipped', 'slipped', 'mistake', 'mistake', 'blunder', 'blunder'])
})

const pilotPlies = () => PILOT_LOSSES_STOCKFISH19_D20.map((winPctLost, i) =>
  ({ ply: i + 1, mover: i % 2 === 0 ? 'w' : 'b', winPctLost }))

test('cartes — partie pilote : 14 erreurs, 14 témoins, 5 cadeaux non punis', () => {
  const cards = selectCards(pilotPlies(), 'w')
  const of = (role) => cards.filter((c) => c.role === role).map((c) => c.ply)
  assert.deepEqual(of('own'), [5, 9, 17, 19, 21, 23, 35, 53, 55, 57, 59, 63, 67, 71])
  assert.deepEqual(of('control'), [25, 27, 29, 33, 39, 41, 45, 47, 49, 51, 65, 69, 73, 75])
  assert.deepEqual(of('opponent_gift'), [8, 20, 54, 66, 70])
  assert.deepEqual(cards.map((c) => c.ply), [...cards.map((c) => c.ply)].sort((a, b) => a - b))
})

test('cartes — jamais de témoin avant le coup 9, même s’il en manque', () => {
  const plies = [
    { ply: 1, mover: 'w', winPctLost: 0 }, { ply: 2, mover: 'b', winPctLost: 0 },
    { ply: 3, mover: 'w', winPctLost: 12 }, { ply: 4, mover: 'b', winPctLost: 0 },
  ]
  assert.deepEqual(selectCards(plies, 'w'), [{ ply: 3, role: 'own' }])
})

test('cartes — témoins répartis sur toute la partie quand il y en a trop', () => {
  const plies = Array.from({ length: 80 }, (_, i) => ({ ply: i + 1, mover: i % 2 ? 'b' : 'w', winPctLost: 0 }))
  plies[60].winPctLost = 25
  plies[62].winPctLost = 25
  const controls = selectCards(plies, 'w').filter((c) => c.role === 'control').map((c) => c.ply)
  assert.equal(controls.length, 2)
  assert.ok(controls[0] < 40 && controls[1] > 40, `témoins groupés : ${controls}`)
})

test('cartes — un cadeau sur le dernier demi-coup n’a pas de réponse, donc pas de carte', () => {
  const plies = [{ ply: 1, mover: 'w', winPctLost: 0 }, { ply: 2, mover: 'b', winPctLost: 40 }]
  assert.deepEqual(selectCards(plies, 'w'), [])
})

test('cartes — Julien avec les Noirs : ses coups sont les demi-coups pairs', () => {
  const cards = selectCards(pilotPlies(), 'b')
  assert.ok(cards.filter((c) => c.role === 'own').every((c) => c.ply % 2 === 0))
  assert.ok(cards.filter((c) => c.role === 'opponent_gift').every((c) => c.ply % 2 === 1))
})

test('notation française — R→T, N→C, B→F, Q→D, K→R, roques et promotions', () => {
  assert.deepEqual(['Re7+', 'Nxa2', 'Bxh7', 'Qxe5+', 'Kf1', 'O-O', 'e8=Q#', 'exd5'].map(frenchSan),
    ['Te7+', 'Cxa2', 'Fxh7', 'Dxe5+', 'Rf1', 'O-O', 'e8=D#', 'exd5'])
})

test('raisons — chaque bouton a un libellé tiré du vocabulaire', () => {
  for (const tag of REASON_TAGS) assert.ok(reasonLabel(tag), `${tag} sans libellé`)
  assert.equal(REASON_TAGS.at(-1), 'other')
})

test('judgeGame — refuse un nombre d’évaluations qui ne colle pas', () => {
  assert.throws(() => judgeGame(['e4'], [{ cp: 20, pv: ['e4'] }], 'w'), /2 évaluations attendues/)
})

test('judgeGame — mat du berger côté noir : la position finale n’invente pas de meilleur coup', () => {
  const sans = ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#']
  const evaluations = [
    { cp: 30, pv: ['e4'] }, { cp: 30, pv: ['e5'] }, { cp: 30, pv: ['Bc4'] }, { cp: 30, pv: ['Nc6'] },
    { cp: 30, pv: ['Qh5'] }, { cp: 30, pv: ['g6'] }, { cp: 10000, pv: ['Qxf7#'] }, { cp: 10000, pv: [] },
  ]
  const { plies, cards } = judgeGame(sans, evaluations, 'b')
  assert.equal(plies.length, 7)
  assert.equal(plies[5].verdict, 'blunder', '3…Cf6 laisse le mat : Gaffe pour les Noirs')
  assert.equal(plies[5].bestSan, 'g6')
  assert.equal(plies[6].verdict, 'kept', 'Dxf7# est le meilleur coup')
  assert.ok(cards.some((c) => c.ply === 6 && c.role === 'own' && c.verdict === 'blunder'))
  assert.equal(plies[0].fen, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
})

test('judgeGame — une perte brute de 4,95 % s’arrondit à 5,0 : Glissement et carte « own », pas Conservé', () => {
  const evaluations = [{ cp: 0, pv: ['e4'] }, { cp: -54, pv: [] }]
  assert.ok(lossFor('w', 0, -54) < 5, 'la perte brute est sous le seuil')
  const { plies, cards } = judgeGame(['e4'], evaluations, 'w')
  assert.equal(plies[0].winPctLost, 5)
  assert.equal(plies[0].verdict, 'slipped')
  assert.deepEqual(cards.map((c) => [c.ply, c.role, c.verdict]), [[1, 'own', 'slipped']])
})
