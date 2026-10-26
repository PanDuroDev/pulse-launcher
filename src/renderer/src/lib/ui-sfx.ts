import { createUISFX, type CueName, type PlayOptions, type UISFXPlayer } from 'uisfx'

/**
 * Interface sounds are synthesised by uisfx from the "zen" pack, so nothing is
 * streamed or decoded from disk. Only the cues Pulse actually uses are warmed
 * up, and the AudioContext is created lazily on the first real gesture: a
 * launcher that starts scanning a library should not open an audio device
 * before the user has touched anything.
 */
const CUES = [
  'hover',
  'press',
  'release',
  'focus',
  'select',
  'deselect',
  'open',
  'close',
  'back',
  'toggle-on',
  'toggle-off',
  'start',
  'success',
  'error',
  'delete',
] as const satisfies readonly CueName[]

let player: UISFXPlayer | null = null
let enabled = true
let unlockStarted = false
let muteTimer: number | null = null

function getPlayer(): UISFXPlayer {
  player ??= createUISFX({
    pack: 'zen',
    volume: 0.6,
    maxVoices: 6,
    cooldownMs: 40,
  })
  return player
}

/** Called from the first pointer or key gesture; safe to call repeatedly. */
export function unlockUISounds(): void {
  if (unlockStarted || !enabled) return
  unlockStarted = true
  const instance = getPlayer()
  void instance
    .unlock()
    .then((running) => (running ? instance.preload(CUES) : undefined))
    .catch(() => undefined)
}

export function playUI(cue: CueName, options?: PlayOptions): void {
  if (!enabled || !unlockStarted) return
  try {
    player?.play(cue, options)
  } catch {
    // Audio is a decoration: a missing device must never break the launcher.
  }
}

/**
 * Toggling sounds off must not clip the "off" cue that is still ringing, so
 * the player is muted a beat later. The local flag stops new cues at once.
 */
export function applyUISoundEnabled(value: boolean): void {
  enabled = value
  if (muteTimer !== null) {
    window.clearTimeout(muteTimer)
    muteTimer = null
  }
  if (!player) return
  if (value) {
    player.setEnabled(true)
    return
  }
  muteTimer = window.setTimeout(() => {
    muteTimer = null
    player?.setEnabled(false)
  }, 400)
}
