import { describe, expect, it } from 'vitest'
import type { MusicTrack } from '@shared/types'
import {
  filterTracks,
  formatDuration,
  nextIndex,
  previousIndex,
  progressRatio,
  trackIndexById,
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
