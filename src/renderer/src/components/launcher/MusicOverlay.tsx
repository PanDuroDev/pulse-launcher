import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  CloseFilled,
  MusicFilled,
  PauseFilled,
  PlayFilled,
  SkipForwardFilled,
  SkipPreviousFilled,
  VolumeFilled,
  VolumeMuteFilled,
} from '@mingcute/react/core-filled'
import type { MusicOverlayAction, MusicOverlayState } from '@shared/types'
import { formatDuration, progressRatio } from '@/lib/music-queue'
import { uiAccent } from '@/lib/accent'
import { cn } from '@/lib/utils'

const EMPTY_STATE: MusicOverlayState = {
  status: 'idle',
  track: null,
  positionMs: 0,
  durationMs: 0,
  volume: 0.8,
  muted: false,
  repeat: 'off',
  shuffle: false,
}

interface OverlayButtonProps {
  label: string
  onClick: () => void
  children: ReactNode
  primary?: boolean
  className?: string
}

function OverlayButton({ label, onClick, children, primary, className }: OverlayButtonProps) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'no-drag grid shrink-0 place-items-center rounded-full text-white outline-none transition-colors',
        // 44 px is the smallest target that stays comfortable on a TV remote
        // and at a distance; the primary button gets extra weight instead.
        primary
          ? 'size-11 bg-white/15 hover:bg-white/25'
          : 'size-11 hover:bg-white/12',
        className,
      )}
    >
      {children}
    </button>
  )
}

interface SeekBarProps {
  positionMs: number
  durationMs: number
  onSeek: (positionMs: number) => void
}

function SeekBar({ positionMs, durationMs, onSeek }: SeekBarProps) {
  const ratio = progressRatio(positionMs, durationMs)

  return (
    <div
      role="slider"
      tabIndex={-1}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(ratio * 100)}
      onClick={(event) => {
        if (durationMs <= 0) return
        const rect = event.currentTarget.getBoundingClientRect()
        if (rect.width <= 0) return
        const next = ((event.clientX - rect.left) / rect.width) * durationMs
        onSeek(Math.max(0, Math.min(durationMs, Math.round(next))))
      }}
      className="relative flex h-5 flex-1 cursor-pointer items-center"
    >
      <span className="absolute inset-x-0 h-1 overflow-hidden rounded-full bg-white/10">
        <span
          className="block h-full rounded-full transition-[width] duration-[--duration-focus]"
          style={{ width: `${Math.round(ratio * 100)}%`, background: uiAccent(0.95) }}
        />
      </span>
    </div>
  )
}

function sourceLine(state: MusicOverlayState): string {
  if (state.status === 'loading') return 'Loading…'
  if (state.status === 'error') return 'Playback error'
  if (!state.track) return 'Start a track in Pulse'

  const kind =
    state.track.streamKind === 'preview'
      ? 'Preview'
      : state.track.streamKind === 'full'
        ? 'Full track'
        : null
  const parts = [
    state.track.provider === 'youtube' ? 'YouTube' : null,
    kind,
    state.track.publisher,
    state.track.license,
    state.repeat !== 'off' ? `Repeat ${state.repeat}` : null,
    state.shuffle ? 'Shuffle' : null,
  ].filter((part): part is string => Boolean(part))

  return parts.length > 0 ? parts.join(' · ') : 'Local library'
}

export function MusicOverlay() {
  const [state, setState] = useState<MusicOverlayState>(EMPTY_STATE)
  const [drift, setDrift] = useState(0)
  const anchorRef = useRef(0)

  const resetTo = useCallback((next: MusicOverlayState) => {
    anchorRef.current = Date.now()
    setDrift(0)
    setState(next)
  }, [])

  useEffect(() => {
    let alive = true
    void window.launcher.music.overlay
      .state()
      .then((initial) => {
        if (alive && initial) resetTo(initial)
      })
      .catch(() => undefined)
    const unsubscribe = window.launcher.music.overlay.onState((next) => {
      anchorRef.current = Date.now()
      setDrift(0)
      setState(next)
    })
    return () => {
      alive = false
      unsubscribe()
    }
  }, [resetTo])

  useEffect(() => {
    if (state.status !== 'playing') return
    const timer = window.setInterval(() => {
      setDrift(Date.now() - anchorRef.current)
    }, 500)
    return () => window.clearInterval(timer)
  }, [state.status, state.positionMs])

  const send = useCallback((action: MusicOverlayAction) => {
    window.launcher.music.action(action)
  }, [])

  const playing = state.status === 'playing'
  const positionMs = playing
    ? Math.min(state.durationMs, state.positionMs + drift)
    : state.positionMs
  const positionRef = useRef(positionMs)

  useEffect(() => {
    positionRef.current = positionMs
  }, [positionMs])

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
        send({ type: 'seek', positionMs: Math.max(0, positionRef.current - 5_000) })
        return
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        send({ type: 'seek', positionMs: positionRef.current + 5_000 })
        return
      }
      if (event.key.toLowerCase() === 'm') {
        event.preventDefault()
        send({ type: 'toggle-mute' })
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [send])

  const title = state.track?.title ?? 'Pulse Launcher'
  const artist = state.track?.artist ?? 'Nothing playing'
  const source = sourceLine(state)
  const muted = state.muted || state.volume === 0

  return (
    // The window is exactly the card, so there is no transparent ring for the
    // desktop to show through and no padding for a shadow to paint a dark halo
    // on the screen behind it. The card edge is the window edge.
    <div className="h-screen w-screen overflow-hidden">
      {/* Fully opaque on purpose: a translucent card with backdrop blur let the
          wallpaper and the game bleed through the overlay, which is exactly
          what makes a desktop widget look cheap. */}
      <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[1.25rem] bg-[#0b0b10] ring-1 ring-white/12">
        <div className="flex min-h-0 flex-1 items-center gap-3 px-3 pt-2.5">
          <button
            type="button"
            tabIndex={-1}
            aria-label="Open Pulse Launcher"
            onClick={() => send({ type: 'focus' })}
            className="no-drag size-14 shrink-0 overflow-hidden rounded-xl bg-white/8 ring-1 ring-white/10 outline-none transition-transform hover:scale-[1.03]"
          >
            {state.track?.artworkUrl ? (
              <img
                src={state.track.artworkUrl}
                alt=""
                draggable={false}
                className="size-full object-cover"
              />
            ) : (
              <span className="grid size-full place-items-center text-white/30">
                <MusicFilled className="size-6" />
              </span>
            )}
          </button>

          <div className="drag min-w-0 flex-1 select-none">
            <p
              dir="auto"
              title={title}
              className="truncate text-body font-semibold leading-tight text-white"
            >
              {title}
            </p>
            <p
              dir="auto"
              title={artist}
              className="mt-0.5 truncate text-caption leading-tight text-white/65"
            >
              {artist}
            </p>
            <p
              dir="auto"
              title={source}
              aria-live="polite"
              className="mt-1 flex items-center gap-1.5 truncate text-caption leading-tight text-white/55"
            >
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{
                  background:
                    state.status === 'playing' ? uiAccent(0.95) : 'rgba(255,255,255,0.28)',
                }}
              />
              <span className="truncate">{source}</span>
            </p>
          </div>

          <div className="no-drag flex shrink-0 items-center gap-1">
            <OverlayButton label="Previous track" onClick={() => send({ type: 'previous' })}>
              <SkipPreviousFilled className="size-4" />
            </OverlayButton>
            <OverlayButton
              label={playing ? 'Pause' : 'Play'}
              primary
              onClick={() => send({ type: 'toggle-play' })}
            >
              {playing ? <PauseFilled className="size-4" /> : <PlayFilled className="size-4" />}
            </OverlayButton>
            <OverlayButton label="Next track" onClick={() => send({ type: 'next' })}>
              <SkipForwardFilled className="size-4" />
            </OverlayButton>
            <OverlayButton
              label="Close overlay"
              onClick={() => send({ type: 'close' })}
              className="text-white/65 hover:text-white"
            >
              <CloseFilled className="size-3.5" />
            </OverlayButton>
          </div>
        </div>

        <div className="no-drag flex items-center gap-2 px-3 pb-2">
          <button
            type="button"
            tabIndex={-1}
            aria-label={muted ? 'Unmute' : 'Mute'}
            aria-pressed={muted}
            onClick={() => send({ type: 'toggle-mute' })}
            className="grid size-11 shrink-0 place-items-center rounded-full text-white/70 transition-colors hover:bg-white/12 hover:text-white"
          >
            {muted ? <VolumeMuteFilled className="size-3.5" /> : <VolumeFilled className="size-3.5" />}
          </button>
          <span className="w-8 text-right text-caption tabular-nums text-white/55">
            {formatDuration(positionMs)}
          </span>
          <SeekBar
            positionMs={positionMs}
            durationMs={state.durationMs}
            onSeek={(next) => send({ type: 'seek', positionMs: next })}
          />
          <span className="w-8 text-caption tabular-nums text-white/45">
            {formatDuration(state.durationMs)}
          </span>
        </div>
      </div>
    </div>
  )
}
