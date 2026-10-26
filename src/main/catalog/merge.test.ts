import { describe, expect, it } from 'vitest'
import type { GameRecord, GameSource } from '@shared/types'
import { mergeCatalogGames, type CatalogMergeInput } from './merge'

function game(id: string, source: GameSource, name: string): GameRecord {
  return {
    id,
    source,
    name,
    installed: true,
    accent: '#ffffff',
    launch: { kind: 'steam', target: `steam://rungameid/${id}` },
  }
}

describe('mergeCatalogGames', () => {
  it('keeps previous games for a source that failed and marks it stale', () => {
    const input: CatalogMergeInput = {
      previous: [
        game('steam-1', 'steam', 'Zeta'),
        game('epic-1', 'epic', 'Old Epic'),
      ],
      manual: [],
      results: [
        { source: 'steam', games: [], error: 'Steam install path not found' },
        { source: 'epic', games: [game('epic-2', 'epic', 'New Epic')] },
      ],
    }

    const result = mergeCatalogGames(input)

    expect(result.staleSources).toEqual(['steam'])
    expect(result.games.map((entry) => entry.id)).toEqual(['epic-2', 'steam-1'])
  })

  it('does not mark a failed source as stale when it has no previous games', () => {
    const result = mergeCatalogGames({
      previous: [],
      manual: [],
      results: [{ source: 'epic', games: [], error: 'Manifest directory not found' }],
    })

    expect(result.staleSources).toEqual([])
    expect(result.games).toEqual([])
  })

  it('removes games from a source that was not scanned at all', () => {
    const result = mergeCatalogGames({
      previous: [
        game('start-menu-1', 'start-menu', 'Shortcut'),
        game('steam-1', 'steam', 'Steam Game'),
      ],
      manual: [],
      results: [{ source: 'steam', games: [game('steam-1', 'steam', 'Steam Game')] }],
    })

    expect(result.staleSources).toEqual([])
    expect(result.games.map((entry) => entry.id)).toEqual(['steam-1'])
  })

  it('always includes manual games and sorts the merged catalog', () => {
    const result = mergeCatalogGames({
      previous: [game('steam-1', 'steam', 'Zeta')],
      manual: [game('manual-1', 'manual', 'Alpha Local')],
      results: [
        { source: 'steam', games: [game('steam-1', 'steam', 'Zeta')] },
      ],
    })

    expect(result.games.map((entry) => entry.name)).toEqual(['Alpha Local', 'Zeta'])
  })

  it('replaces a previous record when its source scan succeeds', () => {
    const result = mergeCatalogGames({
      previous: [game('steam-1', 'steam', 'Old Name')],
      manual: [],
      results: [
        { source: 'steam', games: [game('steam-1', 'steam', 'New Name')] },
      ],
    })

    expect(result.staleSources).toEqual([])
    expect(result.games).toHaveLength(1)
    expect(result.games[0]?.name).toBe('New Name')
  })
})
