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
