import { spawn } from 'node:child_process'
import { resolveResourcePath } from './paths'

export type WindowAction = 'info' | 'close' | 'focus'

export type WindowActionFailure =
  | 'not-found'
  | 'identity-mismatch'
  | 'no-window'
  | 'post-failed'
  | 'foreground-denied'
  | 'call-failed'

export interface WindowActionRequest {
  action: WindowAction
  pid: number
  /** Creation time of the verified process, used to detect PID reuse. */
  expectedStartedAt: number
}

export interface WindowActionOutcome {
  ok: boolean
  handle: number | null
  title: string | null
  reason: WindowActionFailure | null
}

const WINDOW_ACTION_TIMEOUT_MS = 15_000
const MAX_OUTPUT_BYTES = 64 * 1024

const REASONS = new Set<string>([
  'not-found',
  'identity-mismatch',
  'no-window',
  'post-failed',
  'foreground-denied',
  'call-failed',
])

function failure(reason: WindowActionFailure): WindowActionOutcome {
  return { ok: false, handle: null, title: null, reason }
}

/** Parses the single JSON line printed by `game-window.ps1`. */
export function parseWindowAction(line: string): WindowActionOutcome | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null

  const record = parsed as Record<string, unknown>
  if (typeof record.ok !== 'boolean') return null

  const handle =
    typeof record.handle === 'number' &&
    Number.isInteger(record.handle) &&
    record.handle >= 0
      ? record.handle
      : null
  const title =
    typeof record.title === 'string' && record.title.length > 0
      ? record.title
      : null
  const reason =
    typeof record.reason === 'string' && REASONS.has(record.reason)
      ? (record.reason as WindowActionFailure)
      : null

  if (record.ok && reason) return null

  return { ok: record.ok, handle, title, reason }
}

/**
 * Runs the window helper for one verified process and parses its result.
 * Any failure (timeout, spawn error, unreadable output) is reported as
 * `call-failed`, never as a silent success.
 */
export function runWindowAction(
  request: WindowActionRequest,
): Promise<WindowActionOutcome> {
  return new Promise((resolve) => {
    let settled = false
    let stdout = ''

    const child = spawn(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        resolveResourcePath('game-window.ps1'),
        '-TargetPid',
        String(request.pid),
        '-Action',
        request.action,
        '-ExpectedCreatedMs',
        String(request.expectedStartedAt),
      ],
      {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )

    const finish = (outcome: WindowActionOutcome): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(outcome)
    }

    const timer = setTimeout(() => {
      child.kill()
      finish(failure('call-failed'))
    }, WINDOW_ACTION_TIMEOUT_MS)

    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdout.length >= MAX_OUTPUT_BYTES) return
      stdout += chunk.toString('utf8')
    })
    child.stderr?.resume()
    child.once('error', () => finish(failure('call-failed')))
    child.once('close', () => {
      const lines = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
      const last = lines.at(-1)
      finish((last ? parseWindowAction(last) : null) ?? failure('call-failed'))
    })
  })
}
