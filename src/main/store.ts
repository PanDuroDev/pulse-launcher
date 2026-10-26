import type {
  FavoriteResult,
  ManualGame,
  PlayHistory,
  SelectionResult,
  Settings,
  SettingsUpdate,
} from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/types'
import { getAppPaths } from './paths'
import { backupFile, readJsonFile, writeJsonFileAtomic } from './fs-utils'
import {
  parseHistoryFile,
  parseSettingsFile,
  SettingsFieldsSchema,
  SETTINGS_SCHEMA_VERSION,
  type SettingsFile,
} from './persisted-state'
import { log } from './logger'

const MAX_LOGGED_ISSUES = 10

export class AppStore {
  private settingsFile: SettingsFile = {
    version: SETTINGS_SCHEMA_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    manualGames: [],
    favorites: [],
    lastSelectedId: null,
  }

  private history: PlayHistory = {}

  private readonly paths = getAppPaths()

  async load(): Promise<void> {
    const rawSettings = await readJsonFile(this.paths.settings)
    if (rawSettings.status === 'ok') {
      const parsed = parseSettingsFile(rawSettings.value)
      this.settingsFile = {
        version: SETTINGS_SCHEMA_VERSION,
        settings: parsed.settings,
        manualGames: parsed.manualGames,
        favorites: parsed.favorites,
        lastSelectedId: parsed.lastSelectedId,
      }
      if (parsed.issues.length > 0) {
        await this.reportRecovery('settings', this.paths.settings, parsed.issues)
      }
    } else if (rawSettings.status === 'invalid') {
      await this.reportRecovery('settings', this.paths.settings, [
        'the settings file is not valid JSON',
      ])
    }

    const rawHistory = await readJsonFile(this.paths.history)
    if (rawHistory.status === 'ok') {
      const parsed = parseHistoryFile(rawHistory.value)
      this.history = parsed.history
      if (parsed.issues.length > 0) {
        await this.reportRecovery('history', this.paths.history, parsed.issues)
      }
    } else if (rawHistory.status === 'invalid') {
      await this.reportRecovery('history', this.paths.history, [
        'the history file is not valid JSON',
      ])
    }
  }

  getSettings(): Settings {
    return { ...this.settingsFile.settings }
  }

  async updateSettings(update: SettingsUpdate): Promise<Settings> {
    const next: Settings = {
      ...this.settingsFile.settings,
      ...update,
    }
    const validated = SettingsFieldsSchema.parse(next)
    this.settingsFile = { ...this.settingsFile, settings: validated }
    await this.persistSettings()
    return this.getSettings()
  }

  getManualGames(): ManualGame[] {
    return this.settingsFile.manualGames.map((game) => ({ ...game }))
  }

  findManualGame(id: string): ManualGame | undefined {
    return this.settingsFile.manualGames.find((game) => game.id === id)
  }

  async addManualGame(game: ManualGame): Promise<ManualGame> {
    const existing = this.findManualGame(game.id)
    if (existing) return { ...existing }
    this.settingsFile.manualGames.push(game)
    await this.persistSettings()
    return { ...game }
  }

  /**
   * Replaces one manual entry in place. When the executable changed the id
   * changed too, so favorites, the stored selection, and play history are moved
   * to the new id instead of being left behind.
   */
  async replaceManualGame(previousId: string, next: ManualGame): Promise<boolean> {
    const index = this.settingsFile.manualGames.findIndex(
      (game) => game.id === previousId,
    )
    if (index === -1) return false

    const manualGames = [...this.settingsFile.manualGames]
    manualGames[index] = next
    this.settingsFile.manualGames = manualGames

    let historyMoved = false
    if (next.id !== previousId) {
      this.settingsFile.favorites = this.settingsFile.favorites.map((id) =>
        id === previousId ? next.id : id,
      )
      if (this.settingsFile.lastSelectedId === previousId) {
        this.settingsFile.lastSelectedId = next.id
      }
      const entry = this.history[previousId]
      if (entry) {
        const history = { ...this.history }
        delete history[previousId]
        history[next.id] = entry
        this.history = history
        historyMoved = true
      }
    }

    await this.persistSettings()
    if (historyMoved) {
      try {
        await writeJsonFileAtomic(this.paths.history, this.history)
      } catch (error) {
        log.error('[store] could not move play history', error)
      }
    }
    return true
  }

  async removeManualGame(id: string): Promise<boolean> {
    const next = this.settingsFile.manualGames.filter((game) => game.id !== id)
    if (next.length === this.settingsFile.manualGames.length) return false
    this.settingsFile.manualGames = next
    // A removed game must not leave a favorite id behind that can never be
    // toggled off from the UI again.
    this.settingsFile.favorites = this.settingsFile.favorites.filter(
      (favorite) => favorite !== id,
    )
    if (this.settingsFile.lastSelectedId === id) {
      this.settingsFile.lastSelectedId = null
    }
    await this.persistSettings()
    return true
  }

  getLastSelectedId(): string | null {
    return this.settingsFile.lastSelectedId
  }

  /**
   * Stores the selected catalog id. Selection changes arrive on every focus
   * move, so an unchanged value is not written again.
   */
  async setLastSelectedId(id: string | null): Promise<SelectionResult> {
    if (this.settingsFile.lastSelectedId === id) return { ok: true }
    this.settingsFile.lastSelectedId = id
    try {
      await this.persistSettings()
    } catch (error) {
      log.error('[store] could not save the selection', error)
      return { ok: false, error: 'Could not save the selection.' }
    }
    return { ok: true }
  }

  getFavorites(): string[] {
    return [...this.settingsFile.favorites]
  }

  isFavorite(id: string): boolean {
    return this.settingsFile.favorites.includes(id)
  }

  /** Adds or removes one catalog id and persists the new list. */
  async toggleFavorite(id: string): Promise<FavoriteResult> {
    const favorite = !this.isFavorite(id)
    this.settingsFile.favorites = favorite
      ? [...this.settingsFile.favorites, id]
      : this.settingsFile.favorites.filter((entry) => entry !== id)
    try {
      await this.persistSettings()
    } catch (error) {
      log.error('[store] could not save favorites', error)
      return { ok: false, error: 'Could not save the favorite.' }
    }
    return { ok: true, favorite }
  }

  getHistoryFor(id: string): { lastPlayedAt: number; playCount: number } | undefined {
    return this.history[id]
  }

  getHistory(): PlayHistory {
    return { ...this.history }
  }

  async markPlayed(id: string, timestamp = Date.now()): Promise<void> {
    const previous = this.history[id]
    this.history = {
      ...this.history,
      [id]: {
        lastPlayedAt: timestamp,
        playCount: (previous?.playCount ?? 0) + 1,
      },
    }
    await writeJsonFileAtomic(this.paths.history, this.history)
  }

  private async persistSettings(): Promise<void> {
    await writeJsonFileAtomic(this.paths.settings, this.settingsFile)
  }

  private async reportRecovery(
    kind: 'settings' | 'history',
    filePath: string,
    issues: string[],
  ): Promise<void> {
    const backup = await backupFile(filePath)
    log.warn(`[store] ${kind} data needed recovery`, {
      issueCount: issues.length,
      issues: issues.slice(0, MAX_LOGGED_ISSUES),
      backup,
    })
  }
}
