import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { concedes, forcingOutcome } from './forcing-search.js'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const MATE_IN_ONE_IF_ROOK_LEAVES = '5r1k/1p5p/2r1bp2/4pp2/1qP5/1B3Q2/P4PPP/3RR1K1 w - - 8 22'
const MATE_IN_TWO_AFTER_RXC5 = '8/1p1r1Bkp/5p2/2r1p3/P4p2/8/4RPPP/2R3K1 w - - 0 31'
const BEST_MOVE_IS_QD3 = 'r1bq1rk1/pp2pp1p/8/1B3p2/3n4/2N5/PPP2PPP/R2QK2R w KQ - 0 11'

describe('ce qu’un coup abandonne', () => {
  it('un coup d’ouverture ordinaire ne concède rien', () => {
    assert.equal(concedes(START, 'e4'), false)
    assert.equal(concedes(START, 'Nf3'), false)
  })

  it('voit le mat en UN que le coup permet', () => {
    const outcome = forcingOutcome(MATE_IN_ONE_IF_ROOK_LEAVES, 'Rd3')
    assert.equal(outcome.after, -1000)
    assert.equal(concedes(MATE_IN_ONE_IF_ROOK_LEAVES, 'Rd3'), true)
  })

  it('voit le mat en DEUX, où le matériel augmente pourtant d’abord', () => {
    const outcome = forcingOutcome(MATE_IN_TWO_AFTER_RXC5, 'Rxc5')
    assert.ok(outcome.before > 0, 'la position part matériellement favorable')
    assert.equal(outcome.after, -1000)
    assert.equal(concedes(MATE_IN_TWO_AFTER_RXC5, 'Rxc5'), true)
  })

  it('ne condamne pas le meilleur coup de la position', () => {
    assert.equal(concedes(BEST_MOVE_IS_QD3, 'Qd3'), false)
  })

  it('rend null sur un coup illégal plutôt qu’un verdict inventé', () => {
    assert.equal(forcingOutcome(START, 'Qh5'), null)
    assert.equal(concedes(START, 'Qh5'), false)
  })

  it('un seuil plus bas condamne plus, un seuil plus haut condamne moins', () => {
    const lenient = concedes(BEST_MOVE_IS_QD3, 'Qd3', { threshold: 100 })
    const strict = concedes(BEST_MOVE_IS_QD3, 'Qd3', { threshold: -100 })
    assert.equal(lenient, false)
    assert.equal(strict, true)
  })
})
