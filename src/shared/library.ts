import type { GameSummary, LibrarySort } from './types'
import { sourceLabel } from './format'

/** Cycles of the sort action in the All Games row header. */
export const LIBRARY_SORTS: readonly LibrarySort[] = ['recent', 'title', 'added']

const SORT_LABELS: Record<LibrarySort, string> = {
  recent: 'Recent',
  title: 'A–Z',
  added: 'Added',
}

const SORT_DESCRIPTIONS: Record<LibrarySort, string> = {
  recent: 'Recently played first',
  title: 'Alphabetical order',
  added: 'Newest additions first',
}

/** How many games the Continue Playing row shows. */
export const CONTINUE_PLAYING_LIMIT = 8

export function librarySortLabel(sort: LibrarySort): string {
  return SORT_LABELS[sort]
}

export function librarySortDescription(sort: LibrarySort): string {
  return SORT_DESCRIPTIONS[sort]
}

/**
 * The next order in the cycle. Keeping this pure means the button, the `O`
 * shortcut, and the persisted value can never disagree.
 */
export function nextLibrarySort(sort: LibrarySort): LibrarySort {
  const index = LIBRARY_SORTS.indexOf(sort)
  return LIBRARY_SORTS[(index + 1) % LIBRARY_SORTS.length] ?? 'title'
}

/** Case- and accent-insensitive form used by both search and ranking. */
export function normalizeSearch(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

function searchScore(game: GameSummary, needle: string): number {
  const name = normalizeSearch(game.name)
  if (name === needle) return 5
  if (name.startsWith(needle)) return 4
  // A word inside the title ("Stick Fight" for "fight") beats a mid-word hit.
  if (name.split(/[^\p{L}\p{N}]+/u).some((word) => word.startsWith(needle))) return 3
  if (name.includes(needle)) return 2
  if (game.subtitle && normalizeSearch(game.subtitle).includes(needle)) return 1
  if (normalizeSearch(sourceLabel(game.source)).includes(needle)) return 1
  return -1
}

/**
 * Instant library search. An empty query returns the catalog unchanged, so the
 * caller can always pass the same list to the row builder.
 */
export function filterGames(games: GameSummary[], query: string): GameSummary[] {
  const needle = normalizeSearch(query)
  if (!needle) return [...games]

  return games
    .map((game, index) => ({ game, index, score: searchScore(game, needle) }))
    .filter((entry) => entry.score >= 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.game.name.localeCompare(right.game.name) ||
        left.index - right.index,
    )
    .map((entry) => entry.game)
}

function byTitle(left: GameSummary, right: GameSummary): number {
  return left.name.localeCompare(right.name)
}

function byRecent(left: GameSummary, right: GameSummary): number {
  const leftPlayed = left.lastPlayedAt ?? 0
  const rightPlayed = right.lastPlayedAt ?? 0
  if (leftPlayed !== rightPlayed) return rightPlayed - leftPlayed
  return byTitle(left, right)
}

function byAdded(left: GameSummary, right: GameSummary): number {
  const leftAdded = left.addedAt ?? 0
  const rightAdded = right.addedAt ?? 0
  if (leftAdded !== rightAdded) return rightAdded - leftAdded
  return byTitle(left, right)
}

/** Returns a sorted copy; the catalog order itself is never mutated. */
export function sortGames(games: GameSummary[], sort: LibrarySort): GameSummary[] {
  const next = [...games]
  if (sort === 'recent') return next.sort(byRecent)
  if (sort === 'added') return next.sort(byAdded)
  return next.sort(byTitle)
}

/**
 * Games the user actually played, newest first. Running games are excluded
 * because Running Now already surfaces them.
 */
export function recentlyPlayed(
  games: GameSummary[],
  limit = CONTINUE_PLAYING_LIMIT,
): GameSummary[] {
  return games
    .filter((game) => !game.running && (game.lastPlayedAt ?? 0) > 0)
    .sort(byRecent)
    .slice(0, Math.max(0, limit))
}

export function favoriteGames(games: GameSummary[]): GameSummary[] {
  return games.filter((game) => game.favorite).sort(byTitle)
}
