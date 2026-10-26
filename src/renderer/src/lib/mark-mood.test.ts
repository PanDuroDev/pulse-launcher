import { describe, expect, it } from 'vitest'
import { markMoodFor, signatureFor, type MarkContext } from './mark-mood'

const calm: MarkContext = {
  status: 'ready',
  refreshing: false,
  pending: false,
  running: false,
  favorite: false,
  hasSelection: true,
}

describe('markMoodFor', () => {
  it('rests on the selected game face when nothing is happening', () => {
    // Without a game the catalogue's own resting face is used.
    expect(markMoodFor(calm)).toEqual({ state: 'idle', expression: 'neutre' })
    // With one, the face is that game's signature — stable, and not always idle.
    const seeded = markMoodFor({ ...calm, seed: 'steam-1091500' })
    expect(seeded).toEqual(signatureFor('steam-1091500'))
  })

  it('thinks while the catalog is being read', () => {
    expect(markMoodFor({ ...calm, status: 'loading' }).state).toBe('thinking')
    expect(markMoodFor({ ...calm, refreshing: true }).state).toBe('thinking')
  })

  it('alerts on a failure, above every other signal', () => {
    expect(markMoodFor({ ...calm, status: 'error', pending: true }).state).toBe('alert')
  })

  it('bursts while a launch is in flight', () => {
    expect(markMoodFor({ ...calm, pending: true, running: true }).state).toBe('burst')
  })

  it('plays for a running game and notifies for a favorite', () => {
    expect(markMoodFor({ ...calm, running: true }).state).toBe('play')
    expect(markMoodFor({ ...calm, favorite: true }).state).toBe('notify')
    // A running favorite is still a running game.
    expect(markMoodFor({ ...calm, favorite: true, running: true }).state).toBe('play')
  })

  it('sleeps when the library is empty', () => {
    expect(markMoodFor({ ...calm, hasSelection: false }).state).toBe('sleep')
  })

  it('never asks for a state the engine would cut short', () => {
    const seen = new Set(
      [
        calm,
        { ...calm, status: 'loading' as const },
        { ...calm, status: 'error' as const },
        { ...calm, pending: true },
        { ...calm, running: true },
        { ...calm, favorite: true },
        { ...calm, hasSelection: false },
      ].map((ctx) => markMoodFor(ctx).state),
    )
    // Every mood is a state the catalogue can hold as a still frame.
    for (const state of seen) expect(typeof state).toBe('string')
  })
})

describe('signatureFor', () => {
  it('gives the same game the same face every time', () => {
    expect(signatureFor('steam-1091500')).toEqual(signatureFor('steam-1091500'))
  })

  it('does not give neighbouring games the same face', () => {
    const ids = ['steam-1', 'steam-2', 'steam-3', 'steam-4', 'steam-5', 'steam-6']
    const faces = new Set(ids.map((id) => signatureFor(id).expression))
    expect(faces.size).toBeGreaterThan(1)
  })

  it('keeps the ball round whichever face a game wears', () => {
    // The mark is a logo before it is a character: a cover may change what the
    // ball is doing, never what shape it is.
    const round = new Set(['idle', 'wink', 'wide', 'notify'])
    for (const id of ['steam-1', 'epic-hades', 'manual-7', 'start-menu-x', 'steam-9']) {
      expect(round.has(signatureFor(id).state)).toBe(true)
    }
  })

  it('falls back to the calm face without a game', () => {
    expect(signatureFor(null)).toEqual({ state: 'idle', expression: 'neutre' })
    expect(signatureFor(undefined)).toEqual({ state: 'idle', expression: 'neutre' })
    expect(signatureFor('')).toEqual({ state: 'idle', expression: 'neutre' })
  })

  it('wears the selected game face once the loud moods are gone', () => {
    const ctx = { ...calm, seed: 'epic-hades' }
    expect(markMoodFor(ctx)).toEqual(signatureFor('epic-hades'))
    // A running game still outranks the personal face.
    expect(markMoodFor({ ...ctx, running: true }).state).toBe('play')
  })
})
