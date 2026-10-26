import { describe, expect, it } from 'vitest'
import type { GameRunState } from './types'
import { describeRunEvidence, runAssurance } from './run-state'

function state(overrides: Partial<GameRunState>): GameRunState {
  return { confidence: 'exact', ambiguous: false, processCount: 1, ...overrides }
}

describe('runAssurance', () => {
  it('treats an exact single match as confirmed', () => {
    expect(runAssurance(state({ confidence: 'exact' }))).toBe('confirmed')
  })

  it('treats a single install-folder match as confirmed', () => {
    expect(runAssurance(state({ confidence: 'directory' }))).toBe('confirmed')
  })

  it('downgrades name-only and ambiguous matches', () => {
    expect(runAssurance(state({ confidence: 'name' }))).toBe('probable')
    expect(
      runAssurance(state({ confidence: 'directory', ambiguous: true, processCount: 2 })),
    ).toBe('probable')
  })

  it('stays confirmed when no evidence was reported', () => {
    expect(runAssurance(undefined)).toBe('confirmed')
  })
})

describe('describeRunEvidence', () => {
  it('returns no evidence for an exact match', () => {
    expect(describeRunEvidence(state({ confidence: 'exact' }))).toBeNull()
  })

  it('explains a folder, a name, and a tie', () => {
    expect(describeRunEvidence(state({ confidence: 'directory' }))).toBe(
      'a process in the install folder',
    )
    expect(describeRunEvidence(state({ confidence: 'name' }))).toBe(
      'the process name only',
    )
    expect(
      describeRunEvidence(state({ confidence: 'directory', ambiguous: true, processCount: 3 })),
    ).toBe('3 processes in the install folder')
  })
})
