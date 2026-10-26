import type {
  MusicOnlineProvider,
  MusicOnlineStreamKind,
} from '@shared/types'

/**
 * The provider-independent shape produced by every catalog adapter. URLs are
 * still remote here; the service replaces them with short-lived `app://`
 * tokens before anything reaches the renderer.
 */
export interface ProviderTrack {
  id: string
  provider: MusicOnlineProvider
  title: string
  artist: string
  album: string
  durationMs: number
  publisher: string
  streamKind: MusicOnlineStreamKind
  license: string | null
  sourceUrl: string | null
  remoteStreamUrl: string
  remoteArtworkUrl: string | null
}

export interface OnlineProvider {
  id: MusicOnlineProvider
  search: (query: string, signal: AbortSignal) => Promise<ProviderTrack[]>
}

const USER_AGENT = 'PulseLauncher/0.1 (+https://github.com/PanDuroDev/pulse-launcher)'

function text(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .join(', ')
  }
  return ''
}

function finiteNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function httpsOrNull(value: unknown): string | null {
  const raw = text(value)
  if (!raw) return null
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

function stableId(prefix: string, value: unknown): string {
  const raw = text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
  return `${prefix}:${raw || 'unknown'}`
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    signal,
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': USER_AGENT,
    },
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return (await response.json()) as T
}

/* -------------------------------------------------------------------------- */
/* iTunes / Apple Music                                                       */
/* -------------------------------------------------------------------------- */

export interface ItunesRow {
  trackId?: number | string
  trackName?: string
  artistName?: string
  collectionName?: string
  trackTimeMillis?: number
  previewUrl?: string
  artworkUrl100?: string
  trackViewUrl?: string
}

export function mapItunesRow(row: ItunesRow): ProviderTrack | null {
  const stream = httpsOrNull(row.previewUrl)
  if (!stream) return null
  const artwork = httpsOrNull(row.artworkUrl100?.replace(/\/\d+x\d+bb\./, '/600x600bb.'))

  return {
    id: stableId('itunes', row.trackId ?? stream),
    provider: 'itunes',
    title: text(row.trackName) || 'Untitled',
    artist: text(row.artistName) || 'Unknown artist',
    album: text(row.collectionName),
    durationMs: Math.max(0, Math.round(finiteNumber(row.trackTimeMillis))),
    publisher: 'Apple Music',
    streamKind: 'preview',
    license: null,
    sourceUrl: httpsOrNull(row.trackViewUrl),
    remoteStreamUrl: stream,
    remoteArtworkUrl: artwork,
  }
}

async function searchItunes(query: string, signal: AbortSignal): Promise<ProviderTrack[]> {
  const url = new URL('https://itunes.apple.com/search')
  url.searchParams.set('term', query)
  url.searchParams.set('media', 'music')
  url.searchParams.set('entity', 'song')
  url.searchParams.set('limit', '12')
  const payload = await fetchJson<{ results?: ItunesRow[] }>(url.toString(), signal)
  return (payload.results ?? []).flatMap((row) => {
    const track = mapItunesRow(row)
    return track ? [track] : []
  })
}

/* -------------------------------------------------------------------------- */
/* Deezer                                                                     */
/* -------------------------------------------------------------------------- */

interface DeezerRow {
  id?: number | string
  title?: string
  duration?: number
  preview?: string
  link?: string
  artist?: { name?: string; picture_xl?: string }
  album?: {
    title?: string
    cover_xl?: string
    cover_big?: string
    cover_medium?: string
  }
}

export function mapDeezerRow(row: DeezerRow): ProviderTrack | null {
  const stream = httpsOrNull(row.preview)
  if (!stream) return null
  const artwork =
    httpsOrNull(row.album?.cover_xl) ??
    httpsOrNull(row.album?.cover_big) ??
    httpsOrNull(row.album?.cover_medium) ??
    httpsOrNull(row.artist?.picture_xl)

  return {
    id: stableId('deezer', row.id ?? stream),
    provider: 'deezer',
    title: text(row.title) || 'Untitled',
    artist: text(row.artist?.name) || 'Unknown artist',
    album: text(row.album?.title),
    durationMs: Math.max(0, Math.round(finiteNumber(row.duration) * 1000)),
    publisher: 'Deezer',
    streamKind: 'preview',
    license: null,
    sourceUrl: httpsOrNull(row.link),
    remoteStreamUrl: stream,
    remoteArtworkUrl: artwork,
  }
}

async function searchDeezer(query: string, signal: AbortSignal): Promise<ProviderTrack[]> {
  const url = new URL('https://api.deezer.com/search')
  url.searchParams.set('q', query)
  url.searchParams.set('limit', '12')
  const payload = await fetchJson<{ data?: DeezerRow[] }>(url.toString(), signal)
  return (payload.data ?? []).flatMap((row) => {
    const track = mapDeezerRow(row)
    return track ? [track] : []
  })
}

/* -------------------------------------------------------------------------- */
/* Audius                                                                     */
/* -------------------------------------------------------------------------- */

interface AudiusRow {
  id?: string
  title?: string
  duration?: number
  permalink?: string
  user?: { name?: string; handle?: string }
  artwork?: {
    '150x150'?: string
    '480x480'?: string
    '1000x1000'?: string
  }
}

export function mapAudiusRow(row: AudiusRow): ProviderTrack | null {
  const id = text(row.id)
  if (!id) return null
  const artwork =
    httpsOrNull(row.artwork?.['1000x1000']) ??
    httpsOrNull(row.artwork?.['480x480']) ??
    httpsOrNull(row.artwork?.['150x150'])
  const permalink = text(row.permalink)
  const sourceUrl =
    permalink && /^https:\/\//i.test(permalink)
      ? httpsOrNull(permalink)
      : httpsOrNull(permalink ? `https://audius.co${permalink.startsWith('/') ? '' : '/'}${permalink}` : null)

  return {
    id: stableId('audius', id),
    provider: 'audius',
    title: text(row.title) || 'Untitled',
    artist: text(row.user?.name) || text(row.user?.handle) || 'Unknown artist',
    album: '',
    durationMs: Math.max(0, Math.round(finiteNumber(row.duration) * 1000)),
    publisher: 'Audius',
    streamKind: 'full',
    license: null,
    sourceUrl,
    remoteStreamUrl: `https://api.audius.co/v1/tracks/${encodeURIComponent(id)}/stream?app_name=PulseLauncher`,
    remoteArtworkUrl: artwork,
  }
}

async function searchAudius(query: string, signal: AbortSignal): Promise<ProviderTrack[]> {
  const url = new URL('https://api.audius.co/v1/tracks/search')
  url.searchParams.set('query', query)
  url.searchParams.set('limit', '10')
  url.searchParams.set('app_name', 'PulseLauncher')
  const payload = await fetchJson<{ data?: AudiusRow[] }>(url.toString(), signal)
  return (payload.data ?? []).flatMap((row) => {
    const track = mapAudiusRow(row)
    return track ? [track] : []
  })
}

/* -------------------------------------------------------------------------- */
/* Openverse                                                                  */
/* -------------------------------------------------------------------------- */

interface OpenverseRow {
  id?: string
  title?: string
  creator?: string
  duration?: number
  url?: string
  thumbnail?: string
  license?: string
  license_version?: string
  foreign_landing_url?: string
  provider?: string
  source?: string
}

export function formatOpenverseLicense(
  license: string,
  version: string,
): string | null {
  const name = license.trim()
  if (!name) return null
  const upper = name.toUpperCase()
  const label = upper === 'CC0' ? 'CC0' : `CC ${upper}`
  return version.trim() ? `${label} ${version.trim()}` : label
}

export function mapOpenverseRow(row: OpenverseRow): ProviderTrack | null {
  const stream = httpsOrNull(row.url)
  if (!stream) return null
  return {
    id: stableId('openverse', row.id ?? stream),
    provider: 'openverse',
    title: text(row.title) || 'Untitled',
    artist: text(row.creator) || 'Unknown artist',
    album: '',
    durationMs: Math.max(0, Math.round(finiteNumber(row.duration))),
    publisher: text(row.provider) || text(row.source) || 'Openverse',
    streamKind: 'full',
    license: formatOpenverseLicense(text(row.license), text(row.license_version)),
    sourceUrl: httpsOrNull(row.foreign_landing_url),
    remoteStreamUrl: stream,
    remoteArtworkUrl: httpsOrNull(row.thumbnail),
  }
}

async function searchOpenverse(query: string, signal: AbortSignal): Promise<ProviderTrack[]> {
  const url = new URL('https://api.openverse.org/v1/audio/')
  url.searchParams.set('q', query)
  url.searchParams.set('page_size', '12')
  url.searchParams.set('license_type', 'all')
  const payload = await fetchJson<{ results?: OpenverseRow[] }>(url.toString(), signal)
  return (payload.results ?? []).flatMap((row) => {
    const track = mapOpenverseRow(row)
    return track ? [track] : []
  })
}

/* -------------------------------------------------------------------------- */
/* Internet Archive                                                           */
/* -------------------------------------------------------------------------- */

interface ArchiveDoc {
  identifier?: string
  title?: string | string[]
  creator?: string | string[]
}

export interface ArchiveFile {
  name?: string
  format?: string
  length?: string | number
  title?: string
  artist?: string | string[]
  private?: string | boolean
}

export interface ArchiveMetadata {
  metadata?: {
    title?: string | string[]
    creator?: string | string[]
  }
  files?: ArchiveFile[]
}

const ARCHIVE_AUDIO_PATTERN = /\.(mp3|m4a|ogg|oga|flac)$/i

/** Accepts seconds ("245.12") or colon time ("4:05", "1:02:03"). */
export function parseArchiveDuration(value: string | number | undefined): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? Math.round(value * 1000) : 0
  }
  const raw = value?.trim()
  if (!raw) return 0

  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    return Math.round(Number(raw) * 1000)
  }

  const parts = raw.split(':')
  if (parts.length < 2 || parts.length > 3) return 0
  const numbers = parts.map(Number)
  if (numbers.some((part) => !Number.isFinite(part) || part < 0)) return 0
  let seconds = 0
  for (const part of numbers) seconds = seconds * 60 + part
  return Math.round(seconds * 1000)
}

function archiveFileScore(file: ArchiveFile): number {
  const format = text(file.format).toLowerCase()
  if (format.includes('vbr mp3')) return 4
  if (format.includes('mp3')) return 3
  if (format.includes('ogg')) return 2
  if (format.includes('flac')) return 1
  return 0
}

function archiveTrackTitle(file: ArchiveFile, itemTitle: string): string {
  const explicit = text(file.title)
  if (explicit) return explicit
  const name = text(file.name).split('/').pop() ?? ''
  const withoutExtension = name.replace(/\.[^.]+$/, '')
  const cleaned = withoutExtension.replace(/^\d+\s*[-._ ]+\s*/, '').trim()
  return cleaned || itemTitle || 'Untitled'
}

export function mapArchiveEntry(
  doc: ArchiveDoc,
  metadata: ArchiveMetadata,
): ProviderTrack | null {
  const identifier = text(doc.identifier)
  if (!identifier) return null

  const files = metadata.files ?? []
  const best = files
    .filter(
      (file) =>
        Boolean(file.name) &&
        file.private !== true &&
        file.private !== 'true' &&
        ARCHIVE_AUDIO_PATTERN.test(file.name ?? ''),
    )
    .sort((left, right) => archiveFileScore(right) - archiveFileScore(left))[0]
  if (!best?.name) return null

  const itemTitle = text(metadata.metadata?.title) || text(doc.title)
  const creator = text(metadata.metadata?.creator) || text(doc.creator)
  const encodedName = best.name.split('/').map(encodeURIComponent).join('/')

  return {
    id: `archive:${encodeURIComponent(identifier)}:${encodeURIComponent(best.name)}`,
    provider: 'archive',
    title: archiveTrackTitle(best, itemTitle),
    artist: text(best.artist) || creator || 'Unknown artist',
    album: itemTitle,
    durationMs: parseArchiveDuration(best.length),
    publisher: 'Internet Archive',
    streamKind: 'full',
    license: null,
    sourceUrl: `https://archive.org/details/${encodeURIComponent(identifier)}`,
    remoteStreamUrl: `https://archive.org/download/${encodeURIComponent(identifier)}/${encodedName}`,
    remoteArtworkUrl: `https://archive.org/services/img/${encodeURIComponent(identifier)}`,
  }
}

async function fetchArchiveMetadata(
  identifier: string,
  signal: AbortSignal,
): Promise<ArchiveMetadata | null> {
  try {
    return await fetchJson<ArchiveMetadata>(
      `https://archive.org/metadata/${encodeURIComponent(identifier)}`,
      signal,
    )
  } catch {
    // One broken item should not discard the rest of the archive results.
    return null
  }
}

async function searchArchive(query: string, signal: AbortSignal): Promise<ProviderTrack[]> {
  const url = new URL('https://archive.org/advancedsearch.php')
  url.searchParams.set('q', `${query} AND mediatype:(audio)`)
  for (const field of ['identifier', 'title', 'creator']) {
    url.searchParams.append('fl[]', field)
  }
  url.searchParams.set('rows', '6')
  url.searchParams.set('page', '1')
  url.searchParams.set('output', 'json')

  const payload = await fetchJson<{ response?: { docs?: ArchiveDoc[] } }>(
    url.toString(),
    signal,
  )
  const docs = (payload.response?.docs ?? []).filter((doc) => text(doc.identifier)).slice(0, 6)
  const metadata = await Promise.all(
    docs.map((doc) => fetchArchiveMetadata(text(doc.identifier), signal)),
  )

  const tracks: ProviderTrack[] = []
  docs.forEach((doc, index) => {
    const entry = metadata[index]
    if (!entry) return
    const track = mapArchiveEntry(doc, entry)
    if (track) tracks.push(track)
  })
  return tracks
}

export const ONLINE_PROVIDERS: readonly OnlineProvider[] = [
  { id: 'itunes', search: searchItunes },
  { id: 'deezer', search: searchDeezer },
  { id: 'audius', search: searchAudius },
  { id: 'openverse', search: searchOpenverse },
  { id: 'archive', search: searchArchive },
]
