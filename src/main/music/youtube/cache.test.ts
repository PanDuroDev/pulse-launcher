import { describe, expect, it } from 'vitest'
import {
  cacheLimitBytes,
  clampCacheLimitMb,
  DEFAULT_CACHE_LIMIT_MB,
  MAX_CACHE_LIMIT_MB,
  MIN_CACHE_LIMIT_MB,
  selectEvictions,
} from './cache'

const MB = 1024 * 1024

function entry(videoId: string, megabytes: number, downloadedAt: number) {
  return { videoId, bytes: megabytes * MB, downloadedAt }
}

describe('cache limit', () => {
  it('clamps out-of-range and unreadable values', () => {
    expect(clampCacheLimitMb(undefined)).toBe(DEFAULT_CACHE_LIMIT_MB)
    expect(clampCacheLimitMb('not a number')).toBe(DEFAULT_CACHE_LIMIT_MB)
    expect(clampCacheLimitMb(Number.NaN)).toBe(DEFAULT_CACHE_LIMIT_MB)
    expect(clampCacheLimitMb(1)).toBe(MIN_CACHE_LIMIT_MB)
    expect(clampCacheLimitMb(999_999)).toBe(MAX_CACHE_LIMIT_MB)
    expect(clampCacheLimitMb(512.4)).toBe(512)
  })

  it('converts megabytes to bytes and applies the minimum', () => {
    expect(cacheLimitBytes(200)).toBe(200 * MB)
    // Below the minimum the clamp wins, so 2 MB becomes 100 MB.
    expect(cacheLimitBytes(2)).toBe(MIN_CACHE_LIMIT_MB * MB)
    expect(cacheLimitBytes(0)).toBe(MIN_CACHE_LIMIT_MB * MB)
  })
})

describe('selectEvictions', () => {
  it('keeps everything when the cache fits', () => {
    expect(
      selectEvictions([entry('aaaaaaaaaaa', 10, 1), entry('bbbbbbbbbbb', 10, 2)], 30 * MB),
    ).toEqual([])
  })

  it('deletes the oldest first until the cache fits', () => {
    const evicted = selectEvictions(
      [
        entry('ccccccccccc', 10, 3),
        entry('aaaaaaaaaaa', 10, 1),
        entry('bbbbbbbbbbb', 10, 2),
      ],
      20 * MB,
    )
    expect(evicted).toEqual(['aaaaaaaaaaa'])
  })

  it('deletes several tracks when one is not enough', () => {
    const evicted = selectEvictions(
      [
        entry('aaaaaaaaaaa', 10, 1),
        entry('bbbbbbbbbbb', 10, 2),
        entry('ccccccccccc', 10, 3),
      ],
      10 * MB,
    )
    expect(evicted).toEqual(['aaaaaaaaaaa', 'bbbbbbbbbbb'])
  })

  it('never evicts the track that was just written', () => {
    const evicted = selectEvictions(
      [entry('aaaaaaaaaaa', 10, 1), entry('bbbbbbbbbbb', 10, 2)],
      5 * MB,
      'bbbbbbbbbbb',
    )
    expect(evicted).toEqual(['aaaaaaaaaaa'])
  })

  it('keeps an oversized newest file rather than deleting it on arrival', () => {
    expect(selectEvictions([entry('aaaaaaaaaaa', 900, 1)], 100 * MB)).toEqual([])
  })

  it('breaks ties by id so the order is deterministic', () => {
    const evicted = selectEvictions(
      [entry('bbbbbbbbbbb', 10, 5), entry('aaaaaaaaaaa', 10, 5)],
      10 * MB,
    )
    expect(evicted).toEqual(['aaaaaaaaaaa'])
  })
})
