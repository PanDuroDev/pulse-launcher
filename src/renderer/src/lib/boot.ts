import type { Block } from '@/components/bloub/bot/cycles'
import type { StateId } from '@/components/bloub/bot/states'

/**
 * The boot overlay is a short, deliberate piece of theatre, not a progress
 * report: the store already tells us when the cached library is ready. Three
 * phases are enough to make the wait read as intentional.
 *
 * - `scan` covers `initialize()` (settings, catalog, selection);
 * - `ready` is the hand-off, and only then does the overlay fade out;
 * - `error` holds long enough to be read before the library's own error page
 *   takes over.
 */
export type BootPhase = 'scan' | 'ready' | 'error'

export function bootPhaseFor(status: 'loading' | 'ready' | 'error'): BootPhase {
  if (status === 'error') return 'error'
  return status === 'loading' ? 'scan' : 'ready'
}

/**
 * Timings are in milliseconds. The intro dwell keeps the first state on screen
 * long enough to register even when the catalog answers in 80 ms.
 *
 * The ready hold is the whole of `comet`, not a slice of it: the animation only
 * makes sense played through, and its last beat is the dot growing back into a
 * ball — which is the exact image the hand-off needs, because that ball is what
 * flies into the header and becomes the mark. The exit is the crossing itself,
 * so it is longer than a plain fade.
 */
export const BOOT_INTRO_MS = 700
export const BOOT_READY_HOLD_MS = 2400
export const BOOT_ERROR_HOLD_MS = 1700
export const BOOT_EXIT_MS = 560

/**
 * Montages rather than a single state: the bot works through a different set
 * of animations for each phase. Every duration respects the engine's own
 * minimum (a shorter block would be cut before the morph lands), and `comet`
 * is the one animation both the loading and the ready phase share, so the
 * shooting star is seen even when the library answers immediately.
 */
export const BOOT_CYCLES: Record<BootPhase, Block[]> = {
  scan: [
    { state: 'swirl', duration: 1.3 },
    { state: 'thinking', duration: 2.6 },
    { state: 'comet', duration: 2.4 },
    { state: 'orbit', duration: 3.4 },
  ],
  ready: [
    { state: 'comet', duration: 2.4 },
    { state: 'idle', duration: 2.4 },
  ],
  error: [
    { state: 'alert', duration: 2.4 },
    { state: 'exclaim', duration: 2.0 },
  ],
}

/**
 * One readable frame per phase, used when motion is reduced: the montage is
 * frozen instead of played, so nothing moves and nothing is cut short.
 */
export const BOOT_STILL_STATE: Record<BootPhase, StateId> = {
  scan: 'thinking',
  ready: 'comet',
  error: 'alert',
}

export const BOOT_STILL_AT: Record<BootPhase, number> = {
  scan: 1.1,
  ready: 1.15,
  error: 0.75,
}
