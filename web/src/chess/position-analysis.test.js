import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CHESS_VOCABULARY } from './chess-vocabulary.js'
import { analyzePosition, describeAxis, IMPLEMENTED_AXES } from './position-analysis.js'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const DOUBLED_ISOLATED = '4k3/8/8/8/8/P7/P7/4K3 w - - 0 1'
const ROOK_SEVENTH_ABSOLUTE = '6k1/R7/8/8/8/8/8/6K1 w - - 0 1'
const BOTH_SEVENTH = '6k1/R7/8/8/8/8/7r/6K1 w - - 0 1'
const BOTH_CASTLED = 'r4rk1/pp3ppp/8/8/8/8/PP3PPP/R4RK1 w - - 0 1'
const BLACK_SHELTER_GONE = 'r4rk1/pp6/8/8/8/8/PP3PPP/R4RK1 w - - 0 1'

describe('cohérence avec le vocabulaire tiré', () => {
  it('tous les axes annoncés implémentés existent dans le vocabulaire', () => {
    const declared = new Set(CHESS_VOCABULARY.axes.map((a) => a.key))
    for (const key of IMPLEMENTED_AXES) {
      assert.ok(declared.has(key), `axe implémenté «${key}» absent du vocabulaire`)
    }
  })

  it('implémentés + non implémentés couvrent exactement le vocabulaire', () => {
    const result = analyzePosition(START)
    const covered = [...Object.keys(result.axes), ...result.notImplemented].sort()
    const declared = CHESS_VOCABULARY.axes.map((a) => a.key).sort()
    assert.deepEqual(covered, declared)
  })

  it('ne déclare aucune dérive de version sur la version épinglée', () => {
    assert.equal(analyzePosition(START).vocabularyDrift, null)
  })

  it('refuse une valeur non déclarée plutôt que de forcer une voisine', () => {
    const axis = CHESS_VOCABULARY.axes.find((a) => a.key === 'material_balance')
    assert.ok(!axis.values.some((v) => v.key === 'white_crushing'))
    assert.equal(describeAxis('material_balance', 'white_crushing'), null)
  })

  it('rend le libellé humain d’une valeur', () => {
    const described = describeAxis('material_balance', 'balanced')
    assert.equal(described.facet, 'material')
    assert.match(described.value, /Équilibré/)
  })
})

describe('position de départ', () => {
  const { axes, metrics } = analyzePosition(START)

  it('matériel équilibré', () => assert.equal(axes.material_balance, 'balanced'))
  it('aucune paire de fous', () => assert.equal(axes.bishop_pair, 'neither'))
  it('un îlot de pions chacun', () => {
    assert.equal(axes.pawn_islands, 'equal')
    assert.equal(metrics.whitePawnIslands, 1)
  })
  it('aucun défaut de structure', () => assert.deepEqual(axes.pawn_defects, []))
  it('aucun pion passé', () => assert.equal(axes.passed_pawn_edge, 'none'))
  it('avance de pions égale', () => assert.equal(axes.pawn_advance_edge, 'equal'))
  it('terrain contrôlé équilibré', () => assert.equal(axes.terrain_control, 'equal'))
  it('centre disputé', () => assert.equal(axes.centre_command, 'contested'))
  it('développement égal', () => assert.equal(axes.development_lead, 'equal'))
  it('personne n’a roqué', () => assert.equal(axes.castling_state, 'neither'))
  it('personne sur la septième', () => assert.equal(axes.seventh_rank, 'none'))
  it('aucune colonne ouverte à tenir', () => assert.equal(axes.key_file_control, 'none'))
  it('aucune ligne ouverte — position fermée', () => {
    assert.equal(axes.position_character, 'closed')
    assert.equal(metrics.openFiles, 0)
  })
  it('pas d’abri à juger avant le roque', () => {
    assert.equal(axes.shelter_integrity, 'not_castled')
  })
})

const PAWNS_LOCKED = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'
const FRENCH_CHAIN = 'rnbqkbnr/pp3ppp/4p3/2ppP3/3P4/8/PPP2PPP/RNBQKBNR w KQkq - 0 4'
const SOLE_DEFENDER_EVICTABLE = '6k1/8/5n2/3r2P1/8/8/B5K1/8 w - - 0 1'
const SOLE_DEFENDER_SAFE = '6k1/8/5n2/3r4/8/8/B5K1/8 w - - 0 1'
const TWO_DEFENDERS = '6k1/8/5n2/3rr1P1/8/8/B5K1/8 w - - 0 1'

describe('immobilité de pion (Nimzowitsch)', () => {
  it('la position de départ n’a aucun pion bloqué', () => {
    const { axes, metrics } = analyzePosition(START)
    assert.equal(axes.pawn_immobility, 'none')
    assert.equal(metrics.whiteImmobilePawns, 0)
    assert.equal(metrics.blackImmobilePawns, 0)
  })

  it('e4 face à e5 : un pion bloqué de chaque côté', () => {
    const { axes, metrics } = analyzePosition(PAWNS_LOCKED)
    assert.equal(axes.pawn_immobility, 'mutual')
    assert.equal(metrics.whiteImmobilePawns, 1)
    assert.equal(metrics.blackImmobilePawns, 1)
  })

  it('la chaîne française immobilise davantage les noirs', () => {
    const { axes, metrics } = analyzePosition(FRENCH_CHAIN)
    assert.equal(axes.pawn_immobility, 'black_more')
    assert.ok(metrics.blackImmobilePawns > metrics.whiteImmobilePawns)
  })

  it('un pion à qui une prise s’offre n’est pas immobile', () => {
    assert.ok(analyzePosition(FRENCH_CHAIN).metrics.whiteImmobilePawns < 2)
  })
})

describe('déviation — le détecteur doit savoir NE PAS se déclencher', () => {
  it('défenseur unique délogeable par un pion : la cible tombe avec gain', () => {
    const threats = analyzePosition(SOLE_DEFENDER_EVICTABLE).axes.immediate_threats
    assert.ok(threats.includes('deflection'))
  })

  it('sans moyen de déloger le défenseur, aucune déviation', () => {
    const threats = analyzePosition(SOLE_DEFENDER_SAFE).axes.immediate_threats
    assert.ok(!threats.includes('deflection'))
  })

  it('deux défenseurs : en déloger un ne rapporte rien', () => {
    const threats = analyzePosition(TWO_DEFENDERS).axes.immediate_threats
    assert.ok(!threats.includes('deflection'))
  })

  it('la position de départ n’en produit aucune', () => {
    assert.ok(!analyzePosition(START).axes.immediate_threats.includes('deflection'))
  })
})

describe('tension — les trois valeurs doivent être atteignables', () => {
  const tension = (fen) => analyzePosition(fen).axes.tension_state

  it('aucun contact de pions : tension relâchée', () => {
    assert.equal(tension('4k3/8/8/4p3/4P3/8/8/4K3 w - - 0 1'), 'released')
  })

  it('contact d’aile sans prise centrale : tension montante', () => {
    assert.equal(tension('4k3/8/8/1p6/P7/8/8/4K3 w - - 0 1'), 'building')
  })

  it('contact central : une prise change la nature de la position', () => {
    assert.equal(tension('4k3/8/8/4p3/3P4/8/8/4K3 w - - 0 1'), 'critical')
  })

  it('une prise de pièce disponible ne suffit plus à dire « montante »', () => {
    assert.equal(tension('4k3/8/8/4r3/4P3/8/8/4K3 w - - 0 1'), 'released')
  })
})

describe('pions doublés et isolés', () => {
  const { axes, metrics } = analyzePosition(DOUBLED_ISOLATED)

  it('détecte isolé ET doublé, sans inventer de recul', () => {
    assert.deepEqual(axes.pawn_defects.sort(), ['white_doubled', 'white_isolated'])
    assert.equal(metrics.whiteIsolated, 2)
    assert.equal(metrics.whiteDoubled, 1)
  })

  it('deux pions blancs sans pion noir = pions passés blancs', () => {
    assert.equal(axes.passed_pawn_edge, 'white_better')
    assert.equal(metrics.whitePassedPawns, 2)
  })

  it('deux pions d’avance = avantage net', () => {
    assert.equal(axes.material_balance, 'white_clear')
    assert.equal(metrics.materialDiffPawns, 2)
  })

  it('position ouverte — presque plus de pions', () => {
    assert.equal(axes.position_character, 'open')
  })
})

describe('septième rangée', () => {
  it('absolue quand le roi adverse est enfermé sur la huitième', () => {
    const { axes } = analyzePosition(ROOK_SEVENTH_ABSOLUTE)
    assert.equal(axes.seventh_rank, 'white_absolute')
  })

  it('tient sa colonne ouverte', () => {
    const { axes } = analyzePosition(ROOK_SEVENTH_ABSOLUTE)
    assert.equal(axes.key_file_control, 'white')
  })

  it('rend `both` quand les deux camps y sont — pas un camp arbitraire', () => {
    const { axes } = analyzePosition(BOTH_SEVENTH)
    assert.equal(axes.seventh_rank, 'both')
  })
})

describe('roque et abri du roi', () => {
  it('deux roques du même côté', () => {
    const { axes } = analyzePosition(BOTH_CASTLED)
    assert.equal(axes.castling_state, 'both_castled')
    assert.equal(axes.shelter_integrity, 'intact')
  })

  it('détecte le bouclier noir disparu', () => {
    const { axes } = analyzePosition(BLACK_SHELTER_GONE)
    assert.equal(axes.shelter_integrity, 'black_broken')
  })
})

const DECODECHESS = 'r1bqk2r/pp2ppbp/2n2np1/2pp4/3P4/1P2PN2/PBPN1PPP/R2QKB1R w KQkq - 2 7'
const DECODECHESS_HISTORY = ['b3', 'g6', 'Bb2', 'Nf6', 'd4', 'd5', 'Nd2', 'Bg7', 'e3', 'c5', 'Ngf3', 'Nc6']
const KING_WALKED_TO_G1 = '4k3/8/8/8/8/8/PPPPPPPP/6K1 w - - 0 1'
const PINNED_KNIGHT = '4k3/8/8/8/8/4n3/8/4R1K1 b - - 0 1'
const SKEWER_ON_FILE = '4r3/6k1/8/8/8/8/4q3/4R1K1 w - - 0 1'
const MATE_IN_ONE = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1'
const FROZEN_BISHOP = '4k3/6P1/7B/6P1/8/8/8/4K3 w - - 0 1'
const RELEASED_TENSION = '4k3/p7/8/8/8/8/7P/4K3 w - - 0 1'

describe('position DecodeChess — 6...Nc6?', () => {
  const result = analyzePosition(DECODECHESS, { history: DECODECHESS_HISTORY })

  it('lit la tension centrale comme critique', () => {
    assert.equal(result.axes.tension_state, 'critical')
    assert.equal(result.metrics.pawnContacts, 1)
    assert.equal(result.metrics.centralPawnCapture, true)
  })

  it('voit le pion c5 laissé en l’air', () => {
    assert.ok(result.axes.immediate_threats.includes('hanging_piece'))
    assert.equal(result.axes.weakest_link, 'black_target')
    assert.equal(result.metrics.blackPressuredMen, 1)
  })

  it('ne déclare pas la découverte de Bb2 sur f6, qui ne gagne rien', () => {
    assert.ok(!result.axes.immediate_threats.includes('discovered_attack'))
  })

  it('ne déclare aucun clouage : f2 contre g1 est un artefact du roque', () => {
    assert.ok(!result.axes.immediate_threats.includes('pin'))
  })

  it('ne laisse que les trois axes moteur sans calcul', () => {
    assert.deepEqual(result.notImplemented, ['initiative_holder', 'position_regime', 'compensation'])
  })
})

describe('roque déduit de l’historique, pas de la case du roi', () => {
  it('un roi qui a marché en g1 n’est pas lu comme ayant roqué', () => {
    const walked = analyzePosition(KING_WALKED_TO_G1, { history: ['Ke2', 'Ke7', 'Kf3', 'Ke8', 'Kg1'] })
    assert.equal(walked.axes.castling_state, 'neither')
    assert.equal(walked.metrics.castlingSource, 'history')
  })

  it('sans historique, la lecture du FEN reste un indice déclaré comme tel', () => {
    const guessed = analyzePosition(KING_WALKED_TO_G1)
    assert.equal(guessed.axes.castling_state, 'white_only')
    assert.equal(guessed.metrics.castlingSource, 'fen_heuristic')
  })

  it('l’historique confirme un vrai roque des deux camps', () => {
    const castled = analyzePosition(BOTH_CASTLED, { history: ['O-O', 'O-O'] })
    assert.equal(castled.axes.castling_state, 'both_castled')
  })
})

describe('motifs tactiques', () => {
  it('détecte un clouage en place', () => {
    assert.ok(analyzePosition(PINNED_KNIGHT).axes.immediate_threats.includes('pin'))
  })

  it('détecte une enfilade sur la colonne e', () => {
    assert.ok(analyzePosition(SKEWER_ON_FILE).axes.immediate_threats.includes('skewer'))
  })

  it('détecte un mat en un', () => {
    assert.ok(analyzePosition(MATE_IN_ONE).axes.immediate_threats.includes('mate_net'))
  })

  it('déclare le zugzwang comme non détecté plutôt que comme absent', () => {
    assert.deepEqual(analyzePosition(START).metrics.threatsNotDetected, ['zugzwang'])
  })

  it('ne voit aucun motif dans la position de départ', () => {
    assert.deepEqual(analyzePosition(START).axes.immediate_threats, [])
  })
})

describe('qualité et liberté des pièces', () => {
  it('compte un fou totalement hors jeu', () => {
    const result = analyzePosition(FROZEN_BISHOP)
    assert.equal(result.axes.pieces_out_of_action, 'white_has')
    assert.equal(result.metrics.whiteFrozenPieces, 1)
  })

  it('ne compte pas les pièces encore sur leur rangée de départ', () => {
    const result = analyzePosition(START)
    assert.equal(result.axes.pieces_out_of_action, 'none')
    assert.equal(result.metrics.whiteFrozenPieces, 0)
  })

  it('ne juge aucun abri quand le camp n’a plus de pions', () => {
    const { axes } = analyzePosition(MATE_IN_ONE)
    assert.equal(axes.shelter_integrity, 'intact')
    assert.equal(axes.king_safety_balance, 'equal')
  })

  it('lit une tension relâchée quand plus rien ne se touche', () => {
    assert.equal(analyzePosition(RELEASED_TENSION).axes.tension_state, 'released')
  })

  it('ne désigne aucune pire pièce dans la position de départ', () => {
    const { axes } = analyzePosition(START)
    assert.equal(axes.worst_piece, 'none')
    assert.equal(axes.piece_cooperation, 'equal')
    assert.equal(axes.hole_ownership, 'none')
  })
})
