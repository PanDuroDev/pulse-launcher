import type { ExpressionId, StateId } from '@/components/bloub'

/**
 * What the header mark is doing, derived from the launcher rather than from the
 * pointer. The Bloub catalogue is a vocabulary: `thinking` when the catalog is
 * being read, `play` for a running game, `notify` for a favorite, `sleep` when
 * there is nothing to play. Keeping the mapping pure means the rules can be
 * tested without a DOM, and `BrandMark` stays a renderer of one decision.
 */
export type LauncherStatus = 'loading' | 'ready' | 'error'

export interface MarkContext {
  status: LauncherStatus
  /** A library rescan is in flight (the header shows a scanning pill). */
  refreshing: boolean
  /** A launch request for the selected game has not answered yet. */
  pending: boolean
  /** The selected game is running right now. */
  running: boolean
  /** The selected game is marked as a favorite. */
  favorite: boolean
  /** False when the library is empty: the mark has nothing to mirror. */
  hasSelection: boolean
  /**
   * Identity of the selected game. It seeds the resting face, so moving from
   * one cover to the next changes the mark instead of leaving it on the same
   * expression for the whole session.
   */
  seed?: string | null
}

export interface MarkMood {
  state: StateId
  expression: ExpressionId
}

/** Nothing to report: the catalogue's own resting face. */
const CALM: MarkMood = { state: 'idle', expression: 'neutre' }

/**
 * The faces a game can be given.
 *
 * Most are the catalogue's resting pose — `idle`, which holds the ball — with a
 * different expression on it, because the mark is a logo before it is a
 * character. Three of them change the pose instead, and all three still draw a
 * circle: `wink` closes one eye, `wide` opens both, `notify` adds the blue
 * badge. Nothing here changes the silhouette, so the header never looks like a
 * different app; moving between covers just changes what the ball is doing.
 */
const SIGNATURES: readonly MarkMood[] = [
  { state: 'idle', expression: 'neutre' },
  { state: 'idle', expression: 'fier' },
  { state: 'idle', expression: 'blase' },
  { state: 'idle', expression: 'curieux' },
  { state: 'idle', expression: 'timide' },
  { state: 'wink', expression: 'curieux' },
  { state: 'wide', expression: 'surpris' },
  { state: 'notify', expression: 'heureux' },
]

/**
 * FNV-1a, kept here rather than imported: the point is only that the same game
 * always gets the same face, and that two neighbours in the library do not.
 */
function hash(text: string): number {
  let value = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i)
    value = Math.imul(value, 0x01000193)
  }
  return value >>> 0
}

/** The face this game wears when nothing else is going on. */
export function signatureFor(seed: string | null | undefined): MarkMood {
  if (!seed) return CALM
  return SIGNATURES[hash(seed) % SIGNATURES.length] ?? CALM
}

/**
 * Precedence is deliberate. A failure outranks everything (the library is not
 * usable), a launch outranks a scan (the user just asked for something), and a
 * running game outranks a favorite (a session is more immediate than a flag).
 * Only the last, quietest case is personal: with nothing to report, the mark
 * takes the selected game's signature.
 */
export function markMoodFor(ctx: MarkContext): MarkMood {
  if (ctx.status === 'error') return { state: 'alert', expression: 'triste' }
  if (ctx.pending) return { state: 'burst', expression: 'excite' }
  if (ctx.status === 'loading' || ctx.refreshing) {
    return { state: 'thinking', expression: 'attentif' }
  }
  if (ctx.running) return { state: 'play', expression: 'excite' }
  if (!ctx.hasSelection) return { state: 'sleep', expression: 'somnolent' }
  if (ctx.favorite) return { state: 'notify', expression: 'heureux' }
  return signatureFor(ctx.seed)
}
