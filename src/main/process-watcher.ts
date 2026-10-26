import { spawn, type ChildProcess } from 'node:child_process'
import { createInterface, type Interface } from 'node:readline'
import { matchRunningProcesses, parseProcessSnapshot } from './game-processes'
import type { GameProcessCandidate, GameRunMatch } from './game-processes'
import { resolveResourcePath } from './paths'
import { log } from './logger'

const SNAPSHOT_INTERVAL_MS = 2_500
const BASE_RESTART_DELAY_MS = 3_000
const MAX_RESTART_DELAY_MS = 60_000
const MAX_RESTART_ATTEMPTS = 5
const HEALTHY_UPTIME_MS = 5 * 60_000

interface ProcessWatcherOptions {
  getGames: () => GameProcessCandidate[]
  onChange: (matches: GameRunMatch[]) => void
}

function runningKey(matches: GameRunMatch[]): string {
  return matches
    .map(
      (match) =>
        `${match.gameId}:${match.pid ?? '-'}:${match.startedAt ?? '-'}:${match.confidence}:${match.processCount}:${match.ambiguous ? 1 : 0}`,
    )
    .join('|')
}

function describeMatches(matches: GameRunMatch[]): string[] {
  return matches.map(
    (match) =>
      `${match.gameId}#${match.pid ?? '?'} (${match.confidence}${
        match.ambiguous ? ', ambiguous' : ''
      }, ${match.processCount} process${match.processCount === 1 ? '' : 'es'})`,
  )
}

export class GameProcessWatcher {
  private child: ChildProcess | null = null
  private reader: Interface | null = null
  private restartTimer: NodeJS.Timeout | null = null
  private stopping = false
  private lastRunningKey = ''
  private restartAttempts = 0
  private helperStartedAt: number | null = null
  private readonly options: ProcessWatcherOptions

  constructor(options: ProcessWatcherOptions) {
    this.options = options
  }

  start(): void {
    if (this.child || this.restartTimer) return
    this.stopping = false
    // An explicit start (for example when the launcher window is shown again)
    // is a deliberate retry, so it clears the previous failure budget.
    this.restartAttempts = 0
    this.spawnHelper()
  }

  stop(): void {
    this.stopping = true
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
    this.reader?.close()
    this.reader = null
    const child = this.child
    this.child = null
    this.helperStartedAt = null
    child?.kill()
  }

  private spawnHelper(): void {
    if (this.stopping) return
    const child = spawn(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        resolveResourcePath('process-snapshot.ps1'),
        '-ParentPid',
        String(process.pid),
        '-IntervalMs',
        String(SNAPSHOT_INTERVAL_MS),
      ],
      {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )

    this.child = child
    this.helperStartedAt = Date.now()
    let finished = false
    const finish = (code: number | null): void => {
      if (finished) return
      finished = true
      if (this.child !== child) return
      this.reader?.close()
      this.reader = null
      this.child = null
      if (this.stopping) return

      // A helper that stayed up long enough is considered healthy, so a later
      // crash starts a fresh retry budget instead of continuing an old one.
      if (
        this.helperStartedAt !== null &&
        Date.now() - this.helperStartedAt >= HEALTHY_UPTIME_MS
      ) {
        this.restartAttempts = 0
      }
      this.helperStartedAt = null

      if (this.restartAttempts >= MAX_RESTART_ATTEMPTS) {
        log.error(
          `[processes] snapshot helper exited (${code}); giving up after ${MAX_RESTART_ATTEMPTS} restart attempts`,
        )
        return
      }

      const delay = Math.min(
        BASE_RESTART_DELAY_MS * 2 ** this.restartAttempts,
        MAX_RESTART_DELAY_MS,
      )
      this.restartAttempts += 1
      log.warn(
        `[processes] snapshot helper exited (${code}); restart ${this.restartAttempts}/${MAX_RESTART_ATTEMPTS} in ${delay}ms`,
      )
      this.restartTimer = setTimeout(() => {
        this.restartTimer = null
        this.spawnHelper()
      }, delay)
    }

    if (child.stdout) {
      this.reader = createInterface({ input: child.stdout })
      this.reader.on('line', (line) => this.handleSnapshot(line))
    }
    child.stderr?.resume()
    child.once('error', (error) => {
      log.warn('[processes] snapshot helper failed', error)
      finish(null)
    })
    child.once('exit', (code) => finish(code))
  }

  private handleSnapshot(line: string): void {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#< CLIXML')) return
    const processes = parseProcessSnapshot(trimmed)
    if (!processes) return

    const running = matchRunningProcesses(this.options.getGames(), processes)
    const key = runningKey(running)
    if (key === this.lastRunningKey) return
    this.lastRunningKey = key
    log.info('[processes] running changed', describeMatches(running))
    this.options.onChange(running)
  }
}
