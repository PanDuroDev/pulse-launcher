/**
 * User-chosen order for library rows.
 *
 * - `recent` puts games with play history first, newest first.
 * - `title` is the stable A–Z order new libraries start with.
 * - `added` puts the most recently discovered or added games first.
 */
export type LibrarySort = 'recent' | 'title' | 'added'

export type MotionPreference = 'system' | 'reduced' | 'full'

/**
 * How the launcher window is presented.
 *
 * - `windowed` keeps a normal frame and the taskbar, for development and
 *   desktop use.
 * - `fullscreen` is borderless fullscreen without always-on-top, so Alt+Tab and
 *   other windows keep working normally.
 * - `kiosk` is fullscreen, always-on-top, and hidden from the taskbar. It is an
 *   opt-in for dedicated machines, restored with the tray icon or Ctrl+Alt+L.
 */
export type WindowMode = 'windowed' | 'fullscreen' | 'kiosk'

export interface Settings {
  showStartMenuApps: boolean
  steamGridDbApiKey: string
  hideCursorAfterMs: number
  motion: MotionPreference
  windowMode: WindowMode
  /**
   * Bring Pulse back automatically after a game it launched exits. Requires the
   * game to be observed running first, so a launch that never started a process
   * cannot bounce the launcher back immediately.
   */
  returnAfterGame: boolean
  /** Order used by the All Games row; persisted so it survives a restart. */
  librarySort: LibrarySort
  /** Interface sounds for hover, press, selection and page changes. */
  uiSounds: boolean
}

export interface SettingsUpdate {
  showStartMenuApps?: boolean
  steamGridDbApiKey?: string
  hideCursorAfterMs?: number
  motion?: MotionPreference
  windowMode?: WindowMode
  returnAfterGame?: boolean
  librarySort?: LibrarySort
  uiSounds?: boolean
}
