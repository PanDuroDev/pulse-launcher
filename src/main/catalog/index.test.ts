import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameRecord, RunningGameInfo } from '@shared/types'

const state = vi.hoisted(() => ({ userData: '' }))

vi.mock('../paths', () => ({
  getAppPaths: () => ({
    userData: state.userData,
    logs: state.userData,
    artwork: `${state.userData}/artwork`,
    cache: `${state.userData}/cache`,
    settings: `${state.userData}/settings.json`,
    history: `${state.userData}/history.json`,
    catalog: `${state.userData}/cache/catalog.json`,
  }),
  resolveResourcePath: () => '',
  sanitizeFileToken: (value: string) => value,
}))

vi.mock('../artwork', () => ({
  ArtworkService: class {
    async ensure() {
      return { url: null }
    }
  },
}))

vi.mock('./steam', () => ({ scanSteam: vi.fn() }))
vi.mock('./epic', () => ({ scanEpic: vi.fn() }))
vi.mock('./start-menu', () => ({ scanStartMenu: vi.fn() }))
vi.mock('../logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { CatalogService } from './index'
import { scanSteam } from './steam'
import { scanEpic } from './epic'
import { AppStore } from '../store'
import type { GameRunMatch } from '../game-processes'

function game(id: string, source: 'steam' | 'epic', name: string): GameRecord {
  return {
    id,
    source,
    name,
    installed: true,
    accent: '#ffffff',
    launch: {
      kind: source === 'steam' ? 'steam' : 'epic',
      target:
        source === 'steam'
          ? `steam://rungameid/${id}`
          : `com.epicgames.launcher://apps/${id}?action=launch&silent=true`,
    },
  }
}

async function createCatalog(): Promise<CatalogService> {
  const store = new AppStore()
  await store.load()
  const catalog = new CatalogService(store)
  await catalog.loadCache()
  return catalog
}

describe('CatalogService refresh', () => {
  beforeEach(async () => {
    state.userData = await mkdtemp(path.join(os.tmpdir(), 'pulse-catalog-'))
    vi.mocked(scanSteam).mockReset()
    vi.mocked(scanEpic).mockReset()
  })

  afterEach(async () => {
    await rm(state.userData, { recursive: true, force: true })
  })

  it('keeps the previous Steam games when a later Steam scan fails', async () => {
    vi.mocked(scanSteam).mockResolvedValueOnce({
      games: [game('steam-1', 'steam', 'Steam Game')],
      steamRoot: 'C:\\Steam',
      warnings: [],
    })
    vi.mocked(scanEpic).mockResolvedValueOnce({
      games: [game('epic-1', 'epic', 'Epic Game')],
      manifestDirectory: 'C:\\Epic',
      warnings: [],
    })

    const catalog = await createCatalog()
    const first = await catalog.refresh()
    expect(first.games).toHaveLength(2)
    expect(first.staleSources).toEqual([])
    expect(first.scannedAt).toBeGreaterThan(0)

    vi.mocked(scanSteam).mockRejectedValueOnce(new Error('Steam registry unavailable'))
    vi.mocked(scanEpic).mockResolvedValueOnce({
      games: [],
      manifestDirectory: 'C:\\Epic',
      warnings: [],
    })

    const second = await catalog.refresh()

    expect(second.errors).toEqual([
      { source: 'steam', message: 'Steam registry unavailable' },
    ])
    expect(second.staleSources).toEqual(['steam'])
    expect(second.games.map((entry) => entry.id)).toEqual(['steam-1'])
    expect(second.scannedAt).toBe(0)
    expect(catalog.isStale).toBe(true)
    expect(catalog.getStaleSources()).toEqual(['steam'])
  })

  it('clears the stale state after the source recovers', async () => {
    vi.mocked(scanSteam).mockResolvedValueOnce({
      games: [game('steam-1', 'steam', 'Steam Game')],
      steamRoot: 'C:\\Steam',
      warnings: [],
    })
    vi.mocked(scanEpic).mockResolvedValueOnce({
      games: [],
      manifestDirectory: null,
      warnings: [],
    })

    const catalog = await createCatalog()
    await catalog.refresh()

    vi.mocked(scanSteam).mockRejectedValueOnce(new Error('Temporary failure'))
    vi.mocked(scanEpic).mockResolvedValueOnce({
      games: [],
      manifestDirectory: null,
      warnings: [],
    })

    const failed = await catalog.refresh()
    expect(failed.staleSources).toEqual(['steam'])
    expect(catalog.isStale).toBe(true)

    vi.mocked(scanSteam).mockResolvedValueOnce({
      games: [game('steam-1', 'steam', 'Steam Game')],
      steamRoot: 'C:\\Steam',
      warnings: [],
    })
    vi.mocked(scanEpic).mockResolvedValueOnce({
      games: [],
      manifestDirectory: null,
      warnings: [],
    })

    const recovered = await catalog.refresh()

    expect(recovered.errors).toEqual([])
    expect(recovered.staleSources).toEqual([])
    expect(catalog.getStaleSources()).toEqual([])
    expect(catalog.isStale).toBe(false)
  })

  it('persists stale sources in the catalog cache and reloads them', async () => {
    vi.mocked(scanSteam).mockResolvedValueOnce({
      games: [game('steam-1', 'steam', 'Steam Game')],
      steamRoot: 'C:\\Steam',
      warnings: [],
    })
    vi.mocked(scanEpic).mockResolvedValueOnce({
      games: [],
      manifestDirectory: null,
      warnings: [],
    })

    const catalog = await createCatalog()
    await catalog.refresh()

    vi.mocked(scanSteam).mockRejectedValueOnce(new Error('Steam is unavailable'))
    vi.mocked(scanEpic).mockResolvedValueOnce({
      games: [],
      manifestDirectory: null,
      warnings: [],
    })
    await catalog.refresh()

    const cachePath = path.join(state.userData, 'cache', 'catalog.json')
    const cached = JSON.parse(await readFile(cachePath, 'utf8')) as {
      games: GameRecord[]
      scannedAt: number
      staleSources: string[]
    }

    expect(cached.staleSources).toEqual(['steam'])
    expect(cached.scannedAt).toBe(0)
    expect(cached.games.map((entry) => entry.id)).toEqual(['steam-1'])

    const restarted = await createCatalog()
    expect(restarted.getStaleSources()).toEqual(['steam'])
    expect(restarted.list().map((entry) => entry.id)).toEqual(['steam-1'])
  })
})

describe('CatalogService cache recovery', () => {
  beforeEach(async () => {
    state.userData = await mkdtemp(path.join(os.tmpdir(), 'pulse-cache-'))
    vi.mocked(scanSteam).mockReset()
    vi.mocked(scanEpic).mockReset()
  })

  afterEach(async () => {
    await rm(state.userData, { recursive: true, force: true })
  })

  async function writeCache(content: unknown): Promise<void> {
    const cachePath = path.join(state.userData, 'cache', 'catalog.json')
    await mkdir(path.dirname(cachePath), { recursive: true })
    await writeFile(
      cachePath,
      typeof content === 'string' ? content : JSON.stringify(content),
      'utf8',
    )
  }

  async function cacheBackups(): Promise<string[]> {
    const entries = await readdir(path.join(state.userData, 'cache'))
    return entries.filter((entry) => entry.endsWith('.bak'))
  }

  it('keeps valid games from a partly corrupt cache and forces a rescan', async () => {
    await writeCache({
      version: 2,
      scannedAt: Date.now(),
      games: [game('steam-1', 'steam', 'Steam Game'), { id: 'broken' }],
      staleSources: ['steam', 'not-a-source'],
    })

    const catalog = await createCatalog()

    expect(catalog.list().map((entry) => entry.id)).toEqual(['steam-1'])
    expect(catalog.getStaleSources()).toEqual(['steam'])
    expect(catalog.isStale).toBe(true)
    expect(await cacheBackups()).toHaveLength(1)
  })

  it('discards and backs up a cache that is not valid JSON', async () => {
    await writeCache('{ not json')

    const catalog = await createCatalog()

    expect(catalog.list()).toEqual([])
    expect(catalog.isStale).toBe(true)
    expect(await cacheBackups()).toHaveLength(1)
  })

  it('rejects and backs up a cache from a newer schema version', async () => {
    await writeCache({
      version: 3,
      scannedAt: Date.now(),
      games: [game('steam-1', 'steam', 'Steam Game')],
      staleSources: [],
    })

    const catalog = await createCatalog()

    expect(catalog.list()).toEqual([])
    expect(catalog.isStale).toBe(true)
    expect(await cacheBackups()).toHaveLength(1)
  })

  it('loads a fully valid cache without a backup', async () => {
    await writeCache({
      version: 2,
      scannedAt: Date.now(),
      games: [game('steam-1', 'steam', 'Steam Game')],
      staleSources: [],
    })

    const catalog = await createCatalog()

    expect(catalog.list().map((entry) => entry.id)).toEqual(['steam-1'])
    expect(catalog.isStale).toBe(false)
    expect(await cacheBackups()).toEqual([])
  })

  it('restores manual games from settings even when the cache skips a rescan', async () => {
    await writeCache({
      version: 2,
      scannedAt: Date.now(),
      games: [game('steam-1', 'steam', 'Steam Game')],
      staleSources: [],
    })
    await writeFile(
      path.join(state.userData, 'settings.json'),
      JSON.stringify({
        version: 1,
        settings: {},
        manualGames: [
          {
            id: 'manual-charmap',
            name: 'Character Map',
            executable: 'C:\\Windows\\System32\\charmap.exe',
            addedAt: 1_700_000_000_000,
          },
        ],
      }),
      'utf8',
    )

    const catalog = await createCatalog()

    expect(catalog.isStale).toBe(false)
    expect(catalog.list().map((entry) => entry.name)).toEqual([
      'Character Map',
      'Steam Game',
    ])
  })
})

describe('CatalogService running identity', () => {
  beforeEach(async () => {
    state.userData = await mkdtemp(path.join(os.tmpdir(), 'pulse-running-'))
    vi.mocked(scanSteam).mockReset()
    vi.mocked(scanEpic).mockReset()
  })

  afterEach(async () => {
    await rm(state.userData, { recursive: true, force: true })
  })

  async function catalogWithGame(): Promise<CatalogService> {
    const cachePath = path.join(state.userData, 'cache', 'catalog.json')
    await mkdir(path.dirname(cachePath), { recursive: true })
    await writeFile(
      cachePath,
      JSON.stringify({
        version: 2,
        scannedAt: Date.now(),
        games: [game('steam-1', 'steam', 'Steam Game')],
        staleSources: [],
      }),
      'utf8',
    )
    return createCatalog()
  }

  function match(overrides: Partial<GameRunMatch> = {}): GameRunMatch {
    return {
      gameId: 'steam-1',
      pid: 4_242,
      startedAt: 1_690_000_000_000,
      confidence: 'exact',
      processCount: 1,
      ambiguous: false,
      ...overrides,
    }
  }

  it('keeps the PID in main and exposes only evidence to listeners', async () => {
    const catalog = await catalogWithGame()
    const events: RunningGameInfo[][] = []
    catalog.setListeners({ onRunningChanged: (games) => events.push(games) })

    catalog.setRunningGames([match()])

    expect(events).toEqual([
      [{ gameId: 'steam-1', confidence: 'exact', ambiguous: false, processCount: 1 }],
    ])
    expect(events[0]?.[0]).not.toHaveProperty('pid')
    expect(catalog.list()[0]).toMatchObject({
      running: true,
      runState: { confidence: 'exact', ambiguous: false, processCount: 1 },
    })
    expect(catalog.getRunningMatch('steam-1')).toMatchObject({
      pid: 4_242,
      startedAt: 1_690_000_000_000,
    })
  })

  it('does not emit when the identity is unchanged', async () => {
    const catalog = await catalogWithGame()
    const events: RunningGameInfo[][] = []
    catalog.setListeners({ onRunningChanged: (games) => events.push(games) })

    catalog.setRunningGames([match()])
    catalog.setRunningGames([match()])

    expect(events).toHaveLength(1)
  })

  it('emits again when the process identity changes', async () => {
    const catalog = await catalogWithGame()
    const events: RunningGameInfo[][] = []
    catalog.setListeners({ onRunningChanged: (games) => events.push(games) })

    catalog.setRunningGames([match()])
    catalog.setRunningGames([match({ pid: 5_000, startedAt: 1_690_000_100_000 })])

    expect(events).toHaveLength(2)
  })

  it('reports an ambiguous match without a target process', async () => {
    const catalog = await catalogWithGame()

    catalog.setRunningGames([
      match({ pid: null, confidence: 'directory', ambiguous: true, processCount: 2 }),
    ])

    expect(catalog.list()[0]?.runState).toEqual({
      confidence: 'directory',
      ambiguous: true,
      processCount: 2,
    })
    expect(catalog.getRunningMatch('steam-1')?.pid).toBeNull()
  })

  it('ignores matches for games outside the library', async () => {
    const catalog = await catalogWithGame()
    const events: RunningGameInfo[][] = []
    catalog.setListeners({ onRunningChanged: (games) => events.push(games) })

    catalog.setRunningGames([match({ gameId: 'not-in-library' })])

    expect(events).toEqual([])
    expect(catalog.list()[0]?.running).toBe(false)
  })
})

describe('CatalogService manual editing', () => {
  beforeEach(async () => {
    state.userData = await mkdtemp(path.join(os.tmpdir(), 'pulse-catalog-edit-'))
  })

  afterEach(async () => {
    await rm(state.userData, { recursive: true, force: true })
  })

  async function setup(): Promise<{ store: AppStore; catalog: CatalogService }> {
    const store = new AppStore()
    await store.load()
    const catalog = new CatalogService(store)
    await catalog.loadCache()
    return { store, catalog }
  }

  async function gameFile(name: string): Promise<string> {
    const file = path.join(state.userData, name)
    await writeFile(file, 'MZ')
    return file
  }

  it('renames a manual game without changing its id', async () => {
    const { store, catalog } = await setup()
    const added = await catalog.addManualGame(await gameFile('Old Name.exe'))
    expect(added.ok).toBe(true)
    const id = added.game?.id as string

    const result = await catalog.updateManualGame({ gameId: id, name: '  Better Name  ' })

    expect(result.ok).toBe(true)
    expect(result.previousId).toBeUndefined()
    expect(result.game).toMatchObject({ id, name: 'Better Name' })
    expect(store.findManualGame(id)?.name).toBe('Better Name')
    expect(catalog.list().map((game) => game.name)).toEqual(['Better Name'])
  })

  it('moves favorites, selection, and history when the executable changes', async () => {
    const { store, catalog } = await setup()
    const added = await catalog.addManualGame(await gameFile('Before.exe'))
    const oldId = added.game?.id as string
    await store.toggleFavorite(oldId)
    await store.setLastSelectedId(oldId)
    await store.markPlayed(oldId, 42)

    const result = await catalog.updateManualGame({
      gameId: oldId,
      executable: await gameFile('After.exe'),
    })

    const newId = result.game?.id as string
    expect(result.ok).toBe(true)
    expect(result.previousId).toBe(oldId)
    expect(newId).not.toBe(oldId)
    expect(store.getManualGames().map((game) => game.id)).toEqual([newId])
    expect(store.getFavorites()).toEqual([newId])
    expect(store.getLastSelectedId()).toBe(newId)
    expect(store.getHistoryFor(newId)).toEqual({ lastPlayedAt: 42, playCount: 1 })
    expect(store.getHistoryFor(oldId)).toBeUndefined()
    expect(catalog.list().map((game) => game.id)).toEqual([newId])

    const reloaded = new AppStore()
    await reloaded.load()
    expect(reloaded.getManualGames().map((game) => game.id)).toEqual([newId])
    expect(reloaded.getFavorites()).toEqual([newId])
    expect(reloaded.getLastSelectedId()).toBe(newId)
    expect(reloaded.getHistoryFor(newId)).toBeDefined()
  })

  it('refuses a path that already belongs to another game', async () => {
    const { catalog } = await setup()
    const first = await catalog.addManualGame(await gameFile('First.exe'))
    const second = await catalog.addManualGame(await gameFile('Second.exe'))

    const result = await catalog.updateManualGame({
      gameId: second.game?.id as string,
      executable: path.join(state.userData, 'First.exe'),
    })

    expect(result).toMatchObject({
      ok: false,
      error: 'That game is already in your library.',
    })
    expect(catalog.list()).toHaveLength(2)
    expect(first.ok).toBe(true)
  })

  it('validates the name, executable, and artwork before writing', async () => {
    const { store, catalog } = await setup()
    const added = await catalog.addManualGame(await gameFile('Game.exe'))
    const id = added.game?.id as string
    const notes = path.join(state.userData, 'notes.txt')
    await writeFile(notes, 'not an image')

    expect(await catalog.updateManualGame({ gameId: id, name: '   ' })).toMatchObject({
      ok: false,
      error: 'Enter a name for the game.',
    })
    expect(
      await catalog.updateManualGame({ gameId: id, name: 'x'.repeat(81) }),
    ).toMatchObject({ ok: false, error: 'Keep the name under 80 characters.' })
    expect(
      await catalog.updateManualGame({
        gameId: id,
        executable: path.join(state.userData, 'missing.exe'),
      }),
    ).toMatchObject({ ok: false, error: 'The selected file does not exist.' })
    expect(
      await catalog.updateManualGame({
        gameId: id,
        executable: path.join(state.userData, 'notes.txt'),
      }),
    ).toMatchObject({ ok: false, error: 'Choose an .exe or .lnk file.' })
    expect(await catalog.updateManualGame({ gameId: id, artwork: notes })).toMatchObject({
      ok: false,
      error: 'Choose a PNG, JPEG, WebP, or AVIF image.',
    })
    expect(await catalog.updateManualGame({ gameId: 'steam-1', name: 'Nope' })).toMatchObject({
      ok: false,
      error: 'Only manually added games can be edited.',
    })

    // Nothing above was written.
    expect(store.findManualGame(id)?.name).toBe('Game')
    expect(store.findManualGame(id)?.artwork).toBeUndefined()
  })

  it('stores and clears a custom artwork image', async () => {
    const { store, catalog } = await setup()
    const added = await catalog.addManualGame(await gameFile('Art.exe'))
    const id = added.game?.id as string
    const art = path.join(state.userData, 'cover.png')
    await writeFile(art, 'PNG')

    const set = await catalog.updateManualGame({ gameId: id, artwork: art })
    expect(set.ok).toBe(true)
    expect(set.game?.customArtwork).toBe(true)
    expect(store.findManualGame(id)?.artwork).toBe(path.resolve(art))

    const cleared = await catalog.updateManualGame({ gameId: id, artwork: null })
    expect(cleared.ok).toBe(true)
    expect(cleared.game?.customArtwork).toBe(false)
    expect(store.findManualGame(id)?.artwork).toBeUndefined()
  })
})
