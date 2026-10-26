import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface FakeChild {
  stdout: Record<string, never>
  stderr: { resume: () => void }
  killed: boolean
  once: (event: string, handler: (arg?: unknown) => void) => void
  kill: () => void
  emit: (event: string, arg?: unknown) => void
}

const harness = vi.hoisted(() => ({
  spawns: [] as FakeChild[],
  onLine: null as ((line: string) => void) | null,
}))

vi.mock('node:child_process', () => ({
  spawn: () => {
    const handlers = new Map<string, (arg?: unknown) => void>()
    const child: FakeChild = {
      stdout: {},
      stderr: { resume: () => undefined },
      killed: false,
      once: (event, handler) => {
        handlers.set(event, handler)
      },
      kill: () => {
        child.killed = true
      },
      emit: (event, arg) => {
        handlers.get(event)?.(arg)
      },
    }
    harness.spawns.push(child)
    return child
  },
}))

vi.mock('node:readline', () => ({
  createInterface: () => ({
    on: (_event: string, handler: (line: string) => void) => {
      harness.onLine = handler
    },
    close: () => undefined,
  }),
}))

vi.mock('./paths', () => ({
  resolveResourcePath: () => 'C:\\fake\\process-snapshot.ps1',
}))

vi.mock('./logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { GameProcessWatcher } from './process-watcher'
import type { GameProcessCandidate, GameRunMatch } from './game-processes'
import { log } from './logger'

function createWatcher(): GameProcessWatcher {
  return new GameProcessWatcher({ getGames: () => [], onChange: () => undefined })
}

function lastChild(): FakeChild {
  const child = harness.spawns.at(-1)
  if (!child) throw new Error('expected a spawned helper')
  return child
}

describe('GameProcessWatcher restart policy', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    harness.spawns.length = 0
    harness.onLine = null
    vi.mocked(log.error).mockClear()
    vi.mocked(log.warn).mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('restarts after 3s and then after 6s', async () => {
    const watcher = createWatcher()
    watcher.start()
    expect(harness.spawns).toHaveLength(1)

    lastChild().emit('exit', 1)
    await vi.advanceTimersByTimeAsync(2_999)
    expect(harness.spawns).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(harness.spawns).toHaveLength(2)

    lastChild().emit('exit', 1)
    await vi.advanceTimersByTimeAsync(5_999)
    expect(harness.spawns).toHaveLength(2)

    await vi.advanceTimersByTimeAsync(1)
    expect(harness.spawns).toHaveLength(3)
  })

  it('gives up after five restart attempts and logs the failure', async () => {
    const watcher = createWatcher()
    watcher.start()

    for (let attempt = 0; attempt < 5; attempt += 1) {
      lastChild().emit('exit', 1)
      await vi.advanceTimersByTimeAsync(60_000)
    }

    expect(harness.spawns).toHaveLength(6)

    lastChild().emit('exit', 1)
    await vi.advanceTimersByTimeAsync(10 * 60_000)

    expect(harness.spawns).toHaveLength(6)
    expect(log.error).toHaveBeenCalledTimes(1)
  })

  it('spawns again when start() is called after giving up', async () => {
    const watcher = createWatcher()
    watcher.start()

    for (let attempt = 0; attempt < 5; attempt += 1) {
      lastChild().emit('exit', 1)
      await vi.advanceTimersByTimeAsync(60_000)
    }
    lastChild().emit('exit', 1)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(harness.spawns).toHaveLength(6)

    watcher.start()
    expect(harness.spawns).toHaveLength(7)

    lastChild().emit('exit', 1)
    await vi.advanceTimersByTimeAsync(3_000)
    expect(harness.spawns).toHaveLength(8)
  })

  it('does not restart after stop()', async () => {
    const watcher = createWatcher()
    watcher.start()
    const child = lastChild()

    watcher.stop()
    expect(child.killed).toBe(true)

    child.emit('exit', 1)
    await vi.advanceTimersByTimeAsync(10 * 60_000)

    expect(harness.spawns).toHaveLength(1)
  })

  it('resets the backoff after a healthy uptime', async () => {
    const watcher = createWatcher()
    watcher.start()

    lastChild().emit('exit', 1)
    await vi.advanceTimersByTimeAsync(3_000)
    expect(harness.spawns).toHaveLength(2)

    lastChild().emit('exit', 1)
    await vi.advanceTimersByTimeAsync(6_000)
    expect(harness.spawns).toHaveLength(3)

    await vi.advanceTimersByTimeAsync(5 * 60_000)
    lastChild().emit('exit', 1)

    await vi.advanceTimersByTimeAsync(2_999)
    expect(harness.spawns).toHaveLength(3)

    await vi.advanceTimersByTimeAsync(1)
    expect(harness.spawns).toHaveLength(4)
  })
})

describe('GameProcessWatcher snapshots', () => {
  const games: GameProcessCandidate[] = [
    {
      id: 'manual-hades',
      process: { executable: 'C:\\Games\\Hades\\Hades.exe' },
    },
  ]

  beforeEach(() => {
    harness.spawns.length = 0
    harness.onLine = null
    vi.mocked(log.info).mockClear()
  })

  function createReportingWatcher(): GameRunMatch[][] {
    const changes: GameRunMatch[][] = []
    const watcher = new GameProcessWatcher({
      getGames: () => games,
      onChange: (matches) => changes.push(matches),
    })
    watcher.start()
    return changes
  }

  const snapshot = JSON.stringify([
    {
      id: 4242,
      name: 'Hades.exe',
      path: 'C:\\Games\\Hades\\Hades.exe',
      startedAt: 1_690_000_000_000,
    },
  ])

  it('reports the verified PID and confidence from a snapshot', () => {
    const changes = createReportingWatcher()

    harness.onLine?.(snapshot)

    expect(changes).toEqual([
      [
        {
          gameId: 'manual-hades',
          pid: 4242,
          startedAt: 1_690_000_000_000,
          confidence: 'exact',
          processCount: 1,
          ambiguous: false,
        },
      ],
    ])
  })

  it('does not re-emit an unchanged snapshot', () => {
    const changes = createReportingWatcher()

    harness.onLine?.(snapshot)
    harness.onLine?.(snapshot)

    expect(changes).toHaveLength(1)
  })

  it('emits once more when the game exits', () => {
    const changes = createReportingWatcher()

    harness.onLine?.(snapshot)
    harness.onLine?.('[]')

    expect(changes).toEqual([
      [expect.objectContaining({ gameId: 'manual-hades', pid: 4242 })],
      [],
    ])
  })

  it('ignores helper output and malformed lines', () => {
    const changes = createReportingWatcher()

    harness.onLine?.('#< CLIXML')
    harness.onLine?.('not json')

    expect(changes).toEqual([])
  })
})
