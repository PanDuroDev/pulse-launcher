import type { MusicPlaybackStatus, MusicRepeat, MusicTrack } from '@shared/contracts/music'
import { nextIndex, previousIndex, trackIndexById } from './music-queue'

export interface MusicEngineState {
  track: MusicTrack | null
  status: MusicPlaybackStatus
  positionMs: number
  durationMs: number
  volume: number
  muted: boolean
  repeat: MusicRepeat
  shuffle: boolean
  error: string | null
  /** Video id of the extraction in progress, so the row can offer Cancel. */
  preparingId: string | null
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
  private queue: MusicTrack[] = []
  /**
   * Online results keep their own queue. A local scan or overlay update must
   * never stop an online track just because its id is not in the local library.
   */
  private queueSource: 'library' | 'online' | 'youtube' = 'library'
  private listeners = new Set<(state: MusicEngineState) => void>()
  private state: MusicEngineState
  private prefs: StoredPrefs
  /** Invalidates an in-flight YouTube extraction when the user picks another row. */
  private playToken = 0

  constructor() {
    this.prefs = readPrefs()
    this.state = {
      track: null,
      status: 'idle',
      positionMs: 0,
      durationMs: 0,
      volume: this.prefs.volume,
      muted: false,
      repeat: this.prefs.repeat,
      shuffle: this.prefs.shuffle,
      error: null,
      preparingId: null,
    }
  }

  subscribe = (listener: (state: MusicEngineState) => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getState = (): MusicEngineState => this.state

  /** Reconciles the local queue with a scan. The current track keeps playing. */
  setLibrary(tracks: MusicTrack[]): void {
    this.library = tracks
    if (this.queueSource !== 'library') return
    this.queue = tracks
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
    this.queueSource = 'library'
    this.queue = this.library
    this.startTrack(track)
  }

  /** Plays a search result and keeps the merged online ranking as the queue. */
  playOnlineQueue(tracks: MusicTrack[], track: MusicTrack): void {
    this.queueSource = 'online'
    this.queue = tracks
    this.startTrack(track)
  }

  /** YouTube rows are unresolved until the first play extracts their MP3. */
  playYouTubeQueue(tracks: MusicTrack[], track: MusicTrack): void {
    this.queueSource = 'youtube'
    this.queue = tracks
    this.startTrack(track)
  }

  /**
   * The unified search mixes local files, online streams, and unresolved
   * YouTube rows in one queue, so next/previous can cross all three sources.
   */
  playMixedQueue(tracks: MusicTrack[], track: MusicTrack): void {
    this.queueSource = track.youtubeId ? 'youtube' : 'online'
    this.queue = tracks
    this.startTrack(track)
  }

  /** Plays the first track when nothing is selected, which is what Play means on an empty player. */
  toggle(): void {
    if (!this.state.track) {
      const queue = this.activeQueue()
      const first = queue[0]
      if (first) {
        if (!this.queue.includes(first)) this.queueSource = 'library'
        this.startTrack(first)
      }
      return
    }
    if (!this.state.track.streamUrl) {
      this.startTrack(this.state.track)
      return
    }
    if (this.state.status === 'playing') {
      this.audio?.pause()
      return
    }
    void this.resume()
  }

  async resume(): Promise<void> {
    if (!this.state.track) {
      this.toggle()
      return
    }
    if (!this.state.track.streamUrl) {
      this.startTrack(this.state.track)
      return
    }
    if (!this.audio) {
      this.startTrack(this.state.track)
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
    const queue = this.activeQueue()
    const index = trackIndexById(queue, this.state.track?.id ?? null)
    const target = nextIndex(queue.length, index, {
      repeat: this.state.repeat,
      shuffle: this.state.shuffle,
    })
    if (target === null) {
      this.audio?.pause()
      return
    }
    const track = queue[target]
    if (track) this.startTrack(track)
  }

  previous(): void {
    const queue = this.activeQueue()
    const index = trackIndexById(queue, this.state.track?.id ?? null)
    // A press after the first few seconds restarts the song, like every other player.
    if (this.audio && this.audio.currentTime > 3) {
      this.seek(0)
      return
    }
    const target = previousIndex(queue.length, index, {
      repeat: this.state.repeat,
      shuffle: this.state.shuffle,
    })
    if (target === null) return
    const track = queue[target]
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
    const muted = value > 0 ? false : this.state.muted
    this.prefs = { ...this.prefs, volume: value }
    this.persist()
    if (this.audio) this.audio.volume = muted ? 0 : value
    this.patch({ volume: value, muted })
  }

  toggleMute(): void {
    const muted = !this.state.muted
    if (this.audio) this.audio.volume = muted ? 0 : this.state.volume
    this.patch({ muted })
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
    this.playToken += 1
    this.cancelPreparing()
    this.audio?.pause()
    this.patch({
      track: null,
      status: 'idle',
      positionMs: 0,
      durationMs: 0,
      error: null,
      preparingId: null,
    })
  }

  /**
   * Stops the extraction started by the current row. The main process kills the
   * yt-dlp/ffmpeg process tree, so this is a real cancel and not just a hidden
   * progress indicator.
   */
  cancelPreparing(): void {
    const videoId = this.state.preparingId
    if (!videoId) return
    this.playToken += 1
    void window.launcher.music.youtube.cancel(videoId).catch(() => undefined)
    this.patch({
      status: 'paused',
      error: null,
      preparingId: null,
      positionMs: 0,
    })
  }

  private activeQueue(): MusicTrack[] {
    if (
      (this.queueSource === 'online' || this.queueSource === 'youtube') &&
      this.queue.length > 0
    ) {
      return this.queue
    }
    return this.library
  }

  private startTrack(track: MusicTrack): void {
    const token = ++this.playToken
    // Choosing another row must stop the previous extraction, otherwise both
    // downloads run in parallel and the user pays twice for one listen.
    const pending = this.state.preparingId
    if (pending && pending !== track.youtubeId) {
      void window.launcher.music.youtube.cancel(pending).catch(() => undefined)
    }
    if (track.youtubeId && !track.streamUrl) {
      this.patch({
        track,
        status: 'loading',
        positionMs: 0,
        durationMs: track.durationMs,
        error: null,
        preparingId: track.youtubeId,
      })
      // Search rows intentionally carry no stream URL. The main process
      // downloads and converts the MP3 once, then the resolved track joins the
      // queue so next/previous do not extract it again.
      void window.launcher.music.youtube
        .resolve(track.youtubeId)
        .then((result) => {
          if (this.playToken !== token) return
          this.patch({ preparingId: null })
          if (!result.ok || !result.track) {
            this.patch({
              status: 'error',
              error: result.error ?? 'The YouTube audio could not be prepared.',
            })
            return
          }
          const resolved = result.track
          this.queue = this.queue.map((entry) =>
            entry.id === resolved.id ? resolved : entry,
          )
          this.startResolvedTrack(resolved)
        })
        .catch((error: unknown) => {
          if (this.playToken !== token) return
          this.patch({
            status: 'error',
            preparingId: null,
            error:
              error instanceof Error
                ? error.message
                : 'The YouTube audio could not be prepared.',
          })
        })
      return
    }
    this.startResolvedTrack(track)
  }

  private startResolvedTrack(track: MusicTrack): void {
    if (!track.streamUrl) {
      this.patch({ track, status: 'error', error: 'The audio file is not ready yet.' })
      return
    }
    const audio = this.ensureAudio()
    this.patch({
      track,
      status: 'loading',
      positionMs: 0,
      durationMs: track.durationMs,
      error: null,
      preparingId: null,
    })
    audio.src = track.streamUrl
    audio.volume = this.state.muted ? 0 : this.state.volume
    audio.load()
    void this.resume()
  }

  private ensureAudio(): HTMLAudioElement {
    if (this.audio) return this.audio

    const audio = new Audio()
    audio.preload = 'metadata'
    audio.volume = this.state.muted ? 0 : this.state.volume

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
        error: audio.error?.message || 'This track could not be played.',
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
