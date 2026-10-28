import { useCallback } from 'react'
import type { GameSummary } from '@shared/contracts/games'
import type { LibrarySort } from '@shared/contracts/settings'
import type { LauncherPageState } from '@/hooks/use-launcher-page-state'
import { useLibraryView } from '@/hooks/use-library-view'
import { useAddGameNavigation } from '@/hooks/use-add-game-navigation'
import { useLauncherViewTransition } from '@/hooks/use-launcher-view-transition'
import { useLauncherFocusManagement } from '@/hooks/use-launcher-focus-management'
import { useSearchNavigation } from '@/hooks/use-search-navigation'
import { useSecondaryPageNavigation } from '@/hooks/use-secondary-page-navigation'
import { useGameAddedFocus } from '@/hooks/use-game-added-focus'
import { useGameDetailsNavigation } from '@/hooks/use-game-details-navigation'
import { useGameDetailsActions } from '@/hooks/use-game-details-actions'

type LauncherStatus = 'loading' | 'ready' | 'error'

interface UseLauncherNavigationControllerOptions {
  games: GameSummary[]
  selectedId: string | null
  librarySort: LibrarySort
  refreshing: boolean
  status: LauncherStatus
  bootDone: boolean
  select: (gameId: string) => void
  page: LauncherPageState
}

/** Coordinates page state, focus restoration, and top-level navigation actions. */
export function useLauncherNavigationController({
  games,
  selectedId,
  librarySort,
  refreshing,
  status,
  bootDone,
  select,
  page,
}: UseLauncherNavigationControllerOptions) {
  const {
    settingsOpen,
    setSettingsOpen,
    addOpen,
    setAddOpen,
    addMode,
    setAddMode,
    detailsOpen,
    setDetailsOpen,
    detailsSnapshot,
    setDetailsSnapshot,
    manualDraft,
    setManualDraft,
    detailsSaving,
    setDetailsSaving,
    detailsRemoving,
    setDetailsRemoving,
    searchOpen,
    setSearchOpen,
    setSearchQuery,
    powerOpen,
    setPowerOpen,
    musicOpen,
    setMusicOpen,
    lastFocusKey,
    rememberFocusKey,
  } = page

  const {
    rows,
    selected,
    detailsGame,
    initialFocusKey,
  } = useLibraryView({
    games,
    selectedId,
    librarySort,
    detailsOpen,
    detailsSnapshot,
  })

  const { handleAddGame, closeAddGame } = useAddGameNavigation({
    addMode,
    detailsOpen,
    gamesEmpty: games.length === 0,
    initialFocusKey,
    lastFocusKey,
    setAddMode,
    setAddOpen,
    setPowerOpen,
    setSettingsOpen,
  })

  useLauncherViewTransition({
    addOpen,
    detailsOpen,
    musicOpen,
    powerOpen,
    searchOpen,
    settingsOpen,
  })

  useLauncherFocusManagement({
    bootDone,
    games,
    initialFocusKey,
    lastFocusKey,
    refreshing,
    status,
  })

  const handleSelect = useCallback(
    (game: GameSummary, focusKey: string) => {
      rememberFocusKey(focusKey)
      select(game.id)
    },
    [rememberFocusKey, select],
  )

  const { openSearch, closeSearch } = useSearchNavigation({
    addOpen,
    initialFocusKey,
    lastFocusKey,
    powerOpen,
    searchOpen,
    setSearchOpen,
    setSearchQuery,
    settingsOpen,
  })

  const {
    openSettings,
    closeSettings,
    openMusic,
    closeMusic,
  } = useSecondaryPageNavigation({
    gamesEmpty: games.length === 0,
    initialFocusKey,
    lastFocusKey,
    setMusicOpen,
    setPowerOpen,
    setSettingsOpen,
    settingsOpen,
  })

  const handleGameAdded = useGameAddedFocus({
    addOpen,
    rememberFocusKey,
    rows,
    select,
    setAddOpen,
  })

  const {
    clearDetailsReturnFocus,
    openDetails,
    closeDetails,
    openDetailsPicker,
    handlePickedPath,
    handlePickedArtwork,
  } = useGameDetailsNavigation({
    initialFocusKey,
    lastFocusKey,
    select,
    setAddMode,
    setAddOpen,
    setDetailsOpen,
    setDetailsSnapshot,
    setManualDraft,
    setPowerOpen,
  })

  const { handleSaveDetails, handleRemoveDetails } = useGameDetailsActions({
    clearDetailsReturnFocus,
    detailsRemoving,
    detailsSaving,
    manualDraft,
    select,
    selected,
    setDetailsOpen,
    setDetailsRemoving,
    setDetailsSaving,
    setDetailsSnapshot,
    setManualDraft,
  })

  const handleAddFromSettings = useCallback(() => {
    closeSettings()
    window.setTimeout(() => handleAddGame(), 140)
  }, [closeSettings, handleAddGame])

  return {
    library: { rows, selected, detailsGame, initialFocusKey },
    focus: { lastFocusKey },
    navigation: {
      handleAddGame,
      closeAddGame,
      handleSelect,
      handleGameAdded,
      openSearch,
      closeSearch,
      openSettings,
      closeSettings,
      openMusic,
      closeMusic,
      openDetails,
      closeDetails,
      openDetailsPicker,
      handlePickedPath,
      handlePickedArtwork,
      handleSaveDetails,
      handleRemoveDetails,
      handleAddFromSettings,
    },
  }
}
