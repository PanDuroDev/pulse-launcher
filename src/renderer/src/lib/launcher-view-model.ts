import type { GameSummary } from '@shared/contracts/games'
import { FORCE_QUIT_GRACE_MS } from '@shared/game-control'
import type { GameActionState } from '@/lib/game-actions'
import { actionForGame, forceRemainingMs } from '@/lib/game-actions'
import { markMoodFor } from '@/lib/mark-mood'
import type { MarkMood } from '@/lib/mark-mood'
import type { AddMode, LauncherRoute, LauncherStatus } from './launcher-page-types'


interface PendingLaunchIdentity {
  id: string
}

export interface LauncherViewModelInput {
  status: LauncherStatus
  games: GameSummary[]
  refreshing: boolean
  pendingLaunch: PendingLaunchIdentity | null
  selected: GameSummary | undefined
  gameAction: GameActionState
  actionClock: number
  searchOpen: boolean
  addOpen: boolean
  addMode: AddMode
  detailsGame: GameSummary | null
  musicOpen: boolean
  settingsOpen: boolean
  powerOpen: boolean
}

export interface LauncherViewModel {
  activePage: LauncherRoute
  markMood: MarkMood
  showLoading: boolean
  showError: boolean
  showEmpty: boolean
  selectedAction: GameActionState
  selectedForceRemaining: number
  title: string
  showTools: boolean
  showHintBar: boolean
}

/** Purely derives the selected game's presentation and active-page affordances. */
export function deriveLauncherViewModel({
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
}: LauncherViewModelInput): LauncherViewModel {
  const markMood = markMoodFor({
    status,
    refreshing,
    pending: Boolean(pendingLaunch && selected && pendingLaunch.id === selected.id),
    running: Boolean(selected?.running),
    favorite: Boolean(selected?.favorite),
    hasSelection: Boolean(selected),
    seed: selected?.id ?? null,
  })

  const showLoading = status === 'loading' || (games.length === 0 && refreshing)
  const showError = status === 'error' && games.length === 0
  const showEmpty = !showLoading && games.length === 0

  // The action state belongs to one game; another selection starts idle.
  // Before the first tick the grace period is still fully pending.
  const selectedAction = actionForGame(gameAction, selected?.id)
  const countdownVisible =
    selectedAction.kind === 'close-requested' ||
    selectedAction.kind === 'force-confirming'
  const selectedForceRemaining = countdownVisible
    ? actionClock > 0
      ? forceRemainingMs(selectedAction, actionClock)
      : FORCE_QUIT_GRACE_MS
    : 0

  // The active route is shared by the title and the page renderer.
  const activePage: LauncherRoute = searchOpen
    ? 'search'
    : addOpen
      ? 'add'
      : detailsGame
        ? 'details'
        : musicOpen
          ? 'music'
          : settingsOpen
            ? 'settings'
            : showLoading
              ? 'loading'
              : showEmpty
                ? 'empty'
                : 'library'

  const title =
    activePage === 'search'
      ? 'Search'
      : activePage === 'add'
        ? addMode === 'image'
          ? 'Cover art'
          : addMode === 'path'
            ? 'Game file'
            : 'Add game'
        : activePage === 'details'
          ? 'Game details'
          : activePage === 'music'
            ? 'Music'
            : activePage === 'settings'
              ? 'Settings'
              : 'Library'
  const showTools =
    activePage !== 'search' &&
    activePage !== 'add' &&
    activePage !== 'details' &&
    activePage !== 'music' &&
    activePage !== 'settings'
  const showHintBar =
    activePage !== 'search' &&
    activePage !== 'add' &&
    activePage !== 'details' &&
    activePage !== 'music' &&
    activePage !== 'settings' &&
    !powerOpen

  return {
    activePage,
    markMood,
    showLoading,
    showError,
    showEmpty,
    selectedAction,
    selectedForceRemaining,
    title,
    showTools,
    showHintBar,
  }
}
