import { createHash } from 'node:crypto'
import { mkdir, opendir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { MusicFolder, MusicLibrarySnapshot, MusicTrack } from '@shared/types'
import { backupFile, readJsonFile, writeJsonFileAtomic } from '../fs-utils'
import { log } from '../logger'
import { ensureDemoLibrary } from './demo'
import type { MusicLibraryFile, StoredMusicTrack } from './types'

/** Extensions we can hand to Chromium's audio element without transcoding. */
const AUDIO_EXTENSIONS = new Set([
  '.mp3',
  '.m4a',
  '.m4b',
  '.aac',
  '.flac',
  '.ogg',
  '.oga',
  '.opus',
  '.wav',
  '.wma',
])

/** Directories that never contain user music and are expensive to walk. */
const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  '$recycle.bin',
  'system volume information',
  'windows',
  'program files',
  'program files (x86)',
  'programdata',
  'appdata',
])

/** Guards against a folder pointed at a whole drive. */
const MAX_TRACKS = 8_000
const MAX_DEPTH = 8
/** A 250 MB file is a DJ set, not a song; parsing tags would stall the scan. */
const MAX_FILE_BYTES = 250 * 1024 * 1024
const PARSE_CONCURRENCY = 4
const PROGRESS_EVERY = 25
const LIBRARY_FILE_VERSION = 1

const MIME_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
}

type MusicMetadataModule = typeof import('music-metadata')

let metadataModule: Promise<MusicMetadataModule> | null = null

/**
 * `music-metadata` v12 is ESM-only. The main bundle is CJS, so the import has to
 * stay dynamic; caching the promise means the module is evaluated once even when
 * several scans overlap.
 */
function loadMetadata(): Promise<MusicMetadataModule> {
  metadataModule ??= import('music-metadata')
  return metadataModule
}

export interface MusicLibraryOptions {
  libraryFile: string
  artworkDir: string
  demoDir: string
  demo: boolean
}

export type MusicLibraryListener = (snapshot: MusicLibrarySnapshot) => void

interface ScanCounters {
  scannedFiles: number
  skippedFiles: number
  failedFiles: number
}

function trackIdFor(filePath: string): string {
  return createHash('sha1').update(filePath.toLowerCase()).digest('hex').slice(0, 16)
}

function folderLabel(folderPath: string): string {
  const base = path.basename(folderPath.trim())
  return base.length > 0 ? base : folderPath
}

async function readAudioFiles(
  root: string,
  counters: ScanCounters,
  found: string[],
  signal?: AbortSignal,
): Promise<void> {
  const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }]

  while (queue.length > 0 && found.length < MAX_TRACKS) {
    if (signal?.aborted) return
    const next = queue.shift()
    if (!next) break

    let directory
    try {
      directory = await opendir(next.dir)
    } catch {
      counters.skippedFiles += 1
      continue
    }

    for await (const entry of directory) {
      // A NAS folder can take seconds per entry, so the check lives in the loop
      // and not only per directory.
      if (signal?.aborted) return
      if (found.length >= MAX_TRACKS) break

      if (entry.isDirectory()) {
        if (next.depth >= MAX_DEPTH) {
          counters.skippedFiles += 1
          continue
        }
        if (entry.name.startsWith('.') || SKIPPED_DIRECTORIES.has(entry.name.toLowerCase())) {
          counters.skippedFiles += 1
          continue
        }
        queue.push({ dir: path.join(next.dir, entry.name), depth: next.depth + 1 })
        continue
      }

      if (!entry.isFile()) continue
      const extension = path.extname(entry.name).toLowerCase()
      if (!AUDIO_EXTENSIONS.has(extension)) continue

      const filePath = path.join(next.dir, entry.name)
      try {
        const info = await stat(filePath)
        if (info.size > MAX_FILE_BYTES || info.size < 1024) {
          counters.skippedFiles += 1
          continue
        }
      } catch {
        counters.skippedFiles += 1
        continue
      }

      found.push(filePath)
    }
  }
}

async function readTrack(
  filePath: string,
  folderPath: string,
  artworkDir: string,
  counters: ScanCounters,
): Promise<StoredMusicTrack | null> {
  const id = trackIdFor(filePath)
  const fallbackTitle = path.basename(filePath, path.extname(filePath))
  let title = fallbackTitle
  let artist = 'Unknown artist'
  let album = ''
  let durationMs = 0
  let artworkFile: string | null = null

  try {
    const { parseFile } = await loadMetadata()
    // `skipPostHeaders` keeps the scan from reading the tail of large files for
    // chapter data we never display.
    const parsed = await parseFile(filePath, { duration: true, skipPostHeaders: true })
    title = parsed.common.title?.trim() || fallbackTitle
    artist = parsed.common.artist?.trim() || parsed.common.albumartist?.trim() || artist
    album = parsed.common.album?.trim() ?? ''
    durationMs = Math.round((parsed.format.duration ?? 0) * 1000)

    const picture = parsed.common.picture?.[0]
    if (picture) {
      const extension = MIME_EXTENSION[picture.format.toLowerCase()] ?? 'jpg'
      const file = `${id}.${extension}`
      await mkdir(artworkDir, { recursive: true })
      await writeFile(path.join(artworkDir, file), picture.data)
      artworkFile = file
    }
  } catch (error) {
    counters.failedFiles += 1
    log.warn(`music: could not read tags for ${filePath}`, error)
  }

  counters.scannedFiles += 1
  return {
    id,
    title,
    artist,
    album,
    durationMs,
    filePath,
    artworkFile,
    folder: folderLabel(folderPath),
    folderPath,
    addedAt: Date.now(),
  }
}

/**
 * Owns the local music index. Scanning is deliberately separate from playback:
 * the renderer only ever receives `MusicTrack` objects whose paths have been
 * replaced by `app://` URLs.
 */
export class MusicLibraryService {
  private readonly options: MusicLibraryOptions
  private readonly listeners = new Set<MusicLibraryListener>()
  private folders: string[] = []
  private tracks: StoredMusicTrack[] = []
  private demo: StoredMusicTrack[] = []
  private scanning = false
  private scannedFiles = 0
  private skippedFiles = 0
  private scanError: string | null = null
  private scannedAt = 0
  private scanPromise: Promise<MusicLibrarySnapshot> | null = null
  /** Aborts the running scan; null when nothing is scanning. */
  private scanAbort: AbortController | null = null
  private loaded = false

  constructor(options: MusicLibraryOptions) {
    this.options = options
  }

  async load(): Promise<void> {
    if (this.loaded) return
    this.loaded = true

    const read = await readJsonFile(this.options.libraryFile)
    if (read.status === 'ok') {
      const parsed = this.parseCache(read.value)
      if (parsed) {
        this.folders = parsed.folders
        this.tracks = parsed.tracks
        this.scannedAt = parsed.scannedAt
      } else {
        await backupFile(this.options.libraryFile, 'invalid')
      }
    }

    if (this.options.demo) {
      this.demo = await ensureDemoLibrary(this.options.demoDir, this.options.artworkDir)
    }
  }

  get snapshot(): MusicLibrarySnapshot {
    return {
      tracks: this.allTracks().map((track) => this.toPublicTrack(track)),
      folders: this.folderSummaries(),
      scanning: this.scanning,
      scannedFiles: this.scannedFiles,
      skippedFiles: this.skippedFiles,
      scanError: this.scanError,
      scannedAt: this.scannedAt > 0 ? this.scannedAt : null,
    }
  }

  getTrackFile(trackId: string): string | null {
    const track = this.allTracks().find((candidate) => candidate.id === trackId)
    return track?.filePath ?? null
  }

  onChange(listener: MusicLibraryListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** True when the cache does not cover the folders currently configured. */
  needsScan(): boolean {
    if (this.tracks.length === 0 && this.folders.length > 0) return true
    if (this.scannedAt === 0 && this.folders.length > 0) return true
    return false
  }

  async addFolder(folderPath: string): Promise<MusicLibrarySnapshot> {
    const normalized = path.resolve(folderPath)
    if (!this.folders.some((folder) => folder.toLowerCase() === normalized.toLowerCase())) {
      this.folders = [...this.folders, normalized]
      await this.persist()
    }
    return this.rescan()
  }

  async removeFolder(folderPath: string): Promise<MusicLibrarySnapshot> {
    const normalized = path.resolve(folderPath)
    this.folders = this.folders.filter(
      (folder) => folder.toLowerCase() !== normalized.toLowerCase(),
    )
    this.tracks = this.tracks.filter((track) => track.folderPath !== normalized)
    await this.persist()
    this.emit()
    return this.snapshot
  }

  rescan(): Promise<MusicLibrarySnapshot> {
    // A rescan while a scan is running used to start a second walk over the same
    // folders. Cancel the old one and queue exactly one fresh walk behind it.
    const running = this.scanPromise
    if (running) {
      this.cancelScan()
      const next = running.then(() => this.rescan())
      this.scanPromise = next
      return next
    }
    const scan = this.runScan().finally(() => {
      if (this.scanPromise === scan) this.scanPromise = null
    })
    this.scanPromise = scan
    return scan
  }

  /**
   * Stops the running scan. The tracks found so far are kept, so a cancelled
   * scan of a huge folder still leaves a usable partial library.
   */
  cancelScan(): MusicLibrarySnapshot {
    this.scanAbort?.abort()
    return this.snapshot
  }

  private async runScan(): Promise<MusicLibrarySnapshot> {
    const controller = new AbortController()
    this.scanAbort = controller
    const signal = controller.signal
    this.scanning = true
    this.scanError = null
    this.scannedFiles = 0
    this.skippedFiles = 0
    this.emit()

    const counters: ScanCounters = { scannedFiles: 0, skippedFiles: 0, failedFiles: 0 }
    const previousArtwork = new Set(
      this.tracks.map((track) => track.artworkFile).filter((file): file is string => Boolean(file)),
    )
    const collected: StoredMusicTrack[] = []

    try {
      for (const folder of this.folders) {
        if (signal.aborted) break
        const files: string[] = []
        await readAudioFiles(folder, counters, files, signal)

        let cursor = 0
        const run = async (): Promise<void> => {
          while (cursor < files.length) {
            if (signal.aborted) return
            const index = cursor
            cursor += 1
            const filePath = files[index]
            if (!filePath) continue
            const track = await readTrack(filePath, folder, this.options.artworkDir, counters)
            if (track) collected.push(track)
            if (collected.length % PROGRESS_EVERY === 0) {
              this.scannedFiles = counters.scannedFiles
              this.skippedFiles = counters.skippedFiles
              this.emit()
            }
          }
        }

        await Promise.all(Array.from({ length: PARSE_CONCURRENCY }, run))
      }
    } catch (error) {
      this.scanError = error instanceof Error ? error.message : 'Music scan failed.'
      log.warn('music: scan failed', error)
    }

    const cancelled = signal.aborted
    if (this.scanAbort === controller) this.scanAbort = null

    const deduped = new Map<string, StoredMusicTrack>()
    for (const track of collected) {
      deduped.set(track.filePath.toLowerCase(), track)
    }

    this.tracks = [...deduped.values()].sort(
      (a, b) =>
        a.artist.localeCompare(b.artist) ||
        a.album.localeCompare(b.album) ||
        a.title.localeCompare(b.title),
    )
    this.scannedFiles = counters.scannedFiles
    this.skippedFiles = counters.skippedFiles
    if (!cancelled) this.scannedAt = Date.now()
    this.scanning = false

    // Covers from tracks that disappeared (or were re-tagged) are dead weight.
    const liveArtwork = new Set(
      this.tracks.map((track) => track.artworkFile).filter((file): file is string => Boolean(file)),
    )
    for (const file of previousArtwork) {
      if (!liveArtwork.has(file)) {
        await rm(path.join(this.options.artworkDir, file), { force: true }).catch(() => undefined)
      }
    }

    await this.persist()
    this.emit()
    return this.snapshot
  }

  private allTracks(): StoredMusicTrack[] {
    return this.demo.length > 0 ? [...this.demo, ...this.tracks] : this.tracks
  }

  private toPublicTrack(track: StoredMusicTrack): MusicTrack {
    return {
      id: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      durationMs: track.durationMs,
      artworkUrl: track.artworkFile
        ? `app://launcher/music-art/${encodeURIComponent(track.artworkFile)}`
        : null,
      streamUrl: `app://launcher/media/${encodeURIComponent(track.id)}`,
      folder: track.folder,
    }
  }

  private folderSummaries(): MusicFolder[] {
    const counts = new Map<string, MusicFolder>()
    if (this.demo.length > 0) {
      counts.set('Demo', { path: 'Demo', trackCount: this.demo.length })
    }
    for (const track of this.tracks) {
      const key = track.folderPath ?? track.folder
      const existing = counts.get(key)
      if (existing) existing.trackCount += 1
      else counts.set(key, { path: key, trackCount: 1 })
    }
    return [...counts.values()]
  }

  private emit(): void {
    const snapshot = this.snapshot
    for (const listener of this.listeners) {
      try {
        listener(snapshot)
      } catch (error) {
        log.warn('music: listener failed', error)
      }
    }
  }

  private async persist(): Promise<void> {
    const payload: MusicLibraryFile = {
      version: LIBRARY_FILE_VERSION,
      folders: this.folders,
      tracks: this.tracks,
      scannedAt: this.scannedAt,
    }
    await writeJsonFileAtomic(this.options.libraryFile, payload).catch((error) =>
      log.warn('music: could not persist library', error),
    )
  }

  private parseCache(value: unknown): MusicLibraryFile | null {
    if (!value || typeof value !== 'object') return null
    const record = value as Record<string, unknown>
    if (record.version !== LIBRARY_FILE_VERSION) return null
    if (!Array.isArray(record.folders) || !Array.isArray(record.tracks)) return null

    const folders = record.folders.filter(
      (folder): folder is string => typeof folder === 'string' && folder.length > 0,
    )
    const tracks: StoredMusicTrack[] = []
    for (const entry of record.tracks) {
      if (!entry || typeof entry !== 'object') continue
      const item = entry as Record<string, unknown>
      if (typeof item.id !== 'string' || typeof item.filePath !== 'string') continue
      if (typeof item.title !== 'string' || typeof item.artist !== 'string') continue
      tracks.push({
        id: item.id,
        title: item.title,
        artist: item.artist,
        album: typeof item.album === 'string' ? item.album : '',
        durationMs: typeof item.durationMs === 'number' ? item.durationMs : 0,
        filePath: item.filePath,
        artworkFile: typeof item.artworkFile === 'string' ? item.artworkFile : null,
        folder: typeof item.folder === 'string' ? item.folder : 'Music',
        folderPath: typeof item.folderPath === 'string' ? item.folderPath : undefined,
        addedAt: typeof item.addedAt === 'number' ? item.addedAt : 0,
      })
    }

    return {
      version: LIBRARY_FILE_VERSION,
      folders,
      tracks,
      scannedAt: typeof record.scannedAt === 'number' ? record.scannedAt : 0,
    }
  }
}

/** Exposed for the scan test without touching the filesystem. */
export const MUSIC_SCAN_LIMITS = { MAX_TRACKS, MAX_DEPTH, MAX_FILE_BYTES } as const

/** Kept for callers that only need to know whether a path looks like audio. */
export function isAudioPath(filePath: string): boolean {
  return AUDIO_EXTENSIONS.has(path.extname(filePath).toLowerCase())
}

/** Reads a cover file for tests; not used by the service itself. */
export async function readCoverBytes(filePath: string): Promise<Buffer> {
  return readFile(filePath)
}
