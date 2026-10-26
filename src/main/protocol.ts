import { protocol } from 'electron'
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import path from 'node:path'
import { APP_HOST, APP_SCHEME } from './paths'
import { log } from './logger'

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
  '.aac': 'audio/aac',
  '.wma': 'audio/x-ms-wma',
}

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ')

export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
      },
    },
  ])
}

function resolveWithinRoot(root: string, requestPath: string): string | null {
  if (requestPath.includes('\0')) return null
  const resolved = path.resolve(root, requestPath)
  const relative = path.relative(root, resolved)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null
  return resolved
}

type ResponseBody = ConstructorParameters<typeof Response>[0]

const RANGE_PATTERN = /^bytes=(\d*)-(\d*)$/

interface ByteRange {
  start: number
  end: number
}

/**
 * Parses a single `bytes=` range against the file size.
 *
 * Invalid or unsatisfiable ranges return null, which the caller answers with
 * 416. Multi-range requests are rejected on purpose: an audio element only ever
 * asks for one range, and a multipart response would be a lot of code for a
 * case that never happens here.
 */
function parseRange(header: string, size: number): ByteRange | null {
  const match = RANGE_PATTERN.exec(header.trim())
  if (!match) return null
  const startRaw = match[1] ?? ''
  const endRaw = match[2] ?? ''
  if (startRaw === '' && endRaw === '') return null

  let start: number
  let end: number
  if (startRaw === '') {
    // `bytes=-500` means "the last 500 bytes".
    const suffix = Number(endRaw)
    if (!Number.isFinite(suffix) || suffix <= 0) return null
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(startRaw)
    end = endRaw === '' ? size - 1 : Math.min(Number(endRaw), size - 1)
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  if (start < 0 || start > end || start >= size) return null
  return { start, end }
}

function baseHeaders(extension: string, cacheable: boolean): Headers {
  const headers = new Headers({
    'Content-Type': MIME_TYPES[extension] ?? 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': cacheable
      ? 'public, max-age=31536000, immutable'
      : 'no-cache',
  })
  if (extension === '.html') {
    headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY)
  }
  return headers
}

/** Serves a renderer/artwork file from memory: these are small and immutable. */
async function createFileResponse(
  filePath: string,
  cacheable: boolean,
): Promise<Response> {
  const body = await readFile(filePath)
  const extension = path.extname(filePath).toLowerCase()
  const headers = baseHeaders(extension, cacheable)
  headers.set('Content-Length', String(body.byteLength))
  return new Response(body, { status: 200, headers })
}

/**
 * Streams an audio file and honours a single HTTP byte range.
 *
 * Seeking in an `<audio>` element is a range request: without 206 responses the
 * element can only play from the start, so this path is separate from the
 * in-memory one above.
 */
async function createMediaResponse(
  filePath: string,
  rangeHeader: string | null,
): Promise<Response> {
  const info = await stat(filePath)
  if (!info.isFile()) return new Response('Not found', { status: 404 })

  const extension = path.extname(filePath).toLowerCase()
  const headers = baseHeaders(extension, false)
  headers.set('Accept-Ranges', 'bytes')

  if (rangeHeader) {
    const range = parseRange(rangeHeader, info.size)
    if (!range) {
      headers.set('Content-Range', `bytes */${info.size}`)
      return new Response('Range not satisfiable', { status: 416, headers })
    }
    const length = range.end - range.start + 1
    headers.set('Content-Range', `bytes ${range.start}-${range.end}/${info.size}`)
    headers.set('Content-Length', String(length))
    const stream = createReadStream(filePath, { start: range.start, end: range.end })
    return new Response(Readable.toWeb(stream) as unknown as ResponseBody, {
      status: 206,
      headers,
    })
  }

  headers.set('Content-Length', String(info.size))
  const stream = createReadStream(filePath)
  return new Response(Readable.toWeb(stream) as unknown as ResponseBody, {
    status: 200,
    headers,
  })
}

/**
 * Proxies an online catalog URL through the `app://` origin. The CSP only
 * allows `self`, so `<audio>` and `<img>` cannot load the remote host directly;
 * range headers are forwarded so seeking still works for full-length tracks.
 */
async function createRemoteResponse(
  remoteUrl: string,
  request: Request,
  cacheable: boolean,
): Promise<Response> {
  let url: URL
  try {
    url = new URL(remoteUrl)
  } catch {
    return new Response('Bad upstream URL', { status: 502 })
  }
  if (url.protocol !== 'https:') {
    return new Response('Bad upstream URL', { status: 502 })
  }

  const headers = new Headers()
  const range = request.headers.get('range')
  if (range) headers.set('Range', range)
  const accept = request.headers.get('accept')
  if (accept) headers.set('Accept', accept)

  const upstream = await fetch(url, {
    method: request.method === 'HEAD' ? 'HEAD' : 'GET',
    headers,
    redirect: 'follow',
    signal: request.signal,
  })

  const responseHeaders = new Headers()
  for (const name of [
    'content-type',
    'content-length',
    'content-range',
    'accept-ranges',
    'etag',
    'last-modified',
  ]) {
    const value = upstream.headers.get(name)
    if (value) responseHeaders.set(name, value)
  }
  if (!responseHeaders.has('content-type')) {
    responseHeaders.set('content-type', cacheable ? 'image/jpeg' : 'audio/mpeg')
  }
  responseHeaders.set('X-Content-Type-Options', 'nosniff')
  responseHeaders.set(
    'Cache-Control',
    cacheable ? 'public, max-age=86400, immutable' : 'no-cache',
  )

  if (!upstream.ok) {
    return new Response(null, {
      status: upstream.status === 416 ? 416 : 502,
      headers: responseHeaders,
    })
  }

  return new Response(request.method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  })
}

export interface AppProtocolOptions {
  rendererRoot: string
  artworkRoot: string
  /** Where embedded cover art extracted by the music scanner is written. */
  musicArtworkRoot?: string
  /** Resolves a track id to an absolute audio path, or null when unknown. */
  resolveMedia?: (trackId: string) => string | null
  /** Resolves an online-media token to an HTTPS URL, or null when unknown. */
  resolveOnlineMedia?: (token: string) => string | null
  /** Resolves an online-artwork token to an HTTPS URL, or null when unknown. */
  resolveOnlineArt?: (token: string) => string | null
  /** Resolves a YouTube video id to candidate thumbnail HTTPS URLs, best first. */
  resolveYouTubeArt?: (videoId: string) => string[]
}

export function installAppProtocol(options: AppProtocolOptions): void {
  const {
    rendererRoot,
    artworkRoot,
    musicArtworkRoot,
    resolveMedia,
    resolveOnlineMedia,
    resolveOnlineArt,
    resolveYouTubeArt,
  } = options

  protocol.handle(APP_SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      if (url.hostname !== APP_HOST) {
        return new Response('Not found', { status: 404 })
      }

      const decodedPath = decodeURIComponent(url.pathname)

      if (decodedPath.startsWith('/media/')) {
        const trackId = decodedPath.slice(7)
        const filePath = resolveMedia?.(trackId)
        if (!filePath) return new Response('Not found', { status: 404 })
        return await createMediaResponse(filePath, request.headers.get('range'))
      }

      const isOnlineArt = decodedPath.startsWith('/online-art/')
      if (isOnlineArt || decodedPath.startsWith('/online-media/')) {
        const prefix = isOnlineArt ? '/online-art/' : '/online-media/'
        const token = decodedPath.slice(prefix.length)
        const remoteUrl = isOnlineArt
          ? resolveOnlineArt?.(token)
          : resolveOnlineMedia?.(token)
        if (!remoteUrl) return new Response('Not found', { status: 404 })
        return await createRemoteResponse(remoteUrl, request, isOnlineArt)
      }

      if (decodedPath.startsWith('/youtube-art/')) {
        const videoId = decodedPath.slice('/youtube-art/'.length)
        const candidates = resolveYouTubeArt?.(videoId) ?? []
        if (candidates.length === 0) return new Response('Not found', { status: 404 })
        // Not every video has a maxres thumbnail. Try the candidate list in
        // order so a missing size still renders a cover instead of a 502.
        for (const remoteUrl of candidates) {
          const response = await createRemoteResponse(remoteUrl, request, true)
          if (response.status !== 502) return response
        }
        return new Response('Not found', { status: 404 })
      }

      const isMusicArtwork = decodedPath.startsWith('/music-art/')
      const isArtwork = isMusicArtwork || decodedPath.startsWith('/art/')
      let root = rendererRoot
      let relativePath = decodedPath
      if (isMusicArtwork) {
        if (!musicArtworkRoot) return new Response('Not found', { status: 404 })
        root = musicArtworkRoot
        relativePath = decodedPath.slice(11)
      } else if (isArtwork) {
        root = artworkRoot
        relativePath = decodedPath.slice(5)
      } else if (decodedPath === '/' || decodedPath === '') {
        relativePath = 'index.html'
      } else {
        relativePath = decodedPath.replace(/^\/+/, '')
      }

      const filePath = resolveWithinRoot(root, relativePath)
      if (!filePath) {
        return new Response('Bad request', { status: 400 })
      }

      return await createFileResponse(filePath, isArtwork)
    } catch (error) {
      log.warn('[protocol] request failed', request.url, error)
      return new Response('Not found', { status: 404 })
    }
  })
}
