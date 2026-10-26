/**
 * Tracks the "return to Pulse after the game exits" intent.
 *
 * The launcher hides as soon as the launch request is accepted, which can be
 * before the process watcher has seen the game. Auto-return therefore waits
 * until the launched game has actually been observed running, then waits until
 * no tracked game is running anymore. A launch that never produces a process
 * leaves the launcher hidden instead of bouncing back immediately; tray and
 * `Ctrl+Alt+L` still restore it.
 */
export interface AutoReturnState {
  /** The game whose launch hid the launcher, or `null` when nothing is armed. */
  gameId: string | null
  /** Whether the target game has been observed running since the launcher hid. */
  seenRunning: boolean
}

export const NO_AUTO_RETURN: AutoReturnState = {
  gameId: null,
  seenRunning: false,
}

export type AutoReturnAction = 'none' | 'wait' | 'return'

export interface AutoReturnUpdate {
  state: AutoReturnState
  action: AutoReturnAction
}

/**
 * Arms auto-return after the launcher hid itself for `gameId`.
 *
 * `alreadyRunning` seeds the state from the watcher's current knowledge. The
 * watcher only reports changes, so a game that was already running when the
 * launcher hid may never be reported as running again.
 */
export function markHiddenForGame(gameId: string, alreadyRunning: boolean): AutoReturnState {
  return { gameId, seenRunning: alreadyRunning }
}

/**
 * Advances the state with the games the watcher currently sees.
 *
 * Returns `'return'` exactly once, when the target was seen running and the
 * running set is now empty. Any other case keeps the launcher hidden; showing
 * the window by any other route disarms the state.
 */
export function nextAutoReturn(
  state: AutoReturnState,
  runningGameIds: readonly string[],
): AutoReturnUpdate {
  if (state.gameId === null) return { state, action: 'none' }

  if (runningGameIds.includes(state.gameId)) {
    if (state.seenRunning) return { state, action: 'wait' }
    return { state: { gameId: state.gameId, seenRunning: true }, action: 'wait' }
  }

  if (!state.seenRunning || runningGameIds.length > 0) {
    return { state, action: 'wait' }
  }

  return { state: NO_AUTO_RETURN, action: 'return' }
}
