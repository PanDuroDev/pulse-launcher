import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  CloseFilled,
  MusicFilled,
  PauseFilled,
  PlayFilled,
  SkipForwardFilled,
  SkipPreviousFilled,
} from '@mingcute/react/core-filled'
import type { MusicOverlayState } from '@shared/types'
import { formatDuration, progressRatio } from '@/lib/music-queue'
import { uiAccent } from '@/lib/accent'
import { cn } from 'cn'

const EMPTY_STATE: MusicOverlayState = {
  status: 'idle',
  track: null,
  positionMs: 0,
  durationMs: 0,
  volume: 0.8,
  repeat: 'off',
  shuffle: false,
}

/**
 * The always-on-top card. It owns no audio and no queue: every button becomes a
 * `music:overlay-action`, and the launcher window answers by pushing a new state.
 */
export function MusicOverlay() {
  const [model, setModel] = useState<{ state: MusicOverlayState; anchor: number; drift: number }>({
    state: EMPTY_STATE,
    anchor: 0,
    drift: 0,
  })
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    const accept = (next: MusicOverlayState): void => {
      setModel({ state: next, anchor: Date.now(), drift: 0 })
    }
    const stop = window.launcher.music.overlay.onState(accept)
    window.launcher.music.overlay
      .state()
      .then((initial) => {
        if (!mounted.current || !initial) return
        accept(initial)
      })
      .catch(() => undefined)
    return () => {
      mounted.current = false
      stop()
    }
  }, [])

  const { state } = model
  const playing = state.status === 'playing'

  // The launcher publishes about four times a second; measuring the drift on a
  // timer keeps the bar moving smoothly without an IPC message per frame.
  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => {
      setModel((current) => ({
        ...current,
        drift: Math.max(0, Date.now() - current.anchor),
      }))
    }, 500)
    return () => window.clearInterval(timer)
  }, [playing])

  const positionMs = playing
    ? Math.min(state.durationMs, state.positionMs + model.drift)
    : state.positionMs

  const send = useCallback((action: Parameters<typeof window.launcher.music.action>[0]) => {
    window.launcher.music.action(action)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        send({ type: 'close' })
        return
      }
      if (event.key === ' ') {
        event.preventDefault()
        send({ type: 'toggle-play' })
        return
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        send({ type: 'seek', positionMs: Math.max(0, positionMs - 5_000) })
        return
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        send({ type: 'seek', positionMs: positionMs + 5_000 })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [positionMs, send])

  const ratio = progressRatio(positionMs, state.durationMs)
  const title = state.track?.title ?? 'Nothing playing'
  const artist = state.track?.artist ?? 'Start a track in Pulse'

  return (
    <div className="h-screen w-screen overflow-hidden p-2">
      <div
        data-overlay-card=""
        className="relative flex h-20 w-full items-center gap-3 overflow-hidden rounded-[1.1rem] bg-[#0b0b10]/95 pr-2 pl-2.5 ring-1 ring-white/12 shadow-[0_16px_40px_-14px_rgba(0,0,0,0.9)] backdrop-blur-2xl"
      >
        <button
          type="button"
          tabIndex={-1}
          aria-label="Open Pulse Launcher"
          onClick={() => send({ type: 'focus' })}
          className="no-drag shrink-0 outline-none"
          style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
        >
          {state.track?.artworkUrl ? (
            <img
              src={state.track.artworkUrl}
              alt=""
              draggable={false}
              className="size-13 rounded-xl object-cover ring-1 ring-white/10"
            />
          ) : (
            <span className="grid size-13 place-items-center rounded-xl bg-white/6 text-white/30 ring-1 ring-white/10">
              <MusicFilled className="size-5" />
            </span>
          )}
        </button>

        <div
          className="drag min-w-0 flex-1 select-none"
          style={{ WebkitAppRegion: 'drag' } as CSSProperties}
        >
          <p className="truncate text-[13px] font-semibold leading-tight text-white">{title}</p>
          <p className="mt-0.5 truncate text-[11.5px] leading-tight text-white/55">{artist}</p>
        </div>

        <div className="no-drag flex shrink-0 items-center gap-0.5">
          <OverlayButton
            label="Previous track"
            onClick={() => send({ type: 'previous' })}
          >
            <SkipPreviousFilled className="size-[18px]" />
          </OverlayButton>
          <OverlayButton
            label={playing ? 'Pause' : 'Play'}
            primary
            onClick={() => send({ type: 'toggle-play' })}
          >
            {playing ? <PauseFilled className="size-5" /> : <PlayFilled className="size-5" />}
          </OverlayButton>
          <OverlayButton label="Next track" onClick={() => send({ type: 'next' })}>
            <SkipForwardFilled className="size-[18px]" />
          </OverlayButton>
          <OverlayButton label="Close overlay" onClick={() => send({ type: 'close' })}>
            <CloseFilled className="size-4" />
          </OverlayButton>
        </div>

        <div
          role="progressbar"
          aria-label="Track progress"
          aria-valuemin={0}
          aria-valuemax={Math.round(state.durationMs / 1000)}
          aria-valuenow={Math.round(positionMs / 1000)}
          aria-valuetext={`${formatDuration(positionMs)} of ${formatDuration(state.durationMs)}`}
          className="absolute inset-x-0 bottom-0 h-[3px] bg-white/8"
        >
          <div
            className="h-full rounded-r-full transition-[width] duration-300 ease-linear"
            style={{ width: `${ratio * 100}%`, background: uiAccent(0.95) }}
          />
        </div>
      </div>
    </div>
  )
}

interface OverlayButtonProps {
  label: string
  onClick: () => void
  children: ReactNode
  primary?: boolean
}

function OverlayButton({ label, onClick, children, primary }: OverlayButtonProps) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'no-drag grid place-items-center rounded-full text-white outline-none transition-colors',
        primary ? 'size-8 bg-white/14 hover:bg-white/24' : 'size-7 hover:bg-white/12',
        label === 'Close overlay' && 'text-white/55 hover:text-white',
      )}
      style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
    >
      {children}
    </button>
  )
}
