/** A search hit before it is exposed to the renderer. */
export interface YouTubeCandidate {
  videoId: string
  /** Cleaned song or video name shown as the primary title. */
  title: string
  /** Original YouTube video title, kept so the UI can show the exact source. */
  videoTitle: string
  artist: string
  channel: string
  durationMs: number
  /** Highest-resolution thumbnail returned by the API, or null. */
  thumbnailUrl: string | null
  sourceUrl: string
}

export type YouTubeSearchSource = 'api' | 'yt-dlp'

export interface YouTubeSearchOutcome {
  candidates: YouTubeCandidate[]
  source: YouTubeSearchSource
  warning: string | null
}

/** Metadata persisted next to the extracted MP3 so a restart needs no search. */
export interface YouTubeCacheEntry {
  videoId: string
  title: string
  videoTitle: string
  artist: string
  channel: string
  durationMs: number
  thumbnailUrl: string | null
  sourceUrl: string
  downloadedAt: number
}

export interface YouTubeCacheIndex {
  version: number
  entries: Record<string, YouTubeCacheEntry>
}
