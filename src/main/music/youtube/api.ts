import {
  cleanChannelName,
  isYouTubeVideoId,
  parseIsoDuration,
  parseYouTubeTitle,
  youtubeThumbnailUrlFromApi,
  youtubeWatchUrl,
} from './parse'
import type { YouTubeCandidate } from './types'

const API_BASE = 'https://www.googleapis.com/youtube/v3'
const MAX_RESULTS = 25
/** Search spends 100 quota units, so keep the follow-up video lookup optional. */
const VIDEO_LOOKUP_LIMIT = 50

interface ApiThumbnail {
  url?: string
  width?: number
  height?: number
}

interface ApiSnippet {
  title?: string
  channelTitle?: string
  liveBroadcastContent?: string
  thumbnails?: Record<string, ApiThumbnail>
}

interface ApiSearchItem {
  id?: { videoId?: string }
  snippet?: ApiSnippet
}

interface ApiVideoItem {
  id?: string
  snippet?: ApiSnippet
  contentDetails?: { duration?: string }
}

interface ApiListResponse<T> {
  items?: T[]
  error?: { message?: string }
}

async function fetchJson<T>(url: URL, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    redirect: 'follow',
    signal,
  })
  if (!response.ok) {
    let detail = ''
    try {
      const body = (await response.json()) as ApiListResponse<unknown>
      detail = body.error?.message?.slice(0, 160) ?? ''
    } catch {
      // The status is enough when the error body is not JSON.
    }
    throw new Error(
      `YouTube API request failed (${response.status})${detail ? `: ${detail}` : ''}`,
    )
  }
  return (await response.json()) as T
}

function isLive(snippet: ApiSnippet | undefined): boolean {
  return (
    snippet?.liveBroadcastContent === 'live' ||
    snippet?.liveBroadcastContent === 'upcoming'
  )
}

/**
 * The API returns several sizes per video. Pick the largest usable image and
 * validate its host here, before the URL is ever proxied to the renderer.
 */
function bestThumbnail(snippet: ApiSnippet | undefined): string | null {
  let best: { url: string; pixels: number } | null = null
  for (const thumbnail of Object.values(snippet?.thumbnails ?? {})) {
    const url = youtubeThumbnailUrlFromApi(thumbnail?.url)
    if (!url) continue
    const width = Number(thumbnail?.width)
    const height = Number(thumbnail?.height)
    const pixels =
      Number.isFinite(width) && Number.isFinite(height) ? width * height : 0
    if (!best || pixels > best.pixels) best = { url, pixels }
  }
  return best?.url ?? null
}

/** Pure mapping step, exported so the API shape can be tested without network. */
export function mapApiItems(
  searchItems: ApiSearchItem[],
  videoItems: ApiVideoItem[],
): YouTubeCandidate[] {
  const videos = new Map<string, ApiVideoItem>()
  for (const item of videoItems) {
    if (isYouTubeVideoId(item.id)) videos.set(item.id, item)
  }

  const candidates: YouTubeCandidate[] = []
  const seen = new Set<string>()
  for (const item of searchItems) {
    const videoId = item.id?.videoId
    if (!isYouTubeVideoId(videoId) || seen.has(videoId)) continue
    if (isLive(item.snippet)) continue

    const video = videos.get(videoId)
    const snippet = video?.snippet ?? item.snippet
    if (isLive(snippet)) continue
    const videoTitle = snippet?.title?.trim()
    if (!videoTitle) continue

    // The videos endpoint is a second quota call. If it fails, search results
    // are still usable with an unknown duration rather than disappearing. When
    // it succeeds but an id is absent, that video is private or deleted.
    const length = parseIsoDuration(video?.contentDetails?.duration ?? '')
    if (videoItems.length > 0 && (!video || length === 0)) continue

    const channel = cleanChannelName(snippet?.channelTitle ?? '')
    const parsed = parseYouTubeTitle(videoTitle, channel)
    seen.add(videoId)
    candidates.push({
      videoId,
      title: parsed.title,
      videoTitle,
      artist: parsed.artist,
      channel: channel || parsed.artist,
      durationMs: length,
      thumbnailUrl: bestThumbnail(video?.snippet) ?? bestThumbnail(item.snippet),
      sourceUrl: youtubeWatchUrl(videoId),
    })
  }
  return candidates
}

export interface YouTubeApiSearchOptions {
  apiKey: string
  query: string
  signal: AbortSignal
}

export async function searchWithApi(
  options: YouTubeApiSearchOptions,
): Promise<YouTubeCandidate[]> {
  const searchUrl = new URL(`${API_BASE}/search`)
  searchUrl.searchParams.set('part', 'snippet')
  searchUrl.searchParams.set('type', 'video')
  searchUrl.searchParams.set('maxResults', String(MAX_RESULTS))
  searchUrl.searchParams.set('q', options.query)
  searchUrl.searchParams.set('key', options.apiKey)

  const search = await fetchJson<ApiListResponse<ApiSearchItem>>(
    searchUrl,
    options.signal,
  )
  const items = search.items ?? []
  const ids = items
    .map((item) => item.id?.videoId)
    .filter((id): id is string => isYouTubeVideoId(id))
    .slice(0, VIDEO_LOOKUP_LIMIT)
  if (ids.length === 0) return []

  let videos: ApiVideoItem[] = []
  try {
    const videoUrl = new URL(`${API_BASE}/videos`)
    videoUrl.searchParams.set('part', 'contentDetails,snippet')
    videoUrl.searchParams.set('id', ids.join(','))
    videoUrl.searchParams.set('maxResults', String(VIDEO_LOOKUP_LIMIT))
    videoUrl.searchParams.set('key', options.apiKey)
    const details = await fetchJson<ApiListResponse<ApiVideoItem>>(
      videoUrl,
      options.signal,
    )
    videos = details.items ?? []
  } catch {
    // A failed detail lookup should not discard otherwise valid search hits.
  }

  return mapApiItems(items, videos)
}
