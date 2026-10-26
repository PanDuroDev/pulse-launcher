import { describe, expect, it } from 'vitest'
import type { MusicTrack } from '@shared/types'
import {
  countSources,
  filterBySource,
  filterTracks,
  formatDuration,
  mergeSources,
  nextIndex,
  previousIndex,
  progressRatio,
  trackIndexById,
  trackSource,
} from './music-queue'

function track(id: string, title: string, artist: string, album = ''): MusicTrack {
  return {
    id,
    title,
    artist,
    album,
    durationMs: 60_000,
    artworkUrl: null,
    streamUrl: `app://launcher/media/${id}`,
    folder: 'Music',
  }
}

const library: MusicTrack[] = [
  track('1', 'Neon Drift', 'Pulse Sessions', 'Night Drive'),
  track('2', 'Glass Horizon', 'Mira Vale', 'Slow Light'),
  track('3', 'Afterglow', 'The Lumen Set', 'Static Bloom'),
]

describe('source filtering', () => {
  const local = track('l1', 'Neon Drift', 'Pulse Sessions')
  const online = {
    ...track('o1', 'Glass Horizon', 'Mira Vale'),
    provider: 'audius' as const,
    publisher: 'Audius',
    streamKind: 'full' as const,
    license: 'CC BY',
    sourceUrl: 'https://audius.co/x',
  }
  const youtube = {
    ...track('youtube:abc12345678', 'Afterglow', 'The Lumen Set'),
    provider: 'youtube' as const,
    youtubeId: 'abc12345678',
    publisher: 'The Lumen Set',
    streamKind: 'full' as const,
    license: null,
    sourceUrl: 'https://www.youtube.com/watch?v=abc12345678',
    videoTitle: 'The Lumen Set - Afterglow (Official Video)',
    streamUrl: '',
  }
  const mixed = [local, online, youtube]

  it('classifies local, online, and YouTube rows', () => {
    expect(trackSource(local)).toBe('library')
    expect(trackSource(online)).toBe('online')
    expect(trackSource(youtube)).toBe('youtube')
  })

  it('counts every bucket including the total', () => {
    expect(countSources(mixed)).toEqual({
      all: 3,
      library: 1,
      online: 1,
      youtube: 1,
    })
    expect(countSources([])).toEqual({ all: 0, library: 0, online: 0, youtube: 0 })
  })

  it('returns the whole list for the all filter and narrows otherwise', () => {
    expect(filterBySource(mixed, 'all')).toHaveLength(3)
    expect(filterBySource(mixed, 'library')).toEqual([local])
    expect(filterBySource(mixed, 'online')).toEqual([online])
    expect(filterBySource(mixed, 'youtube')).toEqual([youtube])
    expect(filterBySource(mixed, 'youtube')[0]?.id).toBe('youtube:abc12345678')
  })

  it('merges sources with YouTube first, then local, then online', () => {
    const merged = mergeSources([youtube], [local], [online])
    expect(merged.map((entry) => entry.id)).toEqual([
      'youtube:abc12345678',
      'l1',
      'o1',
    ])
    // The merged order must agree with the per-source counts and filters.
    expect(countSources(merged)).toEqual({ all: 3, library: 1, online: 1, youtube: 1 })
    expect(filterBySource(merged, 'youtube')).toEqual([youtube])
  })

  it('merges partial sources without reordering the rest', () => {
    expect(mergeSources([], [local], [online]).map((entry) => entry.id)).toEqual(['l1', 'o1'])
    expect(mergeSources([youtube], [], []).map((entry) => entry.id)).toEqual([
      'youtube:abc12345678',
    ])
    expect(mergeSources([], [], [])).toEqual([])
  })
})

describe('formatDuration', () => {
  it('formats minutes and seconds with a padded seconds field', () => {
    expect(formatDuration(65_000)).toBe('1:05')
    expect(formatDuration(9_000)).toBe('0:09')
  })

  it('adds an hours field only when needed', () => {
    expect(formatDuration(3_600_000)).toBe('1:00:00')
    expect(formatDuration(3_725_000)).toBe('1:02:05')
  })

  it('treats missing and negative durations as zero', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(-5)).toBe('0:00')
    expect(formatDuration(Number.NaN)).toBe('0:00')
  })
})

describe('filterTracks', () => {
  it('returns the same list for an empty query', () => {
    expect(filterTracks(library, '   ')).toBe(library)
  })

  it('matches title, artist and album regardless of case', () => {
    expect(filterTracks(library, 'neon')).toHaveLength(1)
    expect(filterTracks(library, 'MIRA')).toHaveLength(1)
    expect(filterTracks(library, 'static bloom')).toHaveLength(1)
  })

  it('requires every token, in any order', () => {
    expect(filterTracks(library, 'slow mira')).toHaveLength(1)
    expect(filterTracks(library, 'slow pulse')).toHaveLength(0)
  })
})

describe('nextIndex', () => {
  it('advances through the queue', () => {
    expect(nextIndex(3, 0, { repeat: 'off', shuffle: false })).toBe(1)
    expect(nextIndex(3, 1, { repeat: 'off', shuffle: false })).toBe(2)
  })

  it('stops at the end when repeat is off', () => {
    expect(nextIndex(3, 2, { repeat: 'off', shuffle: false })).toBeNull()
  })

  it('wraps when repeat is all', () => {
    expect(nextIndex(3, 2, { repeat: 'all', shuffle: false })).toBe(0)
  })

  it('replays the same track when repeat is one', () => {
    expect(nextIndex(3, 1, { repeat: 'one', shuffle: false })).toBe(1)
  })

  it('never picks the current track when shuffling more than one track', () => {
    const random = (): number => 0.5
    expect(nextIndex(3, 1, { repeat: 'off', shuffle: true, random })).not.toBe(1)
  })

  it('returns null for an empty queue', () => {
    expect(nextIndex(0, 0, { repeat: 'all', shuffle: false })).toBeNull()
  })
})

describe('previousIndex', () => {
  it('steps back through the queue', () => {
    expect(previousIndex(3, 2, { repeat: 'off', shuffle: false })).toBe(1)
  })

  it('restarts the first track instead of stopping', () => {
    expect(previousIndex(3, 0, { repeat: 'off', shuffle: false })).toBe(0)
  })

  it('wraps to the last track when repeat is all', () => {
    expect(previousIndex(3, 0, { repeat: 'all', shuffle: false })).toBe(2)
  })
})

describe('trackIndexById', () => {
  it('finds a track and reports -1 for unknown or null ids', () => {
    expect(trackIndexById(library, '2')).toBe(1)
    expect(trackIndexById(library, 'missing')).toBe(-1)
    expect(trackIndexById(library, null)).toBe(-1)
  })
})

describe('progressRatio', () => {
  it('is clamped to 0–1', () => {
    expect(progressRatio(30_000, 60_000)).toBe(0.5)
    expect(progressRatio(-1, 60_000)).toBe(0)
    expect(progressRatio(90_000, 60_000)).toBe(1)
  })

  it('is zero when the duration is unknown', () => {
    expect(progressRatio(30_000, 0)).toBe(0)
  })
})
