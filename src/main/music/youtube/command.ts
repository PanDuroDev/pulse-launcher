import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const MAX_STDOUT_BYTES = 8_000_000
const MAX_STDERR_BYTES = 64_000

export interface CommandResult {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  error: string | null
}

function appendCapped(current: string, chunk: Buffer, limit: number): string {
  const next = current + chunk.toString('utf8')
  return next.length > limit ? next.slice(next.length - limit) : next
}

function killTree(child: ChildProcess): void {
  if (!child.pid) {
    child.kill()
    return
  }
  if (process.platform !== 'win32') {
    child.kill('SIGKILL')
    return
  }
  // yt-dlp starts ffmpeg as a child. Killing only yt-dlp can leave ffmpeg
  // holding the temp file and the download lock.
  const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
    windowsHide: true,
    stdio: 'ignore',
  })
  killer.on('error', () => child.kill())
}

/**
 * Runs an executable without a shell, so query text and paths can never be
 * interpreted as commands. A timeout kills the whole process tree on Windows.
 */
export function runCommand(
  file: string,
  args: string[],
  timeoutMs: number,
): Promise<CommandResult> {
  return new Promise((resolve) => {
    let child: ChildProcess
    try {
      child = spawn(file, args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      resolve({
        code: null,
        stdout: '',
        stderr: '',
        timedOut: false,
        error: error instanceof Error ? error.message : 'Could not start the process.',
      })
      return
    }

    let stdout = ''
    let stderr = ''
    let timedOut = false
    let settled = false
    let timer: NodeJS.Timeout | null = null

    const finish = (result: CommandResult): void => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      resolve(result)
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout = appendCapped(stdout, chunk, MAX_STDOUT_BYTES)
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = appendCapped(stderr, chunk, MAX_STDERR_BYTES)
    })
    child.on('error', (error) => {
      finish({
        code: null,
        stdout,
        stderr,
        timedOut,
        error: error.message,
      })
    })
    child.on('close', (code) => {
      finish({ code, stdout, stderr, timedOut, error: null })
    })

    timer = setTimeout(() => {
      timedOut = true
      killTree(child)
    }, timeoutMs)
  })
}

export interface DownloadFileOptions {
  timeoutMs: number
  minBytes: number
}

/** Downloads a small executable or archive with a size sanity check. */
export async function downloadFile(
  url: string,
  targetPath: string,
  options: DownloadFileOptions,
): Promise<number> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/octet-stream',
      'User-Agent': 'PulseLauncher',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(options.timeoutMs),
  })
  if (!response.ok) {
    throw new Error(`Download failed with HTTP ${response.status}.`)
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength < options.minBytes) {
    throw new Error('The downloaded file was unexpectedly small.')
  }

  await mkdir(path.dirname(targetPath), { recursive: true })
  const temporary = `${targetPath}.download-${process.pid}`
  try {
    await writeFile(temporary, bytes)
    await rename(temporary, targetPath)
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined)
    throw error
  }
  return bytes.byteLength
}
