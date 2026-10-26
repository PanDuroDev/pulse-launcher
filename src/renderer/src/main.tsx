import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { init } from '@noriginmedia/norigin-spatial-navigation-core'
import './index.css'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
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

/**
 * The outermost boundary is the last line of defence: it catches a failure in
 * the shell itself. Individual pages add their own boundary so one broken page
 * does not take the whole launcher down with it.
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary surface={isOverlay ? 'overlay' : 'launcher'}>
      {isOverlay ? <MusicOverlay /> : <App />}
    </ErrorBoundary>
  </StrictMode>,
)
