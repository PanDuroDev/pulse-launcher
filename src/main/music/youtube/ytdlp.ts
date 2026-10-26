import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { runCommand } from './command'
import {
  isYouTubeVideoId,
  parseYtDlpSearch,
  safeErrorMessage,
  youtubeWatchUrl,
} from './parse'
import type { YouTubeCandidate } from './types'

const SEARCH_TIMEOUT_MS = 45_000
const DOWNLOAD_TIMEOUT_MS = 300_000
const SEARCH_RESULTS = 25

export function ytDlpError(stderr: string, fallback: string): string {
  const line = stderr
    .split(/\r?\n/)
    .map((value) => value.trim())
    // yt-dlp prefixes the extractor, as in `[youtube] <id>: ERROR: ...`, so the
    // marker is not always at the start of the line.
    .filter((value) => /(?:^|\s)ERROR:/i.test(value))
    .at(-1)
  if (!line) return fallback
  const message = line.replace(/^.*?ERROR:\s*/i, '')
  // Age checks also say "sign in to confirm", so they must be matched before
  // the bot-check branch or they are misreported.
  if (/age[- ]restricted|confirm your age|inappropriate for some users/i.test(message)) {
    return 'This video is age-restricted and cannot be extracted without an account.'
  }
  if (/sign in to confirm|not a bot/i.test(message)) {
    return 'YouTube asked yt-dlp to sign in. Try another video or use a YouTube API key for search.'
  }
  if (/video (?:is )?unavailable/i.test(message)) {
    return 'This video is unavailable on YouTube.'
  }
  if (/private video/i.test(message)) {
    return 'This video is private.'
  }
  if (/ffmpeg/i.test(message)) {
    return 'FFmpeg could not be started. Check the FFmpeg path in YouTube setup.'
  }
  if (/requested format is not available/i.test(message)) {
    return 'YouTube did not offer an audio format that yt-dlp can extract.'
  }
  return safeErrorMessage(message, fallback)
}

export async function searchWithYtDlp(
  ytDlpPath: string,
  query: string,
): Promise<YouTubeCandidate[]> {
  const result = await runCommand(
    ytDlpPath,
    [
      '--flat-playlist',
      '--dump-json',
      '--no-warnings',
      '--no-playlist',
      '--ignore-errors',
      '--socket-timeout',
      '10',
      `ytsearch${SEARCH_RESULTS}:${query}`,
    ],
    SEARCH_TIMEOUT_MS,
  )

  if (result.timedOut) throw new Error('yt-dlp search timed out.')
  if (result.error) {
    throw new Error(safeErrorMessage(result.error, 'yt-dlp could not be started.'))
  }
  const candidates = parseYtDlpSearch(result.stdout)
  if (candidates.length > 0) return candidates
  if (result.code !== 0) {
    throw new Error(ytDlpError(result.stderr, 'yt-dlp search failed.'))
  }
  return []
}

export interface DownloadAudioOptions {
  ytDlpPath: string
  ffmpegPath: string
  videoId: string
  outputDir: string
  timeoutMs?: number
}

export interface DownloadAudioResult {
  filePath: string
  bytes: number
}

/**
 * Extracts the best audio stream as an MP3 into a private temp directory, then
 * moves only the finished file into the cache. A crashed download can never be
 * served as a half-written track.
 */
export async function downloadAudioToMp3(
  options: DownloadAudioOptions,
): Promise<DownloadAudioResult> {
  if (!isYouTubeVideoId(options.videoId)) {
    throw new Error('Invalid YouTube video id.')
  }
  const tempDir = path.join(
    options.outputDir,
    '.tmp',
    `${options.videoId}-${Date.now()}-${process.pid}`,
  )
  await mkdir(tempDir, { recursive: true })

  try {
    const result = await runCommand(
      options.ytDlpPath,
      [
        '--no-playlist',
        '--extract-audio',
        '--audio-format',
        'mp3',
        '--audio-quality',
        '0',
        '--embed-metadata',
        '--no-warnings',
        '--no-progress',
        '--no-color',
        '--newline',
        '--ffmpeg-location',
        path.dirname(options.ffmpegPath),
        '--socket-timeout',
        '20',
        '--retries',
        '3',
        '-o',
        path.join(tempDir, `${options.videoId}.%(ext)s`),
        youtubeWatchUrl(options.videoId),
      ],
      options.timeoutMs ?? DOWNLOAD_TIMEOUT_MS,
    )

    if (result.timedOut) throw new Error('MP3 extraction timed out.')
    if (result.error) {
      throw new Error(safeErrorMessage(result.error, 'yt-dlp could not be started.'))
    }
    if (result.code !== 0) {
      throw new Error(ytDlpError(result.stderr, 'yt-dlp could not extract this video.'))
    }

    const entries = await readdir(tempDir, { withFileTypes: true })
    const output = entries.find(
      (entry) => entry.isFile() && entry.name === `${options.videoId}.mp3`,
    )
    if (!output) {
      throw new Error('yt-dlp finished without producing an MP3 file.')
    }

    await mkdir(options.outputDir, { recursive: true })
    const destination = path.join(options.outputDir, `${options.videoId}.mp3`)
    await rm(destination, { force: true })
    await rename(path.join(tempDir, output.name), destination)
    const info = await stat(destination)
    return { filePath: destination, bytes: info.size }
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
  }
}
