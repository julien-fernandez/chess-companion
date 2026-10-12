/** Met en phrase la lecture de position — la moitié vocale du paysage. */
import { describeAxis } from './position-analysis.js'

const NEUTRAL = new Set([
  'equal', 'none', 'neither', 'balanced', 'contested', 'intact',
  'not_castled', 'neutralised', 'released', 'both_sheltered',
])

const PRIORITY = [
  'immediate_threats',
  'tension_state',
  'weakest_link',
  'material_balance',
  'king_exposure_max',
  'king_safety_balance',
  'shelter_integrity',
  'pawn_defects',
  'passed_pawn_edge',
  'centre_command',
  'seventh_rank',
  'key_file_control',
  'advance_post_held',
  'hole_ownership',
  'piece_cooperation',
  'function_overload',
  'worst_piece',
  'pieces_out_of_action',
  'position_character',
  'advantage_durability',
]

const PHRASES = {
  immediate_threats: {
    fork: 'une fourchette est en l’air',
    pin: 'il y a un clouage',
    skewer: 'une enfilade est possible',
    discovered_attack: 'une attaque à la découverte est disponible',
    hanging_piece: 'une pièce est en l’air',
    mate_net: 'il y a mat en un',
    overload: 'un défenseur est surchargé',
  },
  tension_state: {
    building: 'la tension monte au centre',
    critical: 'la tension est critique, une prise change la position',
  },
  weakest_link: {
    white_target: 'la cible est chez les blancs',
    black_target: 'la cible est chez les noirs',
    mutual: 'chaque camp a une cible',
  },
  material_balance: {
    white_slight: 'les blancs ont un pion de plus',
    white_clear: 'les blancs ont une pièce de plus',
    white_decisive: 'les blancs ont un avantage matériel décisif',
    black_slight: 'les noirs ont un pion de plus',
    black_clear: 'les noirs ont une pièce de plus',
    black_decisive: 'les noirs ont un avantage matériel décisif',
  },
  king_exposure_max: {
    one_airy: 'un roi a perdu son bouclier',
    one_critical: 'un roi est directement assailli',
    both_exposed: 'les deux rois sont exposés',
  },
}

const MAX_READINGS = 3

function readings(analysis) {
  if (!analysis) return []
  const out = []
  for (const axisKey of PRIORITY) {
    const value = analysis.axes[axisKey]
    if (value === undefined) continue
    for (const candidate of Array.isArray(value) ? value : [value]) {
      if (NEUTRAL.has(candidate)) continue
      out.push({ axisKey, valueKey: candidate })
    }
  }
  return out
}

const spoken = (label) => label.split(/ — | \(|,/)[0].trim().toLowerCase()

function phrase({ axisKey, valueKey }) {
  const written = PHRASES[axisKey]?.[valueKey]
  if (written) return written
  const described = describeAxis(axisKey, valueKey)
  if (!described) return null
  return `${spoken(described.axis)} : ${spoken(described.value)}`
}

/** Les lectures les plus actionnables, plafonnées — une voix ne débite pas huit axes. */
export function describeLandscape(analysis, { limit = MAX_READINGS } = {}) {
  const spoken = readings(analysis).map(phrase).filter(Boolean).slice(0, limit)
  return spoken.join(' ; ')
}
