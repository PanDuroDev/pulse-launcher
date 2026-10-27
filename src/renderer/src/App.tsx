import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  doesFocusableExist,
  getCurrentFocusKey,
  pause,
  resume,
  setFocus,
} from '@noriginmedia/norigin-spatial-navigation-core'
import { toast } from 'sonner'
import type {
  GameSummary,
  LibrarySort,
  UpdateManualGameInput,
} from '@shared/types'
import { sourceLabel } from '@shared/format'
import { nextLibrarySort } from '@shared/library'
import { FORCE_QUIT_GRACE_MS } from '@shared/game-control'
import { useLauncherStore } from '@/store/launcher'
import { useGamepad } from '@/hooks/use-gamepad'
import { useLibraryView } from '@/hooks/use-library-view'
import { useLauncherInitialization } from '@/hooks/use-launcher-initialization'
import { useGameActionController } from '@/hooks/use-game-action-controller'
import { useGameLaunchController } from '@/hooks/use-game-launch-controller'
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
import { invalidateArtwork } from '@/hooks/use-artwork'
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
  const initialFocusDone = useRef(false)
  const emptyFocusDone = useRef(false)
  const pendingFocusGame = useRef<string | null>(null)
  const searchReturnFocus = useRef<string | null>(null)
  const detailsReturnFocus = useRef<string | null>(null)

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

  const focusFirstElement = useCallback(() => {
    if (games.length === 0) {
      if (emptyFocusDone.current) return
      window.setTimeout(() => {
        if (!doesFocusableExist('empty-refresh')) return
        emptyFocusDone.current = true
        void setFocus('empty-refresh')
      }, 200)
      return
    }
    emptyFocusDone.current = false
    if (initialFocusDone.current || !initialFocusKey) return
    window.setTimeout(() => {
      if (!doesFocusableExist(initialFocusKey)) return
      initialFocusDone.current = true
      lastFocusKey.current = initialFocusKey
      void setFocus(initialFocusKey)
    }, 250)
  }, [games.length, initialFocusKey])

  useEffect(() => {
    if (status === 'loading' || !bootDone) return
    focusFirstElement()
  }, [bootDone, focusFirstElement, refreshing, status])

  useEffect(() => {
    if (status !== 'ready' || !lastFocusKey.current) return
    const timer = window.setTimeout(() => {
      if (!doesFocusableExist(lastFocusKey.current ?? '')) {
        const fallback = initialFocusKey
        if (fallback && doesFocusableExist(fallback)) {
          lastFocusKey.current = fallback
          void setFocus(fallback)
        }
      }
    }, 180)
    return () => window.clearTimeout(timer)
  }, [games, initialFocusKey, status])

  useEffect(() => {
    if (!bootDone) return
    const onWindowFocus = (): void => {
      window.setTimeout(() => {
        // Keep the user's place when it still exists. Focus is only recovered
        // when the focused control unmounted, for example a running-only hero
        // action after the game exits. Bringing a game to the front and back
        // must not move focus from the hero row to the last cover.
        const current = getCurrentFocusKey()
        if (current && doesFocusableExist(current)) return
        const target = lastFocusKey.current ?? initialFocusKey
        if (target && doesFocusableExist(target)) void setFocus(target)
      }, 60)
    }
    window.addEventListener('focus', onWindowFocus)
    return () => window.removeEventListener('focus', onWindowFocus)
  }, [bootDone, initialFocusKey])

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

  const handleAddGame = useCallback(() => {
    setPowerOpen(false)
    setSettingsOpen(false)
    setAddMode('game')
    setAddOpen(true)
  }, [])

  const handleSelect = useCallback(
    (game: GameSummary, focusKey: string) => {
      lastFocusKey.current = focusKey
      select(game.id)
    },
    [select],
  )

  const handleToggleFavorite = useCallback(
    async (game: GameSummary) => {
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
    },
    [],
  )

  const handleCycleSort = useCallback(() => {
    const next: LibrarySort = nextLibrarySort(settings.librarySort)
    playUI('select')
    updateSettings({ librarySort: next }).catch((error: unknown) => {
      playUI('error')
      toast.error(error instanceof Error ? error.message : 'Could not save the sort order.')
    })
  }, [settings.librarySort, updateSettings])

  const openSearch = useCallback(() => {
    if (searchOpen || settingsOpen || addOpen || powerOpen) return
    const current = getCurrentFocusKey()
    searchReturnFocus.current =
      current && !current.startsWith('search-') ? current : lastFocusKey.current
    setSearchQuery('')
    setSearchOpen(true)
  }, [addOpen, powerOpen, searchOpen, settingsOpen])

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    setSearchQuery('')
    window.setTimeout(() => {
      const preferred = searchReturnFocus.current
      if (
        preferred &&
        !preferred.startsWith('search-') &&
        doesFocusableExist(preferred)
      ) {
        void setFocus(preferred)
        return
      }
      const fallback = lastFocusKey.current ?? initialFocusKey
      if (
        fallback &&
        !fallback.startsWith('search-') &&
        doesFocusableExist(fallback)
      ) {
        void setFocus(fallback)
        return
      }
      if (initialFocusKey && doesFocusableExist(initialFocusKey)) {
        void setFocus(initialFocusKey)
      }
    }, 80)
  }, [initialFocusKey])

  const openSettings = useCallback(() => {
    if (settingsOpen) return
    setPowerOpen(false)
    setSettingsOpen(true)
    window.setTimeout(() => {
      if (doesFocusableExist('settings-back')) void setFocus('settings-back')
    }, 80)
  }, [settingsOpen])

  const closeSettings = useCallback(() => {
    // A text field owns the keyboard while it is being edited: the first
    // Escape/Back leaves the field instead of closing the page.
    const active = document.activeElement
    if (
      active instanceof HTMLElement &&
      (active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.isContentEditable)
    ) {
      active.blur()
      return
    }
    setSettingsOpen(false)
    window.setTimeout(() => {
      if (doesFocusableExist('tool-settings')) {
        void setFocus('tool-settings')
        return
      }
      const target = lastFocusKey.current ?? initialFocusKey
      if (target && doesFocusableExist(target)) {
        void setFocus(target)
      } else if (games.length === 0 && doesFocusableExist('empty-refresh')) {
        void setFocus('empty-refresh')
      }
    }, 80)
  }, [games.length, initialFocusKey])

  const openMusic = useCallback(() => {
    setPowerOpen(false)
    setMusicOpen(true)
    window.setTimeout(() => {
      if (doesFocusableExist('music-back')) void setFocus('music-back')
    }, 80)
  }, [])

  const closeMusic = useCallback(() => {
    // A field on the music page owns the keyboard: the first Escape leaves the
    // field, the second closes the page — same contract as Settings.
    const active = document.activeElement
    if (
      active instanceof HTMLElement &&
      (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)
    ) {
      active.blur()
      return
    }
    setMusicOpen(false)
    window.setTimeout(() => {
      if (doesFocusableExist('tool-music')) {
        void setFocus('tool-music')
        return
      }
      const target = lastFocusKey.current ?? initialFocusKey
      if (target && doesFocusableExist(target)) void setFocus(target)
    }, 80)
  }, [initialFocusKey])

  const closeAddGame = useCallback(() => {
    const returningToDetails = addMode !== 'game' && detailsOpen
    setAddOpen(false)
    window.setTimeout(() => {
      if (returningToDetails) {
        const key = addMode === 'image' ? 'details-art' : 'details-path'
        if (doesFocusableExist(key)) {
          void setFocus(key)
          return
        }
        if (doesFocusableExist('details-back')) {
          void setFocus('details-back')
          return
        }
      }
      if (doesFocusableExist('tool-add')) {
        void setFocus('tool-add')
        return
      }
      const target = lastFocusKey.current ?? initialFocusKey
      if (target && doesFocusableExist(target)) {
        void setFocus(target)
      } else if (games.length === 0 && doesFocusableExist('empty-add')) {
        void setFocus('empty-add')
      }
    }, 80)
  }, [addMode, detailsOpen, games.length, initialFocusKey])

  /** The picker added a game: close the page, select it, focus its card. */
  const handleGameAdded = useCallback(
    (game: GameSummary) => {
      pendingFocusGame.current = game.id
      setAddOpen(false)
      select(game.id)
      playUI('success')
      toast.success(`${game.name} added to your library`)
      // The new game arrives through the catalog change event; if it somehow
      // does not, focus still lands somewhere usable.
      window.setTimeout(() => {
        if (pendingFocusGame.current !== game.id) return
        pendingFocusGame.current = null
        if (doesFocusableExist('tool-add')) void setFocus('tool-add')
      }, 1200)
    },
    [select],
  )

  // Focus the card of a game that was just added, after the catalog event
  // has rendered it. The effect is the reliable path; the timeout above is
  // only a fallback.
  useEffect(() => {
    const gameId = pendingFocusGame.current
    if (!gameId || addOpen) return
    const row = rows.find((candidate) =>
      candidate.games.some((game) => game.id === gameId),
    )
    if (!row) return
    const focusKey = `${row.id}-${gameId}`
    if (!doesFocusableExist(focusKey)) return
    pendingFocusGame.current = null
    lastFocusKey.current = focusKey
    void setFocus(focusKey)
  }, [addOpen, rows])

  /** Open the full page for the focused game, remembering where focus was. */
  const openDetails = useCallback(
    (game: GameSummary) => {
      const current = getCurrentFocusKey()
      if (current && !current.startsWith('details-')) {
        detailsReturnFocus.current = current
      }
      setPowerOpen(false)
      setDetailsSnapshot(game)
      setManualDraft(
        game.source === 'manual'
          ? {
              gameId: game.id,
              name: game.name,
              executable: game.executable ?? '',
              artwork: undefined,
            }
          : null,
      )
      select(game.id)
      setDetailsOpen(true)
      window.setTimeout(() => {
        if (doesFocusableExist('details-back')) void setFocus('details-back')
      }, 90)
    },
    [select],
  )

  const closeDetails = useCallback(() => {
    // A text field owns the keyboard while it is being edited: the first
    // Escape/Back leaves the field instead of closing the page.
    const active = document.activeElement
    if (
      active instanceof HTMLElement &&
      (active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.isContentEditable)
    ) {
      active.blur()
      return
    }
    setDetailsOpen(false)
    setDetailsSnapshot(null)
    setManualDraft(null)
    window.setTimeout(() => {
      const preferred = detailsReturnFocus.current
      if (preferred && doesFocusableExist(preferred)) {
        void setFocus(preferred)
        return
      }
      const fallback = lastFocusKey.current ?? initialFocusKey
      if (fallback && doesFocusableExist(fallback)) {
        void setFocus(fallback)
        return
      }
      if (doesFocusableExist('tool-add')) void setFocus('tool-add')
    }, 90)
  }, [initialFocusKey])

  // The picker replaces the details page while it is open; the draft lives here
  // so a typed name survives a trip to the file browser.
  const openDetailsPicker = useCallback((mode: 'path' | 'image') => {
    setAddMode(mode)
    setAddOpen(true)
  }, [])

  const handlePickedPath = useCallback((next: string) => {
    setManualDraft((current) =>
      current ? { ...current, executable: next } : current,
    )
    setAddOpen(false)
    window.setTimeout(() => {
      if (doesFocusableExist('details-path')) void setFocus('details-path')
      else if (doesFocusableExist('details-back')) void setFocus('details-back')
    }, 100)
  }, [])

  const handlePickedArtwork = useCallback((next: string) => {
    setManualDraft((current) =>
      current ? { ...current, artwork: next } : current,
    )
    setAddOpen(false)
    window.setTimeout(() => {
      if (doesFocusableExist('details-art')) void setFocus('details-art')
      else if (doesFocusableExist('details-back')) void setFocus('details-back')
    }, 100)
  }, [])

  // The draft starts from the stored game; it is created when the page opens
  // and updated by the editor, so no effect has to mirror it from the catalog.

  const handleSaveDetails = useCallback(async () => {
    if (!selected || !manualDraft || detailsSaving) return
    setDetailsSaving(true)
    try {
      const input: UpdateManualGameInput = {
        gameId: manualDraft.gameId,
        name: manualDraft.name,
      }
      if (
        manualDraft.executable &&
        manualDraft.executable !== (selected.executable ?? '')
      ) {
        input.executable = manualDraft.executable
      }
      if (manualDraft.artwork !== undefined) {
        input.artwork = manualDraft.artwork
      }

      const result = await window.launcher.library.update(input)
      if (!result.ok || !result.game) {
        playUI('error')
        toast.error(result.error ?? 'Could not save this game.')
        return
      }

      // A new executable means a new catalog id; both ids may have cached art.
      const previousId = result.previousId ?? result.game.id
      invalidateArtwork(previousId)
      invalidateArtwork(result.game.id)
      detailsReturnFocus.current = null
      select(result.game.id)
      setDetailsSnapshot(result.game)
      setManualDraft({
        gameId: result.game.id,
        name: result.game.name,
        executable: result.game.executable ?? '',
        artwork: undefined,
      })
      playUI('success')
      toast.success(`${result.game.name} updated`)
    } catch (error) {
      playUI('error')
      toast.error(error instanceof Error ? error.message : 'Could not save this game.')
    } finally {
      setDetailsSaving(false)
    }
  }, [detailsSaving, manualDraft, select, selected])

  const handleRemoveDetails = useCallback(async () => {
    if (!selected || detailsRemoving) return
    setDetailsRemoving(true)
    try {
      const result = await window.launcher.settings.removeManual(selected.id)
      if (!result.ok) {
        playUI('error')
        toast.error(result.error ?? 'Could not remove the game.')
        return
      }
      invalidateArtwork(selected.id)
      setDetailsOpen(false)
      setDetailsSnapshot(null)
      setManualDraft(null)
      playUI('delete')
      toast.success('Removed from your library')
      window.setTimeout(() => {
        if (doesFocusableExist('tool-add')) void setFocus('tool-add')
      }, 160)
    } catch (error) {
      playUI('error')
      toast.error(
        error instanceof Error ? error.message : 'Could not remove the game.',
      )
    } finally {
      setDetailsRemoving(false)
    }
  }, [detailsRemoving, selected])

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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // The boot overlay owns the window until its own hand-off: shortcuts
      // during a fade would act on a screen the user cannot see yet.
      if (!bootDone) return
      const target = event.target as HTMLElement | null
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable

      if (event.key === 'Escape') {
        if (powerOpen) {
          event.preventDefault()
          closePower()
          return
        }
        if (searchOpen) {
          event.preventDefault()
          closeSearch()
          return
        }
        if (addOpen) {
          event.preventDefault()
          closeAddGame()
          return
        }
        if (detailsOpen) {
          event.preventDefault()
          closeDetails()
          return
        }
        if (musicOpen) {
          event.preventDefault()
          closeMusic()
          return
        }
        if (settingsOpen) {
          event.preventDefault()
          closeSettings()
          return
        }
        event.preventDefault()
        void window.launcher.app.hide()
        return
      }

      if (
        typing ||
        settingsOpen ||
        powerOpen ||
        addOpen ||
        searchOpen ||
        detailsOpen ||
        musicOpen
      ) {
        return
      }

      if ((event.ctrlKey || event.metaKey) && (event.key === 'f' || event.key === 'F')) {
        event.preventDefault()
        openSearch()
        return
      }

      if (event.key === '/') {
        event.preventDefault()
        openSearch()
        return
      }

      if (event.key === 'Tab') {
        event.preventDefault()
        cycleFocus(
          [
            'tool-refresh',
            'tool-add',
            'tool-music',
            'tool-settings',
            'tool-power',
            lastFocusKey.current ?? initialFocusKey,
          ],
          event.shiftKey,
        )
        return
      }

      if (event.key === 's' || event.key === 'S') {
        event.preventDefault()
        openSettings()
        return
      }

      if (event.key === 'm' || event.key === 'M') {
        event.preventDefault()
        openMusic()
        return
      }

      if (event.key === 'p' || event.key === 'P') {
        event.preventDefault()
        openPower()
        return
      }

      if (event.key === 'r' || event.key === 'R') {
        event.preventDefault()
        void handleRefresh()
        return
      }

      if (
        (event.key === 'i' || event.key === 'I') &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault()
        if (selected) openDetails(selected)
        return
      }

      if (
        (event.key === 'f' || event.key === 'F') &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault()
        if (selected) void handleToggleFavorite(selected)
        return
      }

      if (
        (event.key === 'o' || event.key === 'O') &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault()
        handleCycleSort()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
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
  ])

  useGamepad({
    enabled: !bootDone,
    onConfirm: () => {
      if (!bootDone) return
      if (searchOpen) {
        // The field owns the keyboard while typing; confirm opens the first
        // match. On a card, confirm opens that card.
        const focusKey = getCurrentFocusKey()
        const selector =
          focusKey && focusKey.startsWith('search-result-')
            ? `[data-focus-key="${CSS.escape(focusKey)}"]`
            : '[data-focus-key^="search-result-"]'
        document.querySelector<HTMLElement>(selector)?.click()
        return
      }
      if (powerOpen || settingsOpen || addOpen || detailsOpen || musicOpen) {
        // Confirm the control that owns the spatial focus, even after a text
        // field let go of the DOM focus on Escape.
        playUI('press')
        const focusKey = getCurrentFocusKey()
        const focused = focusKey
          ? document.querySelector<HTMLElement>(
              `[data-focus-key="${CSS.escape(focusKey)}"]`,
            )
          : null
        const target =
          focused ??
          (document.activeElement instanceof HTMLElement ? document.activeElement : null)
        target?.click()
        return
      }
      if (selected) void handleLaunch(selected)
    },
    onBack: () => {
      if (!bootDone) return
      if (powerOpen) closePower()
      else if (searchOpen) closeSearch()
      else if (addOpen) closeAddGame()
      else if (detailsOpen) closeDetails()
      else if (musicOpen) closeMusic()
      else if (settingsOpen) closeSettings()
      else void window.launcher.app.hide()
    },
    onMenu: () => {
      if (!bootDone) return
      if (powerOpen) closePower()
      else if (searchOpen) closeSearch()
      else if (addOpen) closeAddGame()
      else if (detailsOpen) closeDetails()
      else if (musicOpen) closeMusic()
      else if (settingsOpen) closeSettings()
      else openSettings()
    },
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
