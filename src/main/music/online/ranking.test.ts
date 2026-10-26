import { describe, expect, it } from 'vitest'
import type { ProviderTrack } from './providers'
import {
  contentTokens,
  dedupeKey,
  durationFit,
  isJunkResult,
  matchScore,
  normalizeText,
  rankTracks,
  scoreTrack,
  similarity,
  tokenize,
  versionPenalty,
} from './ranking'

function track(overrides: Partial<ProviderTrack> = {}): ProviderTrack {
  return {
    id: 'itunes:1',
    provider: 'itunes',
    title: 'Numb',
    artist: 'Linkin Park',
    album: 'Meteora',
    durationMs: 185_000,
    publisher: 'Apple Music',
    streamKind: 'preview',
    license: null,
    sourceUrl: null,
    remoteStreamUrl: 'https://example.com/audio.m4a',
    remoteArtworkUrl: null,
    ...overrides,
  }
}

describe('normalization', () => {
  it('strips diacritics, apostrophes, and ampersands', () => {
    expect(normalizeText('Beyoncé & JAY-Z’s “Song”')).toBe('beyonce and jay zs song')
    expect(tokenize('Beyoncé & JAY-Z')).toEqual(['beyonce', 'and', 'jay', 'z'])
  })

  it('drops search stopwords but keeps version words', () => {
    expect(contentTokens('The Official Video (Live)')).toEqual(['official', 'video', 'live'])
    expect(contentTokens('Song feat. Another Artist')).toEqual(['song', 'another', 'artist'])
  })

  it('matches exact tokens, prefixes, and small typos', () => {
    expect(similarity('numb', 'numb')).toBe(1)
    expect(similarity('linkin', 'linkin park')).toBeGreaterThan(0.8)
    expect(similarity('linkin', 'linken')).toBeGreaterThan(0.4)
    expect(similarity('numb', 'park')).toBe(0)
  })
})

describe('matching and scoring', () => {
  it('scores a song and artist query above an unrelated result', () => {
    const exact = matchScore('numb linkin park', 'Numb', 'Linkin Park')
    const artistOnly = matchScore('numb linkin park', 'Some Other Song', 'Linkin Park')
    const unrelated = matchScore('numb linkin park', 'Friday', 'Rebecca Black')
    expect(exact).toBeGreaterThan(artistOnly)
    expect(exact).toBeGreaterThan(unrelated)
    expect(unrelated).toBeLessThan(0.34)
    expect(matchScore('numb', 'Numb', 'Linkin Park')).toBeGreaterThan(0.9)
  })

  it('penalises versions the user did not ask for', () => {
    expect(versionPenalty('Numb (Live)', 'numb')).toBeGreaterThan(0)
    expect(versionPenalty('Numb (Live)', 'numb live')).toBe(0)
    expect(versionPenalty('Numb (Remix)', 'numb')).toBeGreaterThan(0)
    expect(versionPenalty('Numb', 'numb')).toBe(0)
  })

  it('filters karaoke, instrumental, and tribute results unless requested', () => {
    expect(isJunkResult('Numb (Karaoke Version)', 'Linkin Park', 'numb')).toBe(true)
    expect(isJunkResult('Numb', 'Karaoke All-Stars', 'numb')).toBe(true)
    expect(isJunkResult('Numb (Instrumental)', 'Linkin Park', 'numb')).toBe(true)
    expect(isJunkResult('A Tribute to Linkin Park', 'Studio Band', 'numb')).toBe(true)
    expect(isJunkResult('Numb (Live)', 'Linkin Park', 'numb')).toBe(false)
    expect(isJunkResult('Karaoke', 'Artist', 'karaoke')).toBe(false)
    expect(isJunkResult('Numb (Instrumental)', 'Linkin Park', 'numb instrumental')).toBe(false)
  })

  it('prefers ordinary song lengths over clips and long mixes', () => {
    expect(durationFit(0)).toBe(0.4)
    expect(durationFit(10_000)).toBe(0.25)
    expect(durationFit(30_000)).toBe(0.5)
    expect(durationFit(60_000)).toBe(0.8)
    expect(durationFit(180_000)).toBe(1)
    expect(durationFit(30 * 60_000)).toBe(0.6)
  })

  it('gives a full track a small advantage over an equal preview', () => {
    const preview = track()
    const full = track({
      id: 'audius:1',
      provider: 'audius',
      publisher: 'Audius',
      streamKind: 'full',
    })
    expect(scoreTrack(full, 'numb linkin park')).toBeGreaterThan(
      scoreTrack(preview, 'numb linkin park'),
    )
  })
})

describe('ranking and dedupe', () => {
  const preview = track()
  const full = track({
    id: 'audius:numb',
    provider: 'audius',
    publisher: 'Audius',
    streamKind: 'full',
    durationMs: 186_000,
    remoteStreamUrl: 'https://example.com/full.mp3',
  })
  const live = track({
    id: 'deezer:numb-live',
    provider: 'deezer',
    publisher: 'Deezer',
    title: 'Numb (Live)',
    durationMs: 240_000,
  })
  const karaoke = track({
    id: 'itunes:karaoke',
    title: 'Numb (Karaoke Version)',
    artist: 'Karaoke All-Stars',
  })
  const unrelated = track({
    id: 'itunes:friday',
    title: 'Friday',
    artist: 'Rebecca Black',
  })

  it('filters unrelated and junk versions, then keeps the best copy', () => {
    const ranked = rankTracks([karaoke, unrelated, live, preview, full], 'numb linkin park')
    expect(ranked).toHaveLength(1)
    expect(ranked[0]).toMatchObject({ id: 'audius:numb', streamKind: 'full' })
  })

  it('sorts a better title match above a partial match', () => {
    const encore = track({
      id: 'deezer:encore',
      provider: 'deezer',
      title: 'Numb / Encore',
      artist: 'JAY-Z & Linkin Park',
    })
    const ranked = rankTracks([encore, full], 'numb linkin park')
    expect(ranked.map((entry) => entry.id)).toEqual(['audius:numb', 'deezer:encore'])
  })

  it('collapses versions of the same song and keeps the full copy', () => {
    const ranked = rankTracks([preview, live, full], 'numb linkin park')
    expect(ranked).toHaveLength(1)
    expect(ranked[0]?.streamKind).toBe('full')
  })

  it('keeps the same title by a different artist', () => {
    const other = track({ id: 'deezer:numb-jayz', artist: 'JAY-Z', album: 'The Blueprint 3' })
    const ranked = rankTracks([track(), other], 'numb')
    expect(ranked).toHaveLength(2)
    expect(new Set(ranked.map(dedupeKey)).size).toBe(2)
  })

  it('builds a stable key without version words or brackets', () => {
    expect(dedupeKey(track({ title: 'Numb (Live)' }))).toBe(
      dedupeKey(track({ title: 'Numb - Remastered' })),
    )
    expect(dedupeKey(track({ title: 'Numb (Live)' }))).toBe('linkin park|numb')
  })
})
