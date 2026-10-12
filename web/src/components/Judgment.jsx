import { useCallback, useEffect, useMemo, useState } from 'react'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import { REASON_TAGS, VERDICTS, VERDICT_LABEL, frenchSan, reasonLabel } from '../chess/judgment'
import { api } from '../api'
import { logger } from '../logger'
import './Judgment.css'

const MOD = 'jugement'

const PLAYED_STYLE = { backgroundColor: 'rgba(255, 214, 10, 0.4)' }
const OUTCOME_LINE = { recalled: 'Juste.', recalled_after_retry: 'Presque : un cran d’écart.', failed: 'Non.' }


/** Des cases en fraction de pixel laissent passer le fond entre les rangées, sur écran de téléphone. */
const boardWidth = () => Math.floor(Math.min(448, window.innerWidth - 32) / 8) * 8
const isDue = (card) => card.due_at !== null && new Date(card.due_at) <= new Date()
const moveNumber = (ply) => `${Math.ceil(ply / 2)}${ply % 2 ? '.' : '…'}`

/** Éval du point de vue de Julien : `cp` est celle des Blancs, on la retourne quand il a les Noirs. */
function pawns(whiteCp, side) {
  const cp = side === 'black' ? -whiteCp : whiteCp
  if (Math.abs(cp) >= 9000) return cp > 0 ? 'mat pour toi' : 'mat contre toi'
  return (cp / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'always' })
}

function Reason({ card }) {
  if (card.expected_verdict === 'kept') return <p>Rien de perdu.</p>
  const layers = card.reason?.layers ?? []
  const changes = card.reason?.changes ?? []
  return (
    <>
      {layers.length === 0 ? <p>Aucune raison détectée par l’ontologie.</p> : layers.map(layer => (
        <div key={layer.layer} className="judgment-layer">
          <strong>Étage {layer.layer} · {layer.label}</strong>
          <ul>{layer.items.map((item, i) => <li key={i}>{item.why}</li>)}</ul>
        </div>
      ))}
      {changes.length > 0 && (
        <div className="judgment-changes">
          <p className="judgment-changes-title">Ce qui a changé (sans sens connu)</p>
          {changes.map(layer => (
            <div key={layer.layer}>
              <strong>Étage {layer.layer} · {layer.label}</strong>
              <ul>{layer.items.map((item, i) => <li key={i}>{item.why}</li>)}</ul>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

export default function Judgment() {
  const [auth, setAuth] = useState('checking')
  const [password, setPassword] = useState('')
  const [cards, setCards] = useState([])
  const [index, setIndex] = useState(0)
  const [answer, setAnswer] = useState(null)
  const [reasonTag, setReasonTag] = useState(null)
  const [note, setNote] = useState('')
  const [reasonWrong, setReasonWrong] = useState(false)
  const [status, setStatus] = useState('')

  const load = useCallback(() => api('judgments').then(({ status: code, data }) => {
    if (code === 401) { setAuth('login'); return }
    setAuth('ready')
    if (code !== 200 || !Array.isArray(data)) { setStatus('Cartes indisponibles.'); return }
    setCards(data.filter(isDue))
    setIndex(0)
  }), [])

  useEffect(() => { load() }, [load])

  const card = cards[index]
  const played = useMemo(() => (card ? new Chess(card.fen).move(card.san) : null), [card])

  async function login(e) {
    e.preventDefault()
    const { status: code } = await api('login', { password })
    if (code === 200) load()
    else setStatus('Mot de passe refusé.')
  }

  async function judge(verdict) {
    const { status: code, data } = await api('judgment-review', { game_id: card.game_id, ply: card.ply, verdict })
    if (code !== 201) { setStatus(data?.error ?? 'Réponse non enregistrée.'); return }
    logger.info(MOD, 'verdict', { game_id: card.game_id, ply: card.ply, verdict, outcome: data?.outcome })
    setStatus('')
    setAnswer({ ...data, verdict })
  }

  async function next() {
    if (reasonTag || note.trim() || reasonWrong) {
      const { status: code } = await api('judgment-annotation',
        { id: answer.id, reason_tag: reasonTag, note: note.trim(), reason_wrong: reasonWrong })
      if (code !== 201) { setStatus('Raison non enregistrée.'); return }
      logger.info(MOD, 'annotation', { id: answer.id, reasonTag, reasonWrong, note: Boolean(note.trim()) })
    }
    setAnswer(null); setReasonTag(null); setNote(''); setReasonWrong(false)
    setIndex(i => i + 1)
  }

  if (auth === 'checking') return <div className="judgment"><p>Connexion…</p></div>

  if (auth === 'login') return (
    <div className="judgment">
      <h1>Jugement</h1>
      <form onSubmit={login} className="judgment-form">
        <input type="password" value={password} onChange={e => setPassword(e.target.value)}
               placeholder="Mot de passe" autoComplete="current-password" />
        <button type="submit">Entrer</button>
      </form>
      <p className="judgment-status">{status}</p>
    </div>
  )

  if (!card) return (
    <div className="judgment">
      <h1>Jugement</h1>
      <p>Aucune carte à juger aujourd’hui.</p>
      <p className="judgment-status">{status}</p>
    </div>
  )

  const size = boardWidth()
  const mine = card.mover === card.julien_side
  return (
    <div className="judgment">
      <h1>Jugement</h1>
      <p className="judgment-count">{index + 1} / {cards.length}</p>
      <p>{mine ? 'Ton coup' : `Coup de ${card.opponent}`} : <strong>{moveNumber(card.ply)}{frenchSan(card.san)}</strong></p>
      <div className="judgment-board" style={{ width: size, height: size }}>
        <Chessboard options={{
          position: card.fen,
          boardOrientation: card.julien_side,
          allowDragging: false,
          squareStyles: played ? { [played.from]: PLAYED_STYLE, [played.to]: PLAYED_STYLE } : {},
        }} />
      </div>
      {!answer ? (
        <>
          <p>Ce coup, {mine ? 'pour toi' : 'pour lui'} :</p>
          <div className="judgment-verdicts">
            {VERDICTS.map(v => <button key={v} onClick={() => judge(v)}>{VERDICT_LABEL[v]}</button>)}
          </div>
        </>
      ) : (
        <div className="judgment-back">
          <p className={`judgment-outcome judgment-${answer.outcome}`}>
            {OUTCOME_LINE[answer.outcome]} {VERDICT_LABEL[card.expected_verdict]} :
            {' '}{Math.max(0, card.win_pct_lost).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} % perdus.
          </p>
          <p>Éval (de ton côté) : {pawns(card.eval_before_cp, card.julien_side)} → {pawns(card.eval_after_cp, card.julien_side)}</p>
          {card.best_san !== card.san && (
            <p>Mieux : <strong>{frenchSan(card.best_san)}</strong> — {card.best_pv.slice(0, 6).map(frenchSan).join(' ')}</p>
          )}
          <Reason card={card} />
          <p>Ce que le coup a fait, selon toi :</p>
          <div className="judgment-reasons">
            {REASON_TAGS.map(tag => (
              <button key={tag} className={reasonTag === tag ? 'chosen' : ''}
                      onClick={() => setReasonTag(t => (t === tag ? null : tag))}>{reasonLabel(tag)}</button>
            ))}
          </div>
          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Note (facultatif)" maxLength={500} />
          <label className="judgment-wrong">
            <input type="checkbox" checked={reasonWrong} onChange={e => setReasonWrong(e.target.checked)} />
            La raison affichée est fausse
          </label>
          <button className="judgment-next" onClick={next}>Suivant</button>
        </div>
      )}
      <p className="judgment-status">{status}</p>
    </div>
  )
}
