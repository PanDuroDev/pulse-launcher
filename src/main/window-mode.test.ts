import { describe, expect, it } from 'vitest'
import {
  applyWindowMode,
  resolveWindowMode,
  windowModeConfig,
  windowModeNeedsRecreate,
} from './window-mode'

function recorder() {
  const calls: string[] = []
  return {
    calls,
    target: {
      setFullScreen: (value: boolean) => calls.push(`fullscreen:${value}`),
      setAlwaysOnTop: (value: boolean) => calls.push(`top:${value}`),
      setSkipTaskbar: (value: boolean) => calls.push(`skip:${value}`),
    },
  }
}

describe('windowModeConfig', () => {
  it('never uses always-on-top outside kiosk', () => {
    expect(windowModeConfig('windowed')).toEqual({
      frame: true,
      fullscreen: false,
      alwaysOnTop: false,
      skipTaskbar: false,
    })
    expect(windowModeConfig('fullscreen')).toEqual({
      frame: false,
      fullscreen: true,
      alwaysOnTop: false,
      skipTaskbar: false,
    })
  })

  it('makes kiosk the only always-on-top, taskbar-less mode', () => {
    expect(windowModeConfig('kiosk')).toEqual({
      frame: false,
      fullscreen: true,
      alwaysOnTop: true,
      skipTaskbar: true,
    })
  })
})

describe('resolveWindowMode', () => {
  it('uses the saved preference by default', () => {
    expect(resolveWindowMode({ windowed: false, capture: false, saved: 'kiosk' })).toBe('kiosk')
  })

  it('lets development flags force a windowed layout', () => {
    expect(resolveWindowMode({ windowed: true, capture: false, saved: 'kiosk' })).toBe(
      'windowed',
    )
    expect(resolveWindowMode({ windowed: false, capture: true, saved: 'fullscreen' })).toBe(
      'windowed',
    )
  })
})

describe('windowModeNeedsRecreate', () => {
  it('recreates only when the target needs a native frame', () => {
    expect(windowModeNeedsRecreate('fullscreen', 'windowed')).toBe(true)
    expect(windowModeNeedsRecreate('kiosk', 'windowed')).toBe(true)
    expect(windowModeNeedsRecreate('windowed', 'fullscreen')).toBe(false)
    expect(windowModeNeedsRecreate('fullscreen', 'kiosk')).toBe(false)
    expect(windowModeNeedsRecreate('kiosk', 'fullscreen')).toBe(false)
    expect(windowModeNeedsRecreate('windowed', 'windowed')).toBe(false)
  })
})

describe('applyWindowMode', () => {
  it('enters fullscreen from a normal window', () => {
    const { calls, target } = recorder()
    applyWindowMode(target, 'fullscreen', { fullscreen: false })

    expect(calls).toEqual(['skip:false', 'fullscreen:true', 'top:false'])
  })

  it('applies fullscreen before always-on-top for kiosk', () => {
    const { calls, target } = recorder()
    applyWindowMode(target, 'kiosk', { fullscreen: false })

    expect(calls).toEqual(['skip:true', 'fullscreen:true', 'top:true'])
  })

  it('leaves an already-fullscreen window in place when switching modes', () => {
    const kiosk = recorder()
    applyWindowMode(kiosk.target, 'kiosk', { fullscreen: true })
    expect(kiosk.calls).toEqual(['skip:true', 'top:true'])

    const fullscreen = recorder()
    applyWindowMode(fullscreen.target, 'fullscreen', { fullscreen: true })
    expect(fullscreen.calls).toEqual(['skip:false', 'top:false'])
  })

  it('turns everything off for a windowed mode', () => {
    const { calls, target } = recorder()
    applyWindowMode(target, 'windowed', { fullscreen: true })

    expect(calls).toEqual(['skip:false', 'fullscreen:false', 'top:false'])
  })

  it('always re-applies the fullscreen flag when the state is unknown', () => {
    const { calls, target } = recorder()
    applyWindowMode(target, 'windowed')

    expect(calls).toEqual(['skip:false', 'fullscreen:false', 'top:false'])
  })
})
