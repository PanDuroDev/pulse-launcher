import { useMemo } from 'react'
import type { GameSummary, LibrarySort } from '@shared/types'
import { favoriteGames, recentlyPlayed, sortGames } from '@shared/library'

interface LibraryRow {
  id: string
  title: string
  games: GameSummary[]
}

interface UseLibraryViewOptions {
  games: GameSummary[]
  selectedId: string | null
  librarySort: LibrarySort
  detailsOpen: boolean
  detailsSnapshot: GameSummary | null
}

/** Derives the launcher library's grouped rows and current selection from catalog state. */
export function useLibraryView({
  games,
  selectedId,
  librarySort,
  detailsOpen,
  detailsSnapshot,
}: UseLibraryViewOptions) {
  const runningGames = useMemo(
    () =>
      [...games]
        .filter((game) => game.running)
        .sort((left, right) => left.name.localeCompare(right.name)),
    [games],
  )

  const continueGames = useMemo(() => recentlyPlayed(games), [games])
  const favoriteList = useMemo(() => favoriteGames(games), [games])
  const sortedGames = useMemo(
    () => sortGames(games, librarySort),
    [games, librarySort],
  )

  const rows = useMemo<LibraryRow[]>(() => {
    const next: LibraryRow[] = []
    // Live games come first so Up from Running Now reaches the hero.
    if (runningGames.length > 0) {
      next.push({ id: 'running', title: 'Running Now', games: runningGames })
    }
    if (continueGames.length > 0) {
      next.push({ id: 'continue', title: 'Continue Playing', games: continueGames })
    }
    if (favoriteList.length > 0) {
      next.push({ id: 'favorites', title: 'Favorites', games: favoriteList })
    }
    next.push({ id: 'all', title: 'All Games', games: sortedGames })

    const sources = new Set(games.map((game) => game.source))
    if (sources.size > 1) {
      const steam = sortedGames.filter((game) => game.source === 'steam')
      const epic = sortedGames.filter((game) => game.source === 'epic')
      const local = sortedGames.filter(
        (game) => game.source === 'manual' || game.source === 'start-menu',
      )
      if (steam.length > 0) next.push({ id: 'steam', title: 'Steam', games: steam })
      if (epic.length > 0) next.push({ id: 'epic', title: 'Epic Games', games: epic })
      if (local.length > 0) {
        next.push({ id: 'local', title: 'Local & Desktop', games: local })
      }
    }
    return next
  }, [continueGames, favoriteList, games, runningGames, sortedGames])

  const selected = useMemo(
    () => games.find((game) => game.id === selectedId) ?? games[0],
    [games, selectedId],
  )

  // Keep the details page rendering while a saved ID propagates through the store.
  const detailsGame = useMemo(() => {
    if (!detailsOpen) return null
    const wanted = detailsSnapshot?.id
    if (!wanted) return null
    return games.find((game) => game.id === wanted) ?? detailsSnapshot
  }, [detailsOpen, detailsSnapshot, games])

  const initialFocusKey = useMemo(() => {
    if (games.length === 0) return null
    const row = rows.find((candidate) =>
      candidate.games.some((game) => game.id === selected?.id),
    )
    const target = selected && row ? { row, game: selected } : {
      row: rows[0],
      game: rows[0]?.games[0],
    }
    if (!target.row || !target.game) return null
    return `${target.row.id}-${target.game.id}`
  }, [games.length, rows, selected])

  return {
    runningGames,
    continueGames,
    favoriteList,
    sortedGames,
    rows,
    selected,
    detailsGame,
    initialFocusKey,
  }
}
