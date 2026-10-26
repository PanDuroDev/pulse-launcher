import { describe, expect, it } from 'vitest'
import type { GameRecord, ScanProgress } from '@shared/types'
import { runSourceScan, SourceTimeoutError } from './source-scan'

const game: GameRecord = {
  id: 'steam-1',
  source: 'steam',
  name: 'Steam Game',
  installed: true,
  accent: '#ffffff',
  launch: { kind: 'steam', target: 'steam://rungameid/1' },
}

describe('runSourceScan', () => {
  it('returns the games and reports scan progress on success', async () => {
    const progress: ScanProgress[] = []

    const outcome = await runSourceScan(
      'steam',
      async () => ({ games: [game], warnings: ['minor warning'] }),
      { timeoutMs: 1_000, onProgress: (entry) => progress.push(entry) },
    )

    expect(outcome.error).toBeUndefined()
    expect(outcome.timedOut).toBeUndefined()
    expect(outcome.games).toEqual([game])
    expect(outcome.warnings).toEqual(['minor warning'])
    expect(progress.map((entry) => entry.phase)).toEqual(['scanning', 'done'])
    expect(progress[1]?.found).toBe(1)
  })

  it('turns a thrown error into an error outcome with no games', async () => {
    const outcome = await runSourceScan(
      'epic',
      async () => {
        throw new Error('Manifest directory not found')
      },
      { timeoutMs: 1_000 },
    )

    expect(outcome.error).toBe('Manifest directory not found')
    expect(outcome.games).toEqual([])
    expect(outcome.warnings).toEqual([])
    expect(outcome.timedOut).toBeUndefined()
  })

  it('times out, aborts the signal, and reports the timeout', async () => {
    let received: AbortSignal | undefined

    const outcome = await runSourceScan(
      'start-menu',
      (signal) => {
        received = signal
        return new Promise(() => undefined)
      },
      { timeoutMs: 10 },
    )

    expect(outcome.timedOut).toBe(true)
    expect(outcome.error).toBe('Scan timed out after 10ms')
    expect(received?.aborted).toBe(true)
    expect(received?.reason).toBeInstanceOf(SourceTimeoutError)
  })

  it('lets a cooperative scanner stop through the abort signal', async () => {
    const outcome = await runSourceScan(
      'steam',
      (signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        }),
      { timeoutMs: 10 },
    )

    expect(outcome.timedOut).toBe(true)
    expect(outcome.error).toBe('Scan timed out after 10ms')
  })
})
