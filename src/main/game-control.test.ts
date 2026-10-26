import { describe, expect, it } from 'vitest'
import { FORCE_QUIT_GRACE_MS, GameControlService } from './game-control'
import type { GameRunMatch } from './game-processes'
import type { WindowActionOutcome, WindowActionRequest } from './game-window'

function match(overrides: Partial<GameRunMatch> = {}): GameRunMatch {
  return {
    gameId: 'g1',
    pid: 4_242,
    startedAt: 1_700_000_000_000,
    confidence: 'exact',
    processCount: 1,
    ambiguous: false,
    ...overrides,
  }
}

const okOutcome: WindowActionOutcome = {
  ok: true,
  handle: 197_004,
  title: 'Game',
  reason: null,
}

interface Harness {
  service: GameControlService
  calls: WindowActionRequest[]
  terminated: number[]
  advance: (ms: number) => void
  setMatch: (next: GameRunMatch | undefined) => void
}

function createHarness(options: {
  match?: GameRunMatch
  outcome?: WindowActionOutcome
  terminate?: boolean
} = {}): Harness {
  let now = 1_000_000
  // An explicit `match: undefined` means "not running"; omitting the option
  // uses the default verified match.
  let current = 'match' in options ? options.match : match()
  const calls: WindowActionRequest[] = []
  const terminated: number[] = []

  const service = new GameControlService({
    getRunningMatch: () => current,
    runWindowAction: async (request) => {
      calls.push(request)
      return options.outcome ?? okOutcome
    },
    terminateProcess: async (pid) => {
      terminated.push(pid)
      return options.terminate ?? true
    },
    now: () => now,
  })

  return {
    service,
    calls,
    terminated,
    advance: (ms) => {
      now += ms
    },
    setMatch: (next) => {
      current = next
    },
  }
}

describe('GameControlService targeting', () => {
  it('uses the verified PID and start time from the watcher', async () => {
    const harness = createHarness({ match: match() })

    await expect(harness.service.focus('g1')).resolves.toEqual({
      ok: true,
      action: 'focus',
    })
    expect(harness.calls).toEqual([
      { action: 'focus', pid: 4_242, expectedStartedAt: 1_700_000_000_000 },
    ])
  })

  it('refuses when the game is not running', async () => {
    const harness = createHarness({ match: undefined })

    await expect(harness.service.close('g1')).resolves.toMatchObject({
      ok: false,
      errorCode: 'not-running',
    })
    expect(harness.calls).toEqual([])
  })

  it('refuses to pick one of several matching processes', async () => {
    const harness = createHarness({
      match: match({ pid: null, ambiguous: true, processCount: 2 }),
    })

    await expect(harness.service.close('g1')).resolves.toMatchObject({
      ok: false,
      errorCode: 'ambiguous-process',
    })
    expect(harness.calls).toEqual([])
  })

  it('refuses a process whose identity could not be captured', async () => {
    const harness = createHarness({ match: match({ startedAt: null }) })

    await expect(harness.service.focus('g1')).resolves.toMatchObject({
      ok: false,
      errorCode: 'unverified-identity',
    })
    expect(harness.calls).toEqual([])
  })
})

describe('GameControlService close', () => {
  it('asks the window to close and reports success', async () => {
    const harness = createHarness()

    await expect(harness.service.close('g1')).resolves.toEqual({
      ok: true,
      action: 'close',
    })
    expect(harness.calls).toEqual([
      { action: 'close', pid: 4_242, expectedStartedAt: 1_700_000_000_000 },
    ])
    expect(harness.terminated).toEqual([])
  })

  it('reports a game that has no window yet', async () => {
    const harness = createHarness({
      outcome: { ok: false, handle: 0, title: null, reason: 'no-window' },
    })

    await expect(harness.service.close('g1')).resolves.toMatchObject({
      ok: false,
      errorCode: 'no-window',
    })
  })

  it('refuses when the helper detected PID reuse', async () => {
    const harness = createHarness({
      outcome: { ok: false, handle: null, title: null, reason: 'identity-mismatch' },
    })

    await expect(harness.service.close('g1')).resolves.toMatchObject({
      ok: false,
      errorCode: 'unverified-identity',
    })
  })

  it('reports a rejected WM_CLOSE', async () => {
    const harness = createHarness({
      outcome: { ok: false, handle: 5, title: null, reason: 'post-failed' },
    })

    await expect(harness.service.close('g1')).resolves.toMatchObject({
      ok: false,
      errorCode: 'failed',
    })
  })
})

describe('GameControlService force quit', () => {
  it('requires explicit confirmation', async () => {
    const harness = createHarness()
    await harness.service.close('g1')

    await expect(harness.service.forceClose('g1', false)).resolves.toMatchObject({
      ok: false,
      errorCode: 'confirmation-required',
    })
    expect(harness.terminated).toEqual([])
  })

  it('is unavailable without a prior close request', async () => {
    const harness = createHarness()

    await expect(harness.service.forceClose('g1', true)).resolves.toMatchObject({
      ok: false,
      errorCode: 'close-not-requested',
    })
    expect(harness.terminated).toEqual([])
  })

  it('waits for the grace period after the close request', async () => {
    const harness = createHarness()
    await harness.service.close('g1')

    const tooEarly = await harness.service.forceClose('g1', true)

    expect(tooEarly.ok).toBe(false)
    expect(tooEarly.errorCode).toBe('grace-period')
    expect(tooEarly.retryAfterMs).toBe(FORCE_QUIT_GRACE_MS)
    expect(harness.terminated).toEqual([])

    harness.advance(FORCE_QUIT_GRACE_MS - 1)
    expect((await harness.service.forceClose('g1', true)).errorCode).toBe('grace-period')

    harness.advance(1)
    await expect(harness.service.forceClose('g1', true)).resolves.toEqual({
      ok: true,
      action: 'force-close',
    })
    expect(harness.terminated).toEqual([4_242])
  })

  it('clears the request after a successful force quit', async () => {
    const harness = createHarness()
    await harness.service.close('g1')
    harness.advance(FORCE_QUIT_GRACE_MS)
    await harness.service.forceClose('g1', true)

    await expect(harness.service.forceClose('g1', true)).resolves.toMatchObject({
      ok: false,
      errorCode: 'close-not-requested',
    })
  })

  it('rejects a request that targets a different process identity', async () => {
    const harness = createHarness()
    await harness.service.close('g1')

    const moved = createHarness({
      match: match({ pid: 5_000, startedAt: 1_700_000_500_000 }),
    })
    harness.advance(FORCE_QUIT_GRACE_MS)
    // A different identity has no close request of its own.
    await expect(moved.service.forceClose('g1', true)).resolves.toMatchObject({
      ok: false,
      errorCode: 'close-not-requested',
    })
    expect(harness.terminated).toEqual([])
  })

  it('reports a process that refuses termination', async () => {
    const harness = createHarness({ terminate: false })
    await harness.service.close('g1')
    harness.advance(FORCE_QUIT_GRACE_MS)

    await expect(harness.service.forceClose('g1', true)).resolves.toMatchObject({
      ok: false,
      errorCode: 'failed',
    })
    expect(harness.terminated).toEqual([4_242])
  })

  it('forgets the close request when the game exits', async () => {
    const harness = createHarness()
    await harness.service.close('g1')
    harness.advance(FORCE_QUIT_GRACE_MS)

    const exited = createHarness({ match: undefined })
    await expect(exited.service.forceClose('g1', true)).resolves.toMatchObject({
      ok: false,
      errorCode: 'not-running',
    })
  })
})
