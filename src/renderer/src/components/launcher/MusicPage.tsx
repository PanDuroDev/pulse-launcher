import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ArrowLeftFilled,
  FolderOpenFilled,
  MiniplayerFilled,
  MusicFilled,
  PauseFilled,
  PlayFilled,
  Refresh2Filled,
  RepeatFilled,
  RepeatOneFilled,
  SearchFilled,
  ShuffleFilled,
  SkipForwardFilled,
  SkipPreviousFilled,
  VolumeFilled,
  VolumeMuteFilled,
} from '@mingcute/react/core-filled'
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation-react'
import { pause, resume } from '@noriginmedia/norigin-spatial-navigation-core'
import type { MusicTrack } from '@shared/types'
import { uiAccent } from '@/lib/accent'
import { musicEngine } from '@/lib/music-engine'
import { filterTracks, formatDuration, progressRatio } from '@/lib/music-queue'
import { useMusicEngineState } from '@/hooks/use-music-engine'
import { useMusicStore } from '@/store/music'
import { cn } from 'cn'

const BACK_KEY = 'music-back'
const FILTER_KEY = 'music-filter'
const ADD_KEY = 'music-add-folder'
const RESCAN_KEY = 'music-rescan'
const OVERLAY_PREVIEW_KEY = 'music-overlay-preview'
const OVERLAY_SWITCH_KEY = 'music-overlay-switch'
const PLAY_KEY = 'music-play'
const PREVIOUS_KEY = 'music-previous'
const NEXT_KEY = 'music-next'
const REPEAT_KEY = 'music-repeat'
const SHUFFLE_KEY = 'music-shuffle'
const VOLUME_KEY = 'music-volume'
const SEEK_KEY = 'music-seek'

const trackKey = (trackId: string): string => `music-track-${trackId}`

interface MusicPageProps {
  onBack: () => void
}

interface ToolProps {
  focusKey: string
  label: string
  icon: ReactNode
  onClick: () => void
  active?: boolean
  disabled?: boolean
}

function Tool({ focusKey, label, icon, onClick, active, disabled }: ToolProps) {
  const { ref, focused } = useFocusable<Record<string, never>, HTMLButtonElement>({
    focusKey,
    accessibilityLabel: label,
    // Spatial navigation fires this directly, so a disabled tool needs the same
    // guard the browser gives a disabled button.
    onEnterPress: () => {
      if (!disabled) onClick()
    },
  })

  return (
    <button
      ref={ref}
      type="button"
      tabIndex={-1}
      data-focus-key={focusKey}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[0.72rem] font-medium outline-none transition-colors',
        disabled && 'cursor-not-allowed opacity-35',
        focused && !disabled
          ? 'bg-white text-black'
          : active
            ? 'bg-white/12 text-white ring-1 ring-white/20'
            : 'bg-white/5 text-white/65 ring-1 ring-white/12 hover:bg-white/10 hover:text-white',
      )}
      style={focused && !disabled ? { boxShadow: `0 0 0 2px ${uiAccent(0.7)}` } : undefined}
    >
      {icon}
      {label}
    </button>
  )
}

interface TransportProps {
  focusKey: string
  label: string
  onClick: () => void
  children: ReactNode
  primary?: boolean
  active?: boolean
}

function Transport({ focusKey, label, onClick, children, primary, active }: TransportProps) {
  const { ref, focused } = useFocusable<Record<string, never>, HTMLButtonElement>({
    focusKey,
    accessibilityLabel: label,
    onEnterPress: onClick,
  })

  return (
    <button
      ref={ref}
      type="button"
      tabIndex={-1}
      data-focus-key={focusKey}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'grid place-items-center rounded-full outline-none transition-all duration-200',
        primary ? 'size-14' : 'size-11',
        focused
          ? 'scale-[1.04] bg-white text-black'
          : primary
            ? 'bg-white/12 text-white hover:bg-white/20'
            : 'bg-white/6 text-white/75 hover:bg-white/12 hover:text-white',
        active && !focused && 'text-white ring-1 ring-white/25',
      )}
      style={focused ? { boxShadow: `0 0 0 2px ${uiAccent(0.75)}` } : undefined}
    >
      {children}
    </button>
  )
}

function Cover({ track, size }: { track: MusicTrack | null; size: string }) {
  if (track?.artworkUrl) {
    return (
      <img
        src={track.artworkUrl}
        alt=""
        draggable={false}
        className={cn('shrink-0 rounded-xl object-cover', size)}
      />
    )
  }
  return (
    <div
      className={cn(
        'grid shrink-0 place-items-center rounded-xl bg-white/6 text-white/30 ring-1 ring-white/10',
        size,
      )}
    >
      <MusicFilled className="size-5" />
    </div>
  )
}

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

export function MusicPage({ onBack }: MusicPageProps) {
  const tracks = useMusicStore((state) => state.tracks)
  const folders = useMusicStore((state) => state.folders)
  const scanning = useMusicStore((state) => state.scanning)
  const scannedFiles = useMusicStore((state) => state.scannedFiles)
  const scanError = useMusicStore((state) => state.scanError)
  const loading = useMusicStore((state) => state.loading)
  const overlay = useMusicStore((state) => state.overlay)
  const addFolder = useMusicStore((state) => state.addFolder)
  const rescan = useMusicStore((state) => state.rescan)
  const updateOverlay = useMusicStore((state) => state.updateOverlay)
  const toggleOverlay = useMusicStore((state) => state.toggleOverlay)

  const playback = useMusicEngineState()
  const [query, setQuery] = useState('')
  const visible = useMemo(() => filterTracks(tracks, query), [tracks, query])

  const listRef = useRef<HTMLDivElement>(null)
  const { ref: backRef, focused: backFocused } = useFocusable<
    Record<string, never>,
    HTMLButtonElement
  >({
    focusKey: BACK_KEY,
    accessibilityLabel: 'Back to library',
    onEnterPress: onBack,
  })

  const { ref: filterRef, focused: filterFocused } = useFocusable<
    Record<string, never>,
    HTMLInputElement
  >({
    focusKey: FILTER_KEY,
    accessibilityLabel: 'Filter music',
    onEnterPress: () => filterRef.current?.focus(),
  })

  // Typing must not be interpreted as spatial navigation, exactly like the
  // library search field.
  useEffect(() => {
    const isTyping = (target: EventTarget | null): boolean =>
      target instanceof HTMLElement &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
    let paused = false
    const onFocusIn = (event: FocusEvent): void => {
      if (!isTyping(event.target) || paused) return
      pause()
      paused = true
    }
    const onFocusOut = (event: FocusEvent): void => {
      if (!isTyping(event.target) || !paused) return
      if (isTyping(event.relatedTarget)) return
      resume()
      paused = false
    }
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      if (paused) resume()
    }
  }, [])

  const play = useCallback((track: MusicTrack) => {
    musicEngine.playTrack(track)
  }, [])

  const playing = playback.status === 'playing'

  return (
    <section data-music-page="" className="flex min-h-0 flex-1 flex-col">
      <h1 className="sr-only">Music</h1>

      <div className="flex items-center gap-4 px-[6vw] pt-6">
        <button
          ref={backRef}
          type="button"
          tabIndex={-1}
          data-focus-key={BACK_KEY}
          aria-label="Back to library"
          onClick={onBack}
          className={cn(
            'inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-[0.78rem] font-medium outline-none transition-colors',
            backFocused
              ? 'bg-white text-black'
              : 'bg-white/5 text-white/65 ring-1 ring-white/12 hover:bg-white/10 hover:text-white',
          )}
          style={backFocused ? { boxShadow: `0 0 0 2px ${uiAccent(0.7)}` } : undefined}
        >
          <ArrowLeftFilled className="size-4" />
          Library
        </button>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Tool
            focusKey={ADD_KEY}
            label="Add folder"
            icon={<FolderOpenFilled className="size-4" />}
            onClick={() => void addFolder()}
          />
          <Tool
            focusKey={RESCAN_KEY}
            label={scanning ? 'Scanning' : 'Rescan'}
            icon={<Refresh2Filled className={cn('size-4', scanning && 'animate-spin')} />}
            onClick={() => void rescan()}
            disabled={scanning}
          />
          <Tool
            focusKey={OVERLAY_PREVIEW_KEY}
            label="Preview"
            icon={<MiniplayerFilled className="size-4" />}
            onClick={() => void toggleOverlay()}
            disabled={!overlay || !overlay.enabled}
          />
        </div>
      </div>

      <div className="mt-5 flex min-h-0 flex-1 gap-6 px-[6vw] pb-8">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-[1.35rem] border border-white/10 bg-black/30 backdrop-blur-xl">
          <div
            className={cn(
              'flex items-center gap-3 border-b px-4 py-3 transition-colors',
              filterFocused ? 'border-white/25' : 'border-white/8',
            )}
          >
            <SearchFilled className="size-4 shrink-0 text-white/35" />
            <input
              ref={filterRef}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by title, artist, or album"
              aria-label="Filter music"
              autoComplete="off"
              spellCheck={false}
              data-focus-key={FILTER_KEY}
              className="h-7 min-w-0 flex-1 bg-transparent text-[0.82rem] text-white outline-none placeholder:text-white/30"
            />
            <span className="shrink-0 text-[0.68rem] tabular-nums text-white/40">
              {visible.length} / {tracks.length}
            </span>
          </div>

          <div ref={listRef} className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
            {loading ? (
              <p className="px-3 py-6 text-[0.8rem] text-white/45">Reading your music library…</p>
            ) : tracks.length === 0 ? (
              <div className="px-4 py-10">
                <p className="text-[0.95rem] font-medium text-white">No music yet</p>
                <p className="mt-1.5 max-w-md text-[0.8rem] leading-relaxed text-white/45">
                  Add a folder of MP3, FLAC, M4A, OGG, or WAV files. Pulse reads the tags and
                  embedded covers once, then keeps the index on disk.
                </p>
                <div className="mt-4">
                  <Tool
                    focusKey="music-add-folder-empty"
                    label="Add folder"
                    icon={<FolderOpenFilled className="size-4" />}
                    onClick={() => void addFolder()}
                  />
                </div>
              </div>
            ) : visible.length === 0 ? (
              <p className="px-3 py-6 text-[0.8rem] text-white/45">
                Nothing matches “{query.trim()}”.
              </p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {visible.map((track) => (
                  <TrackRow
                    key={track.id}
                    track={track}
                    current={playback.track?.id === track.id}
                    playing={playing}
                    onPlay={play}
                  />
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-white/8 px-4 py-2.5 text-[0.66rem] text-white/40">
            <span>
              {folders.length === 0
                ? 'No folders added'
                : `${folders.length} ${folders.length === 1 ? 'folder' : 'folders'}`}
              {scanning ? ` · scanning ${scannedFiles} files…` : ''}
              {scanError ? ` · ${scanError}` : ''}
            </span>
            <span>{tracks.length} tracks</span>
          </div>
        </div>

        <aside className="relative isolate flex w-[22rem] shrink-0 flex-col overflow-hidden rounded-[1.35rem] border border-white/10 bg-black/30 p-5 backdrop-blur-xl">
          {/* The cover tints the panel the way the hero tints the library. */}
          {playback.track?.artworkUrl ? (
            <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
              <img
                src={playback.track.artworkUrl}
                alt=""
                draggable={false}
                className="size-full scale-125 object-cover opacity-40 blur-3xl"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/35 to-black/85" />
            </div>
          ) : null}

          <p className="text-[0.64rem] font-medium tracking-[0.16em] text-white/45 uppercase">
            Now playing
          </p>

          {/* A large sleeve is what makes this panel read as a player rather
              than a form: the list already carries the small covers. */}
          <div className="mt-4 flex justify-center">
            <Cover track={playback.track} size="size-64" />
          </div>

          <div className="mt-5 min-w-0 text-center">
            <p className="truncate text-[1.02rem] font-semibold text-white">
              {playback.track?.title ?? 'Nothing playing'}
            </p>
            <p className="mt-1 truncate text-[0.8rem] text-white/55">
              {playback.track?.artist ?? 'Pick a track from the list'}
            </p>
            <p className="mt-0.5 truncate text-[0.7rem] text-white/35">
              {playback.track?.album || ''}
            </p>
          </div>

          <div className="mt-5">
            <SeekBar positionMs={playback.positionMs} durationMs={playback.durationMs} />
          </div>

          <div className="mt-4 flex items-center justify-center gap-3">
            <Transport
              focusKey={PREVIOUS_KEY}
              label="Previous track"
              onClick={() => musicEngine.previous()}
            >
              <SkipPreviousFilled className="size-5" />
            </Transport>
            <Transport
              focusKey={PLAY_KEY}
              label={playing ? 'Pause' : 'Play'}
              onClick={() => musicEngine.toggle()}
              primary
            >
              {playing ? <PauseFilled className="size-6" /> : <PlayFilled className="size-6" />}
            </Transport>
            <Transport focusKey={NEXT_KEY} label="Next track" onClick={() => musicEngine.next()}>
              <SkipForwardFilled className="size-5" />
            </Transport>
          </div>

          <div className="mt-5 flex items-center justify-center gap-2">
            <Transport
              focusKey={SHUFFLE_KEY}
              label={playback.shuffle ? 'Shuffle on' : 'Shuffle off'}
              onClick={() => musicEngine.setShuffle(!playback.shuffle)}
              active={playback.shuffle}
            >
              <ShuffleFilled className="size-4" />
            </Transport>
            <Transport
              focusKey={REPEAT_KEY}
              label={`Repeat ${playback.repeat}`}
              onClick={() =>
                musicEngine.setRepeat(
                  playback.repeat === 'off' ? 'all' : playback.repeat === 'all' ? 'one' : 'off',
                )
              }
              active={playback.repeat !== 'off'}
            >
              {playback.repeat === 'one' ? (
                <RepeatOneFilled className="size-4" />
              ) : (
                <RepeatFilled className="size-4" />
              )}
            </Transport>

            <VolumeControl volume={playback.volume} />
          </div>

          <div className="mt-auto border-t border-white/8 pt-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[0.78rem] font-medium text-white">Desktop overlay</p>
                <p className="mt-0.5 text-[0.68rem] leading-relaxed text-white/40">
                  {overlay?.shortcut
                    ? `Shows over other apps · ${overlay.shortcut} toggles it.`
                    : 'Shows over other apps while music plays.'}
                </p>
              </div>
              <OverlaySwitch
                enabled={overlay?.enabled ?? false}
                disabled={!overlay}
                onToggle={() => void updateOverlay({ enabled: !overlay?.enabled })}
              />
            </div>
          </div>
        </aside>
      </div>
    </section>
  )
}

interface TrackRowProps {
  track: MusicTrack
  current: boolean
  playing: boolean
  onPlay: (track: MusicTrack) => void
}

function TrackRow({ track, current, playing, onPlay }: TrackRowProps) {
  const { ref, focused } = useFocusable<Record<string, never>, HTMLButtonElement>({
    focusKey: trackKey(track.id),
    accessibilityLabel: `${track.title} by ${track.artist}`,
    onEnterPress: () => onPlay(track),
  })

  return (
    <li>
      <button
        ref={ref}
        type="button"
        tabIndex={-1}
        data-focus-key={trackKey(track.id)}
        aria-label={`${track.title} by ${track.artist}`}
        onClick={() => onPlay(track)}
        className={cn(
          'flex w-full items-center gap-3 rounded-xl px-2.5 py-1.5 text-left outline-none transition-colors',
          focused ? 'bg-white text-black' : 'text-white hover:bg-white/6',
        )}
        style={focused ? { boxShadow: `0 0 0 2px ${uiAccent(0.55)}` } : undefined}
      >
        <span className="grid w-3 shrink-0 place-items-center">
          {current ? (
            <MusicFilled
              className={cn('size-3.5', focused ? 'text-black' : playing ? 'text-white' : 'text-white/45')}
            />
          ) : null}
        </span>
        <Cover track={track} size="size-10" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.82rem] font-medium">{track.title}</span>
          <span
            className={cn(
              'mt-0.5 block truncate text-[0.7rem]',
              focused ? 'text-black/60' : 'text-white/45',
            )}
          >
            {track.artist}
            {track.album ? ` · ${track.album}` : ''}
          </span>
        </span>
        <span
          className={cn(
            'shrink-0 text-[0.68rem] tabular-nums',
            focused ? 'text-black/60' : 'text-white/35',
          )}
        >
          {formatDuration(track.durationMs)}
        </span>
      </button>
    </li>
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
        'h-6 w-11 shrink-0 rounded-full p-0.5 outline-none transition-colors',
        disabled && 'cursor-not-allowed opacity-40',
        enabled ? 'bg-white' : 'bg-white/15',
      )}
      style={focused && !disabled ? { boxShadow: `0 0 0 2px ${uiAccent(0.75)}` } : undefined}
    >
      <span
        className={cn(
          'block size-5 rounded-full transition-transform',
          enabled ? 'translate-x-5 bg-black' : 'bg-white/70',
        )}
      />
    </button>
  )
}

function VolumeControl({ volume }: { volume: number }) {
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

  return (
    <div
      ref={ref}
      tabIndex={-1}
      data-focus-key={VOLUME_KEY}
      role="slider"
      aria-label="Volume"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(volume * 100)}
      className={cn(
        'ml-1 flex h-11 items-center gap-2 rounded-full px-3 transition-colors',
        focused ? 'bg-white/12' : 'bg-white/5',
      )}
    >
      {volume === 0 ? (
        <VolumeMuteFilled className="size-4 text-white/60" />
      ) : (
        <VolumeFilled className="size-4 text-white/60" />
      )}
      <span className="relative block h-1 w-16 overflow-hidden rounded-full bg-white/15">
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-white/70"
          style={{ width: `${Math.round(volume * 100)}%` }}
        />
      </span>
    </div>
  )
}
