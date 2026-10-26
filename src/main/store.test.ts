import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/types'

const state = vi.hoisted(() => ({ userData: '' }))

vi.mock('./paths', () => ({
  getAppPaths: () => ({
    userData: state.userData,
    logs: state.userData,
    artwork: `${state.userData}/artwork`,
    cache: `${state.userData}/cache`,
    settings: `${state.userData}/settings.json`,
    history: `${state.userData}/history.json`,
    catalog: `${state.userData}/cache/catalog.json`,
  }),
}))

vi.mock('./logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { AppStore } from './store'
import { log } from './logger'

function settingsPath(): string {
  return path.join(state.userData, 'settings.json')
}

function historyPath(): string {
  return path.join(state.userData, 'history.json')
}

async function backupsOf(prefix: string): Promise<string[]> {
  const entries = await readdir(state.userData)
  return entries.filter(
    (entry) => entry.startsWith(prefix) && entry.endsWith('.bak'),
  )
}

describe('AppStore persistence', () => {
  beforeEach(async () => {
    state.userData = await mkdtemp(path.join(os.tmpdir(), 'pulse-store-'))
    vi.mocked(log.warn).mockClear()
  })

  afterEach(async () => {
    await rm(state.userData, { recursive: true, force: true })
  })

  it('loads valid settings, manual games, and history without a backup', async () => {
    await writeFile(
      settingsPath(),
      JSON.stringify({
        version: 1,
        settings: {
          showStartMenuApps: true,
          steamGridDbApiKey: 'key',
          hideCursorAfterMs: 3_000,
          motion: 'reduced',
        },
        manualGames: [
          { id: 'manual-1', name: 'Game', executable: 'C:\\game.exe', addedAt: 5 },
        ],
      }),
      'utf8',
    )
    await writeFile(
      historyPath(),
      JSON.stringify({ 'steam-1': { lastPlayedAt: 10, playCount: 2 } }),
      'utf8',
    )

    const store = new AppStore()
    await store.load()

    expect(store.getSettings()).toEqual({
      showStartMenuApps: true,
      steamGridDbApiKey: 'key',
      hideCursorAfterMs: 3_000,
      motion: 'reduced',
      windowMode: 'fullscreen',
      returnAfterGame: true,
      librarySort: 'title',
      uiSounds: true,
    })
    expect(store.getManualGames()).toHaveLength(1)
    expect(store.getHistory()).toEqual({
      'steam-1': { lastPlayedAt: 10, playCount: 2 },
    })
    expect(await backupsOf('settings.json')).toEqual([])
    expect(await backupsOf('history.json')).toEqual([])
  })

  it('keeps valid settings fields and backs up a partially corrupt file', async () => {
    await writeFile(
      settingsPath(),
      JSON.stringify({
        version: 1,
        settings: { steamGridDbApiKey: 'keep-me', hideCursorAfterMs: 'nope' },
        manualGames: [{ id: 'broken' }, { id: 'ok', name: 'Ok', executable: 'C:\\ok.exe', addedAt: 1 }],
      }),
      'utf8',
    )

    const store = new AppStore()
    await store.load()

    const settings = store.getSettings()
    expect(settings.steamGridDbApiKey).toBe('keep-me')
    expect(settings.hideCursorAfterMs).toBe(DEFAULT_SETTINGS.hideCursorAfterMs)
    expect(store.getManualGames().map((game) => game.id)).toEqual(['ok'])
    expect(await backupsOf('settings.json')).toHaveLength(1)
    expect(log.warn).toHaveBeenCalledWith(
      '[store] settings data needed recovery',
      expect.objectContaining({ issueCount: 2 }),
    )
  })

  it('falls back to defaults and backs up invalid JSON', async () => {
    await writeFile(settingsPath(), '{ not json', 'utf8')

    const store = new AppStore()
    await store.load()

    expect(store.getSettings()).toEqual(DEFAULT_SETTINGS)
    expect(await backupsOf('settings.json')).toHaveLength(1)
  })

  it('rejects a settings file from a newer version and backs it up', async () => {
    await writeFile(
      settingsPath(),
      JSON.stringify({ version: 99, settings: { motion: 'full' }, manualGames: [] }),
      'utf8',
    )

    const store = new AppStore()
    await store.load()

    expect(store.getSettings()).toEqual(DEFAULT_SETTINGS)
    expect(store.getManualGames()).toEqual([])
    expect(await backupsOf('settings.json')).toHaveLength(1)
    expect(log.warn).toHaveBeenCalledWith(
      '[store] settings data needed recovery',
      expect.objectContaining({
        issues: [expect.stringContaining('newer than the supported version')],
      }),
    )
  })

  it('keeps valid history entries and backs up the rest', async () => {
    await writeFile(
      historyPath(),
      JSON.stringify({
        good: { lastPlayedAt: 10, playCount: 1 },
        bad: { lastPlayedAt: 'nope', playCount: 1 },
      }),
      'utf8',
    )

    const store = new AppStore()
    await store.load()

    expect(store.getHistory()).toEqual({ good: { lastPlayedAt: 10, playCount: 1 } })
    expect(await backupsOf('history.json')).toHaveLength(1)
  })

  it('serializes concurrent settings and history writes', async () => {
    const store = new AppStore()
    await store.load()

    await Promise.all([
      store.updateSettings({ motion: 'reduced', hideCursorAfterMs: 4_000 }),
      store.addManualGame({
        id: 'manual-1',
        name: 'Local',
        executable: 'C:\\local.exe',
        addedAt: 1,
      }),
      store.markPlayed('steam-1', 123),
    ])

    const settings = JSON.parse(await readFile(settingsPath(), 'utf8')) as {
      settings: { motion: string; hideCursorAfterMs: number }
      manualGames: Array<{ id: string }>
    }
    expect(settings.settings).toMatchObject({
      motion: 'reduced',
      hideCursorAfterMs: 4_000,
    })
    expect(settings.manualGames.map((game) => game.id)).toEqual(['manual-1'])

    expect(JSON.parse(await readFile(historyPath(), 'utf8'))).toEqual({
      'steam-1': { lastPlayedAt: 123, playCount: 1 },
    })

    const entries = await readdir(state.userData)
    expect(entries.filter((entry) => entry.endsWith('.tmp'))).toEqual([])
  })

  it('persists settings and manual games across reloads', async () => {
    const store = new AppStore()
    await store.load()
    await store.updateSettings({ showStartMenuApps: true })
    await store.addManualGame({
      id: 'manual-1',
      name: 'Local',
      executable: 'C:\\local.exe',
      addedAt: 1,
    })
    await store.markPlayed('manual-1', 50)

    const reloaded = new AppStore()
    await reloaded.load()

    expect(reloaded.getSettings().showStartMenuApps).toBe(true)
    expect(reloaded.getManualGames()).toHaveLength(1)
    expect(reloaded.getHistoryFor('manual-1')).toEqual({
      lastPlayedAt: 50,
      playCount: 1,
    })
    expect(await backupsOf('settings.json')).toEqual([])
  })

  it('persists the chosen window mode across reloads', async () => {
    const store = new AppStore()
    await store.load()
    expect(store.getSettings().windowMode).toBe(DEFAULT_SETTINGS.windowMode)

    await store.updateSettings({ windowMode: 'kiosk' })

    const reloaded = new AppStore()
    await reloaded.load()
    expect(reloaded.getSettings().windowMode).toBe('kiosk')
  })

  it('persists the return-after-game preference across reloads', async () => {
    const store = new AppStore()
    await store.load()
    expect(store.getSettings().returnAfterGame).toBe(true)

    await store.updateSettings({ returnAfterGame: false })

    const reloaded = new AppStore()
    await reloaded.load()
    expect(reloaded.getSettings().returnAfterGame).toBe(false)
  })

  it('persists favorites across a reload and toggles them off again', async () => {
    const store = new AppStore()
    await store.load()

    expect(store.getFavorites()).toEqual([])
    expect(store.isFavorite('steam-1')).toBe(false)

    expect(await store.toggleFavorite('steam-1')).toEqual({ ok: true, favorite: true })
    expect(await store.toggleFavorite('epic-2')).toEqual({ ok: true, favorite: true })
    expect(store.getFavorites()).toEqual(['steam-1', 'epic-2'])

    const reloaded = new AppStore()
    await reloaded.load()
    expect(reloaded.getFavorites()).toEqual(['steam-1', 'epic-2'])
    expect(reloaded.isFavorite('epic-2')).toBe(true)

    expect(await reloaded.toggleFavorite('steam-1')).toEqual({
      ok: true,
      favorite: false,
    })
    expect(reloaded.getFavorites()).toEqual(['epic-2'])
  })

  it('drops a manual game from favorites when it is removed', async () => {
    await writeFile(
      settingsPath(),
      JSON.stringify({
        version: 1,
        settings: {},
        manualGames: [
          { id: 'manual-1', name: 'Game', executable: 'C:\\game.exe', addedAt: 5 },
        ],
        favorites: ['manual-1', 'steam-1'],
      }),
      'utf8',
    )

    const store = new AppStore()
    await store.load()
    expect(await store.removeManualGame('manual-1')).toBe(true)
    expect(store.getFavorites()).toEqual(['steam-1'])

    const reloaded = new AppStore()
    await reloaded.load()
    expect(reloaded.getFavorites()).toEqual(['steam-1'])
  })

  it('persists the last selected game across reloads', async () => {
    const store = new AppStore()
    await store.load()
    expect(store.getLastSelectedId()).toBeNull()

    expect(await store.setLastSelectedId('steam-1')).toEqual({ ok: true })

    const reloaded = new AppStore()
    await reloaded.load()
    expect(reloaded.getLastSelectedId()).toBe('steam-1')

    await reloaded.setLastSelectedId('manual-2')
    const again = new AppStore()
    await again.load()
    expect(again.getLastSelectedId()).toBe('manual-2')
  })

  it('clears the stored selection when that manual game is removed', async () => {
    await writeFile(
      settingsPath(),
      JSON.stringify({
        version: 1,
        settings: {},
        manualGames: [
          { id: 'manual-1', name: 'Game', executable: 'C:\\game.exe', addedAt: 5 },
        ],
        lastSelectedId: 'manual-1',
      }),
      'utf8',
    )

    const store = new AppStore()
    await store.load()
    expect(await store.removeManualGame('manual-1')).toBe(true)
    expect(store.getLastSelectedId()).toBeNull()

    const reloaded = new AppStore()
    await reloaded.load()
    expect(reloaded.getLastSelectedId()).toBeNull()
  })
})
