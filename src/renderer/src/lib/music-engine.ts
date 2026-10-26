import type { MusicPlaybackStatus, MusicRepeat, MusicTrack } from '@shared/types'
import { nextIndex, previousIndex, trackIndexById } from './music-queue'

export interface MusicEngineState {
  track: MusicTrack | null
  status: MusicPlaybackStatus
  positionMs: number
  durationMs: number
  volume: number
  repeat: MusicRepeat
  shuffle: boolean
  error: string | null
}

const STORAGE_KEY = 'pulse.music.prefs'
const DEFAULT_VOLUME = 0.8

interface StoredPrefs {
  volume: number
  repeat: MusicRepeat
  shuffle: boolean
}

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_VOLUME
  return Math.min(1, Math.max(0, value))
}

function readPrefs(): StoredPrefs {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { volume: DEFAULT_VOLUME, repeat: 'off', shuffle: false }
    const parsed = JSON.parse(raw) as Partial<StoredPrefs>
    const repeat: MusicRepeat =
      parsed.repeat === 'all' || parsed.repeat === 'one' || parsed.repeat === 'off'
        ? parsed.repeat
        : 'off'
    return {
      volume: clampVolume(typeof parsed.volume === 'number' ? parsed.volume : DEFAULT_VOLUME),
      repeat,
      shuffle: parsed.shuffle === true,
    }
  } catch {
    return { volume: DEFAULT_VOLUME, repeat: 'off', shuffle: false }
  }
}

/**
 * One `<audio>` element for the whole renderer.
 *
 * The engine is a plain module rather than a store so the overlay window, the
 * music page, and the keyboard shortcuts all read the same playback position
 * without a second copy drifting out of sync.
 */
class MusicEngine {
  private audio: HTMLAudioElement | null = null
  private library: MusicTrack[] = []
  private listeners = new Set<(state: MusicEngineState) => void>()
  private state: MusicEngineState
  private prefs: StoredPrefs

  constructor() {
    this.prefs = readPrefs()
    this.state = {
      track: null,
      status: 'idle',
      positionMs: 0,
      durationMs: 0,
      volume: this.prefs.volume,
      repeat: this.prefs.repeat,
      shuffle: this.prefs.shuffle,
      error: null,
    }
  }

  subscribe = (listener: (state: MusicEngineState) => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getState = (): MusicEngineState => this.state

  /** Reconciles the queue with a scan. The current track keeps playing. */
  setLibrary(tracks: MusicTrack[]): void {
    this.library = tracks
    const current = this.state.track
    if (!current) return
    const fresh = tracks.find((track) => track.id === current.id)
    if (!fresh) {
      this.stop()
      return
    }
    if (fresh !== current) {
      this.patch({ track: fresh })
    }
  }

  playTrack(track: MusicTrack): void {
    this.startTrack(track)
  }

  /** Plays the first track when nothing is selected, which is what Play means on an empty player. */
  toggle(): void {
    if (!this.state.track) {
      const first = this.library[0]
      if (first) this.startTrack(first)
      return
    }
    if (this.state.status === 'playing') {
      this.audio?.pause()
      return
    }
    void this.resume()
  }

  async resume(): Promise<void> {
    if (!this.audio || !this.state.track) {
      this.toggle()
      return
    }
    try {
      await this.audio.play()
    } catch (error) {
      this.patch({
        status: 'error',
        error: error instanceof Error ? error.message : 'Could not start playback.',
      })
    }
  }

  pause(): void {
    this.audio?.pause()
  }

  next(): void {
    const index = trackIndexById(this.library, this.state.track?.id ?? null)
    const target = nextIndex(this.library.length, index, {
      repeat: this.state.repeat,
      shuffle: this.state.shuffle,
    })
    if (target === null) {
      this.audio?.pause()
      return
    }
    const track = this.library[target]
    if (track) this.startTrack(track)
  }

  previous(): void {
    const index = trackIndexById(this.library, this.state.track?.id ?? null)
    // A press after the first few seconds restarts the song, like every other player.
    if (this.audio && this.audio.currentTime > 3) {
      this.seek(0)
      return
    }
    const target = previousIndex(this.library.length, index, {
      repeat: this.state.repeat,
      shuffle: this.state.shuffle,
    })
    if (target === null) return
    const track = this.library[target]
    if (track) this.startTrack(track)
  }

  seek(positionMs: number): void {
    const audio = this.audio
    if (!audio) return
    const duration = Number.isFinite(audio.duration) ? audio.duration * 1000 : this.state.durationMs
    const clamped = Math.min(Math.max(0, positionMs), Math.max(0, duration - 250))
    try {
      audio.currentTime = clamped / 1000
      this.patch({ positionMs: clamped })
    } catch {
      // Seeking before metadata loads throws; the next timeupdate fixes the UI.
    }
  }

  setVolume(volume: number): void {
    const value = clampVolume(volume)
    this.prefs = { ...this.prefs, volume: value }
    this.persist()
    if (this.audio) this.audio.volume = value
    this.patch({ volume: value })
  }

  setRepeat(repeat: MusicRepeat): void {
    this.prefs = { ...this.prefs, repeat }
    this.persist()
    this.patch({ repeat })
  }

  setShuffle(shuffle: boolean): void {
    this.prefs = { ...this.prefs, shuffle }
    this.persist()
    this.patch({ shuffle })
  }

  stop(): void {
    this.audio?.pause()
    this.patch({ track: null, status: 'idle', positionMs: 0, durationMs: 0, error: null })
  }

  private startTrack(track: MusicTrack): void {
    const audio = this.ensureAudio()
    this.patch({
      track,
      status: 'loading',
      positionMs: 0,
      durationMs: track.durationMs,
      error: null,
    })
    audio.src = track.streamUrl
    audio.volume = this.state.volume
    audio.load()
    void this.resume()
  }

  private ensureAudio(): HTMLAudioElement {
    if (this.audio) return this.audio

    const audio = new Audio()
    audio.preload = 'metadata'
    audio.volume = this.state.volume

    audio.addEventListener('loadedmetadata', () => {
      const duration = Number.isFinite(audio.duration)
        ? Math.round(audio.duration * 1000)
        : this.state.durationMs
      this.patch({ durationMs: duration > 0 ? duration : this.state.durationMs })
    })
    audio.addEventListener('playing', () => this.patch({ status: 'playing', error: null }))
    audio.addEventListener('pause', () => {
      if (this.state.status === 'playing') this.patch({ status: 'paused' })
    })
    audio.addEventListener('waiting', () => this.patch({ status: 'loading' }))
    audio.addEventListener('timeupdate', () => {
      this.patch({ positionMs: Math.round(audio.currentTime * 1000) })
    })
    audio.addEventListener('ended', () => this.next())
    audio.addEventListener('error', () => {
      this.patch({
        status: 'error',
        error: audio.error?.message || 'This file could not be played.',
      })
    })

    this.audio = audio
    return audio
  }

  private patch(patch: Partial<MusicEngineState>): void {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener(this.state)
  }

  private persist(): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.prefs))
    } catch {
      // A full quota should not stop playback.
    }
  }
}

export const musicEngine = new MusicEngine()

/** True when a track is loaded (playing, paused, loading or failed). */
export function hasTrack(state: MusicEngineState): boolean {
  return state.track !== null
}
