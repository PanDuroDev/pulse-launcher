import { existsSync } from 'node:fs'
import { mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type {
  MusicYouTubeResolveResult,
  MusicYouTubeSearchResult,
  MusicYouTubeStatus,
  MusicYouTubeTrack,
  MusicYouTubeUpdate,
} from '@shared/types'
import { readJsonFile, writeJsonFileAtomic } from '../../fs-utils'
import { APP_HOST, APP_SCHEME } from '../../paths'
import { searchWithApi } from './api'
import { YouTubeConfigStore } from './config'
import {
  cleanChannelName,
  isYouTubeVideoId,
  parseYouTubeTitle,
  safeErrorMessage,
  youtubeThumbnailUrl,
  youtubeThumbnailUrlFromApi,
  youtubeWatchUrl,
} from './parse'
import {
  detectFfmpeg,
  detectYtDlp,
  ensureFfmpeg,
  ensureYtDlp,
} from './tools'
import type { YouTubeCacheEntry, YouTubeCacheIndex, YouTubeCandidate } from './types'
import { downloadAudioToMp3, searchWithYtDlp } from './ytdlp'

const SEARCH_TIMEOUT_MS = 15_000
const MAX_RESULTS = 25
const INDEX_VERSION = 1
const INDEX_FILE = 'index.json'
const OEMBED_TIMEOUT_MS = 10_000
const ARTWORK_TIMEOUT_MS = 15_000
const MAX_ARTWORK_BYTES = 8_000_000

export interface MusicYouTubeServiceOptions {
  rootDir: string
  artworkDir: string
  configFile: string
  binDir: string
}

function appUrl(pathname: string): string {
  return `${APP_SCHEME}://${APP_HOST}/${pathname}`
}

function parseIndex(value: unknown): YouTubeCacheIndex {
  const empty: YouTubeCacheIndex = { version: INDEX_VERSION, entries: {} }
  if (!value || typeof value !== 'object') return empty
  const raw = value as { entries?: unknown }
  if (!raw.entries || typeof raw.entries !== 'object') return empty

  const entries: Record<string, YouTubeCacheEntry> = {}
  for (const [key, item] of Object.entries(raw.entries)) {
    if (!isYouTubeVideoId(key) || !item || typeof item !== 'object') continue
    const candidate = item as Record<string, unknown>
    const title = typeof candidate['title'] === 'string' ? candidate['title'].slice(0, 400) : ''
    const videoTitle =
      typeof candidate['videoTitle'] === 'string'
        ? candidate['videoTitle'].slice(0, 400)
        : title
    const artist =
      typeof candidate['artist'] === 'string' ? candidate['artist'].slice(0, 400) : ''
    const channel =
      typeof candidate['channel'] === 'string' ? candidate['channel'].slice(0, 400) : ''
    if (!title) continue
    const thumbnailUrl = youtubeThumbnailUrlFromApi(candidate['thumbnailUrl'])
    const duration =
      typeof candidate['durationMs'] === 'number' && Number.isFinite(candidate['durationMs'])
        ? Math.max(0, Math.min(86_400_000, Math.round(candidate['durationMs'])))
        : 0
    const downloadedAt =
      typeof candidate['downloadedAt'] === 'number' &&
      Number.isFinite(candidate['downloadedAt'])
        ? candidate['downloadedAt']
        : 0
    entries[key] = {
      videoId: key,
      title,
      videoTitle,
      artist: artist || channel || 'YouTube',
      channel: channel || artist || 'YouTube',
      durationMs: duration,
      thumbnailUrl,
      sourceUrl: youtubeWatchUrl(key),
      downloadedAt,
    }
  }
  return { version: INDEX_VERSION, entries }
}

function entryCandidate(entry: YouTubeCacheEntry): YouTubeCandidate {
  return {
    videoId: entry.videoId,
    title: entry.title,
    videoTitle: entry.videoTitle || entry.title,
    artist: entry.artist,
    channel: entry.channel,
    durationMs: entry.durationMs,
    thumbnailUrl: entry.thumbnailUrl,
    sourceUrl: entry.sourceUrl,
  }
}

/**
 * Owns YouTube search, MP3 extraction, the on-disk cache, and the settings that
 * point at yt-dlp and FFmpeg.
 */
export class MusicYouTubeService {
  private readonly options: MusicYouTubeServiceOptions
  private readonly config: YouTubeConfigStore
  private readonly candidates = new Map<string, YouTubeCandidate>()
  /** API thumbnails are higher quality than the fixed hqdefault fallback. */
  private readonly thumbnails = new Map<string, string>()
  private readonly extractions = new Map<string, Promise<MusicYouTubeResolveResult>>()
  private index: YouTubeCacheIndex = { version: INDEX_VERSION, entries: {} }

  constructor(options: MusicYouTubeServiceOptions) {
    this.options = options
    this.config = new YouTubeConfigStore(options.configFile)
  }

  async load(): Promise<void> {
    await mkdir(this.options.rootDir, { recursive: true })
    await this.config.load()
    const read = await readJsonFile(path.join(this.options.rootDir, INDEX_FILE))
    if (read.status === 'ok') this.index = parseIndex(read.value)
    for (const entry of Object.values(this.index.entries)) {
      if (entry.thumbnailUrl) this.thumbnails.set(entry.videoId, entry.thumbnailUrl)
    }
  }

  async status(): Promise<MusicYouTubeStatus> {
    const settings = this.config.get()
    const [ytDlp, ffmpeg] = await Promise.all([
      detectYtDlp(settings.ytDlpPath, this.options.binDir),
      detectFfmpeg(settings.ffmpegPath, this.options.binDir),
    ])
    return {
      settings,
      ytDlp,
      ffmpeg,
      cache: await this.cacheStats(),
    }
  }

  async updateSettings(update: MusicYouTubeUpdate): Promise<MusicYouTubeStatus> {
    await this.config.update(update)
    return this.status()
  }

  async search(rawQuery: string): Promise<MusicYouTubeSearchResult> {
    const query = rawQuery.trim()
    if (query.length < 2) {
      return { query, tracks: [], source: 'api', warning: null }
    }

    const settings = this.config.get()
    const apiKey = settings.apiKey || process.env['PULSE_YOUTUBE_API_KEY']?.trim() || ''
    let warning: string | null = null
    let source: MusicYouTubeSearchResult['source'] = 'api'
    let candidates: YouTubeCandidate[] = []
    // A successful API search that simply found nothing must not trigger the
    // slow yt-dlp fallback: the user would wait for a second search to learn
    // that the query has no matches. Only a failed API call falls back.
    let apiFailed = false

    if (apiKey) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS)
      try {
        candidates = await searchWithApi({
          apiKey,
          query,
          signal: controller.signal,
        })
      } catch {
        // A missing or quota-limited key should not make the search unusable.
        apiFailed = true
        warning = 'The YouTube API search failed; showing yt-dlp results instead.'
      } finally {
        clearTimeout(timer)
      }
    }

    if (candidates.length === 0 && (apiFailed || !apiKey)) {
      source = 'yt-dlp'
      const ytDlp = await ensureYtDlp(settings.ytDlpPath, this.options.binDir)
      if (!ytDlp.ok || !ytDlp.path) {
        return {
          query,
          tracks: [],
          source,
          warning: [warning, ytDlp.error].filter(Boolean).join(' '),
        }
      }
      try {
        candidates = await searchWithYtDlp(ytDlp.path, query)
      } catch (error) {
        return {
          query,
          tracks: [],
          source,
          warning: [warning, safeErrorMessage(error, 'yt-dlp search failed.')]
            .filter(Boolean)
            .join(' '),
        }
      }
    }

    const tracks: MusicYouTubeTrack[] = []
    for (const candidate of candidates) {
      const track = this.expose(candidate)
      if (!track) continue
      this.candidates.set(candidate.videoId, candidate)
      if (candidate.thumbnailUrl) {
        this.thumbnails.set(candidate.videoId, candidate.thumbnailUrl)
      }
      tracks.push(track)
      if (tracks.length >= MAX_RESULTS) break
    }

    return { query, tracks, source, warning }
  }

  async resolve(videoId: string): Promise<MusicYouTubeResolveResult> {
    if (!isYouTubeVideoId(videoId)) {
      return { ok: false, error: 'Invalid YouTube video id.' }
    }
    const existing = this.extractions.get(videoId)
    if (existing) return existing

    const task = this.resolveInternal(videoId).finally(() => {
      this.extractions.delete(videoId)
    })
    this.extractions.set(videoId, task)
    return task
  }

  /** Protocol resolver: only extracted files can be played. */
  getTrackFile(trackId: string): string | null {
    if (!trackId.startsWith('youtube:')) return null
    const videoId = trackId.slice('youtube:'.length)
    if (!isYouTubeVideoId(videoId)) return null
    const filePath = path.join(this.options.rootDir, `${videoId}.mp3`)
    return existsSync(filePath) ? filePath : null
  }

  /**
   * Protocol resolver for search thumbnails; API URLs are host-validated.
   * Returns every size worth trying so a video without a maxres image still
   * renders a cover instead of an empty frame.
   */
  getArtworkUrls(videoId: string): string[] {
    if (!isYouTubeVideoId(videoId)) return []
    const candidates = [
      this.thumbnails.get(videoId),
      youtubeThumbnailUrl(videoId, 'maxresdefault'),
      youtubeThumbnailUrl(videoId),
    ].filter((value): value is string => Boolean(value))
    return [...new Set(candidates)]
  }

  private expose(candidate: YouTubeCandidate): MusicYouTubeTrack | null {
    if (!isYouTubeVideoId(candidate.videoId)) return null
    return {
      id: `youtube:${candidate.videoId}`,
      youtubeId: candidate.videoId,
      title: candidate.title,
      videoTitle: candidate.videoTitle,
      artist: candidate.artist,
      album: '',
      durationMs: candidate.durationMs,
      artworkUrl: this.artworkUrl(candidate.videoId),
      streamUrl: '',
      folder: 'YouTube',
      provider: 'youtube',
      publisher: candidate.channel,
      streamKind: 'full',
      license: null,
      sourceUrl: candidate.sourceUrl,
    }
  }

  private buildTrack(candidate: YouTubeCandidate): MusicYouTubeTrack {
    return {
      id: `youtube:${candidate.videoId}`,
      youtubeId: candidate.videoId,
      title: candidate.title,
      videoTitle: candidate.videoTitle,
      artist: candidate.artist,
      album: '',
      durationMs: candidate.durationMs,
      artworkUrl: this.artworkUrl(candidate.videoId),
      streamUrl: appUrl(`media/youtube:${candidate.videoId}`),
      folder: 'YouTube',
      provider: 'youtube',
      publisher: candidate.channel,
      streamKind: 'full',
      license: null,
      sourceUrl: candidate.sourceUrl,
    }
  }

  private artworkUrl(videoId: string): string {
    const filePath = path.join(this.options.artworkDir, `youtube-${videoId}.jpg`)
    return existsSync(filePath)
      ? appUrl(`music-art/youtube-${videoId}.jpg`)
      : appUrl(`youtube-art/${videoId}`)
  }

  private candidateFor(videoId: string): YouTubeCandidate | null {
    const cached = this.candidates.get(videoId)
    if (cached) return cached
    const entry = this.index.entries[videoId]
    return entry ? entryCandidate(entry) : null
  }

  private async resolveInternal(videoId: string): Promise<MusicYouTubeResolveResult> {
    try {
      const filePath = path.join(this.options.rootDir, `${videoId}.mp3`)
      let candidate = this.candidateFor(videoId)
      if (!candidate) candidate = await this.fetchOembed(videoId)

      if (existsSync(filePath)) {
        if (!candidate) {
          candidate = {
            videoId,
            title: 'YouTube video',
            videoTitle: 'YouTube video',
            artist: 'YouTube',
            channel: 'YouTube',
            durationMs: 0,
            thumbnailUrl: null,
            sourceUrl: youtubeWatchUrl(videoId),
          }
        }
        if (!this.index.entries[videoId]) {
          await this.persistEntry(candidate)
        }
        void this.cacheArtwork(videoId, candidate)
        return { ok: true, track: this.buildTrack(candidate) }
      }

      const settings = this.config.get()
      const [ytDlp, ffmpeg] = await Promise.all([
        ensureYtDlp(settings.ytDlpPath, this.options.binDir),
        ensureFfmpeg(settings.ffmpegPath, this.options.binDir),
      ])
      if (!ytDlp.ok || !ytDlp.path) {
        return { ok: false, error: ytDlp.error ?? 'yt-dlp is not available.' }
      }
      if (!ffmpeg.ok || !ffmpeg.path) {
        return { ok: false, error: ffmpeg.error ?? 'FFmpeg is not available.' }
      }
      if (!candidate) candidate = await this.fetchOembed(videoId)
      if (!candidate) {
        candidate = {
          videoId,
          title: 'YouTube video',
          videoTitle: 'YouTube video',
          artist: 'YouTube',
          channel: 'YouTube',
          durationMs: 0,
          thumbnailUrl: null,
          sourceUrl: youtubeWatchUrl(videoId),
        }
      }

      await downloadAudioToMp3({
        ytDlpPath: ytDlp.path,
        ffmpegPath: ffmpeg.path,
        videoId,
        outputDir: this.options.rootDir,
      })
      this.candidates.set(videoId, candidate)
      await this.persistEntry(candidate)
      void this.cacheArtwork(videoId, candidate)
      return { ok: true, track: this.buildTrack(candidate) }
    } catch (error) {
      return {
        ok: false,
        error: safeErrorMessage(error, 'The MP3 could not be extracted.'),
      }
    }
  }

  private async persistEntry(candidate: YouTubeCandidate): Promise<void> {
    this.index.entries[candidate.videoId] = {
      videoId: candidate.videoId,
      title: candidate.title,
      videoTitle: candidate.videoTitle,
      artist: candidate.artist,
      channel: candidate.channel,
      durationMs: candidate.durationMs,
      thumbnailUrl: candidate.thumbnailUrl,
      sourceUrl: candidate.sourceUrl,
      downloadedAt: Date.now(),
    }
    if (candidate.thumbnailUrl) {
      this.thumbnails.set(candidate.videoId, candidate.thumbnailUrl)
    }
    try {
      await writeJsonFileAtomic(
        path.join(this.options.rootDir, INDEX_FILE),
        this.index,
      )
    } catch {
      // Playback should still work if the cache index cannot be written.
    }
  }

  private async fetchOembed(videoId: string): Promise<YouTubeCandidate | null> {
    try {
      const url = new URL('https://www.youtube.com/oembed')
      url.searchParams.set('url', youtubeWatchUrl(videoId))
      url.searchParams.set('format', 'json')
      const response = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'PulseLauncher' },
        redirect: 'follow',
        signal: AbortSignal.timeout(OEMBED_TIMEOUT_MS),
      })
      if (!response.ok) return null
      const body = (await response.json()) as {
        title?: unknown
        author_name?: unknown
        thumbnail_url?: unknown
      }
      if (typeof body.title !== 'string' || !body.title.trim()) return null
      const videoTitle = body.title.trim().slice(0, 400)
      const channel = cleanChannelName(
        typeof body.author_name === 'string' ? body.author_name : '',
      )
      const parsed = parseYouTubeTitle(videoTitle, channel)
      return {
        videoId,
        title: parsed.title,
        videoTitle,
        artist: parsed.artist,
        channel: channel || parsed.artist,
        durationMs: 0,
        thumbnailUrl: youtubeThumbnailUrlFromApi(body.thumbnail_url),
        sourceUrl: youtubeWatchUrl(videoId),
      }
    } catch {
      return null
    }
  }

  private async cacheArtwork(
    videoId: string,
    candidate?: YouTubeCandidate,
  ): Promise<void> {
    const target = path.join(this.options.artworkDir, `youtube-${videoId}.jpg`)
    if (existsSync(target)) return
    await mkdir(this.options.artworkDir, { recursive: true })

    const sources = [
      candidate?.thumbnailUrl,
      youtubeThumbnailUrl(videoId, 'maxresdefault'),
      youtubeThumbnailUrl(videoId, 'hqdefault'),
    ].filter((url, index, list): url is string => Boolean(url) && list.indexOf(url) === index)

    for (const source of sources) {
      try {
        const response = await fetch(source, {
          headers: { Accept: 'image/jpeg' },
          signal: AbortSignal.timeout(ARTWORK_TIMEOUT_MS),
        })
        if (!response.ok) continue
        const contentType = response.headers.get('content-type') ?? ''
        if (!contentType.startsWith('image/')) continue
        const bytes = new Uint8Array(await response.arrayBuffer())
        if (bytes.byteLength < 1_024 || bytes.byteLength > MAX_ARTWORK_BYTES) continue
        const temporary = `${target}.download-${process.pid}-${Date.now()}`
        try {
          await writeFile(temporary, bytes)
          await rm(target, { force: true })
          await rename(temporary, target)
        } catch {
          await rm(temporary, { force: true }).catch(() => undefined)
        }
        return
      } catch {
        // A missing maxres image is normal; try the next size.
      }
    }
  }

  private async cacheStats(): Promise<{ tracks: number; bytes: number }> {
    try {
      const entries = await readdir(this.options.rootDir, { withFileTypes: true })
      const files = entries.filter(
        (entry) => entry.isFile() && entry.name.endsWith('.mp3'),
      )
      let bytes = 0
      await Promise.all(
        files.map(async (entry) => {
          try {
            const info = await stat(path.join(this.options.rootDir, entry.name))
            bytes += info.size
          } catch {
            // A file deleted during the scan simply does not count.
          }
        }),
      )
      return { tracks: files.length, bytes }
    } catch {
      return { tracks: 0, bytes: 0 }
    }
  }
}
