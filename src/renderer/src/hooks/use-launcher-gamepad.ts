import type { GameSummary } from '@shared/contracts/games'
import { getCurrentFocusKey } from '@noriginmedia/norigin-spatial-navigation-core'
import { useGamepad } from '@/hooks/use-gamepad'
import { playUI } from '@/lib/ui-sfx'

interface UseLauncherGamepadOptions {
  addOpen: boolean
  bootDone: boolean
  closeAddGame: () => void
  closeDetails: () => void
  closeMusic: () => void
  closePower: () => void
  closeSearch: () => void
  closeSettings: () => void
  detailsOpen: boolean
  handleLaunch: (game: GameSummary) => unknown
  musicOpen: boolean
  openSettings: () => void
  powerOpen: boolean
  searchOpen: boolean
  selected: GameSummary | undefined
  settingsOpen: boolean
}

/** Owns confirm/back/menu handling for the launcher's gamepad navigation. */
export function useLauncherGamepad({
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
}: UseLauncherGamepadOptions): void {
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
}
