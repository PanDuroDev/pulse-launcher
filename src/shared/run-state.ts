import type { GameRunState } from './types'

/**
 * `confirmed` means the launcher tied the game to a specific executable or a
 * single process in its install folder. `probable` means the evidence is
 * weaker (name-only match or several equally plausible processes), so the UI
 * must not present it as a certain "running now".
 */
export type RunAssurance = 'confirmed' | 'probable'

export function runAssurance(state?: GameRunState): RunAssurance {
  if (!state) return 'confirmed'
  if (state.ambiguous) return 'probable'
  if (state.confidence === 'name') return 'probable'
  return 'confirmed'
}

/**
 * Short noun phrase explaining the evidence behind a run state, written to be
 * used after "matched by". Returns null for an exact match, which needs no
 * qualification.
 */
export function describeRunEvidence(state?: GameRunState): string | null {
  if (!state) return null
  if (state.ambiguous) {
    return state.processCount > 1
      ? `${state.processCount} processes in the install folder`
      : 'several processes in the install folder'
  }
  if (state.confidence === 'directory') return 'a process in the install folder'
  if (state.confidence === 'name') return 'the process name only'
  return null
}
