import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { init } from '@noriginmedia/norigin-spatial-navigation-core'
import './index.css'
import App from './App'
import { MusicOverlay } from './components/launcher/MusicOverlay'

/**
 * The overlay window loads this same bundle with `#/overlay`. Branching before
 * the launcher shell mounts keeps the overlay free of the store bootstrap, boot
 * animation, and spatial-navigation graph.
 */
const isOverlay = window.location.hash.startsWith('#/overlay')

if (isOverlay) {
  document.documentElement.classList.add('overlay-surface')
} else {
  init({
    shouldFocusDOMNode: true,
    shouldUseNativeEvents: true,
    useGetBoundingClientRect: true,
    debug: false,
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isOverlay ? <MusicOverlay /> : <App />}</StrictMode>,
)
