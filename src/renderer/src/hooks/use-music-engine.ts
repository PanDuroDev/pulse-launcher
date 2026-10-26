import { useEffect, useSyncExternalStore } from 'react'
import type { MusicOverlayState, MusicTrack } from '@shared/types'
import { musicEngine } from '@/lib/music-engine'
import type { MusicEngineState } from '@/lib/music-engine'

/** Playback state, shared by the music page, the hint bar and keyboard shortcuts. */
export function useMusicEngineState(): MusicEngineState {
  return useSyncExternalStore(musicEngine.subscribe, musicEngine.getState, musicEngine.getState)
}

export function toOverlayState(state: MusicEngineState): MusicOverlayState {
  return {
    status: state.status,
    track: state.track
      ? {
          id: state.track.id,
          title: state.track.title,
          artist: state.track.artist,
          album: state.track.album,
          artworkUrl: state.track.artworkUrl,
        }
      : null,
    positionMs: state.positionMs,
    durationMs: state.durationMs,
    volume: state.volume,
    repeat: state.repeat,
    shuffle: state.shuffle,
  }
}

/**
 * Mounted once by `App`. It keeps the engine's queue in sync with the scanned
 * library, mirrors playback into the always-on-top overlay, and applies the
 * actions the overlay sends back.
 */
export function useMusicEngine(tracks: MusicTrack[], enabled: boolean): void {
  useEffect(() => {
    musicEngine.setLibrary(tracks)
  }, [tracks])

  useEffect(() => {
    if (!enabled) return

    const publish = (state: MusicEngineState): void => {
      window.launcher.music.overlay.publish(toOverlayState(state))
    }
    publish(musicEngine.getState())
    const unsubscribe = musicEngine.subscribe(publish)

    const stopCommands = window.launcher.music.overlay.onCommand((command) => {
      switch (command.type) {
        case 'toggle-play':
          musicEngine.toggle()
          break
        case 'next':
          musicEngine.next()
          break
        case 'previous':
          musicEngine.previous()
          break
        case 'seek':
          musicEngine.seek(command.positionMs)
          break
        case 'focus':
          // Main focuses the launcher window itself; nothing to play here.
          break
      }
    })

    return () => {
      unsubscribe()
      stopCommands()
    }
  }, [enabled])
}
