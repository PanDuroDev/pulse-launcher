import type {
  GameSource,
  ArtKind,
  LaunchKind,
  ScanPhase,
  LaunchTarget,
  GameProcessHints,
  ProcessMatchConfidence,
  GameRunState,
  RunningGameInfo,
  GameRecord,
  GameSummary,
  ScanProgress,
  ScanError,
  ScanResult,
  ArtworkResult,
  LaunchResult,
  GameControlAction,
  GameControlErrorCode,
  GameControlResult,
  AddManualResult,
  PickerLocation,
  PickerKind,
  PickerEntry,
  DirectoryListing,
  PickerRoots,
  RemoveManualResult,
  UpdateManualGameInput,
  UpdateManualResult,
  FavoriteResult,
  SelectionResult,
  ManualGame,
  PlayHistoryEntry,
  PlayHistory,
} from './contracts/games'

export * from './contracts/games'

import type {
  MusicLibrarySnapshot,
  MusicOnlineSearchResult,
  MusicYouTubeSearchResult,
  MusicYouTubeResolveResult,
  MusicYouTubeStatus,
  MusicYouTubeUpdate,
  MusicOverlaySettings,
  MusicOverlayState,
  MusicCommand,
  MusicOverlayAction,
} from './contracts/music'

import type { Settings, SettingsUpdate } from './contracts/settings'
export * from './contracts/music'
export * from './contracts/settings'

/**
 * A renderer crash forwarded to the main process so it reaches the log file.
 * The renderer cannot write logs itself, and an ErrorBoundary needs a durable
 * record of what happened after the screen has already been replaced.
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
    /** Stops a scan in progress; the partial index is kept. */
    cancelScan: () => Promise<MusicLibrarySnapshot>
    /** Opens the native folder picker and scans every chosen folder. */
    addFolder: () => Promise<MusicLibrarySnapshot>
    removeFolder: (folder: string) => Promise<MusicLibrarySnapshot>
    onChanged: (listener: (snapshot: MusicLibrarySnapshot) => void) => () => void
    /** Searches the legal online catalogs and returns the merged ranking. */
    online: { search: (query: string) => Promise<MusicOnlineSearchResult> }
    /**
     * YouTube search plus on-demand MP3 extraction. `streamUrl` on a search
     * result is empty until `resolve` has prepared the audio file.
     */
    youtube: {
      search: (query: string) => Promise<MusicYouTubeSearchResult>
      resolve: (videoId: string) => Promise<MusicYouTubeResolveResult>
      /** Stops an extraction started by `resolve`; resolves once the process tree is gone. */
      cancel: (videoId: string) => Promise<boolean>
      status: () => Promise<MusicYouTubeStatus>
      updateSettings: (update: MusicYouTubeUpdate) => Promise<MusicYouTubeStatus>
      /** Deletes one cached MP3 and its cover. */
      removeCached: (videoId: string) => Promise<MusicYouTubeStatus>
      /** Deletes every extracted MP3. Settings and tools are untouched. */
      clearCache: () => Promise<MusicYouTubeStatus>
      open: (videoId: string) => Promise<void>
    }
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
    /** Records a renderer crash in the main log so it survives the white screen. */
    reportRendererError: (report: RendererErrorReport) => void
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
