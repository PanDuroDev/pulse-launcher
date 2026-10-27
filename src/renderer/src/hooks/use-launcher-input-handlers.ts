import { useCallback } from 'react'
import {
  doesFocusableExist,
  getCurrentFocusKey,
  setFocus,
} from '@noriginmedia/norigin-spatial-navigation-core'
import type { GameSummary } from '@shared/contracts/games'
import { useLauncherKeyboardShortcuts } from '@/hooks/use-launcher-keyboard-shortcuts'
import { useLauncherGamepad } from '@/hooks/use-launcher-gamepad'

type KeyboardOptions = Parameters<typeof useLauncherKeyboardShortcuts>[0]
type GamepadOptions = Parameters<typeof useLauncherGamepad>[0]

type UseLauncherInputHandlersOptions =
  Omit<KeyboardOptions, 'cycleFocus' | 'closePower' | 'openPower'> &
  Pick<GamepadOptions, 'handleLaunch'> & {
    setPowerOpen: (open: boolean) => void
  }

/** Binds keyboard shortcuts, Tab focus traversal, and gamepad actions together. */
export function useLauncherInputHandlers(options: UseLauncherInputHandlersOptions) {
  const {
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
  } = options

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

  const openPower = useCallback(() => {
    if (powerOpen) return
    setPowerOpen(true)
  }, [powerOpen, setPowerOpen])

  const closePower = useCallback(() => {
    setPowerOpen(false)
    window.setTimeout(() => {
      if (doesFocusableExist('tool-power')) void setFocus('tool-power')
    }, 80)
  }, [setPowerOpen])

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

  return { openPower, closePower }
}
