import { useEffect, useState } from 'react'
import { pause, resume } from '@noriginmedia/norigin-spatial-navigation-core'
import { useLauncherStore } from '@/store/launcher'
import { useLauncherBootSequence } from '@/hooks/use-launcher-boot-sequence'
import { useLauncherInitialization } from '@/hooks/use-launcher-initialization'
import { useGameActionController } from '@/hooks/use-game-action-controller'
import { useGameLaunchController } from '@/hooks/use-game-launch-controller'
import { useLibraryActions } from '@/hooks/use-library-actions'
import { useLauncherInputHandlers } from '@/hooks/use-launcher-input-handlers'
import { useLauncherNavigationController } from '@/hooks/use-launcher-navigation-controller'
import { useLauncherPageState } from '@/hooks/use-launcher-page-state'
import { useLauncherViewModel } from '@/hooks/use-launcher-view-model'
import { useAutoHideCursor } from '@/hooks/use-clock'
import { useUISounds } from '@/hooks/use-ui-sounds'
import { useMusicEngine } from '@/hooks/use-music-engine'
import { useMusicStore } from '@/store/music'
import { LauncherPageContent } from '@/components/launcher/LauncherPageContent'
import { LauncherFrame } from '@/components/launcher/LauncherFrame'

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

  const [demo, setDemo] = useState(false)
  const { bootDone, finishBoot, revealed, bootPhase } = useLauncherBootSequence(status)

  const page = useLauncherPageState()
  const { library, focus, navigation } = useLauncherNavigationController({
    games,
    selectedId,
    librarySort: settings.librarySort,
    refreshing,
    status,
    bootDone,
    select,
    page,
  })

  const {
    settingsOpen,
    addOpen,
    addMode,
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
  } = page
  const { rows, selected, detailsGame, initialFocusKey } = library
  const { lastFocusKey } = focus
  const {
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
  } = navigation

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