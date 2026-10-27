import type { MusicYouTubeCacheEntry } from '@shared/types'

/**
 * Cache policy is separated from the service so the eviction rule can be tested
 * without a filesystem. The numbers are megabytes because that is what the
 * setup panel shows the user.
 */
export const DEFAULT_CACHE_LIMIT_MB = 2_048
export const MIN_CACHE_LIMIT_MB = 100
export const MAX_CACHE_LIMIT_MB = 20_000

const BYTES_PER_MB = 1024 * 1024

export function clampCacheLimitMb(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return DEFAULT_CACHE_LIMIT_MB
  return Math.min(
    MAX_CACHE_LIMIT_MB,
    Math.max(MIN_CACHE_LIMIT_MB, Math.round(numeric)),
  )
}

export function cacheLimitBytes(limitMb: number): number {
  return clampCacheLimitMb(limitMb) * BYTES_PER_MB
}

/**
 * Picks the oldest tracks to delete until the cache fits under its ceiling.
 *
 * The newest track is always kept: evicting it immediately would make playback
 * of a large video impossible on a small limit, and `protectId` (the track just
 * written) is kept for the same reason. So the cache can sit one track over the
 * limit, never more.
 */
export function selectEvictions(
  entries: ReadonlyArray<Pick<MusicYouTubeCacheEntry, 'videoId' | 'bytes' | 'downloadedAt'>>,
  limitBytes: number,
  protectId?: string,
): string[] {
  if (entries.length === 0) return []
  let total = 0
  for (const entry of entries) total += Math.max(0, entry.bytes)

  if (total <= limitBytes) return []

  let newest = entries[0]
  for (const entry of entries) {
    if (!newest || entry.downloadedAt > newest.downloadedAt) newest = entry
  }

  const oldestFirst = [...entries]
    .filter((entry) => entry.videoId !== protectId && entry.videoId !== newest?.videoId)
    .sort((a, b) => a.downloadedAt - b.downloadedAt || a.videoId.localeCompare(b.videoId))

  const evicted: string[] = []
  for (const entry of oldestFirst) {
    if (total <= limitBytes) break
    total -= Math.max(0, entry.bytes)
    evicted.push(entry.videoId)
  }
  return evicted
}
