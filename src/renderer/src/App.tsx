import { useCallback, useEffect, useRef, useState } from 'react'
import { pause, resume } from '@noriginmedia/norigin-spatial-navigation-core'
import type { GameSummary } from '@shared/contracts/games'
import { useLauncherStore } from '@/store/launcher'
import { useLibraryView } from '@/hooks/use-library-view'
import { useLauncherBootSequence } from '@/hooks/use-launcher-boot-sequence'
import { useLauncherViewTransition } from '@/hooks/use-launcher-view-transition'
import { useLauncherInitialization } from '@/hooks/use-launcher-initialization'
import { useGameActionController } from '@/hooks/use-game-action-controller'
import { useGameLaunchController } from '@/hooks/use-game-launch-controller'
import { useLibraryActions } from '@/hooks/use-library-actions'
import { useLauncherInputHandlers } from '@/hooks/use-launcher-input-handlers'
import { useLauncherViewModel } from '@/hooks/use-launcher-view-model'
import { useLauncherFocusManagement } from '@/hooks/use-launcher-focus-management'
import { useGameDetailsActions } from '@/hooks/use-game-details-actions'
import { useGameDetailsNavigation } from '@/hooks/use-game-details-navigation'
import { useGameAddedFocus } from '@/hooks/use-game-added-focus'
import { useSearchNavigation } from '@/hooks/use-search-navigation'
import { useAddGameNavigation } from '@/hooks/use-add-game-navigation'
import { useSecondaryPageNavigation } from '@/hooks/use-secondary-page-navigation'
import { useAutoHideCursor } from '@/hooks/use-clock'
import { useUISounds } from '@/hooks/use-ui-sounds'
import { useMusicEngine } from '@/hooks/use-music-engine'
import { useMusicStore } from '@/store/music'
import { LauncherPageContent } from '@/components/launcher/LauncherPageContent'
import { LauncherFrame } from '@/components/launcher/LauncherFrame'
import type { GameDetailsDraft } from '@/components/launcher/GameDetailsPage'

export default function App() {
  const games = useLauncherStore((state) => state.games)
  const settings = useLauncherStore((state) => state.settings)
  const selectedId = useLauncherStore((state) => state.selectedId)
  const status = useLauncherStore((state) => state.status)
  const error = useLauncherStore((state) => state.error)
  const refreshing = useLauncherStore((state) => state.refreshing)
  const staleSources = useLauncherStore((state) => state.staleSources)
  const scanProgress = useLauncherStore((state) => state.scanProgress)
  const refresh = useLauncherStore((state) => state.refresh)
  const select = useLauncherStore((state) => state.select)
  const updateSettings = useLauncherStore((state) => state.updateSettings)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [addMode, setAddMode] = useState<'game' | 'path' | 'image'>('game')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [detailsSnapshot, setDetailsSnapshot] = useState<GameSummary | null>(null)
  const [manualDraft, setManualDraft] = useState<GameDetailsDraft | null>(null)
  const [detailsSaving, setDetailsSaving] = useState(false)
  const [detailsRemoving, setDetailsRemoving] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [powerOpen, setPowerOpen] = useState(false)
  const [musicOpen, setMusicOpen] = useState(false)
  const [demo, setDemo] = useState(false)
  /** True once the landed mark has had a beat to settle and the library can follow. */
  const lastFocusKey = useRef<string | null>(null)

  const rememberFocusKey = useCallback((focusKey: string) => {
    lastFocusKey.current = focusKey
  }, [])

  const { bootDone, finishBoot, revealed, bootPhase } = useLauncherBootSequence(status)

  const {
    rows,
    selected,
    detailsGame,
    initialFocusKey,
  } = useLibraryView({
    games,
    selectedId,
    librarySort: settings.librarySort,
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

  const {
    gameAction,
    actionClock,
    clearFinishedGameAction,
    handleFocusGame,
    handleCloseGame,
    handleForceQuit,
    handleCancelForceQuit,
  } = useGameActionController()
  const { pendingLaunch, handleLaunch } = useGameLaunchController({
    games,
    demo,
    onFocusGame: handleFocusGame,
  })

  const { markMood, showLoading, showError, showEmpty, selectedAction, selectedForceRemaining } =
    useLauncherViewModel({
      status,
      games,
      refreshing,
      pendingLaunch,
      selected,
      gameAction,
      actionClock,
    })

  const { handleRefresh, handleToggleFavorite, handleCycleSort } = useLibraryActions({
    refresh,
    updateSettings,
    librarySort: settings.librarySort,
  })

  useLauncherInitialization({
    clearFinishedGameAction,
    onDemoLoaded: setDemo,
  })

  const musicTracks = useMusicStore((state) => state.tracks)
  useMusicEngine(musicTracks, bootDone)

  useAutoHideCursor(settings.hideCursorAfterMs)
  useUISounds(settings.uiSounds)

  // Spatial navigation also listens to the arrow keys. Freeze it while the
  // overlay is up, then hand the library back on the same tick the fade ends.
  useEffect(() => {
    if (bootDone) resume()
    else pause()
  }, [bootDone])

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

  // The draft starts from the stored game; it is created when the page opens
  // and updated by the editor, so no effect has to mirror it from the catalog.

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

  const { openPower, closePower } = useLauncherInputHandlers({
    addOpen,
    bootDone,
    closeAddGame,
    closeDetails,
    closeMusic,
    closeSearch,
    closeSettings,
    detailsOpen,
    handleCycleSort,
    handleLaunch,
    handleRefresh,
    handleToggleFavorite,
    initialFocusKey,
    lastFocusKey,
    musicOpen,
    openDetails,
    openMusic,
    openSearch,
    openSettings,
    powerOpen,
    searchOpen,
    selected,
    setPowerOpen,
    settingsOpen,
  })

  return (
    <LauncherFrame
      motion={settings.motion}
      selected={selected}
      revealed={revealed}
      bootDone={bootDone}
      demo={demo}
      title={
        searchOpen
          ? 'Search'
          : addOpen
            ? addMode === 'image'
              ? 'Cover art'
              : addMode === 'path'
                ? 'Game file'
                : 'Add game'
            : detailsOpen
              ? 'Game details'
              : musicOpen
                ? 'Music'
                : settingsOpen
                  ? 'Settings'
                  : 'Library'
      }
      markMood={markMood}
      showTools={!settingsOpen && !addOpen && !searchOpen && !detailsOpen && !musicOpen}
      refreshing={refreshing}
      scanProgress={scanProgress}
      staleSources={staleSources}
      onRefresh={() => void handleRefresh()}
      onAddGame={handleAddGame}
      onOpenMusic={openMusic}
      onOpenSettings={openSettings}
      onOpenPower={openPower}
      showHintBar={!(settingsOpen || addOpen || searchOpen || powerOpen || detailsOpen || musicOpen)}
      gameCount={games.length}
      powerOpen={powerOpen}
      onClosePower={closePower}
      onHide={() => void window.launcher.app.hide()}
      onQuit={() => void window.launcher.app.quit()}
      bootPhase={bootPhase}
      error={error}
      onBootDone={finishBoot}
    >
      <LauncherPageContent
        page={{
          searchOpen,
          searchQuery,
          addOpen,
          addMode,
          detailsGame,
          musicOpen,
          settingsOpen,
          showLoading,
          showEmpty,
          showError,
          error,
          status,
          refreshing,
          manualDraft,
          detailsSaving,
          detailsRemoving,
        }}
        library={{
          games,
          selected,
          rows,
          settings,
          pendingLaunch,
          selectedAction,
          selectedForceRemaining,
        }}
        actions={{
          closeSearch,
          closeAddGame,
          handleSelect,
          handleLaunch,
          handleGameAdded,
          handlePickedArtwork,
          handlePickedPath,
          setSearchQuery,
          setManualDraft,
          handleSaveDetails,
          handleRemoveDetails,
          closeDetails,
          openDetails,
          handleToggleFavorite,
          openDetailsPicker,
          closeMusic,
          closeSettings,
          handleAddFromSettings,
          handleRefresh,
          handleAddGame,
          handleFocusGame,
          handleCloseGame,
          handleForceQuit,
          handleCancelForceQuit,
          handleCycleSort,
        }}
      />
    </LauncherFrame>
  )
}