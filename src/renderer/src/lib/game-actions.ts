import type { GameControlAction, GameControlResult } from '@shared/contracts/games'
import { FORCE_QUIT_GRACE_MS } from '@shared/game-control'

/**
 * UI state for the running-game actions.
 *
 * The renderer only expresses intent: every action is resolved in the main
 * process against the identity the watcher verified. This module just keeps
 * the buttons honest about what already happened (a close was requested, the
 * grace period has passed, a force quit needs a second press).
 */
export type GameActionState =
  | { kind: 'idle' }
  | { kind: 'busy'; gameId: string; action: GameControlAction; closeRequestedAt: number | null }
  | { kind: 'close-requested'; gameId: string; at: number }
  | { kind: 'force-confirming'; gameId: string; at: number }

export const IDLE_GAME_ACTION: GameActionState = { kind: 'idle' }

/** The state to show for one game; another game's state renders as idle. */
export function actionForGame(
  state: GameActionState,
  gameId: string | undefined,
): GameActionState {
  if (!gameId || state.kind === 'idle') return IDLE_GAME_ACTION
  return state.gameId === gameId ? state : IDLE_GAME_ACTION
}

export function isGameActionBusy(state: GameActionState): boolean {
  return state.kind === 'busy'
}

function closeRequestedAtOf(state: GameActionState): number | null {
  if (state.kind === 'close-requested' || state.kind === 'force-confirming') {
    return state.at
  }
  if (state.kind === 'busy') return state.closeRequestedAt
  return null
}

/**
 * Marks an action as in flight. A pending close request is remembered so a
 * failed force quit, or a focus attempt in between, returns to the same grace
 * window instead of pretending nothing was requested.
 */
export function startGameAction(
  state: GameActionState,
  gameId: string,
  action: GameControlAction,
): GameActionState {
  const current = actionForGame(state, gameId)
  if (current.kind === 'busy') return current
  return {
    kind: 'busy',
    gameId,
    action,
    closeRequestedAt: closeRequestedAtOf(current),
  }
}

/**
 * Applies the result of an in-flight action.
 *
 * - a successful close starts the grace window;
 * - a failed force quit returns to that same window (a grace or confirmation
 *   error must not look like the request vanished);
 * - anything else returns to idle.
 */
export function completeGameAction(
  state: GameActionState,
  result: GameControlResult,
  now: number,
): GameActionState {
  if (state.kind !== 'busy' || state.action !== result.action) return state

  const { gameId, closeRequestedAt } = state
  if (result.action === 'close' && result.ok) {
    return { kind: 'close-requested', gameId, at: now }
  }
  if (result.action === 'force-close' && !result.ok && closeRequestedAt !== null) {
    return { kind: 'close-requested', gameId, at: closeRequestedAt }
  }
  if (!result.ok && result.action === 'focus' && closeRequestedAt !== null) {
    return { kind: 'close-requested', gameId, at: closeRequestedAt }
  }
  return IDLE_GAME_ACTION
}

/** Restores the previous phase when a request never reached the main process. */
export function failGameAction(state: GameActionState): GameActionState {
  if (state.kind !== 'busy') return state
  if (state.closeRequestedAt === null) return IDLE_GAME_ACTION
  return { kind: 'close-requested', gameId: state.gameId, at: state.closeRequestedAt }
}

/** Milliseconds until force quit is accepted; 0 means it is available now. */
export function forceRemainingMs(state: GameActionState, now: number): number {
  const at = closeRequestedAtOf(state)
  if (at === null) return FORCE_QUIT_GRACE_MS
  return Math.max(0, FORCE_QUIT_GRACE_MS - (now - at))
}

/**
 * Turns "Force quit" into a confirmation prompt once the grace period passed.
 * Before that the state is returned unchanged, so the button cannot bypass the
 * backend rule.
 */
export function promptForceQuit(
  state: GameActionState,
  gameId: string,
  now: number,
): GameActionState {
  const current = actionForGame(state, gameId)
  if (current.kind !== 'close-requested') return current
  if (forceRemainingMs(current, now) > 0) return current
  return { kind: 'force-confirming', gameId, at: current.at }
}

export function cancelForceQuit(state: GameActionState): GameActionState {
  if (state.kind !== 'force-confirming') return state
  return { kind: 'close-requested', gameId: state.gameId, at: state.at }
}
