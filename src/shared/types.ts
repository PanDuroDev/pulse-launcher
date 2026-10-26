export type GameSource = 'steam' | 'epic' | 'manual' | 'start-menu'

export type ArtKind = 'cover' | 'hero' | 'icon' | 'logo'

export type LaunchKind = 'steam' | 'epic' | 'exe' | 'shortcut'

export type ScanPhase = 'scanning' | 'done' | 'error'

export interface LaunchTarget {
  kind: LaunchKind
  target: string
  args?: string[]
  workDir?: string
}

export interface GameProcessHints {
  executable?: string
  installDir?: string
  names?: string[]
}

/**
 * How strongly a running process was tied to a game.
 *
 * - `exact`: the process executable is the game's own executable.
 * - `directory`: the process lives inside the game's install directory, which
 *   may be a child process rather than the main window owner.
 * - `name`: only the process name matched (no usable path).
 */
export type ProcessMatchConfidence = 'exact' | 'directory' | 'name'

/** Evidence about a running game, safe to show in the renderer (no PID). */
export interface GameRunState {
  confidence: ProcessMatchConfidence
  /** Several equally strong candidates matched, so no single process is identified. */
  ambiguous: boolean
  /** How many processes matched the game's hints in total. */
  processCount: number
}

export interface RunningGameInfo extends GameRunState {
  gameId: string
}

export interface GameRecord {
  id: string
  source: GameSource
  name: string
  subtitle?: string
  installed: boolean
  appId?: string
  sizeBytes?: number
  addedAt?: number
  launch: LaunchTarget
  process?: GameProcessHints
  artCandidates?: Partial<Record<ArtKind, string[]>>
  /** Absolute path of a user-chosen cover/hero image for a manual game. */
  manualArtwork?: string
  accent: string
}

/**
 * User-chosen order for library rows.
 *
 * - `recent` puts games with play history first, newest first.
 * - `title` is the stable A–Z order new libraries start with.
 * - `added` puts the most recently discovered or added games first.
 */
export type LibrarySort = 'recent' | 'title' | 'added'

export interface GameSummary {
  id: string
  source: GameSource
  name: string
  subtitle?: string
  installed: boolean
  appId?: string
  sizeBytes?: number
  addedAt?: number
  lastPlayedAt?: number
  playCount?: number
  running: boolean
  /** Present when the game is running; explains how the process was detected. */
  runState?: GameRunState
  /** Persisted per-game favorite flag, restored from the settings file. */
  favorite: boolean
  /** True when a manual game uses a cover image the user picked. */
  customArtwork?: boolean
  /** Launch path of a manual game, shown and edited on its details page. */
  executable?: string
  accent: string
}

export interface ScanProgress {
  source: GameSource
  phase: ScanPhase
  found: number
  message?: string
}

export interface ScanError {
  source: GameSource
  message: string
}

export interface ScanResult {
  games: GameSummary[]
  errors: ScanError[]
  warnings: string[]
  counts: Partial<Record<GameSource, number>>
  scannedAt: number
  /** Sources whose scan failed and whose previous games were kept from cache. */
  staleSources: GameSource[]
}

export interface ArtworkResult {
  gameId: string
  kind: ArtKind
  url: string | null
}

export interface LaunchResult {
  ok: boolean
  error?: string
  /**
   * `ok: true` only means the platform accepted the launch request. This flag
   * marks that the game has not been observed running yet, so the UI must not
   * present the request as proof that the game started.
   */
  pendingObservation?: boolean
}

export type GameControlAction = 'focus' | 'close' | 'force-close'

export type GameControlErrorCode =
  | 'not-running'
  | 'ambiguous-process'
  | 'unverified-identity'
  | 'no-window'
  | 'confirmation-required'
  | 'close-not-requested'
  | 'grace-period'
  | 'failed'

/**
 * Result of a request that targets the verified game process. The renderer
 * never sends a PID or an executable: every action is resolved in main from
 * the identity the process watcher verified.
 */
export interface GameControlResult {
  ok: boolean
  action: GameControlAction
  error?: string
  errorCode?: GameControlErrorCode
  /** Milliseconds until a force quit becomes available after a close request. */
  retryAfterMs?: number
}

export interface AddManualResult {
  ok: boolean
  game?: GameSummary
  error?: string
}

/** A shortcut to a useful folder in the in-app file picker. */
export interface PickerLocation {
  id: string
  label: string
  path: string
  kind: 'place' | 'drive'
}

/** What the in-app picker is currently looking for. */
export type PickerKind = 'game' | 'image'

/** One row in the picker: a subfolder or a launchable/selectable file. */
export interface PickerEntry {
  name: string
  path: string
  kind: 'directory' | 'file'
  extension?: 'exe' | 'lnk' | 'png' | 'jpg' | 'jpeg' | 'webp' | 'avif'
}

/**
 * Result of reading one folder for the picker. Only names and paths cross the
 * IPC boundary; file contents are never read.
 */
export interface DirectoryListing {
  ok: boolean
  path?: string
  parent?: string | null
  crumbs?: Array<{ name: string; path: string }>
  entries?: PickerEntry[]
  truncated?: boolean
  error?: string
}

export interface PickerRoots {
  places: PickerLocation[]
}

export interface RemoveManualResult {
  ok: boolean
  error?: string
}

/** Fields a user may change on a manually added game. */
export interface UpdateManualGameInput {
  gameId: string
  /** New display name; omitted keeps the current one. */
  name?: string
  /** New .exe/.lnk path; omitted keeps the current one. */
  executable?: string
  /** Absolute image path, or null to drop the custom cover. */
  artwork?: string | null
}

export interface UpdateManualResult {
  ok: boolean
  game?: GameSummary
  /**
   * Set when a new executable moved the game to a new catalog id. Favorites,
   * play history, and the stored selection follow the game.
   */
  previousId?: string
  error?: string
}

export interface FavoriteResult {
  ok: boolean
  /** The favorite state after the toggle. */
  favorite?: boolean
  error?: string
}

/** Result of persisting the game the user last had selected. */
export interface SelectionResult {
  ok: boolean
  error?: string
}

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

export interface ManualGame {
  id: string
  name: string
  executable: string
  addedAt: number
  /** Absolute path of a user-chosen cover/hero image, if any. */
  artwork?: string
}

export interface PlayHistoryEntry {
  lastPlayedAt: number
  playCount: number
}

export type PlayHistory = Record<string, PlayHistoryEntry>

export type MusicRepeat = 'off' | 'all' | 'one'

export type MusicPlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error'

/**
 * One playable file. Audio never travels over IPC: the renderer points an
 * `<audio>` element at `streamUrl`, which the main process serves from the
 * `app://` protocol with Range support so seeking works.
 */
export interface MusicTrack {
  id: string
  title: string
  artist: string
  album: string
  /** Track length in milliseconds; 0 when the tag reader could not measure it. */
  durationMs: number
  /** `app://` URL of the embedded cover, or null when the file has none. */
  artworkUrl: string | null
  streamUrl: string
  /** Display name of the folder the file was found in, used to group the list. */
  folder: string
}

export interface MusicFolder {
  path: string
  trackCount: number
}

export interface MusicLibrarySnapshot {
  tracks: MusicTrack[]
  folders: MusicFolder[]
  scanning: boolean
  /** Files parsed so far in the active scan. */
  scannedFiles: number
  /** Files skipped because they were unreadable; never fatal. */
  skippedFiles: number
  scanError: string | null
  scannedAt: number | null
}

export type MusicOverlayPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'

export interface MusicOverlaySettings {
  enabled: boolean
  alwaysOnTop: boolean
  position: MusicOverlayPosition
  /** Global accelerator, or '' when the shortcut is turned off. */
  shortcut: string
}

/** The subset of a track the overlay needs; it never receives the whole library. */
export interface MusicOverlayTrack {
  id: string
  title: string
  artist: string
  album: string
  artworkUrl: string | null
}

export interface MusicOverlayState {
  status: MusicPlaybackStatus
  track: MusicOverlayTrack | null
  positionMs: number
  durationMs: number
  volume: number
  repeat: MusicRepeat
  shuffle: boolean
}

/** Sent by the overlay window; `close` and `focus` are handled in main. */
export type MusicOverlayAction =
  | { type: 'toggle-play' }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'seek'; positionMs: number }
  | { type: 'close' }
  | { type: 'focus' }

/** Relayed to the launcher window, where the audio element lives. */
export type MusicCommand =
  | { type: 'toggle-play' }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'seek'; positionMs: number }
  | { type: 'focus' }

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

export interface LauncherApi {
  catalog: {
    list: () => Promise<GameSummary[]>
    staleSources: () => Promise<GameSource[]>
    refresh: () => Promise<ScanResult>
    artwork: (gameId: string, kind: ArtKind) => Promise<ArtworkResult>
    /** Adds or removes a game from Favorites and persists the choice. */
    toggleFavorite: (gameId: string) => Promise<FavoriteResult>
    onChanged: (listener: (games: GameSummary[]) => void) => () => void
    onRunningChanged: (listener: (games: RunningGameInfo[]) => void) => () => void
    onScanProgress: (listener: (progress: ScanProgress) => void) => () => void
    onStaleChanged: (listener: (sources: GameSource[]) => void) => () => void
  }
  launch: (gameId: string) => Promise<LaunchResult>
  game: {
    /** Brings the verified game window to the foreground. */
    focus: (gameId: string) => Promise<GameControlResult>
    /** Asks the verified game window to close via WM_CLOSE. */
    close: (gameId: string) => Promise<GameControlResult>
    /** Terminates the verified process; only after a close request plus a grace period. */
    forceClose: (gameId: string, confirm: boolean) => Promise<GameControlResult>
  }
  settings: {
    get: () => Promise<Settings>
    update: (update: SettingsUpdate) => Promise<Settings>
    removeManual: (gameId: string) => Promise<RemoveManualResult>
    onChanged: (listener: (settings: Settings) => void) => () => void
  }
  /**
   * The game the user last had selected. It is stored separately from Settings
   * because it changes on every focus move and must not wake settings listeners.
   */
  selection: {
    get: () => Promise<string | null>
    set: (gameId: string | null) => Promise<SelectionResult>
  }
  /** In-app browsing for local .exe/.lnk files and image files. No native dialog. */
  library: {
    roots: () => Promise<PickerRoots>
    list: (directory: string, kind?: PickerKind) => Promise<DirectoryListing>
    add: (filePath: string) => Promise<AddManualResult>
    /** Edits a manual game and returns its updated summary. */
    update: (input: UpdateManualGameInput) => Promise<UpdateManualResult>
  }
  /** Local music library, the full-page player and the always-on-top overlay. */
  music: {
    list: () => Promise<MusicLibrarySnapshot>
    rescan: () => Promise<MusicLibrarySnapshot>
    /** Opens the native folder picker and scans every chosen folder. */
    addFolder: () => Promise<MusicLibrarySnapshot>
    removeFolder: (folder: string) => Promise<MusicLibrarySnapshot>
    onChanged: (listener: (snapshot: MusicLibrarySnapshot) => void) => () => void
    overlay: {
      get: () => Promise<MusicOverlaySettings>
      update: (update: Partial<MusicOverlaySettings>) => Promise<MusicOverlaySettings>
      /** Shows the overlay when hidden, hides it when shown. Returns visibility. */
      toggle: () => Promise<boolean>
      /** Last state known to main, used by the overlay when it mounts. */
      state: () => Promise<MusicOverlayState | null>
      /** Fire-and-forget: called by the launcher whenever playback changes. */
      publish: (state: MusicOverlayState) => void
      onCommand: (listener: (command: MusicCommand) => void) => () => void
      onState: (listener: (state: MusicOverlayState) => void) => () => void
    }
    /** Overlay window only: forwards a transport action to the launcher window. */
    action: (action: MusicOverlayAction) => void
  }
  app: {
    info: () => Promise<AppInfo>
    hide: () => Promise<void>
    quit: () => Promise<void>
    openLogs: () => Promise<void>
  }
}

export const DEFAULT_SETTINGS: Settings = {
  showStartMenuApps: false,
  steamGridDbApiKey: '',
  hideCursorAfterMs: 2500,
  motion: 'system',
  // Fullscreen without always-on-top keeps Alt+Tab and other windows usable;
  // kiosk stays an explicit choice for dedicated machines.
  windowMode: 'fullscreen',
  returnAfterGame: true,
  // A stable A–Z order is the least surprising first view of a new library.
  librarySort: 'title',
  // Sound is part of the launcher's feel, but it stays one switch away.
  uiSounds: true,
}
