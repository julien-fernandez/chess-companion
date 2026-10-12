import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import Review from './components/Review.jsx'
import Judgment from './components/Judgment.jsx'
import { installErrorCapture, logger } from './logger.js'
import { ensureSession } from './session.js'

installErrorCapture()
// En dev, pas de nginx devant l'API : la révision garde son formulaire de mot de passe.
if (!import.meta.env.DEV) ensureSession()

const PAGES = { '#revision': Review, '#jugement': Judgment }
const Page = PAGES[window.location.hash] ?? App
logger.info('page', 'ouverte', { hash: window.location.hash, agent: navigator.userAgent })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Page />
  </StrictMode>,
)
