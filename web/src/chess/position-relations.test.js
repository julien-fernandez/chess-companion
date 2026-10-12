import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CHESS_VOCABULARY } from './chess-vocabulary.js'
import { relatePosition, describePiece } from './position-relations.js'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const FRENCH_CHAIN = 'rnbqkbnr/pp3ppp/4p3/2ppP3/3P4/8/PPP2PPP/RNBQKBNR w KQkq - 0 4'
const BEFORE_MATE = '8/1p1r1Bkp/5p2/2r1p3/P4p2/8/4RPPP/2R3K1 w - - 0 31'
const BOTVINNIK = '8/p3q1kp/1p2Pnp1/3pQ3/2pP4/1nP3N1/1B4PP/6K1 w - - 5 30'

const typesOf = (fen, type) => relatePosition(fen).relations.filter((r) => r.type === type)

describe('les relations instanciées restent dans le vocabulaire', () => {
  it('aucun type instancié n’est absent de la source', () => {
    const declared = new Set(CHESS_VOCABULARY.relationship_types.map((r) => r.key))
    for (const fen of [START, FRENCH_CHAIN, BEFORE_MATE, BOTVINNIK]) {
      for (const type of relatePosition(fen).typesInstantiated) {
        assert.ok(declared.has(type), `type «${type}» instancié hors vocabulaire`)
      }
    }
  })

  it('chaque relation porte ses deux extrémités et sa raison', () => {
    for (const edge of relatePosition(BOTVINNIK).relations) {
      assert.ok(edge.from.square, 'extrémité de départ manquante')
      assert.ok(edge.to.square || edge.to.line, 'extrémité d’arrivée manquante')
      assert.match(edge.why, /\S/)
    }
  })
})

describe('le détecteur doit savoir NE RIEN dire', () => {
  it('la position de départ ne produit aucune relation', () => {
    assert.equal(relatePosition(START).relations.length, 0)
  })

  it('une tour ne « traverse » pas son propre pion pour viser celui d’en face', () => {
    assert.equal(typesOf(START, 'screens').length, 0)
  })

  it('aucune défense n’est comptée sur un homme que personne n’attaque', () => {
    assert.equal(typesOf(START, 'defends').length, 0)
  })
})

describe('relations concrètes', () => {
  it('la chaîne française met deux pions en contact', () => {
    const contacts = typesOf(FRENCH_CHAIN, 'contacts')
    assert.equal(contacts.length, 2)
    assert.ok(contacts.some((r) => r.from.square === 'c5' && r.to.square === 'd4'))
  })

  it('avant 31.Rxc5, la tour c1 et la tour c5 s’attaquent mutuellement', () => {
    const attacks = typesOf(BEFORE_MATE, 'attacks')
    assert.ok(attacks.some((r) => r.from.square === 'c1' && r.to.square === 'c5'))
    assert.ok(attacks.some((r) => r.from.square === 'c5' && r.to.square === 'c1'))
  })

  it('une tour sur colonne ouverte porte sur sa ligne', () => {
    const lines = typesOf(BEFORE_MATE, 'bears_on')
    assert.ok(lines.some((r) => r.from.square === 'c1' && r.to.line === 'c'))
  })

  it('la position de Botvinnik porte un vrai clouage', () => {
    assert.ok(typesOf(BOTVINNIK, 'pins').length > 0)
  })
})

describe('manœuvres — un chemin vers un trou, avec son but', () => {
  it('n’en propose aucune quand aucun trou n’est atteignable', () => {
    const { maneuvers } = relatePosition(START)
    assert.equal(maneuvers.w.length, 0)
    assert.equal(maneuvers.b.length, 0)
  })

  it('rend un chemin dont chaque étape est une case, et le but est le terminus', () => {
    const { maneuvers } = relatePosition(BEFORE_MATE)
    assert.ok(maneuvers.w.length > 0)
    for (const plan of maneuvers.w) {
      assert.equal(plan.path.at(-1), plan.goal)
      assert.equal(plan.moves, plan.path.length)
      assert.ok(plan.moves <= 3)
    }
  })
})

describe('restitution au niveau de la pièce', () => {
  it('rend ce que la position dit d’UNE pièce, pas de la position entière', () => {
    const said = describePiece(BEFORE_MATE, 'c5')
    assert.ok(said.length > 0)
    assert.ok(said.every((line) => line.includes('c5')))
  })

  it('rend une liste vide pour une case sans relation', () => {
    assert.deepEqual(describePiece(START, 'e2'), [])
  })
})
