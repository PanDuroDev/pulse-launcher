import { VolumeFilled, VolumeMuteFilled } from '@mingcute/react/core-filled'
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation-react'
import type { MusicOverlayState } from '@shared/types'
import { formatDuration, progressRatio } from '@/lib/music-queue'
import { uiAccent } from '@/lib/accent'
import { musicEngine } from '@/lib/music-engine'
import { cn } from 'cn'

const OVERLAY_SWITCH_KEY = 'music-overlay-switch'
const VOLUME_KEY = 'music-volume'
const MUTE_KEY = 'music-mute'
const SEEK_KEY = 'music-seek'

function SeekBar({ positionMs, durationMs }: { positionMs: number; durationMs: number }) {
  const ratio = progressRatio(positionMs, durationMs)
  const { ref, focused } = useFocusable<Record<string, never>, HTMLDivElement>({
    focusKey: SEEK_KEY,
    accessibilityLabel: 'Seek within the track',
    onArrowPress: (direction) => {
      if (direction === 'left') {
        musicEngine.seek(positionMs - 5_000)
        return false
      }
      if (direction === 'right') {
        musicEngine.seek(positionMs + 5_000)
        return false
      }
      return true
    },
    onEnterPress: () => undefined,
  })

  return (
    <div
      ref={ref}
      tabIndex={-1}
      data-focus-key={SEEK_KEY}
      role="slider"
      aria-label="Seek within the track"
      aria-valuemin={0}
      aria-valuemax={Math.round(durationMs / 1000)}
      aria-valuenow={Math.round(positionMs / 1000)}
      onClick={(event) => {
        const box = event.currentTarget.getBoundingClientRect()
        if (box.width <= 0) return
        musicEngine.seek(((event.clientX - box.left) / box.width) * durationMs)
      }}
      className="group flex h-6 cursor-pointer items-center"
    >
      <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/12">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-200"
          style={{ width: `${ratio * 100}%`, background: uiAccent(0.95) }}
        />
      </div>
      <span
        className={cn(
          'ml-3 w-20 shrink-0 text-right text-[0.66rem] tabular-nums transition-colors',
          focused ? 'text-white' : 'text-white/45',
        )}
      >
        {formatDuration(positionMs)} / {formatDuration(durationMs)}
      </span>
    </div>
  )
}

function OverlaySwitch({
  enabled,
  disabled,
  onToggle,
}: {
  enabled: boolean
  disabled: boolean
  onToggle: () => void
}) {
  const { ref, focused } = useFocusable<Record<string, never>, HTMLButtonElement>({
    focusKey: OVERLAY_SWITCH_KEY,
    accessibilityLabel: 'Desktop overlay',
    onEnterPress: () => {
      if (!disabled) onToggle()
    },
  })

  return (
    <button
      ref={ref}
      type="button"
      role="switch"
      tabIndex={-1}
      data-focus-key={OVERLAY_SWITCH_KEY}
      aria-checked={enabled}
      aria-label="Desktop overlay"
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        // The visible track stays 44x24; the button keeps a 44x44 hit area so
        // a remote or controller can actually land on it.
        'grid size-11 shrink-0 place-items-center rounded-full outline-none',
        disabled && 'cursor-not-allowed opacity-40',
      )}
      style={focused && !disabled ? { boxShadow: `0 0 0 2px ${uiAccent(0.75)}` } : undefined}
    >
      <span
        className={cn(
          'relative block h-6 w-11 rounded-full p-0.5 transition-colors',
          enabled ? 'bg-white' : 'bg-white/15',
        )}
      >
        <span
          className={cn(
            'block size-5 rounded-full transition-transform',
            enabled ? 'translate-x-5 bg-black' : 'bg-white/70',
          )}
        />
      </span>
    </button>
  )
}

function VolumeControl({ volume, muted }: { volume: number; muted: boolean }) {
  const { ref, focused } = useFocusable<Record<string, never>, HTMLDivElement>({
    focusKey: VOLUME_KEY,
    accessibilityLabel: `Volume ${Math.round(volume * 100)} percent`,
    onArrowPress: (direction) => {
      if (direction === 'left') {
        musicEngine.setVolume(volume - 0.05)
        return false
      }
      if (direction === 'right') {
        musicEngine.setVolume(volume + 0.05)
        return false
      }
      return true
    },
  })
  const { ref: muteRef, focused: muteFocused } = useFocusable<
    Record<string, never>,
    HTMLButtonElement
  >({
    focusKey: MUTE_KEY,
    accessibilityLabel: muted ? 'Unmute' : 'Mute',
    onEnterPress: () => musicEngine.toggleMute(),
  })

  return (
    <div className="ml-1 flex items-center gap-1.5">
      <button
        ref={muteRef}
        type="button"
        tabIndex={-1}
        data-focus-key={MUTE_KEY}
        aria-label={muted ? 'Unmute' : 'Mute'}
        aria-pressed={muted}
        onClick={() => musicEngine.toggleMute()}
        className={cn(
          'grid size-11 shrink-0 place-items-center rounded-full text-white/60 outline-none transition-colors',
          muteFocused ? 'bg-white text-black' : 'bg-white/5 hover:bg-white/10',
        )}
      >
        {muted || volume === 0 ? (
          <VolumeMuteFilled className="size-4" />
        ) : (
          <VolumeFilled className="size-4" />
        )}
      </button>
      <div
        ref={ref}
        tabIndex={-1}
        data-focus-key={VOLUME_KEY}
        role="slider"
        aria-label="Volume"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(volume * 100)}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          if (rect.width <= 0) return
          musicEngine.setVolume((event.clientX - rect.left) / rect.width)
        }}
        className={cn(
          'flex h-11 items-center gap-2 rounded-full px-2.5 transition-colors',
          focused ? 'bg-white/12' : 'bg-white/5',
        )}
      >
        <span className="relative block h-1.5 w-14 overflow-hidden rounded-full bg-white/15">
          <span
            className="absolute inset-y-0 left-0 rounded-full bg-white/70"
            style={{ width: `${Math.round(volume * 100)}%` }}
          />
        </span>
      </div>
    </div>
  )
}
