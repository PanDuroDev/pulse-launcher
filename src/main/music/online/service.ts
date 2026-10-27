import { randomBytes } from 'node:crypto'
import type {
  MusicOnlineProviderStatus,
  MusicOnlineSearchResult,
  MusicOnlineTrack,
} from '@shared/types'
import { APP_HOST, APP_SCHEME } from '../../paths'
import { ONLINE_PROVIDERS } from './providers'
import type { ProviderTrack } from './providers'
import { rankTracks } from './ranking'

/**
 * Each catalog gets its own deadline, and the search as a whole gets a slightly
 * longer one. iTunes regularly needs more than ten seconds while the other four
 * answer in two, so a single shared budget used to drop it every time.
 */
const PROVIDER_TIMEOUT_MS = 12_000
const SEARCH_TIMEOUT_MS = 15_000
const MAX_RESULTS = 40
const MAX_TOKEN_ENTRIES = 4_000
const TOKEN_PATTERN = /^[a-f0-9]{32}$/

type MediaKind = 'media' | 'art'

interface RemoteEntry {
  url: string
  kind: MediaKind
}

/**
 * A remote URL is only proxied if it is HTTPS on a public hostname. Provider
 * APIs are third-party data, so a malicious catalog item must not be able to
 * turn the token endpoint into an SSRF probe of localhost or a LAN address.
 */
export function isPublicHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return false
    const host = url.hostname.toLowerCase().replace(/\.$/, '')
    if (!host || !host.includes('.')) return false
    if (host === 'localhost' || host.endsWith('.localhost')) return false
    if (host.endsWith('.local') || host.endsWith('.internal')) return false
    if (host.startsWith('[') || host.includes(':')) return false
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return false
    return true
  } catch {
    return false
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'AbortError') return 'The catalog timed out.'
    return error.message.slice(0, 160) || 'The catalog request failed.'
  }
  return 'The catalog request failed.'
}

const PROVIDER_NAMES: Record<MusicOnlineProviderStatus['provider'], string> = {
  itunes: 'iTunes',
  deezer: 'Deezer',
  audius: 'Audius',
  openverse: 'Openverse',
  archive: 'Internet Archive',
}

/**
 * Names the catalogs that failed, because the count alone ("Online 27") does not
 * tell the user that Apple Music previews are missing from the results.
 */
export function providerWarning(statuses: MusicOnlineProviderStatus[]): string | null {
  const failed = statuses.filter((status) => !status.ok)
  if (failed.length === 0) return null
  const names = failed.map((status) => PROVIDER_NAMES[status.provider])
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
  return `${list} did not respond; showing the other catalogs.`
}

interface ProviderRun {
  provider: MusicOnlineProviderStatus['provider']
  status: MusicOnlineProviderStatus
  tracks: ProviderTrack[]
}

export class MusicOnlineService {
  private readonly remoteUrls = new Map<string, RemoteEntry>()

  /**
   * Searches every catalog concurrently. A failed provider is reported as a
   * status entry instead of failing the whole search.
   */
  async search(rawQuery: string, parentSignal?: AbortSignal): Promise<MusicOnlineSearchResult> {
    const query = rawQuery.trim()
    if (query.length < 2) {
      return {
        query,
        tracks: [],
        providers: ONLINE_PROVIDERS.map((provider) => ({
          provider: provider.id,
          ok: true,
          count: 0,
          error: null,
        })),
        warning: null,
      }
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS)
    const abortFromParent = (): void => controller.abort()
    if (parentSignal?.aborted) controller.abort()
    else parentSignal?.addEventListener('abort', abortFromParent, { once: true })

    try {
      const runs = await Promise.all(
        ONLINE_PROVIDERS.map(async (provider): Promise<ProviderRun> => {
          // A provider that hangs only costs its own budget, not the search's.
          const providerController = new AbortController()
          const abortProvider = (): void => providerController.abort()
          if (controller.signal.aborted) providerController.abort()
          else controller.signal.addEventListener('abort', abortProvider, { once: true })
          const providerTimer = setTimeout(abortProvider, PROVIDER_TIMEOUT_MS)
          try {
            const tracks = await provider.search(query, providerController.signal)
            return {
              provider: provider.id,
              status: {
                provider: provider.id,
                ok: true,
                count: tracks.length,
                error: null,
              },
              tracks,
            }
          } catch (error) {
            return {
              provider: provider.id,
              status: {
                provider: provider.id,
                ok: false,
                count: 0,
                error: errorMessage(error),
              },
              tracks: [],
            }
          } finally {
            clearTimeout(providerTimer)
            controller.signal.removeEventListener('abort', abortProvider)
          }
        }),
      )

      const pool = runs.flatMap((run) => run.tracks)
      const ranked = rankTracks(pool, query)
      const tracks: MusicOnlineTrack[] = []
      for (const track of ranked) {
        if (tracks.length >= MAX_RESULTS) break
        const exposed = this.expose(track)
        if (exposed) tracks.push(exposed)
      }

      const statuses = runs.map((run) => run.status)
      return {
        query,
        tracks,
        providers: statuses,
        warning: providerWarning(statuses),
      }
    } finally {
      clearTimeout(timer)
      parentSignal?.removeEventListener('abort', abortFromParent)
    }
  }

  /** Looks up a token minted by `search`. Unknown tokens and wrong kinds return null. */
  resolveMedia(token: string): string | null {
    return this.resolve(token, 'media')
  }

  resolveArtwork(token: string): string | null {
    return this.resolve(token, 'art')
  }

  private resolve(token: string, kind: MediaKind): string | null {
    if (!TOKEN_PATTERN.test(token)) return null
    const entry = this.remoteUrls.get(token)
    return entry?.kind === kind ? entry.url : null
  }

  private appUrl(remoteUrl: string, kind: MediaKind): string | null {
    if (!isPublicHttpsUrl(remoteUrl)) return null
    const token = randomBytes(16).toString('hex')
    this.remoteUrls.set(token, { url: remoteUrl, kind })
    while (this.remoteUrls.size > MAX_TOKEN_ENTRIES) {
      const oldest = this.remoteUrls.keys().next().value
      if (!oldest) break
      this.remoteUrls.delete(oldest)
    }
    return `${APP_SCHEME}://${APP_HOST}/online-${kind}/${token}`
  }

  private expose(track: ProviderTrack): MusicOnlineTrack | null {
    const streamUrl = this.appUrl(track.remoteStreamUrl, 'media')
    if (!streamUrl) return null
    const artworkUrl = track.remoteArtworkUrl
      ? this.appUrl(track.remoteArtworkUrl, 'art')
      : null

    return {
      id: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      durationMs: track.durationMs,
      artworkUrl,
      streamUrl,
      folder: 'Online',
      provider: track.provider,
      publisher: track.publisher,
      streamKind: track.streamKind,
      license: track.license,
      sourceUrl: track.sourceUrl,
    }
  }
}
