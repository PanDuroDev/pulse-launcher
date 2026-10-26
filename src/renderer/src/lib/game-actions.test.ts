import { describe, expect, it } from 'vitest'
import { FORCE_QUIT_GRACE_MS } from '@shared/game-control'
import type { GameControlResult } from '@shared/types'
import {
  IDLE_GAME_ACTION,
  actionForGame,
  cancelForceQuit,
  completeGameAction,
  failGameAction,
  forceRemainingMs,
  isGameActionBusy,
  promptForceQuit,
  startGameAction,
} from './game-actions'

const GAME = 'g1'
const T0 = 1_000_000

function result(overrides: Partial<GameControlResult>): GameControlResult {
  return { ok: true, action: 'close', ...overrides }
}

function closeRequested() {
  return startGameAction(IDLE_GAME_ACTION, GAME, 'close')
}

function requestedState(at = T0) {
  return completeGameAction(closeRequested(), result({ ok: true, action: 'close' }), at)
}

describe('actionForGame', () => {
  it('hides state that belongs to another game', () => {
    const state = closeRequested()
    expect(actionForGame(state, 'g2')).toBe(IDLE_GAME_ACTION)
    expect(actionForGame(state, GAME)).toBe(state)
    expect(actionForGame(state, undefined)).toBe(IDLE_GAME_ACTION)
  })
})

describe('startGameAction', () => {
  it('marks the action as busy', () => {
    const state = startGameAction(IDLE_GAME_ACTION, GAME, 'focus')

    expect(state).toEqual({
      kind: 'busy',
      gameId: GAME,
      action: 'focus',
      closeRequestedAt: null,
    })
    expect(isGameActionBusy(state)).toBe(true)
  })

  it('ignores a second action while one is in flight', () => {
    const first = startGameAction(IDLE_GAME_ACTION, GAME, 'close')
    expect(startGameAction(first, GAME, 'focus')).toBe(first)
  })

  it('remembers a pending close request', () => {
    const state = startGameAction(requestedState(), GAME, 'force-close')

    expect(state).toMatchObject({ kind: 'busy', action: 'force-close', closeRequestedAt: T0 })
  })
})

describe('completeGameAction', () => {
  it('starts the grace window after a successful close', () => {
    const state = completeGameAction(
      closeRequested(),
      result({ ok: true, action: 'close' }),
      T0,
    )

    expect(state).toEqual({ kind: 'close-requested', gameId: GAME, at: T0 })
  })

  it('returns to idle when the close request failed', () => {
    const state = completeGameAction(
      closeRequested(),
      result({ ok: false, action: 'close', errorCode: 'no-window' }),
      T0,
    )

    expect(state).toBe(IDLE_GAME_ACTION)
  })

  it('returns to idle after a focus, or to the close window if one exists', () => {
    const focused = startGameAction(IDLE_GAME_ACTION, GAME, 'focus')
    expect(completeGameAction(focused, result({ ok: true, action: 'focus' }), T0)).toBe(
      IDLE_GAME_ACTION,
    )

    const focusWhileClosing = startGameAction(requestedState(), GAME, 'focus')
    expect(
      completeGameAction(focusWhileClosing, result({ ok: false, action: 'focus' }), T0 + 1),
    ).toEqual({ kind: 'close-requested', gameId: GAME, at: T0 })
  })

  it('ignores a result for a different action', () => {
    const state = closeRequested()
    expect(completeGameAction(state, result({ ok: true, action: 'focus' }), T0)).toBe(state)
  })

  it('goes idle after a successful force quit', () => {
    const state = completeGameAction(
      startGameAction(requestedState(), GAME, 'force-close'),
      result({ ok: true, action: 'force-close' }),
      T0,
    )

    expect(state).toBe(IDLE_GAME_ACTION)
  })

  it('keeps the grace window when a force quit is refused', () => {
    const state = completeGameAction(
      startGameAction(requestedState(), GAME, 'force-close'),
      result({ ok: false, action: 'force-close', errorCode: 'grace-period' }),
      T0 + 100,
    )

    expect(state).toEqual({ kind: 'close-requested', gameId: GAME, at: T0 })
  })
})

describe('failGameAction', () => {
  it('restores the previous phase when the request never reached main', () => {
    expect(failGameAction(closeRequested())).toBe(IDLE_GAME_ACTION)
    expect(failGameAction(startGameAction(requestedState(), GAME, 'force-close'))).toEqual({
      kind: 'close-requested',
      gameId: GAME,
      at: T0,
    })
  })
})

describe('force quit gating', () => {
  it('counts down the grace period', () => {
    const state = requestedState()

    expect(forceRemainingMs(state, T0)).toBe(FORCE_QUIT_GRACE_MS)
    expect(forceRemainingMs(state, T0 + 2_000)).toBe(FORCE_QUIT_GRACE_MS - 2_000)
    expect(forceRemainingMs(state, T0 + FORCE_QUIT_GRACE_MS)).toBe(0)
    expect(forceRemainingMs(state, T0 + FORCE_QUIT_GRACE_MS + 5_000)).toBe(0)
  })

  it('does not offer force quit before the grace period', () => {
    const state = promptForceQuit(requestedState(), GAME, T0 + 1_000)
    expect(state).toEqual({ kind: 'close-requested', gameId: GAME, at: T0 })
  })

  it('asks for confirmation once the grace period passed', () => {
    const state = promptForceQuit(requestedState(), GAME, T0 + FORCE_QUIT_GRACE_MS)

    expect(state).toEqual({ kind: 'force-confirming', gameId: GAME, at: T0 })
    expect(cancelForceQuit(state)).toEqual({ kind: 'close-requested', gameId: GAME, at: T0 })
  })

  it('does nothing without a close request', () => {
    expect(promptForceQuit(IDLE_GAME_ACTION, GAME, T0)).toBe(IDLE_GAME_ACTION)
    expect(forceRemainingMs(IDLE_GAME_ACTION, T0)).toBe(FORCE_QUIT_GRACE_MS)
  })
})
