/**
 * Backwards-compatible shared type entry point.
 *
 * Domain contracts live in ./contracts/*. New code should import from the
 * narrowest contract module; existing imports from this file remain supported.
 */
import type { Settings } from './contracts/settings'

export * from './contracts/app'
export * from './contracts/games'
export * from './contracts/launcher-api'
export * from './contracts/music'
export * from './contracts/settings'

export const DEFAULT_SETTINGS: Settings = {
  showStartMenuApps: false,
  steamGridDbApiKey: '',
  hideCursorAfterMs: 2500,
  motion: 'system',
  // Fullscreen without always-on-top keeps Alt+Tab and other windows usable;
  // kiosk stays an explicit choice for dedicated machines.
  windowMode: 'fullscreen',
  returnAfterGame: true,
  // A stable A–Z order is the least surprising first view of a new library.
  librarySort: 'title',
  // Sound is part of the launcher's feel, but it stays one switch away.
  uiSounds: true,
}
