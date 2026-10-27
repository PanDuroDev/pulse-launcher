import { useEffect, useRef } from 'react'
import { playUI } from '@/lib/ui-sfx'

type LauncherView = 'power' | 'search' | 'add' | 'details' | 'music' | 'settings' | 'library'

interface UseLauncherViewTransitionOptions {
  addOpen: boolean
  detailsOpen: boolean
  musicOpen: boolean
  powerOpen: boolean
  searchOpen: boolean
  settingsOpen: boolean
}

/** Derives the active top-level view and plays the matching page transition cue. */
export function useLauncherViewTransition({
  addOpen,
  detailsOpen,
  musicOpen,
  powerOpen,
  searchOpen,
  settingsOpen,
}: UseLauncherViewTransitionOptions): LauncherView {
  // Preserve the launcher's established overlay precedence: power, search,
  // add-game, details, music, settings, then the library.
  const view: LauncherView = powerOpen
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

  return view
}
