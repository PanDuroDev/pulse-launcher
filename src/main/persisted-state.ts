import { z } from 'zod'
import type { ManualGame, PlayHistory, Settings } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/types'

/**
 * Versioning policy (D3/F7):
 *
 * - Every persisted document carries an integer `version` (files written
 *   before versioning was added are read as the current version).
 * - A schema change that cannot be read by the previous shape must add an
 *   entry to the migration table for the *published* version and bump the
 *   constant below. Migrations are applied in order before validation.
 * - A file from a newer version is never migrated backwards: it is rejected
 *   and backed up so a newer launcher's data is not clobbered by an older one.
 * - Every published version needs a test that loads its fixture (see
 *   `persisted-state.test.ts`).
 */
export const SETTINGS_SCHEMA_VERSION = 1
export const CATALOG_SCHEMA_VERSION = 2

export const SettingsFieldsSchema = z.object({
  showStartMenuApps: z.boolean().default(DEFAULT_SETTINGS.showStartMenuApps),
  steamGridDbApiKey: z.string().default(DEFAULT_SETTINGS.steamGridDbApiKey),
  hideCursorAfterMs: z
    .number()
    .int()
    .min(500)
    .max(60_000)
    .default(DEFAULT_SETTINGS.hideCursorAfterMs),
  motion: z.enum(['system', 'reduced', 'full']).default(DEFAULT_SETTINGS.motion),
  windowMode: z
    .enum(['windowed', 'fullscreen', 'kiosk'])
    .default(DEFAULT_SETTINGS.windowMode),
  returnAfterGame: z.boolean().default(DEFAULT_SETTINGS.returnAfterGame),
  librarySort: z
    .enum(['recent', 'title', 'added'])
    .default(DEFAULT_SETTINGS.librarySort),
  uiSounds: z.boolean().default(DEFAULT_SETTINGS.uiSounds),
})

export const ManualGameSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  executable: z.string().min(1),
  addedAt: z.number().nonnegative(),
  artwork: z.string().min(1).max(1024).optional(),
})

export const HistoryEntrySchema = z.object({
  lastPlayedAt: z.number().nonnegative(),
  playCount: z.number().int().nonnegative(),
})

/** A favorite id is a catalog id; the same limits as the IPC schemas apply. */
export const FavoriteIdSchema = z.string().min(1).max(200)

/** A hard ceiling keeps a corrupt file from inflating memory or the UI. */
export const MAX_FAVORITES = 5_000

export interface SettingsFile {
  version: typeof SETTINGS_SCHEMA_VERSION
  settings: Settings
  manualGames: ManualGame[]
  /**
   * Catalog ids of favorite games. Stored next to the manual games so a
   * favorite survives a restart, and pruned when its game disappears.
   */
  favorites: string[]
  /**
   * Catalog id of the game that was selected when the launcher last closed.
   * `null` means "no stored selection", and the store falls back to its normal
   * running/recent/first pick.
   */
  lastSelectedId: string | null
}

export type Migration = (data: Record<string, unknown>) => Record<string, unknown>

export type MigrationResult =
  | { ok: true; data: Record<string, unknown>; from: number }
  | { ok: false; message: string }

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Brings a persisted document up to `currentVersion`.
 *
 * - A missing `version` is treated as the current version (pre-versioning file).
 * - Older versions are migrated through `migrations` one step at a time.
 * - A missing migration step, an invalid version, or a future version is
 *   reported instead of being silently coerced.
 */
export function migrateToCurrent(
  raw: unknown,
  currentVersion: number,
  migrations: Readonly<Record<number, Migration>> = {},
): MigrationResult {
  if (!isPlainRecord(raw)) {
    return { ok: false, message: 'the file is not a JSON object' }
  }

  const rawVersion = 'version' in raw ? raw.version : currentVersion
  if (
    typeof rawVersion !== 'number' ||
    !Number.isInteger(rawVersion) ||
    rawVersion < 1
  ) {
    return { ok: false, message: 'the schema version is invalid' }
  }

  if (rawVersion > currentVersion) {
    return {
      ok: false,
      message: `schema version ${rawVersion} is newer than the supported version ${currentVersion}`,
    }
  }

  let data = { ...raw }
  let version = rawVersion
  while (version < currentVersion) {
    const migration = migrations[version]
    if (!migration) {
      return {
        ok: false,
        message: `no migration from schema version ${version} to ${version + 1}`,
      }
    }
    const migrated = migration(data)
    if (!isPlainRecord(migrated)) {
      return {
        ok: false,
        message: `migration from schema version ${version} returned invalid data`,
      }
    }
    data = migrated
    version += 1
  }

  return { ok: true, data: { ...data, version: currentVersion }, from: rawVersion }
}

const SETTINGS_KEYS = Object.keys(SettingsFieldsSchema.shape) as Array<keyof Settings>

function assignSetting<K extends keyof Settings>(
  target: Settings,
  key: K,
  value: unknown,
): void {
  target[key] = value as Settings[K]
}

export interface ParsedSettingsFile {
  settings: Settings
  manualGames: ManualGame[]
  favorites: string[]
  /** Restored selection, or null when it is absent or unusable. */
  lastSelectedId: string | null
  /** Human-readable notes about data that could not be kept. */
  issues: string[]
}

/**
 * Restores every valid settings field and manual game independently. One bad
 * value no longer resets the whole file to defaults.
 */
export function parseSettingsFile(raw: unknown): ParsedSettingsFile {
  const issues: string[] = []
  const migrated = migrateToCurrent(raw, SETTINGS_SCHEMA_VERSION)
  if (!migrated.ok) {
    return {
      settings: { ...DEFAULT_SETTINGS },
      manualGames: [],
      favorites: [],
      lastSelectedId: null,
      issues: [migrated.message],
    }
  }

  const data = migrated.data
  const settings: Settings = { ...DEFAULT_SETTINGS }
  const rawSettings = data.settings
  if (isPlainRecord(rawSettings)) {
    for (const key of SETTINGS_KEYS) {
      const parsed = SettingsFieldsSchema.shape[key].safeParse(rawSettings[key])
      if (parsed.success) {
        assignSetting(settings, key, parsed.data)
      } else {
        issues.push(`settings.${key} is invalid; the default value was used`)
      }
    }
  } else if (rawSettings !== undefined) {
    issues.push('the settings section is invalid; default values were used')
  }

  const manualGames: ManualGame[] = []
  const rawGames = data.manualGames
  if (Array.isArray(rawGames)) {
    rawGames.forEach((entry, index) => {
      const parsed = ManualGameSchema.safeParse(entry)
      if (parsed.success) manualGames.push(parsed.data)
      else issues.push(`manualGames[${index}] is invalid and was skipped`)
    })
  } else if (rawGames !== undefined) {
    issues.push('manualGames is not a list; no local games were restored')
  }

  const favorites: string[] = []
  const rawFavorites = data.favorites
  if (Array.isArray(rawFavorites)) {
    const seen = new Set<string>()
    rawFavorites.forEach((entry, index) => {
      const parsed = FavoriteIdSchema.safeParse(entry)
      if (!parsed.success) {
        issues.push(`favorites[${index}] is invalid and was skipped`)
        return
      }
      if (seen.has(parsed.data)) return
      if (favorites.length >= MAX_FAVORITES) {
        issues.push(`favorites beyond ${MAX_FAVORITES} entries were skipped`)
        return
      }
      seen.add(parsed.data)
      favorites.push(parsed.data)
    })
  } else if (rawFavorites !== undefined) {
    issues.push('favorites is not a list; no favorites were restored')
  }

  let lastSelectedId: string | null = null
  const rawSelection = data.lastSelectedId
  if (typeof rawSelection === 'string' && rawSelection.length > 0) {
    const parsed = FavoriteIdSchema.safeParse(rawSelection)
    if (parsed.success) lastSelectedId = parsed.data
    else issues.push('lastSelectedId is invalid; no selection was restored')
  } else if (rawSelection !== undefined && rawSelection !== null) {
    issues.push('lastSelectedId is invalid; no selection was restored')
  }

  return { settings, manualGames, favorites, lastSelectedId, issues }
}

export interface ParsedHistoryFile {
  history: PlayHistory
  issues: string[]
}

/**
 * Restores every valid play-history entry independently instead of dropping
 * the whole history because one record is corrupt.
 */
export function parseHistoryFile(raw: unknown): ParsedHistoryFile {
  if (!isPlainRecord(raw)) {
    return { history: {}, issues: ['the history file is not a JSON object'] }
  }

  const history: PlayHistory = {}
  const issues: string[] = []
  for (const [gameId, entry] of Object.entries(raw)) {
    const parsed = HistoryEntrySchema.safeParse(entry)
    if (parsed.success) history[gameId] = parsed.data
    else issues.push(`history entry "${gameId}" is invalid and was skipped`)
  }

  return { history, issues }
}
