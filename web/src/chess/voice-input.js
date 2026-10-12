/** Normalisation du français dicté, puis parseur vocal vers un coup UCI. */
import { logger } from '../logger.js'

const MOD = 'voice-input'

const NUMBERS_FR = { un:'1', deux:'2', trois:'3', quatre:'4', cinq:'5', six:'6', sept:'7', huit:'8' }

const FILE_PHONETIC = [
  [/\ble\b(?=\s*[1-8]|\s*$)/g, 'e'],
  [/\bla\b(?=\s*[1-8]|\s*$)/g, 'a'],
  [/\bsi\b(?=\s*[1-8]|\s*$)/g, 'c'],
  [/\bcé\b(?=\s*[1-8]|\s*$)/g, 'c'],
  [/\bdi\b(?=\s*[1-8]|\s*$)/g, 'd'],
  [/\bde\b(?=\s*[1-8]|\s*$)/g, 'd'],
  [/\b(?:éf|eff)\b(?=\s*[1-8]|\s*$)/g, 'f'],
  [/\b(?:jé|ji)\b(?=\s*[1-8]|\s*$)/g, 'g'],
  [/\b(?:ach|hache)\b(?=\s*[1-8]|\s*$)/g, 'h'],
  [/\bbé\b(?=\s*[1-8]|\s*$)/g, 'b'],
  [/\b[àâ]\b(?=\s*[1-8]|\s*$)/g, 'a'],
]

const PIECE_FUZZY = [
  [/\bcavaliers?\b/g, 'cavalier'],
  [/\bcavalié\b/g,    'cavalier'],
  [/\bcavale\b/g,     'cavalier'],
  [/\bcava\b/g,       'cavalier'],
  [/\bdames?\b/g,     'dame'],
  [/\bzam\b/g,        'dame'],
  [/\bdam\b/g,        'dame'],
  [/\bdamn\b/g,       'dame'],
  [/\btours?\b/g,     'tour'],
  [/\btur\b/g,        'tour'],
  [/\bfous?\b/g,      'fou'],
  [/\bfu\b/g,         'fou'],
  [/\bpions?\b/g,     'pion'],
  [/\brois?\b/g,      'roi'],
  [/\broua\b/g,       'roi'],
]

const PIECES = { roi: 'k', dame: 'q', tour: 'r', fou: 'b', cavalier: 'n', pion: 'p' }
const PROMOTIONS = { dame: 'q', tour: 'r', fou: 'b', cavalier: 'n' }
const CASTLING = {
  'petit roque': { w: 'e1g1', b: 'e8g8' },
  'grand roque': { w: 'e1c1', b: 'e8c8' },
}

export function normalizeFr(text) {
  let t = text.trim().toLowerCase()
  for (const [pat, rep] of PIECE_FUZZY) t = t.replace(pat, rep)
  for (const [word, digit] of Object.entries(NUMBERS_FR))
    t = t.replace(new RegExp(`\\b${word}\\b`, 'g'), digit)
  for (const [pat, letter] of FILE_PHONETIC) t = t.replace(pat, letter)
  t = t.split(/\s+et\s+/)[0].trim()
  t = t.replace(/([a-h])\s+([1-8])/g, '$1$2')
  logger.debug(MOD, 'normalizeFr', { in: text, out: t })
  return t
}

export class VoiceInput {
  constructor(chess) {
    this._chess = chess
  }

  setChess(chess) { this._chess = chess }

  parse(command) {
    if (!command) return null
    const raw = command
    command = normalizeFr(command)
    logger.info(MOD, 'parse', { raw, normalized: command })

    if (['quitter','quit','stop','fin'].includes(command)) {
      logger.info(MOD, 'commande → quit')
      return 'quit'
    }
    if (['annuler','undo','retour'].includes(command)) {
      logger.info(MOD, 'commande → undo')
      return 'undo'
    }

    for (const [text, moves] of Object.entries(CASTLING)) {
      if (command.includes(text)) {
        const side = this._chess.turn() === 'w' ? 'w' : 'b'
        const uci = moves[side]
        if (this._isLegal(uci)) {
          logger.info(MOD, 'roque', { text, uci })
          return uci
        }
        logger.warn(MOD, 'roque impossible', { text })
        return null
      }
    }

    let promoChar = null
    const promoMatch = command.match(/promotion\s+(?:en\s+)?(\w+)/)
    if (promoMatch) {
      promoChar = PROMOTIONS[promoMatch[1]] || null
      command = command.replace(/promotion\s+(?:en\s+)?\w+/, '').trim()
      logger.debug(MOD, 'promotion détectée', { piece: promoMatch[1], char: promoChar })
    }

    const isEp = command.includes('en passant')
    if (isEp) command = command.replace('en passant', '').trim()

    // Jusqu'à deux mots entre la pièce et la case : « fou en a4 », « fou prend c6 », « fou recule en a4 ».
    const pieceMove = command.match(/(roi|dame|tour|fou|cavalier|pion)(?:\s+[^\s\d]+){0,2}?\s+([a-h][1-8])\b/)
    if (pieceMove) {
      const uci = this._findPieceMove(pieceMove[1], pieceMove[2], promoChar)
      logger.info(MOD, 'branche pièce+case', { piece: pieceMove[1], to: pieceMove[2], uci })
      return uci
    }
    // Une pièce nommée (autre que le pion) n'est jamais un coup de pion vers la même case.
    const namedPiece = /\b(roi|dame|tour|fou|cavalier)\b/.test(command)

    const direct = command.match(/([a-h][1-8])\s*([a-h][1-8])/)
    if (direct) {
      const uci = this._buildUci(direct[1] + direct[2], promoChar)
      logger.info(MOD, 'branche UCI direct', { raw: direct[0], uci })
      return uci
    }

    const single = command.match(/\b([a-h][1-8])\b/)
    if (single && !namedPiece) {
      const uci = this._findPawnMove(single[1], promoChar)
      logger.info(MOD, 'branche pion', { to: single[1], uci })
      return uci
    }

    const pieceFile = command.match(/(roi|dame|tour|fou|cavalier|pion)\s+([a-h])$/)
    if (pieceFile) {
      const uci = this._findPieceOnFile(pieceFile[1], pieceFile[2])
      logger.info(MOD, 'branche pièce+colonne', { piece: pieceFile[1], file: pieceFile[2], uci })
      return uci
    }

    const pieceOnly = command.trim().match(/^(roi|dame|tour|fou|cavalier|pion)$/)
    if (pieceOnly) {
      const uci = this._pieceOnly(pieceOnly[1])
      logger.info(MOD, 'branche pièce seule', { piece: pieceOnly[1], uci })
      return uci
    }

    logger.warn(MOD, 'aucune branche reconnue', { command })
    return null
  }

  _isLegal(uci) {
    return this._chess.moves({ verbose: true }).some(m => m.from + m.to === uci || m.from + m.to + (m.promotion || '') === uci)
  }

  _buildUci(base, promo = null) {
    const from = base.slice(0, 2), to = base.slice(2, 4)
    const piece = this._chess.get(from)
    if (!promo && piece?.type === 'p' && (to[1] === '8' || to[1] === '1')) promo = 'q'
    const uci = base + (promo || '')
    if (this._isLegal(uci)) return uci
    logger.warn(MOD, '_buildUci illégal', { uci })
    return null
  }

  _findPawnMove(target, promo = null) {
    const move = this._chess.moves({ verbose: true }).find(m => m.to === target && m.piece === 'p')
    if (!move) { logger.warn(MOD, '_findPawnMove aucun pion', { target }); return null }
    return this._buildUci(move.from + target, promo)
  }

  _findPieceMove(pieceName, target, promo = null) {
    const type = PIECES[pieceName]
    const candidates = this._chess.moves({ verbose: true }).filter(m => m.to === target && m.piece === type)
    if (candidates.length === 1) return this._buildUci(candidates[0].from + target, promo)
    if (candidates.length > 1) {
      const squares = [...new Set(candidates.map(m => m.from))].sort().join(', ')
      logger.warn(MOD, 'coup ambigu', { pieceName, target, squares })
      return `AMBIG:${pieceName}:${squares}`
    }
    logger.warn(MOD, '_findPieceMove aucun candidat', { pieceName, target })
    return null
  }

  _findPieceOnFile(pieceName, fileLetter) {
    const type = PIECES[pieceName]
    const candidates = this._chess.moves({ verbose: true }).filter(m => m.piece === type && m.to[0] === fileLetter)
    if (candidates.length === 1) return candidates[0].from + candidates[0].to
    if (candidates.length > 1) {
      const squares = [...new Set(candidates.map(m => m.to))].sort().join(', ')
      logger.warn(MOD, 'pièce+colonne ambigu', { pieceName, fileLetter, squares })
      return `AMBIG:${pieceName}:${squares}`
    }
    return null
  }

  _pieceOnly(pieceName) {
    const type = PIECES[pieceName]
    const candidates = this._chess.moves({ verbose: true }).filter(m => m.piece === type)
    if (candidates.length === 1) return candidates[0].from + candidates[0].to
    if (candidates.length > 1) {
      const squares = [...new Set(candidates.map(m => m.to))].sort().join(', ')
      logger.warn(MOD, 'pièce seule ambiguë', { pieceName, squares })
      return `AMBIG:${pieceName}:${squares}`
    }
    logger.warn(MOD, 'pièce ne peut pas bouger', { pieceName })
    return null
  }
}
