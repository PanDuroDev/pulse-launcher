import type { GameControlAction, GameControlErrorCode, GameControlResult } from '@shared/types'
import { FORCE_QUIT_GRACE_MS } from '@shared/game-control'
import type { GameRunMatch } from './game-processes'
import type {
  WindowActionFailure,
  WindowActionOutcome,
  WindowActionRequest,
} from './game-window'

/**
 * Re-exported for tests and callers that import the grace period from main.
 * The value lives in `@shared/game-control` because the renderer mirrors it.
 */
export { FORCE_QUIT_GRACE_MS }

export interface GameControlDeps {
  getRunningMatch: (gameId: string) => GameRunMatch | undefined
  runWindowAction: (request: WindowActionRequest) => Promise<WindowActionOutcome>
  terminateProcess: (pid: number) => Promise<boolean>
  now?: () => number
}

interface CloseRequest {
  pid: number
  startedAt: number
  at: number
}

type ResolvedTarget =
  | { ok: true; pid: number; startedAt: number }
  | { ok: false; result: GameControlResult }

function fail(
  action: GameControlAction,
  errorCode: GameControlErrorCode,
  error: string,
  retryAfterMs?: number,
): GameControlResult {
  return retryAfterMs === undefined
    ? { ok: false, action, errorCode, error }
    : { ok: false, action, errorCode, error, retryAfterMs }
}

function failureFromProbe(
  action: GameControlAction,
  reason: WindowActionFailure | null,
): GameControlResult {
  switch (reason) {
    case 'not-found':
      return fail(action, 'not-running', 'The game process has already exited.')
    case 'identity-mismatch':
      return fail(
        action,
        'unverified-identity',
        'The process now has a different identity, so the request was refused.',
      )
    case 'no-window':
      return fail(
        action,
        'no-window',
        'The game has no window yet. It may still be starting.',
      )
    case 'foreground-denied':
      return fail(
        action,
        'failed',
        'Windows did not allow the launcher to bring the game to the front.',
      )
    case 'post-failed':
      return fail(action, 'failed', 'The game window did not accept the close request.')
    default:
      return fail(action, 'failed', 'The window request could not be completed.')
  }
}

/**
 * Turns renderer intents (`gameId` only) into actions on one verified process.
 *
 * Safety rules:
 * - a game with no single verified PID (ambiguous match, or no captured start
 *   time) is never targeted;
 * - the identity is re-checked by the window helper before anything happens;
 * - a normal close goes through WM_CLOSE;
 * - force quit is refused until a close was actually requested for the same
 *   identity and the grace period elapsed.
 */
export class GameControlService {
  private readonly deps: GameControlDeps
  private readonly closeRequests = new Map<string, CloseRequest>()

  constructor(deps: GameControlDeps) {
    this.deps = deps
  }

  async focus(gameId: string): Promise<GameControlResult> {
    const target = this.resolve('focus', gameId)
    if (!target.ok) return target.result

    const outcome = await this.deps.runWindowAction({
      action: 'focus',
      pid: target.pid,
      expectedStartedAt: target.startedAt,
    })
    return outcome.ok ? { ok: true, action: 'focus' } : failureFromProbe('focus', outcome.reason)
  }

  async close(gameId: string): Promise<GameControlResult> {
    const target = this.resolve('close', gameId)
    if (!target.ok) return target.result

    const outcome = await this.deps.runWindowAction({
      action: 'close',
      pid: target.pid,
      expectedStartedAt: target.startedAt,
    })
    if (!outcome.ok) {
      this.closeRequests.delete(gameId)
      return failureFromProbe('close', outcome.reason)
    }

    this.closeRequests.set(gameId, {
      pid: target.pid,
      startedAt: target.startedAt,
      at: this.now(),
    })
    return { ok: true, action: 'close' }
  }

  async forceClose(gameId: string, confirm: boolean): Promise<GameControlResult> {
    const target = this.resolve('force-close', gameId)
    if (!target.ok) return target.result

    if (!confirm) {
      return fail(
        'force-close',
        'confirmation-required',
        'Force quit must be confirmed explicitly.',
      )
    }

    const request = this.closeRequests.get(gameId)
    if (
      !request ||
      request.pid !== target.pid ||
      request.startedAt !== target.startedAt
    ) {
      return fail(
        'force-close',
        'close-not-requested',
        'Close the game first. Force quit is only offered if it does not exit.',
      )
    }

    const elapsed = this.now() - request.at
    if (elapsed < FORCE_QUIT_GRACE_MS) {
      const retryAfterMs = FORCE_QUIT_GRACE_MS - elapsed
      return fail(
        'force-close',
        'grace-period',
        `Wait ${Math.ceil(retryAfterMs / 1000)}s after the close request before forcing it.`,
        retryAfterMs,
      )
    }

    const terminated = await this.deps.terminateProcess(target.pid)
    this.closeRequests.delete(gameId)
    if (!terminated) {
      return fail(
        'force-close',
        'failed',
        'The process could not be terminated. It may require administrator rights.',
      )
    }
    return { ok: true, action: 'force-close' }
  }

  private resolve(action: GameControlAction, gameId: string): ResolvedTarget {
    const match = this.deps.getRunningMatch(gameId)
    if (!match) {
      this.closeRequests.delete(gameId)
      return {
        ok: false,
        result: fail(action, 'not-running', 'This game is not running.'),
      }
    }
    if (match.pid === null) {
      return {
        ok: false,
        result: fail(
          action,
          'ambiguous-process',
          'Several processes match this game, so the launcher cannot pick one safely.',
        ),
      }
    }
    if (match.startedAt === null) {
      return {
        ok: false,
        result: fail(
          action,
          'unverified-identity',
          'The launcher cannot verify the identity of this process.',
        ),
      }
    }
    return { ok: true, pid: match.pid, startedAt: match.startedAt }
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }
}

/**
 * Terminates exactly one process. Children and other processes in the same
 * install folder are deliberately left alone.
 */
export async function terminateProcess(pid: number): Promise<boolean> {
  try {
    process.kill(pid)
    return true
  } catch (error) {
    // ESRCH means it exited between verification and termination, which is the
    // outcome the user wanted anyway.
    return (error as NodeJS.ErrnoException).code === 'ESRCH'
  }
}
