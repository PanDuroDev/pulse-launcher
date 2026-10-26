import { describe, expect, it } from 'vitest'
import { parseWindowAction } from './game-window'

describe('parseWindowAction', () => {
  it('parses a successful window action', () => {
    expect(
      parseWindowAction('{"ok":true,"handle":197004,"title":"Game","reason":null}'),
    ).toEqual({ ok: true, handle: 197_004, title: 'Game', reason: null })
  })

  it('parses a refusal with a known reason', () => {
    expect(
      parseWindowAction('{"ok":false,"handle":0,"title":null,"reason":"no-window"}'),
    ).toEqual({ ok: false, handle: 0, title: null, reason: 'no-window' })
  })

  it('rejects malformed or contradictory output', () => {
    expect(parseWindowAction('not-json')).toBeNull()
    expect(parseWindowAction('[]')).toBeNull()
    expect(parseWindowAction('{"handle":1}')).toBeNull()
    expect(
      parseWindowAction('{"ok":true,"handle":1,"reason":"post-failed"}'),
    ).toBeNull()
    expect(parseWindowAction('{"ok":true,"handle":-5}')).toEqual({
      ok: true,
      handle: null,
      title: null,
      reason: null,
    })
  })

  it('drops an unknown reason instead of trusting it', () => {
    expect(
      parseWindowAction('{"ok":false,"handle":0,"reason":"something-else"}'),
    ).toEqual({ ok: false, handle: 0, title: null, reason: null })
  })
})
