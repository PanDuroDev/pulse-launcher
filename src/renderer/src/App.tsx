import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  doesFocusableExist,
  getCurrentFocusKey,
  pause,
  resume,
  setFocus,
} from '@noriginmedia/norigin-spatial-navigation-core'
import type { GameSummary } from '@shared/contracts/games'
import { FORCE_QUIT_GRACE_MS } from '@shared/game-control'
import { useLauncherStore } from '@/store/launcher'
import { useLibraryView } from '@/hooks/use-library-view'
import { useLauncherInitialization } from '@/hooks/use-launcher-initialization'
import { useGameActionController } from '@/hooks/use-game-action-controller'
import { useGameLaunchController } from '@/hooks/use-game-launch-controller'
import { useLibraryActions } from '@/hooks/use-library-actions'
import { useLauncherKeyboardShortcuts } from '@/hooks/use-launcher-keyboard-shortcuts'
import { useLauncherGamepad } from '@/hooks/use-launcher-gamepad'
import { useLauncherFocusManagement } from '@/hooks/use-launcher-focus-management'
import { useGameDetailsActions } from '@/hooks/use-game-details-actions'
import { useGameDetailsNavigation } from '@/hooks/use-game-details-navigation'
import { useGameAddedFocus } from '@/hooks/use-game-added-focus'
import { useSearchNavigation } from '@/hooks/use-search-navigation'
import { useAddGameNavigation } from '@/hooks/use-add-game-navigation'
import { useSecondaryPageNavigation } from '@/hooks/use-secondary-page-navigation'
import { actionForGame, forceRemainingMs } from '@/lib/game-actions'
import { useAutoHideCursor } from '@/hooks/use-clock'
import { useUISounds } from '@/hooks/use-ui-sounds'
import { useMusicEngine } from '@/hooks/use-music-engine'
import { useMusicStore } from '@/store/music'
import { markMoodFor } from '@/lib/mark-mood'
import { playUI } from '@/lib/ui-sfx'
import { Backdrop } from '@/components/launcher/Backdrop'
import { TopBar } from '@/components/launcher/TopBar'
import { Hero } from '@/components/launcher/Hero'
import { GameRow, SortControl } from '@/components/launcher/GameRow'
import { SearchPage } from '@/components/launcher/SearchPage'
import { MusicPage } from '@/components/launcher/MusicPage'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { HintBar } from '@/components/launcher/HintBar'
import { PowerMenu } from '@/components/launcher/PowerMenu'
import { SettingsPage } from '@/components/launcher/SettingsPage'
import { AddGamePage } from '@/components/launcher/AddGamePage'
import {
  GameDetailsPage,
  type GameDetailsDraft,
} from '@/components/launcher/GameDetailsPage'
import { EmptyLibrary } from '@/components/launcher/EmptyLibrary'
import { LibraryLoading } from '@/components/launcher/LibraryLoading'
import { BootScreen } from '@/components/launcher/BootScreen'
import { bootPhaseFor } from '@/lib/boot'
import { Toaster } from '@/components/ui/sonner'

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
  const [bootDone, setBootDone] = useState(false)
  /** True once the landed mark has had a beat to settle and the library can follow. */
  const [revealed, setRevealed] = useState(false)
  const lastFocusKey = useRef<string | null>(null)

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

  const bootPhase = bootPhaseFor(status)
  const finishBoot = useCallback(() => setBootDone(true), [])

  // The header mark is the launcher's face. Everything it needs is already
  // decided here, so the mapping stays a pure function of the library's state.
  const markMood = useMemo(
    () =>
      markMoodFor({
        status,
        refreshing,
        pending: Boolean(pendingLaunch && selected && pendingLaunch.id === selected.id),
        running: Boolean(selected?.running),
        favorite: Boolean(selected?.favorite),
        hasSelection: Boolean(selected),
        seed: selected?.id ?? null,
      }),
    [pendingLaunch, refreshing, selected, status],
  )

  // The ball lands on the header mark, which is drawn on that same frame; the
  // library then rises in behind it. Two beats, not one, so the eye follows the
  // mark instead of a cross-fade.
  useEffect(() => {
    if (!bootDone) return
    const timer = window.setTimeout(() => setRevealed(true), 180)
    return () => window.clearTimeout(timer)
  }, [bootDone])

  // Spatial navigation also listens to the arrow keys. Freeze it while the
  // overlay is up, then hand the library back on the same tick the fade ends.
  useEffect(() => {
    if (bootDone) resume()
    else pause()
  }, [bootDone])

  // One place decides the page-change cue, so every entry point (button,
  // shortcut, gamepad, picker return) sounds the same.
  const view = powerOpen
    ? 'power'
    : searchOpen
      ? 'search'
      : addOpen
        ? 'add'
        : detailsOpen
          ? 'details'
          : musicOpen
            ? 'music'
            : settingsOpen
              ? 'settings'
              : 'library'
  const previousView = useRef(view)
  useEffect(() => {
    const from = previousView.current
    if (from === view) return
    previousView.current = view
    if (view === 'library') {
      playUI('back')
    } else if (from === 'library' || view === 'power') {
      playUI('open')
    } else {
      playUI('close')
    }
  }, [view])

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
      lastFocusKey.current = focusKey
      select(game.id)
    },
    [select],
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
    lastFocusKey,
    rows,
    select,
    setAddOpen,
  })

  const {
    detailsReturnFocus,
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
    detailsRemoving,
    detailsReturnFocus,
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

  /** Tab traversal over an explicit order, so keys never leave the view. */
  const cycleFocus = useCallback(
    (keys: Array<string | null>, backwards: boolean): boolean => {
      const available = keys.filter(
        (key): key is string => Boolean(key) && doesFocusableExist(key as string),
      )
      if (available.length === 0) return false
      const current = getCurrentFocusKey()
      const index = current ? available.indexOf(current) : -1
      const step = backwards ? -1 : 1
      const nextIndex =
        index === -1
          ? backwards
            ? available.length - 1
            : 0
          : (index + step + available.length) % available.length
      const next = available[nextIndex]
      if (!next) return false
      void setFocus(next)
      return true
    },
    [],
  )

  const handleAddFromSettings = useCallback(() => {
    closeSettings()
    window.setTimeout(() => handleAddGame(), 140)
  }, [closeSettings, handleAddGame])

  const openPower = useCallback(() => {
    if (powerOpen) return
    setPowerOpen(true)
  }, [powerOpen])

  const closePower = useCallback(() => {
    setPowerOpen(false)
    window.setTimeout(() => {
      if (doesFocusableExist('tool-power')) void setFocus('tool-power')
    }, 80)
  }, [])

  useLauncherKeyboardShortcuts({
    addOpen,
    bootDone,
    closeAddGame,
    closeDetails,
    closeMusic,
    closePower,
    closeSearch,
    closeSettings,
    cycleFocus,
    detailsOpen,
    handleCycleSort,
    handleRefresh,
    handleToggleFavorite,
    initialFocusKey,
    lastFocusKey,
    musicOpen,
    openDetails,
    openMusic,
    openPower,
    openSearch,
    openSettings,
    powerOpen,
    searchOpen,
    selected,
    settingsOpen,
  })

  useLauncherGamepad({
    addOpen,
    bootDone,
    closeAddGame,
    closeDetails,
    closeMusic,
    closePower,
    closeSearch,
    closeSettings,
    detailsOpen,
    handleLaunch,
    musicOpen,
    openSettings,
    powerOpen,
    searchOpen,
    selected,
    settingsOpen,
  })

  const showLoading = status === 'loading' || (games.length === 0 && refreshing)
  const showError = status === 'error' && games.length === 0
  const showEmpty = !showLoading && games.length === 0

  // The action state belongs to one game; another selection starts idle.
  // The countdown reads the clock kept in state, never the wall clock during
  // render. Before the first tick the grace period is still fully pending.
  const selectedAction = actionForGame(gameAction, selected?.id)
  const countdownVisible =
    selectedAction.kind === 'close-requested' ||
    selectedAction.kind === 'force-confirming'
  const selectedForceRemaining = countdownVisible
    ? actionClock > 0
      ? forceRemainingMs(selectedAction, actionClock)
      : FORCE_QUIT_GRACE_MS
    : 0

  return (
    <div
      className="relative h-screen w-screen overflow-hidden text-white"
      data-motion={settings.motion}
    >
      {/* The wallpaper belongs to the library, not the splash: it arrives with the
          content, once the mark has landed. */}
      <div
        aria-hidden={!revealed}
        className={`transition-opacity duration-700 ease-out ${
          revealed ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <Backdrop game={selected} reducedMotion={settings.motion === 'reduced'} />
      </div>

      <div className="relative z-10 flex h-full flex-col">
        {/* Chrome first, and early: the splash ball flies into the mark, so the
            header has to be there — dimmed to nothing until the ball lands. */}
        <div
          className={`transition-opacity duration-200 ease-out ${
            bootDone ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <TopBar
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
            reducedMotion={settings.motion === 'reduced'}
            // The header appears on the frame the ball lands, and the mark with
            // it: the crossing ends exactly on that box.
            markVisible={bootDone}
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
          />
        </div>

        {/* Everything else waits for the landing, then rises into place. */}
        <div
          className={`flex min-h-0 flex-1 flex-col transition-opacity duration-500 ease-out ${
            revealed ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {searchOpen ? (
            <ErrorBoundary
              surface="launcher"
              onBack={{ label: 'Back to library', onClick: closeSearch }}
            >
              <SearchPage
                games={games}
                query={searchQuery}
                onQueryChange={setSearchQuery}
                onBack={closeSearch}
                onSelect={handleSelect}
                onLaunch={(game) => void handleLaunch(game)}
              />
            </ErrorBoundary>
          ) : addOpen ? (
            <ErrorBoundary
              surface="launcher"
              onBack={{ label: 'Back to library', onClick: closeAddGame }}
            >
              <AddGamePage
                mode={addMode}
                onBack={closeAddGame}
                onAdded={addMode === 'game' ? handleGameAdded : undefined}
                onPicked={
                  addMode === 'image'
                    ? handlePickedArtwork
                    : addMode === 'path'
                      ? handlePickedPath
                      : undefined
                }
              />
            </ErrorBoundary>
          ) : detailsGame ? (
            <ErrorBoundary
              surface="launcher"
              onBack={{ label: 'Back to library', onClick: closeDetails }}
            >
              <GameDetailsPage
                key={detailsGame.id}
                game={detailsGame}
                pending={Boolean(
                  pendingLaunch && pendingLaunch.id === detailsGame.id,
                )}
                action={selectedAction}
                draft={
                  manualDraft && manualDraft.gameId === detailsGame.id
                    ? manualDraft
                    : null
                }
                saving={detailsSaving}
                removing={detailsRemoving}
                onDraftChange={(patch) =>
                  setManualDraft((current) =>
                    current ? { ...current, ...patch } : current,
                  )
                }
                onSave={() => void handleSaveDetails()}
                onRemove={() => void handleRemoveDetails()}
                onBack={closeDetails}
                onLaunch={(game) => void handleLaunch(game)}
                onToggleFavorite={(game) => void handleToggleFavorite(game)}
                onPickExecutable={() => openDetailsPicker('path')}
                onPickArtwork={() => openDetailsPicker('image')}
              />
            </ErrorBoundary>
          ) : musicOpen ? (
            <ErrorBoundary
              surface="launcher"
              onBack={{ label: 'Back to library', onClick: closeMusic }}
            >
              <MusicPage onBack={closeMusic} />
            </ErrorBoundary>
          ) : settingsOpen ? (
            <ErrorBoundary
              surface="launcher"
              onBack={{ label: 'Back to library', onClick: closeSettings }}
            >
              <SettingsPage onBack={closeSettings} onAddGame={handleAddFromSettings} />
            </ErrorBoundary>
          ) : showLoading ? (
            <LibraryLoading scanning={refreshing || status === 'loading'} />
          ) : showEmpty ? (
            <EmptyLibrary
              error={showError ? error : null}
              onRefresh={() => void handleRefresh()}
              onAddGame={handleAddGame}
            />
          ) : (
            <>
              <Hero
                game={selected}
                pending={Boolean(pendingLaunch && selected && pendingLaunch.id === selected.id)}
                reducedMotion={settings.motion === 'reduced'}
                action={selectedAction}
                forceRemainingMs={selectedForceRemaining}
                onLaunch={(game) => void handleLaunch(game)}
                onFocus={(game) => void handleFocusGame(game)}
                onClose={(game) => void handleCloseGame(game)}
                onForceQuit={(game) => void handleForceQuit(game)}
                onCancelForce={handleCancelForceQuit}
                onToggleFavorite={(game) => void handleToggleFavorite(game)}
                onDetails={openDetails}
              />
              <div
                data-library-scroll=""
                className="no-scrollbar relative max-h-[54vh] shrink-0 scroll-py-4 overflow-y-auto pb-24"
              >
                {rows.map((row, index) => (
                  <GameRow
                    key={row.id}
                    rowId={row.id}
                    title={row.title}
                    games={row.games}
                    onSelect={handleSelect}
                    onLaunch={(game) => void handleLaunch(game)}
                    upTarget={index === 0 ? 'hero-primary' : undefined}
                    action={
                      row.id === 'all' ? (
                        <SortControl
                          sort={settings.librarySort}
                          onPress={handleCycleSort}
                        />
                      ) : undefined
                    }
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {settingsOpen || addOpen || searchOpen || powerOpen || detailsOpen || musicOpen ? null : (
          <div
            className={`transition-opacity duration-500 ease-out ${
              revealed ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <HintBar gameCount={games.length} />
          </div>
        )}
      </div>

      {powerOpen ? (
        <PowerMenu
          onClose={closePower}
          onHide={() => void window.launcher.app.hide()}
          onQuit={() => void window.launcher.app.quit()}
        />
      ) : null}
      <Toaster position="bottom-right" richColors closeButton />
      {bootDone ? null : (
        <BootScreen
          phase={bootPhase}
          gameCount={games.length}
          error={error}
          reducedMotion={settings.motion === 'reduced'}
          onDone={finishBoot}
        />
      )}
    </div>
  )
}
