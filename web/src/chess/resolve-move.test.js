import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Chess } from 'chess.js'
import { readYesNo, resolveMove, resolveRequest } from './resolve-move.js'

function afterMoves(...sans) {
  const chess = new Chess()
  for (const san of sans) chess.move(san)
  return chess
}

const SCOTCH_GAMBIT_4 = afterMoves('e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4')
const unreachable = () => { throw new Error('ne doit pas être appelé') }

test('un coup net est décidé par la phonétique, sans appel distant ni confirmation', async () => {
  const r = await resolveMove(SCOTCH_GAMBIT_4, ['fou c4'], { resolveRemote: unreachable, confirm: unreachable })
  assert.deepEqual([r.san, r.decider, r.confirmed], ['Bc4', 'phonetic', null])
})

test('un coup tapé est lu par le parseur exact', async () => {
  const r = await resolveMove(new Chess(), ['e4'], { typed: true, resolveRemote: unreachable, confirm: unreachable })
  assert.deepEqual([r.san, r.decider], ['e4', 'typed'])
})

test('un décideur sûr tranche quand la phonétique hésite', async () => {
  const remote = async () => ({ san: 'Bc4', confidence: 0.9, decider: 'laya' })
  const r = await resolveMove(SCOTCH_GAMBIT_4, ['phoque c4'], { resolveRemote: remote, confirm: unreachable })
  assert.deepEqual([r.san, r.decider, r.confidence], ['Bc4', 'laya', 0.9])
})

test('un décideur peu sûr mène à la confirmation, et « oui » décide', async () => {
  const remote = async () => ({ san: 'Bc4', confidence: 0.5, decider: 'laya' })
  const asked = []
  const confirm = async san => { asked.push(san); return true }
  const r = await resolveMove(SCOTCH_GAMBIT_4, ['phoque c4'], { resolveRemote: remote, confirm })
  assert.deepEqual(asked, ['Bc4'])
  assert.deepEqual([r.san, r.decider, r.confirmed], ['Bc4', 'confirmation', true])
})

test('« non » à la confirmation ne décide rien', async () => {
  const remote = async () => ({ san: null, confidence: null, decider: 'none' })
  const r = await resolveMove(SCOTCH_GAMBIT_4, ['phoque c4'], { resolveRemote: remote, confirm: async () => false })
  assert.deepEqual([r.san, r.decider, r.confirmed], [null, 'confirmation', false])
})

test('un décideur en panne ou qui rend un coup illégal ne décide jamais', async () => {
  const broken = async () => { throw new Error('réseau') }
  const r1 = await resolveMove(SCOTCH_GAMBIT_4, ['phoque c4'], { resolveRemote: broken, confirm: async () => null })
  assert.deepEqual([r1.san, r1.decider], [null, 'none'])
  const illegal = async () => ({ san: 'Qh5', confidence: 0.99, decider: 'laya' })
  const asked = []
  await resolveMove(SCOTCH_GAMBIT_4, ['phoque c4'], { resolveRemote: illegal, confirm: async san => { asked.push(san); return null } })
  assert.deepEqual(asked, ['Bc4'])
})

test('une phrase sans rapport ne fait poser aucune question', async () => {
  const remote = async () => ({ san: null, confidence: null, decider: 'none' })
  const r = await resolveMove(new Chess(), ['bonjour'], { resolveRemote: remote, confirm: unreachable })
  assert.deepEqual([r.san, r.decider], [null, 'none'])
})

test('la requête distante porte les coups légaux en français et jamais le coup attendu', () => {
  const req = resolveRequest(new Chess(), ['fouad'], [{ san: 'f3', score: 0.3 }])
  assert.equal(req.options.length, 20)
  assert.deepEqual(req.options.find(o => o.san === 'Nf3'), { san: 'Nf3', spoken: 'cavalier f 3' })
  assert.deepEqual(Object.keys(req).sort(), ['fen', 'options', 'phonetic', 'transcripts'])
})

test('oui et non se lisent dans n\'importe quelle transcription, le reste est illisible', () => {
  assert.equal(readYesNo(['Oui.']), true)
  assert.equal(readYesNo(['bof', 'ouais']), true)
  assert.equal(readYesNo(['non, fou c4']), false)
  assert.equal(readYesNo(['bonjour']), null)
  assert.equal(readYesNo([]), null)
})
