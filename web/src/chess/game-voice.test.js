import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Chess } from 'chess.js'
import { confirmationAnswer, decideGameMove } from './game-voice.js'
import { VoiceInput } from './voice-input.js'

function afterMoves(...sans) {
  const chess = new Chess()
  for (const san of sans) chess.move(san)
  return chess
}

const decide = (chess, transcripts) => decideGameMove(chess, transcripts, new VoiceInput(chess))
const SCOTCH_GAMBIT_4 = afterMoves('e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4')

test('un coup compris mot pour mot passe par les règles', () => {
  assert.deepEqual(decide(new Chess(), ['cavalier f3']),
    { kind: 'move', uci: 'g1f3', san: 'Nf3', source: 'rules' })
})

test('la première transcription comprise l’emporte, pas la première tout court', () => {
  assert.deepEqual(decide(new Chess(), ['bonjour', 'e4']),
    { kind: 'move', uci: 'e2e4', san: 'e4', source: 'rules' })
})

test('« fou c’est quatre » échappe aux règles, la phonétique décide Fc4', () => {
  assert.deepEqual(decide(SCOTCH_GAMBIT_4, ['fou c\'est quatre']),
    { kind: 'move', uci: 'f1c4', san: 'Bc4', source: 'phonetic' })
})

test('un mot inconnu devant la case ne fait pas jouer le pion : « phoque c4 » demande Fc4 ?', () => {
  assert.deepEqual(decide(SCOTCH_GAMBIT_4, ['phoque c4']), { kind: 'confirm', uci: 'f1c4', san: 'Bc4' })
})

test('une phrase sans rapport ne joue rien et ne demande rien', () => {
  assert.deepEqual(decide(new Chess(), ['quelle heure est-il']), { kind: 'none' })
  assert.deepEqual(decide(new Chess(), []), { kind: 'none' })
})

test('les commandes restent des commandes', () => {
  assert.deepEqual(decide(new Chess(), ['annuler']), { kind: 'command', command: 'undo' })
})

test('un coup ambigu demande la case de départ, sans passer par la phonétique', () => {
  const twoKnights = afterMoves('Nf3', 'e5', 'Nc3', 'e4', 'Nd4', 'd5')
  assert.deepEqual(decide(twoKnights, ['cavalier b5']), { kind: 'ambiguous', piece: 'cavalier', squares: 'c3, d4' })
})

test('le roque compris passe par les règles', () => {
  const ready = afterMoves('e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5')
  assert.deepEqual(decide(ready, ['petit roque']), { kind: 'move', uci: 'e1g1', san: 'O-O', source: 'rules' })
})

const RUY_LOPEZ_4 = afterMoves('e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6')

test('un mot de liaison entre la pièce et la case ne fait pas jouer le pion : « fou en a4 » joue Fa4', () => {
  for (const said of ['fou en a4', 'fou en a 4', 'fou recule en a4', 'fou va en a4', 'fou sur a4']) {
    assert.deepEqual(decide(RUY_LOPEZ_4, [said]), { kind: 'move', uci: 'b5a4', san: 'Ba4', source: 'rules' }, said)
  }
})

test('« fou prend c6 » joue la prise du fou, pas un coup de pion', () => {
  assert.deepEqual(decide(RUY_LOPEZ_4, ['fou prend c6']), { kind: 'move', uci: 'b5c6', san: 'Bxc6', source: 'rules' })
})

test('une pièce nommée ne retombe jamais sur le pion de la même case', () => {
  assert.notEqual(decide(RUY_LOPEZ_4, ['cavalier en a4']).san, 'a4')
})

// Partie du 2026-10-07 : après 4...h6, « cavalier prend f6 » entendu « cavalier pour f6 ».
const PIN_4 = afterMoves('e4', 'e5', 'Nf3', 'Nc6', 'd3', 'Nf6', 'Bg5', 'h6')

test('la pièce nommée peut être celle qu’on prend : « cavalier f6 » demande Fxf6 ?', () => {
  for (const said of [['cavalier pour f6', 'cavalier f6'], ['cavalier prend f6'], ['prend le cavalier f6']]) {
    assert.deepEqual(decide(PIN_4, said), { kind: 'confirm', uci: 'g5f6', san: 'Bxf6' }, said[0])
  }
})

test('la prise de la pièce nommée ne se devine pas quand deux pièces peuvent la prendre', () => {
  const twoPawns = afterMoves('d3', 'Nf6', 'f3', 'Ne4')
  assert.deepEqual(decide(twoPawns, ['cavalier e4']), { kind: 'ambiguous', piece: 'pion', squares: 'd3, f3' })
})

// Partie du 2026-10-07 : « Dxd7+ ? » en attente, Julien redit son coup, « dame prend g7 ».
test('pendant une confirmation, un nouveau coup remplace la proposition au lieu d’être jeté', () => {
  assert.equal(confirmationAnswer(['oui']), 'yes')
  assert.equal(confirmationAnswer(['non', 'nom']), 'no')
  assert.equal(confirmationAnswer(['dame prend g7', 'dame prends g7']), 'other')
})

test('une pièce qui peut aller sur la case y va : la règle ne prend pas sa place', () => {
  assert.deepEqual(decide(PIN_4, ['fou f6']), { kind: 'move', uci: 'g5f6', san: 'Bxf6', source: 'rules' })
})
