import { describe, expect, it } from 'vitest'
import {
  markHiddenForGame,
  nextAutoReturn,
  NO_AUTO_RETURN,
} from './auto-return'

describe('markHiddenForGame', () => {
  it('arms auto-return for the launched game', () => {
    expect(markHiddenForGame('steam-1', false)).toEqual({
      gameId: 'steam-1',
      seenRunning: false,
    })
  })

  it('treats a game that was already running as observed', () => {
    expect(markHiddenForGame('steam-1', true)).toEqual({
      gameId: 'steam-1',
      seenRunning: true,
    })
  })
})

describe('nextAutoReturn', () => {
  it('does nothing when no game is armed', () => {
    expect(nextAutoReturn(NO_AUTO_RETURN, [])).toEqual({
      state: NO_AUTO_RETURN,
      action: 'none',
    })
    expect(nextAutoReturn(NO_AUTO_RETURN, ['steam-1'])).toEqual({
      state: NO_AUTO_RETURN,
      action: 'none',
    })
  })

  it('waits before the launched game has been observed', () => {
    const armed = markHiddenForGame('steam-1', false)

    expect(nextAutoReturn(armed, [])).toEqual({ state: armed, action: 'wait' })
    expect(nextAutoReturn(armed, ['steam-2'])).toEqual({ state: armed, action: 'wait' })
  })

  it('marks the game as observed once the watcher reports it', () => {
    const armed = markHiddenForGame('steam-1', false)
    const update = nextAutoReturn(armed, ['steam-1'])

    expect(update.action).toBe('wait')
    expect(update.state).toEqual({ gameId: 'steam-1', seenRunning: true })
  })

  it('keeps waiting while the observed game is still running', () => {
    const armed = markHiddenForGame('steam-1', true)

    expect(nextAutoReturn(armed, ['steam-1'])).toEqual({ state: armed, action: 'wait' })
    expect(nextAutoReturn(armed, ['steam-1', 'steam-2'])).toEqual({
      state: armed,
      action: 'wait',
    })
  })

  it('waits while another tracked game is still running', () => {
    const armed = markHiddenForGame('steam-1', true)
    const update = nextAutoReturn(armed, ['steam-2'])

    expect(update).toEqual({ state: armed, action: 'wait' })
  })

  it('returns once the observed game and every tracked game have exited', () => {
    const armed = markHiddenForGame('steam-1', false)
    const seen = nextAutoReturn(armed, ['steam-1']).state

    expect(nextAutoReturn(seen, [])).toEqual({
      state: NO_AUTO_RETURN,
      action: 'return',
    })
  })

  it('does not return twice', () => {
    const armed = markHiddenForGame('steam-1', true)
    const first = nextAutoReturn(armed, [])
    expect(first.action).toBe('return')

    expect(nextAutoReturn(first.state, [])).toEqual({
      state: NO_AUTO_RETURN,
      action: 'none',
    })
  })
})
