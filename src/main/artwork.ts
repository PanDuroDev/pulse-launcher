import { app, net } from 'electron'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { ArtKind, GameRecord, ArtworkResult, Settings } from '@shared/types'
import { getAppPaths, sanitizeFileToken } from './paths'
import { readBodyWithLimit } from './http-body'
import { log } from './logger'
import type { AppStore } from './store'

const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const DOWNLOAD_TIMEOUT_MS = 20_000
const STEAM_CDN = 'https://cdn.cloudflare.steamstatic.com/steam/apps'
const SGDB_API = 'https://www.steamgriddb.com/api/v2'
const ART_HOST = 'launcher'

type ArtSource = { url: string; extension: string }

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
}

function extensionFromUrl(url: string): string {
  const pathname = new URL(url).pathname.toLowerCase()
  if (pathname.endsWith('.png')) return 'png'
  if (pathname.endsWith('.webp')) return 'webp'
  if (pathname.endsWith('.avif')) return 'avif'
  if (pathname.endsWith('.svg')) return 'svg'
  return 'jpg'
}

function artworkUrl(token: string, fileName: string): string {
  return `app://${ART_HOST}/art/${encodeURIComponent(token)}/${encodeURIComponent(fileName)}`
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function hueFor(value: string): number {
  let result = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index)
    result = Math.imul(result, 16777619)
  }
  return (result >>> 0) % 360
}

function placeholderSvg(game: GameRecord, kind: ArtKind): string {
  const hue = hueFor(game.id)
  const secondHue = (hue + 54) % 360
  const initials = game.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
  const width = kind === 'hero' ? 1920 : 600
  const height = kind === 'hero' ? 1080 : 900
  const titleSize = kind === 'hero' ? 200 : 150

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue} 48% 18%)"/>
      <stop offset="52%" stop-color="hsl(${secondHue} 58% 32%)"/>
      <stop offset="100%" stop-color="hsl(${hue} 62% 10%)"/>
    </linearGradient>
    <radialGradient id="glow" cx="30%" cy="18%" r="80%">
      <stop offset="0%" stop-color="hsla(${hue} 90% 70% / 0.45)"/>
      <stop offset="100%" stop-color="hsla(${hue} 90% 70% / 0)"/>
    </radialGradient>
    <filter id="soft"><feGaussianBlur stdDeviation="30"/></filter>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect width="${width}" height="${height}" fill="url(#glow)"/>
  <circle cx="${width * 0.82}" cy="${height * 0.2}" r="${width * 0.3}" fill="hsla(${secondHue} 90% 62% / 0.2)" filter="url(#soft)"/>
  <circle cx="${width * 0.12}" cy="${height * 0.88}" r="${width * 0.22}" fill="hsla(${hue} 90% 62% / 0.16)" filter="url(#soft)"/>
  <text x="48" y="${height - 48}" fill="hsla(0 0% 100% / 0.82)" font-family="Segoe UI, sans-serif" font-size="${titleSize}" font-weight="700" letter-spacing="-4">${escapeXml(initials)}</text>
  <text x="52" y="${height - 18}" fill="hsla(0 0% 100% / 0.4)" font-family="Segoe UI, sans-serif" font-size="${kind === 'hero' ? 28 : 22}" font-weight="500" letter-spacing="6">${escapeXml(game.source.toUpperCase())}</text>
</svg>`
}

export class ArtworkService {
  private readonly paths = getAppPaths()
  private readonly inFlight = new Map<string, Promise<ArtworkResult>>()
  private readonly settings: () => Settings

  constructor(store: AppStore) {
    this.settings = () => store.getSettings()
  }

  async ensure(game: GameRecord, kind: ArtKind): Promise<ArtworkResult> {
    const cacheKey = `${game.id}:${kind}`
    const existing = this.inFlight.get(cacheKey)
    if (existing) return existing

    const promise = this.ensureInternal(game, kind).finally(() => {
      this.inFlight.delete(cacheKey)
    })
    this.inFlight.set(cacheKey, promise)
    return promise
  }

  private async ensureInternal(
    game: GameRecord,
    kind: ArtKind,
  ): Promise<ArtworkResult> {
    const token = sanitizeFileToken(game.id)
    const directory = path.join(this.paths.artwork, token)
    await mkdir(directory, { recursive: true })

    // A user-picked image outranks every cached or downloaded cover.
    const custom = await this.ensureCustomArtwork(game, kind, directory, token)
    if (custom) {
      return { gameId: game.id, kind, url: artworkUrl(token, custom) }
    }

    const cached = await this.findCached(directory, token, kind)
    if (cached) {
      return { gameId: game.id, kind, url: artworkUrl(token, cached) }
    }

    const candidates = await this.resolveCandidates(game, kind)
    for (const candidate of candidates) {
      try {
        const extension = await this.download(candidate.url, directory, `${token}-${kind}`, candidate.extension)
        if (extension) {
          return {
            gameId: game.id,
            kind,
            url: artworkUrl(token, `${token}-${kind}.${extension}`),
          }
        }
      } catch (error) {
        log.warn('[artwork] download failed', game.id, kind, candidate.url, error)
      }
    }

    if (kind === 'icon') {
      const icon = await this.extractFileIcon(game, directory, token)
      if (icon) return { gameId: game.id, kind, url: artworkUrl(token, icon) }
      return { gameId: game.id, kind, url: null }
    }

    if (kind === 'logo') {
      return { gameId: game.id, kind, url: null }
    }

    const fileName = `${token}-${kind}.svg`
    await writeFile(path.join(directory, fileName), placeholderSvg(game, kind), 'utf8')
    return { gameId: game.id, kind, url: artworkUrl(token, fileName) }
  }

  /**
   * Copies a manual game's chosen image into its artwork folder and returns the
   * cached file name. The file name carries a hash of the source path, size, and
   * mtime, so replacing the image never serves a stale file from the protocol
   * cache, and no invalidation bookkeeping is needed.
   */
  private async ensureCustomArtwork(
    game: GameRecord,
    kind: ArtKind,
    directory: string,
    token: string,
  ): Promise<string | null> {
    if (kind !== 'cover' && kind !== 'hero') return null
    const source = game.manualArtwork
    if (!source) return null

    const extension = path.extname(source).toLowerCase()
    if (!['.png', '.jpg', '.jpeg', '.webp', '.avif'].includes(extension)) return null

    let info
    try {
      info = await stat(source)
    } catch {
      log.warn('[artwork] custom artwork is missing', source)
      return null
    }
    if (!info.isFile() || info.size === 0 || info.size > MAX_IMAGE_BYTES) return null

    const normalized = extension === '.jpeg' ? '.jpg' : extension
    const hash = createHash('sha1')
      .update(`${path.resolve(source)}:${info.size}:${info.mtimeMs}`)
      .digest('hex')
      .slice(0, 12)
    const fileName = `${token}-${kind}-custom-${hash}${normalized}`
    const target = path.join(directory, fileName)
    try {
      const cached = await stat(target)
      if (cached.isFile() && cached.size > 0) return fileName
    } catch {
      // not cached yet
    }

    try {
      await copyFile(source, target)
      await this.dropOlderCustomArtwork(directory, token, kind, fileName)
      return fileName
    } catch (error) {
      log.warn('[artwork] could not copy custom artwork', source, error)
      return null
    }
  }

  /** Keeps at most one custom file per kind; older picks are unreachable. */
  private async dropOlderCustomArtwork(
    directory: string,
    token: string,
    kind: ArtKind,
    keep: string,
  ): Promise<void> {
    const prefix = `${token}-${kind}-custom-`
    let entries: string[]
    try {
      entries = await readdir(directory)
    } catch {
      return
    }
    await Promise.all(
      entries
        .filter((entry) => entry.startsWith(prefix) && entry !== keep)
        .map((entry) => unlink(path.join(directory, entry)).catch(() => undefined)),
    )
  }

  private async findCached(
    directory: string,
    token: string,
    kind: ArtKind,
  ): Promise<string | null> {
    for (const extension of ['jpg', 'png', 'webp', 'avif', 'svg']) {
      const fileName = `${token}-${kind}.${extension}`
      try {
        const info = await stat(path.join(directory, fileName))
        if (info.isFile() && info.size > 0) return fileName
      } catch {
        // cache miss
      }
    }
    return null
  }

  private async resolveCandidates(
    game: GameRecord,
    kind: ArtKind,
  ): Promise<ArtSource[]> {
    const known = (game.artCandidates?.[kind] ?? []).map((url) => ({
      url,
      extension: extensionFromUrl(url),
    }))
    if (known.length > 0) return known

    if (game.source === 'steam' && game.appId) {
      const appId = encodeURIComponent(game.appId)
      const urls =
        kind === 'cover'
          ? [
              `${STEAM_CDN}/${appId}/library_600x900_2x.jpg`,
              `${STEAM_CDN}/${appId}/library_600x900.jpg`,
              `${STEAM_CDN}/${appId}/header.jpg`,
            ]
          : kind === 'hero'
            ? [
                `${STEAM_CDN}/${appId}/library_hero.jpg`,
                `${STEAM_CDN}/${appId}/hero_capsule.jpg`,
                `${STEAM_CDN}/${appId}/header.jpg`,
              ]
            : kind === 'logo'
              ? [
                  `${STEAM_CDN}/${appId}/logo_2x.png`,
                  `${STEAM_CDN}/${appId}/logo.png`,
                ]
              : []
      return urls.map((url) => ({ url, extension: extensionFromUrl(url) }))
    }

    const apiKey = this.settings().steamGridDbApiKey.trim()
    if (!apiKey) return []

    try {
      return await this.steamGridDbCandidates(game.name, kind, apiKey)
    } catch (error) {
      log.warn('[artwork] SteamGridDB lookup failed', game.name, error)
      return []
    }
  }

  private async steamGridDbCandidates(
    name: string,
    kind: ArtKind,
    apiKey: string,
  ): Promise<ArtSource[]> {
    const searchUrl = `${SGDB_API}/search/autocomplete/${encodeURIComponent(name)}`
    const search = await this.fetchJson<{ data?: Array<{ id: number }> }>(
      searchUrl,
      apiKey,
    )
    const gameId = search.data?.[0]?.id
    if (!gameId) return []

    if (kind === 'cover') {
      const response = await this.fetchJson<{ data?: Array<{ url: string }> }>(
        `${SGDB_API}/grids/game/${gameId}?dimensions=600x900&types=static&nsfw=false&humor=false`,
        apiKey,
      )
      return (response.data ?? []).slice(0, 3).map((item) => ({
        url: item.url,
        extension: extensionFromUrl(item.url),
      }))
    }

    if (kind === 'hero') {
      const response = await this.fetchJson<{ data?: Array<{ url: string }> }>(
        `${SGDB_API}/heroes/game/${gameId}?types=static&nsfw=false&humor=false`,
        apiKey,
      )
      return (response.data ?? []).slice(0, 3).map((item) => ({
        url: item.url,
        extension: extensionFromUrl(item.url),
      }))
    }

    if (kind === 'logo') {
      const response = await this.fetchJson<{ data?: Array<{ url: string }> }>(
        `${SGDB_API}/logos/game/${gameId}?types=static&nsfw=false&humor=false`,
        apiKey,
      )
      return (response.data ?? []).slice(0, 3).map((item) => ({
        url: item.url,
        extension: extensionFromUrl(item.url),
      }))
    }

    return []
  }

  private async fetchJson<T>(url: string, apiKey: string): Promise<T> {
    const response = await net.fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    })
    if (!response.ok) {
      throw new Error(`SteamGridDB ${response.status}`)
    }
    return (await response.json()) as T
  }

  private async download(
    url: string,
    directory: string,
    baseName: string,
    preferredExtension: string,
  ): Promise<string | null> {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return null

    const response = await net.fetch(url, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    })
    if (!response.ok) return null

    const contentLength = Number(response.headers.get('content-length') ?? '0')
    if (contentLength > MAX_IMAGE_BYTES) return null

    const contentType = (response.headers.get('content-type') ?? '').split(';')[0] ?? ''
    if (contentType && !contentType.startsWith('image/')) return null

    if (!response.body) return null
    const buffer = await readBodyWithLimit(response.body, MAX_IMAGE_BYTES)
    if (!buffer || buffer.byteLength === 0) return null

    const extension = EXTENSION_BY_CONTENT_TYPE[contentType] ?? preferredExtension
    await writeFile(path.join(directory, `${baseName}.${extension}`), buffer)
    return extension
  }

  private async extractFileIcon(
    game: GameRecord,
    directory: string,
    token: string,
  ): Promise<string | null> {
    const iconTarget = game.launch.target
    try {
      const info = await stat(iconTarget)
      if (!info.isFile()) return null
      const image = await app.getFileIcon(iconTarget, { size: 'large' })
      if (image.isEmpty()) return null
      const fileName = `${token}-icon.png`
      await writeFile(path.join(directory, fileName), image.toPNG())
      return fileName
    } catch (error) {
      log.warn('[artwork] icon extraction failed', game.id, error)
      return null
    }
  }
}
