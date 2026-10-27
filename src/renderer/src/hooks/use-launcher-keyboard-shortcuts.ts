import { useEffect } from 'react'
import type { GameSummary } from '@shared/contracts/games'

interface UseLauncherKeyboardShortcutsOptions {
  addOpen: boolean
  bootDone: boolean
  closeAddGame: () => void
  closeDetails: () => void
  closeMusic: () => void
  closePower: () => void
  closeSearch: () => void
  closeSettings: () => void
  cycleFocus: (keys: Array<string | null>, backwards: boolean) => boolean
  detailsOpen: boolean
  handleCycleSort: () => void
  handleRefresh: () => unknown
  handleToggleFavorite: (game: GameSummary) => unknown
  initialFocusKey: string | null
  lastFocusKey: { current: string | null }
  musicOpen: boolean
  openDetails: (game: GameSummary) => void
  openMusic: () => void
  openPower: () => void
  openSearch: () => void
  openSettings: () => void
  powerOpen: boolean
  searchOpen: boolean
  selected: GameSummary | undefined
  settingsOpen: boolean
}

/** Owns keyboard shortcuts and Escape handling for the main launcher view. */
export function useLauncherKeyboardShortcuts({
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
}: UseLauncherKeyboardShortcutsOptions): void {
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
}
