import { useMemo } from 'react'
import {
  deriveLauncherViewModel,
  type LauncherViewModel,
  type LauncherViewModelInput,
} from '@/lib/launcher-view-model'

/** React adapter for the pure launcher presentation model. */
export function useLauncherViewModel(options: LauncherViewModelInput): LauncherViewModel {
  const {
    status,
    games,
    refreshing,
    pendingLaunch,
    selected,
    gameAction,
    actionClock,
    searchOpen,
    addOpen,
    addMode,
    detailsGame,
    musicOpen,
    settingsOpen,
    powerOpen,
  } = options

  return useMemo(
    () =>
      deriveLauncherViewModel({
        status,
        games,
        refreshing,
        pendingLaunch,
        selected,
        gameAction,
        actionClock,
        searchOpen,
        addOpen,
        addMode,
        detailsGame,
        musicOpen,
        settingsOpen,
        powerOpen,
      }),
    [
      status,
      games,
      refreshing,
      pendingLaunch,
      selected,
      gameAction,
      actionClock,
      searchOpen,
      addOpen,
      addMode,
      detailsGame,
      musicOpen,
      settingsOpen,
      powerOpen,
    ],
  )
}
