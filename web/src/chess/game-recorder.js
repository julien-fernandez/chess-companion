/** Enregistrement des parties en IndexedDB. */
import { openDB } from 'idb'

const DB_NAME = 'chess-companion'
const STORE = 'games'

async function getDb() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
        store.createIndex('date', 'date')
      }
    },
  })
}

function buildPgn(chess, startedAt, result, white = 'Julien', black = '?') {
  const date = startedAt.toISOString().slice(0, 10).replace(/-/g, '.')
  const moves = chess.history().join(' ')
  return [
    `[Event "OTB"]`,
    `[Site "?"]`,
    `[Date "${date}"]`,
    `[White "${white}"]`,
    `[Black "${black}"]`,
    `[Result "${result}"]`,
    '',
    moves + (result !== '*' ? ` ${result}` : ''),
  ].join('\n')
}

export async function saveGame(chess, startedAt, result = '*') {
  const pgn = buildPgn(chess, startedAt, result)
  const duration = Math.round((Date.now() - startedAt.getTime()) / 1000)
  const db = await getDb()
  await db.add(STORE, {
    date: startedAt.toISOString(),
    pgn,
    result,
    movesCount: chess.history().length,
    durationSeconds: duration,
  })
}

export async function listGames() {
  const db = await getDb()
  return db.getAll(STORE)
}

export function exportPgn(chess, startedAt, result = '*') {
  const pgn = buildPgn(chess, startedAt, result)
  const blob = new Blob([pgn], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `chess_${startedAt.toISOString().slice(0,16).replace(/[T:]/g, '-')}.pgn`
  a.click()
  URL.revokeObjectURL(url)
}
