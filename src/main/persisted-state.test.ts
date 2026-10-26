import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/types'
import {
  CATALOG_SCHEMA_VERSION,
  migrateToCurrent,
  parseHistoryFile,
  parseSettingsFile,
  SETTINGS_SCHEMA_VERSION,
} from './persisted-state'

const VALID_GAME = {
  id: 'manual-1',
  name: 'Local Game',
  executable: 'C:\\Games\\game.exe',
  addedAt: 1,
}

describe('migrateToCurrent', () => {
  it('treats a document without a version as the current version', () => {
    const result = migrateToCurrent({ settings: {} }, 1)

    expect(result).toMatchObject({ ok: true, from: 1 })
    if (result.ok) expect(result.data.version).toBe(1)
  })

  it('applies one migration per version step', () => {
    const steps: number[] = []
    const result = migrateToCurrent({ version: 1, value: 1 }, 3, {
      1: (data) => {
        steps.push(1)
        return { ...data, value: 2 }
      },
      2: (data) => {
        steps.push(2)
        return { ...data, value: 3 }
      },
    })

    expect(steps).toEqual([1, 2])
    expect(result).toMatchObject({ ok: true, from: 1 })
    if (result.ok) expect(result.data).toMatchObject({ version: 3, value: 3 })
  })

  it('reports a missing migration step', () => {
    const result = migrateToCurrent({ version: 1 }, 3, {
      2: (data) => data,
    })

    expect(result).toEqual({
      ok: false,
      message: 'no migration from schema version 1 to 2',
    })
  })

  it('rejects a file from a newer version', () => {
    const result = migrateToCurrent({ version: 9 }, 2)

    expect(result).toEqual({
      ok: false,
      message: 'schema version 9 is newer than the supported version 2',
    })
  })

  it.each([
    ['a non-object', 'nope'],
    ['a null value', null],
    ['an array', []],
  ])('rejects %s', (_label, raw) => {
    expect(migrateToCurrent(raw, 1)).toEqual({
      ok: false,
      message: 'the file is not a JSON object',
    })
  })

  it.each([0, -1, 1.5, '1', null])('rejects the invalid version %s', (version) => {
    expect(migrateToCurrent({ version }, 1)).toEqual({
      ok: false,
      message: 'the schema version is invalid',
    })
  })
})

describe('parseSettingsFile', () => {
  it('loads a valid versioned file', () => {
    const parsed = parseSettingsFile({
      version: SETTINGS_SCHEMA_VERSION,
      settings: {
        showStartMenuApps: true,
        steamGridDbApiKey: 'key',
        hideCursorAfterMs: 3_000,
        motion: 'reduced',
        windowMode: 'kiosk',
        returnAfterGame: false,
        librarySort: 'added',
      },
      manualGames: [VALID_GAME],
      favorites: ['steam-1', 'epic-2'],
    })

    expect(parsed.issues).toEqual([])
    expect(parsed.settings).toEqual({
      showStartMenuApps: true,
      steamGridDbApiKey: 'key',
      hideCursorAfterMs: 3_000,
      motion: 'reduced',
      windowMode: 'kiosk',
      returnAfterGame: false,
      librarySort: 'added',
      uiSounds: true,
    })
    expect(parsed.manualGames).toEqual([VALID_GAME])
    expect(parsed.favorites).toEqual(['steam-1', 'epic-2'])
  })

  it('falls back to fullscreen when a saved window mode is unknown', () => {
    const parsed = parseSettingsFile({
      version: SETTINGS_SCHEMA_VERSION,
      settings: { windowMode: 'borderless' },
      manualGames: [],
    })

    expect(parsed.settings.windowMode).toBe('fullscreen')
    expect(parsed.issues).toEqual([
      'settings.windowMode is invalid; the default value was used',
    ])
  })

  it('defaults the window mode for files written before it existed', () => {
    const parsed = parseSettingsFile({
      version: SETTINGS_SCHEMA_VERSION,
      settings: { motion: 'full' },
      manualGames: [],
    })

    expect(parsed.settings.windowMode).toBe(DEFAULT_SETTINGS.windowMode)
    expect(parsed.settings.returnAfterGame).toBe(true)
    expect(parsed.issues).toEqual([])
  })

  it('falls back to returning after a game when the saved flag is invalid', () => {
    const parsed = parseSettingsFile({
      version: SETTINGS_SCHEMA_VERSION,
      settings: { returnAfterGame: 'yes' },
      manualGames: [],
    })

    expect(parsed.settings.returnAfterGame).toBe(true)
    expect(parsed.issues).toEqual([
      'settings.returnAfterGame is invalid; the default value was used',
    ])
  })

  it('loads a legacy file that has no version field', () => {
    const parsed = parseSettingsFile({
      settings: { motion: 'full' },
      manualGames: [],
    })

    expect(parsed.issues).toEqual([])
    expect(parsed.settings.motion).toBe('full')
  })

  it('keeps valid fields and falls back only for the invalid one', () => {
    const parsed = parseSettingsFile({
      version: SETTINGS_SCHEMA_VERSION,
      settings: {
        steamGridDbApiKey: 'keep-me',
        hideCursorAfterMs: 'not a number',
        motion: 'reduced',
      },
      manualGames: [],
    })

    expect(parsed.settings.steamGridDbApiKey).toBe('keep-me')
    expect(parsed.settings.motion).toBe('reduced')
    expect(parsed.settings.hideCursorAfterMs).toBe(DEFAULT_SETTINGS.hideCursorAfterMs)
    expect(parsed.issues).toEqual([
      'settings.hideCursorAfterMs is invalid; the default value was used',
    ])
  })

  it('keeps valid manual games and skips corrupt ones', () => {
    const parsed = parseSettingsFile({
      version: SETTINGS_SCHEMA_VERSION,
      settings: {},
      manualGames: [
        VALID_GAME,
        { id: 'broken', name: 'Broken' },
        { ...VALID_GAME, id: 'manual-2' },
      ],
    })

    expect(parsed.manualGames.map((game) => game.id)).toEqual(['manual-1', 'manual-2'])
    expect(parsed.issues).toEqual(['manualGames[1] is invalid and was skipped'])
  })

  it('keeps valid favorite ids, dedupes them, and skips corrupt entries', () => {
    const parsed = parseSettingsFile({
      version: SETTINGS_SCHEMA_VERSION,
      settings: {},
      manualGames: [],
      favorites: ['steam-1', 42, 'steam-1', '', 'epic-2'],
    })

    expect(parsed.favorites).toEqual(['steam-1', 'epic-2'])
    expect(parsed.issues).toEqual([
      'favorites[1] is invalid and was skipped',
      'favorites[3] is invalid and was skipped',
    ])
  })

  it('ignores a favorites section that is not a list', () => {
    const parsed = parseSettingsFile({
      version: SETTINGS_SCHEMA_VERSION,
      settings: {},
      manualGames: [],
      favorites: 'steam-1',
    })

    expect(parsed.favorites).toEqual([])
    expect(parsed.issues).toEqual([
      'favorites is not a list; no favorites were restored',
    ])
  })

  it('restores the last selected game and defaults it to null', () => {
    const saved = parseSettingsFile({
      version: SETTINGS_SCHEMA_VERSION,
      settings: {},
      manualGames: [],
      lastSelectedId: 'steam-1',
    })

    expect(saved.lastSelectedId).toBe('steam-1')
    expect(saved.issues).toEqual([])

    const legacy = parseSettingsFile({
      version: SETTINGS_SCHEMA_VERSION,
      settings: {},
      manualGames: [],
    })

    expect(legacy.lastSelectedId).toBeNull()
    expect(legacy.issues).toEqual([])
  })

  it('drops an invalid last selection instead of failing the file', () => {
    const parsed = parseSettingsFile({
      version: SETTINGS_SCHEMA_VERSION,
      settings: { motion: 'full' },
      manualGames: [],
      lastSelectedId: 42,
    })

    expect(parsed.lastSelectedId).toBeNull()
    expect(parsed.settings.motion).toBe('full')
    expect(parsed.issues).toEqual([
      'lastSelectedId is invalid; no selection was restored',
    ])
  })

  it('defaults the library sort for files written before it existed', () => {
    const parsed = parseSettingsFile({
      version: SETTINGS_SCHEMA_VERSION,
      settings: { motion: 'full' },
      manualGames: [],
    })

    expect(parsed.settings.librarySort).toBe(DEFAULT_SETTINGS.librarySort)
    expect(parsed.settings.librarySort).toBe('title')
    expect(parsed.issues).toEqual([])
  })

  it('falls back to the default sort when the saved order is unknown', () => {
    const parsed = parseSettingsFile({
      version: SETTINGS_SCHEMA_VERSION,
      settings: { librarySort: 'random' },
      manualGames: [],
    })

    expect(parsed.settings.librarySort).toBe('title')
    expect(parsed.issues).toEqual([
      'settings.librarySort is invalid; the default value was used',
    ])
  })

  it('defaults interface sounds on for files written before the switch existed', () => {
    const parsed = parseSettingsFile({
      version: SETTINGS_SCHEMA_VERSION,
      settings: { motion: 'full' },
      manualGames: [],
    })

    expect(parsed.settings.uiSounds).toBe(true)
    expect(parsed.issues).toEqual([])
  })

  it('falls back to sounds on when the saved flag is invalid', () => {
    const parsed = parseSettingsFile({
      version: SETTINGS_SCHEMA_VERSION,
      settings: { uiSounds: 'quiet' },
      manualGames: [],
    })

    expect(parsed.settings.uiSounds).toBe(true)
    expect(parsed.issues).toEqual([
      'settings.uiSounds is invalid; the default value was used',
    ])
  })

  it('reports an invalid settings section without losing defaults', () => {
    const parsed = parseSettingsFile({
      version: SETTINGS_SCHEMA_VERSION,
      settings: 'nope',
      manualGames: [VALID_GAME],
    })

    expect(parsed.settings).toEqual(DEFAULT_SETTINGS)
    expect(parsed.manualGames).toEqual([VALID_GAME])
    expect(parsed.issues).toEqual([
      'the settings section is invalid; default values were used',
    ])
  })

  it('rejects a future version and uses defaults', () => {
    const parsed = parseSettingsFile({
      version: SETTINGS_SCHEMA_VERSION + 1,
      settings: { motion: 'full' },
      manualGames: [VALID_GAME],
    })

    expect(parsed.settings).toEqual(DEFAULT_SETTINGS)
    expect(parsed.manualGames).toEqual([])
    expect(parsed.issues[0]).toContain('newer than the supported version')
  })

  it('rejects a non-object file', () => {
    const parsed = parseSettingsFile('nope')

    expect(parsed.settings).toEqual(DEFAULT_SETTINGS)
    expect(parsed.manualGames).toEqual([])
    expect(parsed.issues).toEqual(['the file is not a JSON object'])
  })
})

describe('parseHistoryFile', () => {
  it('loads valid entries', () => {
    const parsed = parseHistoryFile({
      'steam-1': { lastPlayedAt: 10, playCount: 2 },
    })

    expect(parsed.issues).toEqual([])
    expect(parsed.history).toEqual({
      'steam-1': { lastPlayedAt: 10, playCount: 2 },
    })
  })

  it('keeps valid entries and drops corrupt ones', () => {
    const parsed = parseHistoryFile({
      good: { lastPlayedAt: 1, playCount: 1 },
      badCount: { lastPlayedAt: 1, playCount: -1 },
      badShape: 'nope',
    })

    expect(parsed.history).toEqual({ good: { lastPlayedAt: 1, playCount: 1 } })
    expect(parsed.issues).toEqual([
      'history entry "badCount" is invalid and was skipped',
      'history entry "badShape" is invalid and was skipped',
    ])
  })

  it('rejects a non-object history file', () => {
    expect(parseHistoryFile([])).toEqual({
      history: {},
      issues: ['the history file is not a JSON object'],
    })
  })
})

describe('schema version constants', () => {
  it('match the published versions', () => {
    // Bumping a version is a deliberate act that must add a migration and a
    // fixture test for the previous published version.
    expect(SETTINGS_SCHEMA_VERSION).toBe(1)
    expect(CATALOG_SCHEMA_VERSION).toBe(2)
  })
})
