import { useMemo } from 'react'
import type { GameSummary } from '@shared/contracts/games'
import { FORCE_QUIT_GRACE_MS } from '@shared/game-control'
import type { GameActionState } from '@/lib/game-actions'
import { actionForGame, forceRemainingMs } from '@/lib/game-actions'
import { markMoodFor } from '@/lib/mark-mood'
import type { MarkMood } from '@/lib/mark-mood'

type LauncherStatus = 'loading' | 'ready' | 'error'

interface PendingLaunchIdentity {
  id: string
}

interface UseLauncherViewModelOptions {
  status: LauncherStatus
  games: GameSummary[]
  refreshing: boolean
  pendingLaunch: PendingLaunchIdentity | null
  selected: GameSummary | undefined
  gameAction: GameActionState
  actionClock: number
}

interface LauncherViewModel {
  markMood: MarkMood
  showLoading: boolean
  showError: boolean
  showEmpty: boolean
  selectedAction: GameActionState
  selectedForceRemaining: number
}

/** Derives presentation-only state for the active library and selected game. */
export function useLauncherViewModel({
  status,
  games,
  refreshing,
  pendingLaunch,
  selected,
  gameAction,
  actionClock,
}: UseLauncherViewModelOptions): LauncherViewModel {
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

  return {
    markMood,
    showLoading,
    showError,
    showEmpty,
    selectedAction,
    selectedForceRemaining,
  }
}
