import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Chess } from 'chess.js'
import { phoneticKey, phoneticMatch, spokenForms } from './phonetic-match.js'

function afterMoves(...sans) {
  const chess = new Chess()
  for (const san of sans) chess.move(san)
  return chess
}

const SCOTCH_GAMBIT_4 = afterMoves('e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4')

test('une case dite en lettres et en chiffres a la même clé que la case écrite', () => {
  assert.equal(phoneticKey('fou c quatre'), phoneticKey('fou c4'))
  assert.equal(phoneticKey('e quatre'), phoneticKey('e4'))
})

test('un coup de pièce se décline avec et sans « prend »', () => {
  const capture = afterMoves('e4', 'd5').moves({ verbose: true }).find(m => m.san === 'exd5')
  assert.deepEqual(spokenForms(capture).sort(), ['d 5', 'e prend d 5', 'pion d 5'].sort())
  const bishop = SCOTCH_GAMBIT_4.moves({ verbose: true }).find(m => m.san === 'Bc4')
  assert.ok(spokenForms(bishop).includes('fou c 4'))
})

test('le coup dit clairement est décidé', () => {
  assert.equal(phoneticMatch(new Chess(), ['e4']).decided, 'e4')
  assert.equal(phoneticMatch(SCOTCH_GAMBIT_4, ['fou c4']).decided, 'Bc4')
  assert.equal(phoneticMatch(afterMoves('d4', 'd5'), ['cavalier f3']).decided, 'Nf3')
})

test('une transcription approximative retrouve le coup dit', () => {
  assert.equal(phoneticMatch(SCOTCH_GAMBIT_4, ['fou c\'est quatre']).decided, 'Bc4')
  assert.equal(phoneticMatch(new Chess(), ['euh quatre', 'e quatre']).decided, 'e4')
})

test('une transcription trop éloignée pour décider met quand même le bon coup en tête', () => {
  const r = phoneticMatch(SCOTCH_GAMBIT_4, ['phoque c4'])
  assert.equal(r.decided, null)
  assert.equal(r.ranking[0].san, 'Bc4')
})

test('majuscules et ponctuation de la reconnaissance ne gênent pas', () => {
  assert.equal(phoneticMatch(SCOTCH_GAMBIT_4, ['Fou C4.']).decided, 'Bc4')
})

test('la meilleure des transcriptions compte, pas la première', () => {
  assert.equal(phoneticMatch(SCOTCH_GAMBIT_4, ['bonjour', 'fou c4']).decided, 'Bc4')
})

test('une phrase sans rapport ne décide rien', () => {
  assert.equal(phoneticMatch(new Chess(), ['bonjour']).decided, null)
  assert.equal(phoneticMatch(new Chess(), ['quelle heure est-il']).decided, null)
  assert.equal(phoneticMatch(new Chess(), ['fouad']).decided, null)
  assert.equal(phoneticMatch(new Chess(), []).decided, null)
})

test('une case dite qui n\'est pas celle du coup le plus proche ne décide rien', () => {
  const ruyLopezMoment = afterMoves('e4', 'e5', 'Nf3', 'Nc6')
  assert.equal(phoneticMatch(ruyLopezMoment, ['fou c5']).decided, null)
  assert.equal(phoneticMatch(ruyLopezMoment, ['fou b4']).decided, null)
  assert.equal(phoneticMatch(ruyLopezMoment, ['fou b5']).decided, 'Bb5')
})

test('une position sans coup de fou ne rend aucun coup de fou', () => {
  const { ranking } = phoneticMatch(new Chess(), ['fou c4'])
  assert.ok(ranking.every(r => !r.san.startsWith('B')))
  assert.equal(ranking.length, 20)
})

test('le classement ne dépend que de la position et des transcriptions', () => {
  assert.equal(phoneticMatch.length, 2)
  assert.deepEqual(phoneticMatch(new Chess(), ['e4']), phoneticMatch(new Chess(), ['e4']))
})
