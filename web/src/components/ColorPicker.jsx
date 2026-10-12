import { useStore } from '../store'

export default function ColorPicker({ onPick }) {
  const setPlayerColor = useStore(s => s.setPlayerColor)

  function pick(color) {
    setPlayerColor(color)
    onPick(color)
  }

  function pickRandom() {
    pick(Math.random() < 0.5 ? 'white' : 'black')
  }

  return (
    <div className="color-picker-overlay">
      <div className="color-picker-box">
        <h2>Choisir ta couleur</h2>
        <div className="color-picker-btns">
          <button className="btn-white" onClick={() => pick('white')}>♔ Blancs</button>
          <button className="btn-black" onClick={() => pick('black')}>♚ Noirs</button>
          <button className="btn-rand"  onClick={pickRandom}>? Hasard</button>
        </div>
      </div>
    </div>
  )
}
