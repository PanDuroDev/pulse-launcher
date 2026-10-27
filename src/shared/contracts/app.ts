/**
 * Main-process app metadata and renderer error-report contracts.
 *
 * These types cross the preload boundary; keep them data-only and serializable.
 */
export interface RendererErrorReport {
  message: string
  stack: string
  componentStack: string
  /** Which surface failed, so the log line is readable without context. */
  surface: 'launcher' | 'overlay'
}

export interface AppInfo {
  version: string
  electron: string
  chrome: string
  node: string
  platform: string
  isPackaged: boolean
  demo: boolean
  /** Whether the global restore shortcut could be registered on this machine. */
  restoreShortcut: {
    accelerator: string
    registered: boolean
  }
  userDataPath: string
  logsPath: string
  artworkPath: string
}
