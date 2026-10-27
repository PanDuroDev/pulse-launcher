import { useCallback, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { GameSummary } from '@shared/contracts/games'
import type { LibrarySort } from '@shared/contracts/settings'
import type { GameDetailsDraft } from '@/components/launcher/GameDetailsPage'
import { useLibraryView } from '@/hooks/use-library-view'
import { useAddGameNavigation } from '@/hooks/use-add-game-navigation'
import { useLauncherViewTransition } from '@/hooks/use-launcher-view-transition'
import { useLauncherFocusManagement } from '@/hooks/use-launcher-focus-management'
import { useSearchNavigation } from '@/hooks/use-search-navigation'
import { useSecondaryPageNavigation } from '@/hooks/use-secondary-page-navigation'
import { useGameAddedFocus } from '@/hooks/use-game-added-focus'
import { useGameDetailsNavigation } from '@/hooks/use-game-details-navigation'
import { useGameDetailsActions } from '@/hooks/use-game-details-actions'

type AddMode = 'game' | 'path' | 'image'
type LauncherStatus = 'loading' | 'ready' | 'error'

interface UseLauncherNavigationControllerOptions {
  games: GameSummary[]
  selectedId: string | null
  librarySort: LibrarySort
  refreshing: boolean
  status: LauncherStatus
  bootDone: boolean
  select: (gameId: string) => void
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
}: UseLauncherNavigationControllerOptions) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [addMode, setAddMode] = useState<AddMode>('game')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [detailsSnapshot, setDetailsSnapshot] = useState<GameSummary | null>(null)
  const [manualDraft, setManualDraft] = useState<GameDetailsDraft | null>(null)
  const [detailsSaving, setDetailsSaving] = useState(false)
  const [detailsRemoving, setDetailsRemoving] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [powerOpen, setPowerOpen] = useState(false)
  const [musicOpen, setMusicOpen] = useState(false)
  const lastFocusKey = useRef<string | null>(null)

  const rememberFocusKey = useCallback((focusKey: string) => {
    lastFocusKey.current = focusKey
  }, [])

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
    page: {
      settingsOpen,
      setSettingsOpen,
      addOpen,
      setAddOpen,
      addMode,
      setAddMode,
      detailsOpen,
      manualDraft,
      setManualDraft,
      detailsSaving,
      detailsRemoving,
      searchOpen,
      searchQuery,
      setSearchQuery,
      powerOpen,
      setPowerOpen,
      musicOpen,
    },
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
