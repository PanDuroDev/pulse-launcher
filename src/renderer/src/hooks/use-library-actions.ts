import { useCallback } from 'react'
import { toast } from 'sonner'
import type { GameSummary } from '@shared/contracts/games'
import type { LibrarySort } from '@shared/contracts/settings'
import { sourceLabel } from '@shared/format'
import { nextLibrarySort } from '@shared/library'
import { playUI } from '@/lib/ui-sfx'
import { useLauncherStore } from '@/store/launcher'

type RefreshLibrary = ReturnType<typeof useLauncherStore.getState>['refresh']
type UpdateSettings = ReturnType<typeof useLauncherStore.getState>['updateSettings']

interface UseLibraryActionsOptions {
  refresh: RefreshLibrary
  updateSettings: UpdateSettings
  librarySort: LibrarySort
}

export function useLibraryActions({
  refresh,
  updateSettings,
  librarySort,
}: UseLibraryActionsOptions) {
  const handleRefresh = useCallback(async () => {
    const result = await refresh()
    if (!result) {
      playUI('error')
      toast.error('Could not refresh the library.')
      return
    }
    toast.success(`Library refreshed · ${result.games.length} games`)
    for (const scanError of result.errors) {
      const suffix = result.staleSources.includes(scanError.source)
        ? ' Showing the last known library.'
        : ''
      toast.error(`${sourceLabel(scanError.source)}: ${scanError.message}${suffix}`)
    }
  }, [refresh])

  const handleToggleFavorite = useCallback(async (game: GameSummary) => {
    try {
      const result = await window.launcher.catalog.toggleFavorite(game.id)
      if (!result.ok) {
        playUI('error')
        toast.error(result.error ?? 'Could not update favorites.')
        return
      }
      playUI(result.favorite ? 'select' : 'deselect')
      toast.success(
        result.favorite
          ? `${game.name} added to favorites`
          : `${game.name} removed from favorites`,
      )
    } catch (error) {
      playUI('error')
      toast.error(error instanceof Error ? error.message : 'Could not update favorites.')
    }
  }, [])

  const handleCycleSort = useCallback(() => {
    const next: LibrarySort = nextLibrarySort(librarySort)
    playUI('select')
    updateSettings({ librarySort: next }).catch((error: unknown) => {
      playUI('error')
      toast.error(error instanceof Error ? error.message : 'Could not save the sort order.')
    })
  }, [librarySort, updateSettings])

  return { handleRefresh, handleToggleFavorite, handleCycleSort }
}
