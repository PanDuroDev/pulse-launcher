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
  /** Online catalog metadata; local files leave these unset. */
  provider?: MusicProvider
  publisher?: string
  streamKind?: MusicOnlineStreamKind
  license?: string | null
  sourceUrl?: string | null
  /** Set for YouTube results; `streamUrl` is empty until the MP3 is prepared. */
  youtubeId?: string
  /** Original YouTube upload title, when it differs from the parsed song title. */
  videoTitle?: string
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
  /** Present when the track came from an online catalog or YouTube. */
  provider?: MusicProvider
  publisher?: string
  streamKind?: MusicOnlineStreamKind
  license?: string | null
}

export interface MusicOverlayState {
  status: MusicPlaybackStatus
  track: MusicOverlayTrack | null
  positionMs: number
  durationMs: number
  volume: number
  muted: boolean
  repeat: MusicRepeat
  shuffle: boolean
}

/** Sent by the overlay window; `close` and `focus` are handled in main. */
export type MusicOverlayAction =
  | { type: 'toggle-play' }
  | { type: 'toggle-mute' }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'seek'; positionMs: number }
  | { type: 'close' }
  | { type: 'focus' }

/** Relayed to the launcher window, where the audio element lives. */
export type MusicCommand =
  | { type: 'toggle-play' }
  | { type: 'toggle-mute' }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'seek'; positionMs: number }
  | { type: 'focus' }

export type MusicOnlineProvider = 'itunes' | 'deezer' | 'audius' | 'openverse' | 'archive'
export type MusicProvider = MusicOnlineProvider | 'youtube'
export type MusicOnlineStreamKind = 'preview' | 'full'

export interface MusicOnlineTrack extends MusicTrack {
  provider: MusicOnlineProvider
  publisher: string
  streamKind: MusicOnlineStreamKind
  license: string | null
  sourceUrl: string | null
}

export interface MusicOnlineProviderStatus {
  provider: MusicOnlineProvider
  ok: boolean
  count: number
  error: string | null
}

export interface MusicOnlineSearchResult {
  query: string
  tracks: MusicOnlineTrack[]
  providers: MusicOnlineProviderStatus[]
  /** Set when a catalog exceeded its own deadline, e.g. "iTunes did not respond". */
  warning: string | null
}

/** A YouTube search result before its audio has been extracted. */
export interface MusicYouTubeTrack extends MusicTrack {
  provider: 'youtube'
  youtubeId: string
  videoTitle: string
  publisher: string
  streamKind: 'full'
  license: null
  sourceUrl: string
}

export type MusicYouTubeSearchSource = 'api' | 'yt-dlp'

export interface MusicYouTubeSearchResult {
  query: string
  tracks: MusicYouTubeTrack[]
  source: MusicYouTubeSearchSource
  warning: string | null
}

export interface MusicYouTubeSettings {
  /** Empty means search falls back to yt-dlp; the key is never sent to the renderer logs. */
  apiKey: string
  ytDlpPath: string
  ffmpegPath: string
  /** MP3 cache ceiling in megabytes; the oldest tracks are evicted past it. */
  cacheLimitMb: number
}

export type MusicYouTubeToolSource =
  | 'configured'
  | 'path'
  | 'downloaded'
  | 'missing'

export interface MusicYouTubeToolInfo {
  ok: boolean
  path: string | null
  version: string | null
  source: MusicYouTubeToolSource
  error: string | null
}

export interface MusicYouTubeStatus {
  settings: MusicYouTubeSettings
  ytDlp: MusicYouTubeToolInfo
  ffmpeg: MusicYouTubeToolInfo
  cache: {
    tracks: number
    bytes: number
    /** Video ids currently stored, oldest first, so the page can offer a delete. */
    entries: MusicYouTubeCacheEntry[]
  }
}

/** One extracted MP3 as shown in the setup panel. */
export interface MusicYouTubeCacheEntry {
  videoId: string
  title: string
  artist: string
  bytes: number
  downloadedAt: number
}

export interface MusicYouTubeUpdate {
  apiKey?: string
  ytDlpPath?: string
  ffmpegPath?: string
  cacheLimitMb?: number
}

export interface MusicYouTubeResolveResult {
  ok: boolean
  track?: MusicYouTubeTrack
  error?: string
}
