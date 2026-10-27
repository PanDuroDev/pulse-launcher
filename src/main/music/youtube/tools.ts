import { stat } from 'node:fs/promises'
import path from 'node:path'
import type { MusicYouTubeToolInfo, MusicYouTubeToolSource } from '@shared/types'
import { downloadFile, runCommand } from './command'
import { safeErrorMessage } from './parse'

const PROBE_TIMEOUT_MS = 8_000
const DOWNLOAD_TIMEOUT_MS = 120_000
const YTDLP_DOWNLOAD_URL =
  'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
const YTDLP_FILE = 'yt-dlp.exe'
const FFMPEG_FILE = 'ffmpeg.exe'

interface ProbeResult {
  ok: boolean
  version: string | null
  error: string | null
}

interface ToolProbe {
  filePath: string
  source: MusicYouTubeToolSource
  versionArgs: string[]
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile()
  } catch {
    return false
  }
}

async function probe(filePath: string, args: string[]): Promise<ProbeResult> {
  const result = await runCommand(filePath, args, PROBE_TIMEOUT_MS)
  if (result.timedOut) {
    return { ok: false, version: null, error: 'The tool did not respond in time.' }
  }
  if (result.error) {
    return {
      ok: false,
      version: null,
      error: safeErrorMessage(result.error, 'The tool could not be started.'),
    }
  }
  if (result.code !== 0) {
    return {
      ok: false,
      version: null,
      error: safeErrorMessage(
        result.stderr || result.stdout,
        'The tool returned an error.',
      ),
    }
  }
  const line = `${result.stdout}\n${result.stderr}`
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find(Boolean)
  return { ok: true, version: line?.slice(0, 160) ?? null, error: null }
}

function stripQuotes(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim()
  }
  return trimmed
}

/** Accepts either the executable itself or the folder that contains it. */
async function resolveConfigured(value: string, fileName: string): Promise<string | null> {
  const candidate = stripQuotes(value)
  if (!candidate) return null
  try {
    const info = await stat(candidate)
    if (info.isDirectory()) return path.join(candidate, fileName)
    return candidate
  } catch {
    // A user may paste the path without the .exe suffix.
    if (!path.extname(candidate)) return `${candidate}.exe`
    return candidate
  }
}

function pathCandidates(fileName: string): string[] {
  const names =
    process.platform === 'win32' && !fileName.toLowerCase().endsWith('.exe')
      ? [fileName, `${fileName}.exe`]
      : [fileName]
  const candidates: string[] = []
  const seen = new Set<string>()
  for (const directory of (process.env['PATH'] ?? '').split(path.delimiter)) {
    if (!directory.trim()) continue
    for (const name of names) {
      const candidate = path.join(directory, name)
      const key = candidate.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      candidates.push(candidate)
    }
  }
  return candidates
}

async function firstRunnable(probes: ToolProbe[]): Promise<MusicYouTubeToolInfo | null> {
  for (const candidate of probes) {
    if (!(await isFile(candidate.filePath))) continue
    const result = await probe(candidate.filePath, candidate.versionArgs)
    if (result.ok) {
      return {
        ok: true,
        path: candidate.filePath,
        version: result.version,
        source: candidate.source,
        error: null,
      }
    }
  }
  return null
}

function missingInfo(error: string): MusicYouTubeToolInfo {
  return { ok: false, path: null, version: null, source: 'missing', error }
}

export async function detectYtDlp(
  configuredPath: string,
  userBinDir: string,
): Promise<MusicYouTubeToolInfo> {
  const configured = await resolveConfigured(configuredPath, YTDLP_FILE)
  let configuredError: string | null = null
  if (configured) {
    if (await isFile(configured)) {
      const result = await probe(configured, ['--version'])
      if (result.ok) {
        return {
          ok: true,
          path: configured,
          version: result.version,
          source: 'configured',
          error: null,
        }
      }
      configuredError = `The configured yt-dlp did not run: ${result.error ?? 'unknown error'}`
    } else {
      configuredError = 'The configured yt-dlp path does not exist.'
    }
  }

  const found = await firstRunnable([
    { filePath: path.join(userBinDir, YTDLP_FILE), source: 'downloaded', versionArgs: ['--version'] },
    ...pathCandidates('yt-dlp').map((filePath) => ({
      filePath,
      source: 'path' as const,
      versionArgs: ['--version'],
    })),
  ])
  if (found) return { ...found, error: configuredError }

  return missingInfo(
    configuredError ??
      'yt-dlp is not installed yet. Pulse downloads the official build automatically on the first search or play.',
  )
}

function ffmpegExtraPaths(): string[] {
  const localAppData = process.env['LOCALAPPDATA']
  const programFiles = process.env['ProgramFiles']
  const programData = process.env['ProgramData']
  const userProfile = process.env['USERPROFILE']
  return [
    localAppData
      ? path.join(localAppData, 'Microsoft', 'WinGet', 'Links', FFMPEG_FILE)
      : '',
    programFiles ? path.join(programFiles, 'ffmpeg', 'bin', FFMPEG_FILE) : '',
    programData ? path.join(programData, 'chocolatey', 'bin', FFMPEG_FILE) : '',
    userProfile ? path.join(userProfile, 'scoop', 'shims', FFMPEG_FILE) : '',
  ].filter(Boolean)
}

export async function detectFfmpeg(
  configuredPath: string,
  userBinDir: string,
): Promise<MusicYouTubeToolInfo> {
  const configured = await resolveConfigured(configuredPath, FFMPEG_FILE)
  let configuredError: string | null = null
  if (configured) {
    if (await isFile(configured)) {
      const result = await probe(configured, ['-version'])
      if (result.ok) {
        return {
          ok: true,
          path: configured,
          version: result.version,
          source: 'configured',
          error: null,
        }
      }
      configuredError = `The configured FFmpeg did not run: ${result.error ?? 'unknown error'}`
    } else {
      configuredError = 'The configured FFmpeg path does not exist.'
    }
  }

  const found = await firstRunnable([
    { filePath: path.join(userBinDir, FFMPEG_FILE), source: 'downloaded', versionArgs: ['-version'] },
    ...pathCandidates('ffmpeg').map((filePath) => ({
      filePath,
      source: 'path' as const,
      versionArgs: ['-version'],
    })),
    ...ffmpegExtraPaths().map((filePath) => ({
      filePath,
      source: 'path' as const,
      versionArgs: ['-version'],
    })),
  ])
  if (found) return { ...found, error: configuredError }

  return missingInfo(
    configuredError ??
      'FFmpeg is required to create MP3 files. Install it with "winget install Gyan.FFmpeg", then open YouTube setup and press Refresh.',
  )
}

/**
 * Search can run without an API key, so the first fallback search downloads the
 * official yt-dlp build into the user's music cache rather than the app bundle.
 */
export async function ensureYtDlp(
  configuredPath: string,
  userBinDir: string,
): Promise<MusicYouTubeToolInfo> {
  const existing = await detectYtDlp(configuredPath, userBinDir)
  if (existing.ok) return existing

  const target = path.join(userBinDir, YTDLP_FILE)
  try {
    await downloadFile(YTDLP_DOWNLOAD_URL, target, {
      timeoutMs: DOWNLOAD_TIMEOUT_MS,
      minBytes: 1_000_000,
    })
  } catch (error) {
    return missingInfo(
      safeErrorMessage(
        error,
        'yt-dlp could not be downloaded. Check your connection and try again.',
      ),
    )
  }

  const downloaded = await detectYtDlp(configuredPath, userBinDir)
  if (downloaded.ok) return downloaded
  return missingInfo(
    `yt-dlp was downloaded but could not run: ${downloaded.error ?? 'unknown error'}`,
  )
}

export async function ensureFfmpeg(
  configuredPath: string,
  userBinDir: string,
): Promise<MusicYouTubeToolInfo> {
  return detectFfmpeg(configuredPath, userBinDir)
}

export function toolDirectory(info: MusicYouTubeToolInfo): string | null {
  return info.path ? path.dirname(info.path) : null
}
