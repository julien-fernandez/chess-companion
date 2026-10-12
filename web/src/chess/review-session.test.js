import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Chess } from 'chess.js'
import { judge, judgeSan } from './review-session.js'
import { spokenSan } from './tts.js'

function afterMoves(...sans) {
  const chess = new Chess()
  for (const san of sans) chess.move(san)
  return chess
}

const LONDON_THIRD = { san: 'Nf3', answers: ['Nf3', 'e3'] }

test('le coup de la variante dicté du premier coup est un rappel', () => {
  const r = judge(afterMoves('d4', 'd5', 'Bf4', 'Nc6'), 'cavalier f3', LONDON_THIRD, 0)
  assert.deepEqual([r.verdict, r.review], ['correct', { san: 'Nf3', outcome: 'recalled' }])
})

test('une alternative déclarée est acceptée et notée sur sa propre carte', () => {
  const r = judge(afterMoves('d4', 'd5', 'Bf4', 'Nc6'), 'e3', LONDON_THIRD, 1)
  assert.deepEqual([r.verdict, r.review], ['alternative', { san: 'e3', outcome: 'recalled_after_retry' }])
})

test('un coup légal hors répertoire fait réessayer, puis échoue au troisième', () => {
  const chess = afterMoves('d4', 'd5', 'Bf4', 'Nc6')
  assert.equal(judge(chess, 'c4', LONDON_THIRD, 0).verdict, 'retry')
  assert.equal(judge(chess, 'c4', LONDON_THIRD, 0).review, null)
  assert.deepEqual(judge(chess, 'c4', LONDON_THIRD, 2).review, { san: 'Nf3', outcome: 'failed' })
})

test('une phrase incomprise ou un coup illégal est noté incompris, sans coûter d\'essai', () => {
  const chess = afterMoves('d4', 'd5', 'Bf4', 'Nc6')
  assert.equal(judge(chess, 'bonjour', LONDON_THIRD, 0).verdict, 'unrecognized')
  assert.equal(judge(chess, 'dame h5', LONDON_THIRD, 2).review.outcome, 'unrecognized')
})

test('un coup se lit en français, pièce et case', () => {
  assert.equal(spokenSan('Nf3'), 'cavalier f 3')
  assert.equal(spokenSan('exd5'), 'e prend d 5')
  assert.equal(spokenSan('Qxd5+'), 'dame prend d 5 échec')
  assert.equal(spokenSan('O-O-O'), 'grand roque')
  assert.equal(spokenSan('e8=Q#'), 'e 8 promotion dame échec et mat')
})

test('un coup déjà décidé se juge sans relire de transcription', () => {
  assert.deepEqual(judgeSan('Nf3', LONDON_THIRD, 0).review, { san: 'Nf3', outcome: 'recalled' })
  assert.equal(judgeSan(null, LONDON_THIRD, 2).verdict, 'unrecognized')
  assert.equal(judgeSan('c4', LONDON_THIRD, 0).verdict, 'retry')
})
