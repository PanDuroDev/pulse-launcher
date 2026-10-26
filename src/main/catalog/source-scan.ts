import type { GameRecord, GameSource, ScanProgress } from '@shared/types'

export interface SourceScanTask {
  games: GameRecord[]
  warnings: string[]
}

export interface SourceScanOutcome extends SourceScanTask {
  source: GameSource
  error?: string
  timedOut?: boolean
}

export interface RunSourceScanOptions {
  timeoutMs: number
  onProgress?: (progress: ScanProgress) => void
  onError?: (message: string, error: unknown) => void
}

export class SourceTimeoutError extends Error {
  constructor(timeoutMs: number) {
    const duration =
      timeoutMs >= 1_000 ? `${Math.round(timeoutMs / 1_000)}s` : `${timeoutMs}ms`
    super(`Scan timed out after ${duration}`)
    this.name = 'SourceTimeoutError'
  }
}

/**
 * Runs one source scan with a hard timeout. The timeout aborts the passed
 * signal so cooperating scanners can stop filesystem/process work early, and
 * rejects the scan even if the scanner ignores the signal.
 */
export async function runSourceScan(
  source: GameSource,
  run: (signal: AbortSignal) => Promise<SourceScanTask>,
  options: RunSourceScanOptions,
): Promise<SourceScanOutcome> {
  options.onProgress?.({ source, phase: 'scanning', found: 0 })

  const controller = new AbortController()
  let timer: NodeJS.Timeout | undefined

  try {
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        const error = new SourceTimeoutError(options.timeoutMs)
        controller.abort(error)
        reject(error)
      }, options.timeoutMs)
    })

    const result = await Promise.race([run(controller.signal), timeout])
    options.onProgress?.({ source, phase: 'done', found: result.games.length })
    return { source, ...result }
  } catch (error) {
    const timedOut = error instanceof SourceTimeoutError
    const message = error instanceof Error ? error.message : String(error)
    options.onError?.(
      `[catalog] ${source} scan ${timedOut ? 'timed out' : 'failed'}`,
      error,
    )
    options.onProgress?.({ source, phase: 'error', found: 0, message })
    return {
      source,
      games: [],
      warnings: [],
      error: message,
      ...(timedOut ? { timedOut: true } : {}),
    }
  } finally {
    if (timer) clearTimeout(timer)
  }
}
