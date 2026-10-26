import path from 'node:path'
import { rm, stat } from 'node:fs/promises'
import { z } from 'zod'
import type {
  AddManualResult,
  ArtKind,
  ArtworkResult,
  FavoriteResult,
  GameRecord,
  GameSource,
  GameSummary,
  ManualGame,
  RemoveManualResult,
  ScanError,
  ScanProgress,
  ScanResult,
  RunningGameInfo,
  UpdateManualGameInput,
  UpdateManualResult,
} from '@shared/types'
import { getAppPaths, sanitizeFileToken } from '../paths'
import { backupFile, readJsonFile, writeJsonFileAtomic } from '../fs-utils'
import {
  CATALOG_SCHEMA_VERSION,
  migrateToCurrent,
} from '../persisted-state'
import { log } from '../logger'
import type { AppStore } from '../store'
import { ArtworkService } from '../artwork'
import type { GameRunMatch } from '../game-processes'
import { scanSteam } from './steam'
import { scanEpic } from './epic'
import { scanStartMenu } from './start-menu'
import {
  MAX_ARTWORK_BYTES,
  isArtworkExtension,
  manualGameFromExecutable,
  manualGameId,
  manualGameToRecord,
} from './manual'
import { demoGames, demoLastPlayed } from './demo'
import { mergeCatalogGames } from './merge'
import { runSourceScan, type SourceScanOutcome } from './source-scan'

const ArtCandidatesSchema = z
  .object({
    cover: z.array(z.string()).optional(),
    hero: z.array(z.string()).optional(),
    icon: z.array(z.string()).optional(),
    logo: z.array(z.string()).optional(),
  })
  .optional()

const ProcessHintsSchema = z
  .object({
    executable: z.string().min(1).optional(),
    installDir: z.string().min(1).optional(),
    names: z.array(z.string().min(1)).max(20).optional(),
  })
  .optional()

const GameSourceSchema = z.enum(['steam', 'epic', 'manual', 'start-menu'])

const GameRecordSchema = z.object({
  id: z.string().min(1),
  source: GameSourceSchema,
  name: z.string().min(1),
  subtitle: z.string().optional(),
  installed: z.boolean(),
  appId: z.string().optional(),
  sizeBytes: z.number().nonnegative().optional(),
  addedAt: z.number().nonnegative().optional(),
  accent: z.string(),
  process: ProcessHintsSchema,
  artCandidates: ArtCandidatesSchema,
  manualArtwork: z.string().min(1).max(1024).optional(),
  launch: z.object({
    kind: z.enum(['steam', 'epic', 'exe', 'shortcut']),
    target: z.string().min(1),
    args: z.array(z.string()).optional(),
    workDir: z.string().optional(),
  }),
})

const CatalogCacheSchema = z.object({
  version: z.literal(CATALOG_SCHEMA_VERSION),
  scannedAt: z.number().nonnegative(),
  games: z.array(GameRecordSchema),
  staleSources: z.array(GameSourceSchema).default([]),
})

const CACHE_MAX_AGE_MS = 30 * 60 * 1000
const SOURCE_TIMEOUT_MS = 60_000

export interface CatalogListeners {
  onChanged?: (games: GameSummary[]) => void
  onRunningChanged?: (games: RunningGameInfo[]) => void
  onProgress?: (progress: ScanProgress) => void
  onStaleChanged?: (sources: GameSource[]) => void
}

function sameRunning(
  current: Map<string, GameRunMatch>,
  next: Map<string, GameRunMatch>,
): boolean {
  if (current.size !== next.size) return false
  for (const [gameId, match] of next) {
    const previous = current.get(gameId)
    if (
      !previous ||
      previous.pid !== match.pid ||
      previous.startedAt !== match.startedAt ||
      previous.confidence !== match.confidence ||
      previous.ambiguous !== match.ambiguous ||
      previous.processCount !== match.processCount
    ) {
      return false
    }
  }
  return true
}

export class CatalogService {
  readonly demo: boolean
  private games: GameRecord[] = []
  /**
   * Verified running identities, main-process only. The PID never leaves this
   * process: the renderer receives derived evidence instead.
   */
  private running = new Map<string, GameRunMatch>()
  private stale: GameSource[] = []
  private scannedAt = 0
  private scanPromise: Promise<ScanResult> | null = null
  private listeners: CatalogListeners = {}
  private readonly artwork: ArtworkService
  private readonly paths = getAppPaths()
  private readonly store: AppStore

  constructor(store: AppStore) {
    this.store = store
    this.artwork = new ArtworkService(store)
    this.demo = process.env['LAUNCHER_DEMO'] === '1'
  }

  setListeners(listeners: CatalogListeners): void {
    this.listeners = listeners
  }

  async loadCache(): Promise<void> {
    if (this.demo) {
      this.games = demoGames()
      this.scannedAt = Date.now()
      return
    }

    const raw = await readJsonFile(this.paths.catalog)
    if (raw.status === 'missing') return
    if (raw.status === 'invalid') {
      log.warn('[catalog] cache is not valid JSON; starting with an empty library')
      await this.backupCache()
      return
    }

    const migrated = migrateToCurrent(raw.value, CATALOG_SCHEMA_VERSION)
    if (!migrated.ok) {
      log.warn('[catalog] cache cannot be used', migrated.message)
      await this.backupCache()
      return
    }

    const parsed = CatalogCacheSchema.safeParse(migrated.data)
    if (parsed.success) {
      this.games = this.withManualGames(parsed.data.games as GameRecord[])
      this.scannedAt = parsed.data.scannedAt
      this.stale = parsed.data.staleSources
      return
    }

    // Keep the games that are still valid, then force a rescan so a partial
    // cache is never presented as a fresh scan result.
    const data = migrated.data
    const entries = Array.isArray(data.games) ? data.games : []
    const games: GameRecord[] = []
    for (const entry of entries) {
      const game = GameRecordSchema.safeParse(entry)
      if (game.success) games.push(game.data as GameRecord)
    }
    log.warn(
      `[catalog] cache had invalid entries; kept ${games.length} of ${entries.length} games`,
      parsed.error.flatten(),
    )
    await this.backupCache()
    if (games.length === 0) return

    this.games = this.withManualGames(games)
    this.scannedAt = 0
    this.stale = Array.isArray(data.staleSources)
      ? data.staleSources.filter(
          (source): source is GameSource => GameSourceSchema.safeParse(source).success,
        )
      : []
  }

  /**
   * Manual entries are stored in settings, not only in the cache. A restored
   * cache therefore has to be reconciled with settings, otherwise a manual game
   * disappears whenever the cache is still fresh enough to skip a rescan.
   */
  private withManualGames(games: GameRecord[]): GameRecord[] {
    const manual = this.store.getManualGames().map(manualGameToRecord)
    if (manual.length === 0) return games
    const byId = new Map(games.map((game) => [game.id, game]))
    for (const game of manual) byId.set(game.id, game)
    return [...byId.values()].sort((left, right) =>
      left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }),
    )
  }

  private async backupCache(): Promise<void> {
    const backup = await backupFile(this.paths.catalog)
    if (backup) log.info('[catalog] previous cache backed up', backup)
  }

  get isStale(): boolean {
    return Date.now() - this.scannedAt > CACHE_MAX_AGE_MS
  }

  getStaleSources(): GameSource[] {
    return [...this.stale]
  }

  list(): GameSummary[] {
    this.pruneRunning()
    return this.games.map((game) => this.toSummary(game))
  }

  getCachedGame(id: string): GameRecord | undefined {
    return this.games.find((game) => game.id === id)
  }

  getProcessCandidates(): Array<{ id: string; process?: GameRecord['process'] }> {
    return this.games.map((game) => ({ id: game.id, process: game.process }))
  }

  setRunningGames(matches: GameRunMatch[]): void {
    const known = new Set(this.games.map((game) => game.id))
    const next = new Map<string, GameRunMatch>()
    for (const match of matches) {
      if (known.has(match.gameId)) next.set(match.gameId, match)
    }
    if (sameRunning(this.running, next)) return
    this.running = next
    this.listeners.onRunningChanged?.(this.listRunning())
  }

  /** Verified identity of a running game, for main-process actions only. */
  getRunningMatch(gameId: string): GameRunMatch | undefined {
    const match = this.running.get(gameId)
    return match ? { ...match } : undefined
  }

  private listRunning(): RunningGameInfo[] {
    this.pruneRunning()
    return [...this.running.values()]
      .sort((left, right) => left.gameId.localeCompare(right.gameId))
      .map((match) => ({
        gameId: match.gameId,
        confidence: match.confidence,
        ambiguous: match.ambiguous,
        processCount: match.processCount,
      }))
  }

  /** Drops identities for games that are no longer in the library. */
  private pruneRunning(): void {
    if (this.running.size === 0) return
    const known = new Set(this.games.map((game) => game.id))
    for (const gameId of [...this.running.keys()]) {
      if (!known.has(gameId)) this.running.delete(gameId)
    }
  }

  getSettings() {
    return this.store.getSettings()
  }

  async refresh(): Promise<ScanResult> {
    if (this.scanPromise) return this.scanPromise
    this.scanPromise = this.performScan().finally(() => {
      this.scanPromise = null
    })
    return this.scanPromise
  }

  private async performScan(): Promise<ScanResult> {
    if (this.demo) {
      const games = demoGames()
      this.games = games
      this.scannedAt = Date.now()
      this.applyStaleSources([])
      this.emitChanged()
      return {
        games: this.list(),
        errors: [],
        warnings: [],
        counts: this.counts(games),
        scannedAt: this.scannedAt,
        staleSources: [],
      }
    }

    const settings = this.store.getSettings()
    const scans: Array<Promise<SourceScanOutcome>> = [
      this.scanSource('steam', async (signal) => {
        const result = await scanSteam(signal)
        return { games: result.games, warnings: result.warnings }
      }),
      this.scanSource('epic', async (signal) => {
        const result = await scanEpic(signal)
        return { games: result.games, warnings: result.warnings }
      }),
    ]

    if (settings.showStartMenuApps) {
      scans.push(
        this.scanSource('start-menu', async (signal) => {
          const result = await scanStartMenu(signal)
          return { games: result.games, warnings: result.warnings }
        }),
      )
    }

    const manual = this.store.getManualGames().map(manualGameToRecord)
    const results = await Promise.all(scans)
    const { games, staleSources } = mergeCatalogGames({
      previous: this.games,
      manual,
      results,
    })
    this.games = games
    // A failed source means the catalog is not fully fresh: reset the scan
    // timestamp so the source is retried on the next launch instead of being
    // hidden behind the 30 minute cache window.
    this.scannedAt = results.some((result) => Boolean(result.error)) ? 0 : Date.now()
    this.applyStaleSources(staleSources)
    await this.saveCache()

    const errors: ScanError[] = results
      .filter((result): result is SourceScanOutcome & { error: string } =>
        Boolean(result.error),
      )
      .map((result) => ({ source: result.source, message: result.error }))
    const warnings = results.flatMap((result) => result.warnings)

    this.emitChanged()
    return {
      games: this.list(),
      errors,
      warnings,
      counts: this.counts(games),
      scannedAt: this.scannedAt,
      staleSources,
    }
  }

  private scanSource(
    source: GameSource,
    callback: (signal: AbortSignal) => Promise<{
      games: GameRecord[]
      warnings: string[]
    }>,
  ): Promise<SourceScanOutcome> {
    return runSourceScan(source, callback, {
      timeoutMs: SOURCE_TIMEOUT_MS,
      onProgress: (progress) => this.listeners.onProgress?.(progress),
      onError: (message, error) => log.error(message, error),
    })
  }

  private counts(games: GameRecord[]): Partial<Record<GameSource, number>> {
    const counts: Partial<Record<GameSource, number>> = {}
    for (const game of games) {
      counts[game.source] = (counts[game.source] ?? 0) + 1
    }
    return counts
  }

  private toSummary(game: GameRecord): GameSummary {
    const history = this.store.getHistoryFor(game.id)
    const demoLastPlayedAt = this.demo ? demoLastPlayed(game.id) : undefined
    const runningMatch = this.running.get(game.id)
    return {
      id: game.id,
      source: game.source,
      name: game.name,
      subtitle: game.subtitle,
      installed: game.installed,
      appId: game.appId,
      sizeBytes: game.sizeBytes,
      addedAt: game.addedAt,
      accent: game.accent,
      lastPlayedAt: history?.lastPlayedAt ?? demoLastPlayedAt,
      playCount: history?.playCount,
      running: Boolean(runningMatch),
      favorite: this.store.isFavorite(game.id),
      customArtwork: Boolean(game.manualArtwork),
      executable: game.source === 'manual' ? game.launch.target : undefined,
      runState: runningMatch
        ? {
            confidence: runningMatch.confidence,
            ambiguous: runningMatch.ambiguous,
            processCount: runningMatch.processCount,
          }
        : undefined,
    }
  }

  private emitChanged(): void {
    this.listeners.onChanged?.(this.list())
  }

  private applyStaleSources(sources: GameSource[]): void {
    const changed =
      sources.length !== this.stale.length ||
      sources.some((source, index) => source !== this.stale[index])
    this.stale = [...sources]
    if (changed) this.listeners.onStaleChanged?.([...this.stale])
  }

  async artworkFor(gameId: string, kind: ArtKind): Promise<ArtworkResult> {
    const game = this.getCachedGame(gameId)
    if (!game) return { gameId, kind, url: null }
    return this.artwork.ensure(game, kind)
  }

  async markLaunched(gameId: string): Promise<void> {
    await this.store.markPlayed(gameId)
    this.emitChanged()
  }

  /**
   * Toggles a favorite for a game that is currently in the catalog. Unknown
   * ids are rejected so a stale renderer cannot grow the settings file.
   */
  async toggleFavorite(gameId: string): Promise<FavoriteResult> {
    if (!this.games.some((game) => game.id === gameId)) {
      return { ok: false, error: 'Game not found.' }
    }
    const result = await this.store.toggleFavorite(gameId)
    if (result.ok) this.emitChanged()
    return result
  }

  async addManualGame(executable: string): Promise<AddManualResult> {
    const extension = path.extname(executable).toLowerCase()
    if (extension !== '.exe' && extension !== '.lnk') {
      return { ok: false, error: 'Choose an .exe or .lnk file.' }
    }

    try {
      const info = await stat(executable)
      if (!info.isFile()) return { ok: false, error: 'The selected path is not a file.' }
    } catch {
      return { ok: false, error: 'The selected file does not exist.' }
    }

    const manual = manualGameFromExecutable(executable)
    if (!manual) return { ok: false, error: 'Could not read the selected file.' }

    await this.store.addManualGame(manual)
    const record = manualGameToRecord(manual)
    this.games = [...this.games.filter((game) => game.id !== record.id), record]
    await this.saveCache()
    this.emitChanged()
    return { ok: true, game: this.toSummary(record) }
  }

  async removeManualGame(gameId: string): Promise<RemoveManualResult> {
    if (!gameId.startsWith('manual-')) {
      return { ok: false, error: 'Only manually added games can be removed here.' }
    }
    const removed = await this.store.removeManualGame(gameId)
    if (!removed) return { ok: false, error: 'Game not found.' }
    this.games = this.games.filter((game) => game.id !== gameId)
    await this.saveCache()
    this.emitChanged()
    return { ok: true }
  }

  /**
   * Edits a manual game. Name and art are edited in place; a new executable
   * changes the stable id, so the entry, favorites, selection, and play history
   * move together. Paths are verified before anything is written.
   */
  async updateManualGame(input: UpdateManualGameInput): Promise<UpdateManualResult> {
    const current = this.store.findManualGame(input.gameId)
    if (!current) return { ok: false, error: 'Only manually added games can be edited.' }

    const name = (input.name ?? current.name).trim()
    if (name.length === 0) return { ok: false, error: 'Enter a name for the game.' }
    if (name.length > 80) {
      return { ok: false, error: 'Keep the name under 80 characters.' }
    }

    let executable = current.executable
    if (input.executable !== undefined) {
      const candidate = path.resolve(input.executable)
      if (candidate.toLowerCase() !== path.resolve(current.executable).toLowerCase()) {
        const error = await this.executableError(candidate)
        if (error) return { ok: false, error }
        executable = candidate
      }
    }

    let artwork = current.artwork
    if (input.artwork === null) {
      artwork = undefined
    } else if (input.artwork !== undefined) {
      const candidate = path.resolve(input.artwork)
      const error = await this.artworkError(candidate)
      if (error) return { ok: false, error }
      artwork = candidate
    }

    const next: ManualGame = {
      id: manualGameId(executable),
      name,
      executable,
      addedAt: current.addedAt,
      ...(artwork ? { artwork } : {}),
    }

    if (next.id !== current.id) {
      if (this.games.some((game) => game.id === next.id)) {
        return { ok: false, error: 'That game is already in your library.' }
      }
      if (this.store.findManualGame(next.id)) {
        return { ok: false, error: 'That game is already in your library.' }
      }
    }

    const replaced = await this.store.replaceManualGame(current.id, next)
    if (!replaced) return { ok: false, error: 'That game is no longer in your library.' }

    const record = manualGameToRecord(next)
    this.games = [
      ...this.games.filter((game) => game.id !== current.id && game.id !== next.id),
      record,
    ]
    this.games.sort((left, right) =>
      left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }),
    )

    if (next.id !== current.id) {
      // The old artwork folder belongs to an id that no longer exists.
      await rm(path.join(getAppPaths().artwork, sanitizeFileToken(current.id)), {
        recursive: true,
        force: true,
      }).catch((error) => log.warn('[catalog] could not drop old artwork', error))
    }

    await this.saveCache()
    this.emitChanged()
    log.info('[catalog] manual game updated', {
      id: next.id,
      renamed: name !== current.name,
      moved: next.id !== current.id,
      customArtwork: Boolean(artwork),
    })
    return {
      ok: true,
      game: this.toSummary(record),
      previousId: next.id === current.id ? undefined : current.id,
    }
  }

  private async executableError(executable: string): Promise<string | null> {
    const extension = path.extname(executable).toLowerCase()
    if (extension !== '.exe' && extension !== '.lnk') {
      return 'Choose an .exe or .lnk file.'
    }
    try {
      const info = await stat(executable)
      if (!info.isFile()) return 'The selected path is not a file.'
    } catch {
      return 'The selected file does not exist.'
    }
    return null
  }

  private async artworkError(file: string): Promise<string | null> {
    if (!isArtworkExtension(file)) {
      return 'Choose a PNG, JPEG, WebP, or AVIF image.'
    }
    let info
    try {
      info = await stat(file)
    } catch {
      return 'The selected image does not exist.'
    }
    if (!info.isFile() || info.size === 0) {
      return 'The selected image is empty.'
    }
    if (info.size > MAX_ARTWORK_BYTES) {
      return 'Choose an image smaller than 20 MiB.'
    }
    return null
  }

  private async saveCache(): Promise<void> {
    if (this.demo) return
    await writeJsonFileAtomic(this.paths.catalog, {
      version: CATALOG_SCHEMA_VERSION,
      scannedAt: this.scannedAt,
      games: this.games,
      staleSources: this.stale,
    })
  }
}
