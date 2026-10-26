import type { WindowMode } from '@shared/types'

/**
 * The BrowserWindow flags that define one presentation mode.
 *
 * `frame` is only read when the window is created; the rest can be applied to
 * a live window.
 */
export interface WindowModeConfig {
  frame: boolean
  fullscreen: boolean
  alwaysOnTop: boolean
  skipTaskbar: boolean
}

const MODE_CONFIG: Record<WindowMode, WindowModeConfig> = {
  windowed: {
    frame: true,
    fullscreen: false,
    alwaysOnTop: false,
    skipTaskbar: false,
  },
  fullscreen: {
    frame: false,
    fullscreen: true,
    alwaysOnTop: false,
    skipTaskbar: false,
  },
  kiosk: {
    frame: false,
    fullscreen: true,
    alwaysOnTop: true,
    skipTaskbar: true,
  },
}

export function windowModeConfig(mode: WindowMode): WindowModeConfig {
  return MODE_CONFIG[mode]
}

export interface WindowModeEnvironment {
  /** `LAUNCHER_WINDOWED=1` asks for a normal window while developing. */
  windowed: boolean
  /** `LAUNCHER_CAPTURE=<path>` needs the windowed layout for screenshots. */
  capture: boolean
  saved: WindowMode
}

/**
 * Picks the mode used while starting up. Development overrides win over the
 * saved preference so a kiosk profile can still be inspected on a desktop.
 */
export function resolveWindowMode(environment: WindowModeEnvironment): WindowMode {
  if (environment.windowed || environment.capture) return 'windowed'
  return environment.saved
}

/**
 * Whether moving from `from` to `to` requires a new BrowserWindow.
 *
 * Electron cannot add a native frame to a live frameless window, so leaving
 * fullscreen or kiosk for `windowed` recreates the window. Every other change
 * can be applied to the existing window.
 */
export function windowModeNeedsRecreate(from: WindowMode, to: WindowMode): boolean {
  return !windowModeConfig(from).frame && windowModeConfig(to).frame
}

/** The setters used to move a live window between modes. */
export interface WindowModeTarget {
  setFullScreen: (value: boolean) => void
  setAlwaysOnTop: (value: boolean) => void
  setSkipTaskbar: (value: boolean) => void
}

/** The part of the live window state that `applyWindowMode` needs to know. */
export interface WindowModeState {
  fullscreen: boolean
}

/**
 * Moves a live window to `mode`.
 *
 * Electron's own kiosk flag is deliberately not toggled at runtime: on Windows
 * leaving and re-entering it re-runs the fullscreen transition, which drops the
 * always-on-top level. Kiosk is therefore expressed with the three properties
 * that matter here: fullscreen, always-on-top, and no taskbar entry.
 *
 * The fullscreen transition only runs when the state changes, and always-on-top
 * is applied last because entering fullscreen can reset the window level.
 */
export function applyWindowMode(
  target: WindowModeTarget,
  mode: WindowMode,
  current?: WindowModeState,
): void {
  const config = windowModeConfig(mode)

  target.setSkipTaskbar(config.skipTaskbar)
  if (!current || current.fullscreen !== config.fullscreen) {
    target.setFullScreen(config.fullscreen)
  }
  target.setAlwaysOnTop(config.alwaysOnTop)
}
