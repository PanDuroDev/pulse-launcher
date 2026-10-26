import type { ExpressionId, StateId } from '@/components/bloub'

/**
 * A one-line bus for "the interface did something worth noticing".
 *
 * The header mark is a single element at the top of the window, but the things
 * worth reacting to — a cover being pointed at, a button being focused, a game
 * launching — live all over the tree. Passing a callback through every layer
 * would couple the mark to cards, rows, the hero and the header's own tools;
 * instead those controls announce a kind, and the mark decides what to do with
 * it. Nothing here holds state: a late subscriber simply misses earlier events,
 * which is exactly right for a reaction with a shelf life.
 */
export type AttentionKind = 'hover' | 'focus' | 'launch'

type Listener = (kind: AttentionKind) => void

const listeners = new Set<Listener>()

export function announceAttention(kind: AttentionKind): void {
  for (const listener of listeners) listener(kind)
}

export function subscribeAttention(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The face the mark wears while it is acknowledging an interface event. */
export interface Reaction {
  state: StateId
  expression: ExpressionId
  /** How long the reaction holds before the launcher's own mood returns. */
  hold: number
}

export const REACTION_BY_KIND: Record<AttentionKind, Reaction> = {
  // A pointer resting on a cover: a curious tilt, not a celebration.
  hover: { state: 'wink', expression: 'curieux', hold: 700 },
  // Spatial focus moved (keys or gamepad): eyes open, the mark looks at it.
  focus: { state: 'wide', expression: 'attentif', hold: 800 },
  // Something was actually chosen. Long enough for `burst` to throw its
  // particles, which is the only part of the animation worth seeing.
  launch: { state: 'burst', expression: 'excite', hold: 1700 },
}
