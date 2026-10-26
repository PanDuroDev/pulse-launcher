import type { GameRecord, GameSource } from '@shared/types'

/** A single source scan result, successful or failed. */
export interface ScannedSource {
  source: GameSource
  games: GameRecord[]
  error?: string
}

export interface CatalogMergeInput {
  /** Catalog state before the scan, used as fallback for failed sources. */
  previous: GameRecord[]
  /** Manual entries read from settings, the source of truth for `manual`. */
  manual: GameRecord[]
  /** Results of the sources that were actually scanned in this run. */
  results: ScannedSource[]
}

export interface CatalogMergeResult {
  games: GameRecord[]
  /** Sources that failed but kept their previous games. */
  staleSources: GameSource[]
}

function sortGames(games: GameRecord[]): GameRecord[] {
  return games.sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }),
  )
}

/**
 * Builds the new catalog from scan results.
 *
 * A failed source keeps the games from the previous catalog instead of dropping
 * them, so a transient Steam/Epic/Start Menu failure does not hide a library
 * section. A source that was not scanned at all (for example Start Menu after
 * being disabled) is removed, because that is an explicit user choice.
 */
export function mergeCatalogGames(input: CatalogMergeInput): CatalogMergeResult {
  const previousBySource = new Map<GameSource, GameRecord[]>()
  for (const game of input.previous) {
    const existing = previousBySource.get(game.source)
    if (existing) existing.push(game)
    else previousBySource.set(game.source, [game])
  }

  const byId = new Map<string, GameRecord>()
  for (const game of input.manual) byId.set(game.id, game)

  const staleSources = new Set<GameSource>()

  for (const result of input.results) {
    if (result.error) {
      const previous = previousBySource.get(result.source) ?? []
      if (previous.length > 0) staleSources.add(result.source)
      for (const game of previous) byId.set(game.id, game)
      continue
    }

    for (const game of result.games) byId.set(game.id, game)
  }

  return {
    games: sortGames([...byId.values()]),
    staleSources: [...staleSources],
  }
}
