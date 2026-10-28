import type { MusicRepeat, MusicTrack } from '@shared/contracts/music'

export interface QueueOptions {
  repeat: MusicRepeat
  shuffle: boolean
  /** Injectable so the tests do not depend on Math.random. */
  random?: () => number
}

/** `m:ss`, or `h:mm:ss` for long mixes. Negative and non-finite values read as 0. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0:00'
  const total = Math.floor(ms / 1000)
  const seconds = total % 60
  const minutes = Math.floor(total / 60) % 60
  const hours = Math.floor(total / 3600)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}

/**
 * Every whitespace-separated token has to appear somewhere in the row, so
 * "mira slow" finds the track and "slow mira" finds it too.
 */
export function filterTracks(tracks: MusicTrack[], query: string): MusicTrack[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return tracks
  return tracks.filter((track) => {
    const haystack = `${track.title} ${track.artist} ${track.album} ${track.folder}`.toLowerCase()
    return tokens.every((token) => haystack.includes(token))
  })
}

export function trackIndexById(tracks: MusicTrack[], trackId: string | null): number {
  if (!trackId) return -1
  return tracks.findIndex((track) => track.id === trackId)
}

/** The three buckets the unified search can filter by. */
export type MusicSourceFilter = 'all' | 'library' | 'online' | 'youtube'

/**
 * Local files carry no provider, so the absence of one is the signal for
 * "library". YouTube is a provider of its own because its rows need async
 * extraction before they can play.
 */
export function trackSource(track: MusicTrack): Exclude<MusicSourceFilter, 'all'> {
  if (track.provider === 'youtube') return 'youtube'
  return track.provider ? 'online' : 'library'
}

export function countSources(
  tracks: MusicTrack[],
): Record<MusicSourceFilter, number> {
  const counts: Record<MusicSourceFilter, number> = {
    all: tracks.length,
    library: 0,
    online: 0,
    youtube: 0,
  }
  for (const track of tracks) counts[trackSource(track)] += 1
  return counts
}

export function filterBySource(
  tracks: MusicTrack[],
  source: MusicSourceFilter,
): MusicTrack[] {
  if (source === 'all') return tracks
  return tracks.filter((track) => trackSource(track) === source)
}

/**
 * Merges the per-source result lists into the unified list. YouTube leads
 * because its rows carry the most complete metadata (API cover, real channel,
 * exact duration) and it is the source users reach for when a song is not in
 * their own files. Local hits follow (instant and offline), then the ranked
 * online catalogs. The order is also the playback order, so it is defined in
 * one tested place instead of inside the component.
 */
export function mergeSources(
  youtube: MusicTrack[],
  library: MusicTrack[],
  online: MusicTrack[],
): MusicTrack[] {
  return [...youtube, ...library, ...online]
}

function randomIndex(length: number, current: number, random: () => number): number {
  if (length <= 1) return 0
  const value = Math.floor(random() * length)
  const candidate = Math.min(length - 1, Math.max(0, value))
  if (candidate !== current) return candidate
  // Stepping one slot keeps the choice random without a retry loop.
  return (candidate + 1) % length
}

/**
 * Returns the next queue index, or null when playback should stop at the end.
 * `repeat: 'one'` deliberately returns the current index: the caller restarts
 * the same element so the progress bar behaves like a normal repeat button.
 */
export function nextIndex(length: number, current: number, options: QueueOptions): number | null {
  if (length <= 0) return null
  if (options.repeat === 'one') return current < 0 ? 0 : current
  if (options.shuffle) return randomIndex(length, current, options.random ?? Math.random)

  const next = current + 1
  if (next < length) return next
  return options.repeat === 'all' ? 0 : null
}

/** Previous at the start of a repeat-off queue restarts the first track. */
export function previousIndex(length: number, current: number, options: QueueOptions): number | null {
  if (length <= 0) return null
  if (options.repeat === 'one') return current < 0 ? 0 : current
  if (options.shuffle) return randomIndex(length, current, options.random ?? Math.random)

  const previous = current - 1
  if (previous >= 0) return previous
  return options.repeat === 'all' ? length - 1 : 0
}

/** Progress as 0–1; guards a zero duration and a position past the end. */
export function progressRatio(positionMs: number, durationMs: number): number {
  if (!Number.isFinite(positionMs) || !Number.isFinite(durationMs) || durationMs <= 0) return 0
  return Math.min(1, Math.max(0, positionMs / durationMs))
}
