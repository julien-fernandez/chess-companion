import { useState, useEffect, useCallback } from 'react'
import { Chessboard } from 'react-chessboard'
import { useStore } from './store'
import Panel from './components/Panel'
import MicControls from './components/MicControls'
import ColorPicker from './components/ColorPicker'
import { assessMove, bestMove } from './chess/coach'
import { speak, describeMove } from './chess/tts'
import { describeLandscape } from './chess/landscape-speech'
import { saveGame } from './chess/game-recorder'
import { logger } from './logger'
import './App.css'

const BOARD_PX = 560

export default function App() {
  const {
    chess, fen, lastMove, playerColor, vsAI,
    coachEnabled,
    applyMove, undoMove, resetGame, setEngineThinking,
    setFeedback, addLog,
  } = useStore()

  const [showColorPicker, setShowColorPicker] = useState(true)
  const [selectedSquare, setSelectedSquare] = useState(null)
  const [legalSquares, setLegalSquares] = useState({})

  const squareStyles = {}
  if (lastMove) {
    squareStyles[lastMove.from] = { backgroundColor: 'rgba(205,210,106,0.5)' }
    squareStyles[lastMove.to]   = { backgroundColor: 'rgba(205,210,106,0.5)' }
  }
  if (selectedSquare) {
    squareStyles[selectedSquare] = { backgroundColor: 'rgba(130,151,105,0.75)' }
  }
  Object.assign(squareStyles, legalSquares)

  const triggerEngine = useCallback(async () => {
    const st = useStore.getState()
    if (st.engineThinking || st.chess.isGameOver()) return
    setEngineThinking(true)
    addLog('Stockfish réfléchit…', 'info')
    try {
      const mv = await bestMove(st.chess.fen())
      if (mv && mv !== '(none)') {
        const st2 = useStore.getState()
        const moveMeta = st2.chess.moves({ verbose: true })
          .find(m => m.from + m.to === mv || m.from + m.to + (m.promotion || '') === mv)
        if (moveMeta) {
          speak(describeMove(st2.chess, moveMeta))
          applyMove(mv)
          setFeedback(`Stockfish joue ${moveMeta.san}`, 'ok')
          logger.info('partie', 'stockfish', { san: moveMeta.san })
          addLog(`Stockfish: ${moveMeta.san}`, 'ok')
        }
      }
    } catch (e) {
      addLog(`Engine err: ${e.message}`, 'err')
      logger.error('partie', 'stockfish en erreur', e)
    } finally {
      setEngineThinking(false)
    }
  }, [])

  const executeMove = useCallback(async (uci) => {
    const chess_ = useStore.getState().chess
    const moveMeta = chess_.moves({ verbose: true })
      .find(m => m.from + m.to === uci || m.from + m.to + (m.promotion || '') === uci)
    if (!moveMeta) {
      setFeedback(`Coup illégal : ${uci}`, 'ok')
      speak('Coup illégal.')
      addLog(`Illégal: ${uci}`, 'err')
      return false
    }

    speak(describeMove(chess_, moveMeta))
    const record = applyMove(uci)
    if (!record) return false
    logger.info('partie', 'coup', { san: moveMeta.san, fenBefore: record.fenBefore })
    setSelectedSquare(null)
    setLegalSquares({})

    if (coachEnabled) {
      try {
        const ev = await assessMove(record.fenBefore, uci)
        if (ev.feedback) {
          setFeedback(ev.feedback, ev.isBlunder ? 'blunder' : 'mistake')
          logger.info('partie', 'coach', { feedback: ev.feedback, blunder: ev.isBlunder })
          speak(ev.feedback)
          addLog(`Coach: ${ev.feedback.slice(0, 45)}`, ev.isBlunder ? 'err' : 'ok')
        } else {
          const landscape = describeLandscape(useStore.getState().analysis)
          setFeedback(landscape)
          if (landscape) speak(landscape)
        }
      } catch (e) {
        addLog(`Coach err: ${e.message}`, 'err')
        logger.error('partie', 'coach en erreur', e)
      }
    }

    const st = useStore.getState()
    const aiColor = st.playerColor === 'white' ? 'b' : 'w'
    if (st.vsAI && !st.chess.isGameOver() && st.chess.turn() === aiColor) {
      triggerEngine()
    }
    return true
  }, [coachEnabled])


  useEffect(() => {
    if (!vsAI || chess.isGameOver()) return
    const aiColor = playerColor === 'white' ? 'b' : 'w'
    if (chess.turn() === aiColor) triggerEngine()
  }, [vsAI])

  function onSquareClick({ square }) {
    const st = useStore.getState()
    if (st.chess.isGameOver()) return
    const myColor = st.playerColor === 'white' ? 'w' : 'b'
    if (st.chess.turn() !== myColor) return

    const piece = st.chess.get(square)

    if (selectedSquare === null) {
      if (piece && piece.color === myColor) {
        setSelectedSquare(square)
        const moves = st.chess.moves({ square, verbose: true })
        const styles = {}
        moves.forEach(m => {
          styles[m.to] = {
            background: st.chess.get(m.to)
              ? 'radial-gradient(circle, rgba(100,111,64,0.8) 85%, transparent 85%)'
              : 'radial-gradient(circle, rgba(100,111,64,0.5) 30%, transparent 30%)',
          }
        })
        setLegalSquares(styles)
      }
      return
    }

    if (square === selectedSquare) {
      setSelectedSquare(null); setLegalSquares({}); return
    }

    const p = st.chess.get(selectedSquare)
    const promo = p?.type === 'p' && (square[1] === '8' || square[1] === '1') ? 'q' : undefined
    const uci = selectedSquare + square + (promo || '')
    const legal = st.chess.moves({ verbose: true })
      .some(m => m.from + m.to + (m.promotion || '') === uci || m.from + m.to === uci)

    if (legal) {
      setSelectedSquare(null); setLegalSquares({})
      executeMove(uci)
    } else if (piece && piece.color === myColor) {
      setSelectedSquare(square)
      const moves = st.chess.moves({ square, verbose: true })
      const styles = {}
      moves.forEach(m => {
        styles[m.to] = {
          background: st.chess.get(m.to)
            ? 'radial-gradient(circle, rgba(100,111,64,0.8) 85%, transparent 85%)'
            : 'radial-gradient(circle, rgba(100,111,64,0.5) 30%, transparent 30%)',
        }
      })
      setLegalSquares(styles)
    } else {
      setSelectedSquare(null); setLegalSquares({})
    }
  }

  function onPieceDrop({ piece, sourceSquare, targetSquare }) {
    const st = useStore.getState()
    const myColor = st.playerColor === 'white' ? 'w' : 'b'
    if (st.chess.turn() !== myColor) return false
    const promo = piece?.[1]?.toLowerCase() === 'p' && (targetSquare[1] === '8' || targetSquare[1] === '1') ? 'q' : undefined
    executeMove(sourceSquare + targetSquare + (promo || ''))
    return true
  }

  function handleColorPick(color) {
    setShowColorPicker(false)
    resetGame()
    if (vsAI && color === 'black') setTimeout(triggerEngine, 400)
  }

  function handleUndo() {
    undoMove()
    if (vsAI) undoMove()
  }

  async function handleQuit() {
    const st = useStore.getState()
    let result = '*'
    if (st.chess.isCheckmate()) result = st.chess.turn() === 'w' ? '0-1' : '1-0'
    else if (st.chess.isDraw()) result = '1/2-1/2'
    if (st.chess.history().length > 0)
      await saveGame(st.chess, st.startedAt || new Date(), result)
    setShowColorPicker(true)
  }

  function handleVoiceMove(uci) {
    if (uci === 'undo') { handleUndo(); return }
    executeMove(uci)
  }

  return (
    <div className="app">
      <div className="board-area">
        <Chessboard
          options={{
            position: fen,
            boardOrientation: playerColor,
            squareStyles,
            animationDurationInMs: 200,
            boardStyle: { width: `${BOARD_PX}px`, height: `${BOARD_PX}px` },
            onSquareClick,
            onPieceDrop,
          }}
        />
      </div>
      <div className="side-panel">
        <Panel onUndo={handleUndo} onQuit={handleQuit} />
        <MicControls onMove={handleVoiceMove} />
      </div>
      {showColorPicker && <ColorPicker onPick={handleColorPick} />}
    </div>
  )
}
