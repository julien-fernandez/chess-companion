import { useStore } from '../store'
import { exportPgn } from '../chess/game-recorder'
import { describeAxis } from '../chess/position-analysis'

const LOG_COLORS = { info: '#8c8c8c', ok: '#50be50', err: '#d44', dim: '#666' }
const FEEDBACK_COLORS = { blunder: '#d44', mistake: '#d49a32', ok: '#50be50' }

const NEUTRAL = new Set([
  'equal', 'none', 'neither', 'balanced', 'contested', 'intact',
  'not_castled', 'neutralised', 'released',
])

function notableReadings(analysis) {
  if (!analysis) return []
  return Object.entries(analysis.axes).flatMap(([axisKey, value]) => {
    const values = Array.isArray(value) ? value : [value]
    return values
      .filter(v => !NEUTRAL.has(v))
      .map(v => ({ axisKey, valueKey: v, described: describeAxis(axisKey, v) }))
      .filter(entry => entry.described)
  })
}

export default function Panel({ onUndo, onQuit }) {
  const {
    chess, playerColor, vsAI, engineThinking,
    feedback, feedbackType, logLines, startedAt, analysis, analysisError,
  } = useStore()

  const readings = notableReadings(analysis)

  const history = chess.history()
  const inCheck = chess.inCheck()
  const turn = chess.turn() === 'w' ? 'Blancs' : 'Noirs'
  const you = playerColor === 'white' ? 'Blancs' : 'Noirs'

  let status, statusColor
  if (chess.isCheckmate()) {
    const winner = chess.turn() === 'w' ? 'Noirs' : 'Blancs'
    status = `♚ Mat — ${winner} gagnent !`
    statusColor = '#d44'
  } else if (chess.isStalemate()) {
    status = '½ Pat — match nul'
    statusColor = '#8c8c8c'
  } else if (inCheck) {
    status = '⚠ ÉCHEC !'
    statusColor = '#d49a32'
  } else {
    const mode = vsAI ? ` [vs IA, tu joues ${you}]` : ''
    status = `▶ Trait aux ${turn} (${chess.moveNumber()})${mode}`
    statusColor = '#50be50'
  }
  const pairs = []
  for (let i = 0; i < history.length; i += 2) {
    pairs.push({ n: Math.floor(i / 2) + 1, w: history[i], b: history[i + 1] || '' })
  }
  const visiblePairs = pairs.slice(-6)

  function handleExport() {
    let result = '*'
    if (chess.isCheckmate()) result = chess.turn() === 'w' ? '0-1' : '1-0'
    else if (chess.isDraw()) result = '1/2-1/2'
    exportPgn(chess, startedAt || new Date(), result)
  }

  return (
    <div className="panel">
      <div className="panel-title">♟ Chess Companion</div>

      <div className="status" style={{ color: statusColor }}>{status}</div>
      <hr className="divider" />

      {engineThinking && <div className="engine-thinking">♟ Stockfish réfléchit…</div>}

      {feedback && (
        <div className="feedback" style={{ color: FEEDBACK_COLORS[feedbackType] || '#50be50' }}>
          {feedback}
        </div>
      )}

      <hr className="divider" />

      <div className="section-label">PAYSAGE</div>
      <div className="landscape">
        {analysisError && <div className="landscape-error">Lecture impossible — {analysisError}</div>}
        {!analysisError && readings.length === 0 && (
          <div className="landscape-flat">Position sans déséquilibre notable.</div>
        )}
        {readings.map(({ axisKey, valueKey, described }) => (
          <div key={`${axisKey}-${valueKey}`} className="landscape-line">
            <span className="landscape-facet">{described.facet}</span>
            <span className="landscape-value">{described.value}</span>
          </div>
        ))}
      </div>

      <hr className="divider" />

      <div className="section-label">HISTORIQUE</div>
      <div className="move-history">
        {visiblePairs.map(p => (
          <div key={p.n} className="move-pair">
            <span className="move-num">{p.n}.</span>
            <span className="move-w">{p.w}</span>
            <span className="move-b">{p.b}</span>
          </div>
        ))}
      </div>

      <hr className="divider" />
      <div className="section-label">LOG VOIX</div>
      <div className="log-panel">
        {logLines.slice(-4).map((l, i) => (
          <div key={i} className="log-line" style={{ color: LOG_COLORS[l.type] || '#8c8c8c' }}>
            {l.msg}
          </div>
        ))}
      </div>

      <div className="panel-actions">
        <button onClick={onUndo} title="Annuler le dernier coup">↩ Undo</button>
        <button onClick={handleExport} title="Exporter en PGN">⬇ PGN</button>
        <button onClick={onQuit} title="Terminer la partie" className="btn-quit">■ Fin</button>
      </div>
    </div>
  )
}
