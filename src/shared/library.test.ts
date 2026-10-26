import { describe, expect, it } from 'vitest'
import type { GameSummary } from './types'
import {
  CONTINUE_PLAYING_LIMIT,
  favoriteGames,
  filterGames,
  librarySortLabel,
  nextLibrarySort,
  normalizeSearch,
  recentlyPlayed,
  sortGames,
} from './library'

function game(overrides: Partial<GameSummary> & { id: string; name: string }): GameSummary {
  return {
    source: 'steam',
    installed: true,
    running: false,
    favorite: false,
    accent: '210 55% 72%',
    ...overrides,
  }
}

const catalog: GameSummary[] = [
  game({ id: 'a', name: 'Stick Fight', addedAt: 100, lastPlayedAt: 300 }),
  game({ id: 'b', name: 'Bloodborne', addedAt: 300, lastPlayedAt: 100 }),
  game({ id: 'c', name: 'Celeste', source: 'epic', subtitle: 'Farewell edition', addedAt: 200 }),
  game({ id: 'd', name: 'Apex Legends', source: 'manual', addedAt: 400 }),
]

describe('normalizeSearch', () => {
  it('trims, lowercases, and removes accents', () => {
    expect(normalizeSearch('  Café  ')).toBe('cafe')
  })
})

describe('filterGames', () => {
  it('returns the whole catalog for an empty query', () => {
    expect(filterGames(catalog, '   ')).toHaveLength(catalog.length)
  })

  it('matches titles case-insensitively and ignores accents', () => {
    expect(filterGames(catalog, 'BLOOD').map((entry) => entry.id)).toEqual(['b'])
    expect(
      filterGames([game({ id: 'accent', name: 'Café Society' })], 'cafe').map(
        (entry) => entry.id,
      ),
    ).toEqual(['accent'])
  })

  it('ranks a prefix match above a word match above a substring', () => {
    const games = [
      game({ id: 'mid', name: 'The Efficient' }),
      game({ id: 'word', name: 'Night Fight' }),
      game({ id: 'prefix', name: 'Figment' }),
    ]
    expect(filterGames(games, 'fi').map((entry) => entry.id)).toEqual([
      'prefix',
      'word',
      'mid',
    ])
  })

  it('searches subtitles and source labels as a fallback', () => {
    expect(filterGames(catalog, 'farewell').map((entry) => entry.id)).toEqual(['c'])
    expect(filterGames(catalog, 'local').map((entry) => entry.id)).toEqual(['d'])
  })

  it('returns an empty list when nothing matches', () => {
    expect(filterGames(catalog, 'zzzz')).toEqual([])
  })
})

describe('sortGames', () => {
  it('sorts by title without mutating the input', () => {
    const before = catalog.map((entry) => entry.id)
    expect(sortGames(catalog, 'title').map((entry) => entry.id)).toEqual([
      'd',
      'b',
      'c',
      'a',
    ])
    expect(catalog.map((entry) => entry.id)).toEqual(before)
  })

  it('sorts by most recent play, unplayed games last', () => {
    expect(sortGames(catalog, 'recent').map((entry) => entry.id)).toEqual([
      'a',
      'b',
      'd',
      'c',
    ])
  })

  it('sorts by most recently added', () => {
    expect(sortGames(catalog, 'added').map((entry) => entry.id)).toEqual([
      'd',
      'b',
      'c',
      'a',
    ])
  })
})

describe('nextLibrarySort', () => {
  it('cycles recent -> title -> added -> recent', () => {
    expect(nextLibrarySort('recent')).toBe('title')
    expect(nextLibrarySort('title')).toBe('added')
    expect(nextLibrarySort('added')).toBe('recent')
  })

  it('labels every order', () => {
    expect(librarySortLabel('recent')).toBe('Recent')
    expect(librarySortLabel('title')).toBe('A–Z')
    expect(librarySortLabel('added')).toBe('Added')
  })
})

describe('recentlyPlayed', () => {
  it('keeps played games only, newest first, excluding running games', () => {
    const games = [
      ...catalog,
      game({ id: 'running', name: 'Running', lastPlayedAt: 900, running: true }),
    ]
    expect(recentlyPlayed(games).map((entry) => entry.id)).toEqual(['a', 'b'])
  })

  it('caps the row length', () => {
    const games = Array.from({ length: 20 }, (_, index) =>
      game({ id: `g${index}`, name: `Game ${index}`, lastPlayedAt: index + 1 }),
    )
    expect(recentlyPlayed(games)).toHaveLength(CONTINUE_PLAYING_LIMIT)
    expect(recentlyPlayed(games)[0]?.id).toBe('g19')
  })

  it('returns an empty row when nothing was played', () => {
    expect(recentlyPlayed([game({ id: 'x', name: 'X' })])).toEqual([])
  })
})

describe('favoriteGames', () => {
  it('returns favorites in title order', () => {
    const games = [
      game({ id: 'a', name: 'Zeta', favorite: true }),
      game({ id: 'b', name: 'Alpha', favorite: true }),
      game({ id: 'c', name: 'Beta' }),
    ]
    expect(favoriteGames(games).map((entry) => entry.id)).toEqual(['b', 'a'])
  })
})
