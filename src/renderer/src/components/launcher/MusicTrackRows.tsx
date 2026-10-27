import { ExternalLinkFilled, MusicFilled, YoutubeFilled } from '@mingcute/react/core-filled'
import { useState } from 'react'
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation-react'
import type { MusicOnlineTrack, MusicProvider, MusicTrack, MusicYouTubeTrack } from '@shared/types'
import { formatDuration, trackSource } from '@/lib/music-queue'
import type { MusicSourceFilter } from '@/lib/music-queue'

type SourceFilter = MusicSourceFilter
import { uiAccent } from '@/lib/accent'
import { cn } from 'cn'

const YOUTUBE_CANCEL_KEY = 'music-youtube-cancel'
const YOUTUBE_WATCH_KEY = 'music-youtube-watch'
const trackKey = (trackId: string): string => `music-track-${trackId}`
const youtubeLinkKey = (videoId: string): string => `music-youtube-link-${videoId}`

export const PROVIDER_LABELS: Record<MusicProvider, string> = {
  itunes: 'iTunes',
  deezer: 'Deezer',
  audius: 'Audius',
  openverse: 'Openverse',
  archive: 'Archive',
  youtube: 'YouTube',
}

export const SOURCE_LABELS: Record<SourceFilter, string> = {
  all: 'All',
  library: 'Library',
  online: 'Online',
  youtube: 'YouTube',
}

function Cover({ track, size }: { track: MusicTrack | null; size: string }) {
  // Remote covers do fail: online-art tokens expire and some YouTube videos
  // have no maxres image. Without this the panel shows a broken image box
  // instead of the music placeholder, and the user cannot tell why.
  //
  // Tracking the failed URL (not a boolean) means a new track retries on its
  // own: the stored URL no longer matches, so the image is rendered again.
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const artworkUrl = track?.artworkUrl ?? null
  const failed = artworkUrl !== null && failedUrl === artworkUrl

  if (artworkUrl && !failed) {
    return (
      <img
        src={artworkUrl}
        alt=""
        draggable={false}
        loading="lazy"
        decoding="async"
        onError={() => setFailedUrl(artworkUrl)}
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

interface SourceChipProps {
  focusKey: string
  label: string
  count: number
  active: boolean
  onClick: () => void
}

export function SourceChip({ focusKey, label, count, active, onClick }: SourceChipProps) {
  const { ref, focused } = useFocusable<Record<string, never>, HTMLButtonElement>({
    focusKey,
    accessibilityLabel: `Show ${label} results`,
    onEnterPress: onClick,
  })

  return (
    <button
      ref={ref}
      type="button"
      tabIndex={-1}
      data-focus-key={focusKey}
      aria-pressed={active}
      aria-label={`Show ${label} results`}
      onClick={onClick}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.68rem] font-medium outline-none transition-colors',
        active
          ? 'bg-white text-black'
          : 'bg-white/6 text-white/60 hover:bg-white/12 hover:text-white',
      )}
      style={focused ? { boxShadow: `0 0 0 2px ${uiAccent(0.55)}` } : undefined}
    >
      {label}
      <span className={cn('tabular-nums', active ? 'text-black/55' : 'text-white/40')}>
        {count}
      </span>
    </button>
  )
}

interface MixedTrackRowProps {
  track: MusicTrack
  current: boolean
  playing: boolean
  preparing: boolean
  onPlay: (track: MusicTrack) => void
  onOpen: (videoId: string) => void
  onCancel: () => void
}

/**
 * One row shape for every source in the unified list: the provider badge tells
 * local, online, and YouTube apart, and only YouTube rows carry an external
 * link, so a click on the row always means "play".
 */
export function MixedTrackRow({
  track,
  current,
  playing,
  preparing,
  onPlay,
  onOpen,
  onCancel,
}: MixedTrackRowProps) {
  const source = trackSource(track)
  const youtubeId = track.youtubeId
  const label = `${track.title} by ${track.artist}`
  const { ref, focused } = useFocusable<Record<string, never>, HTMLButtonElement>({
    focusKey: trackKey(track.id),
    accessibilityLabel: label,
    onEnterPress: () => onPlay(track),
  })
  const { ref: linkRef, focused: linkFocused } = useFocusable<
    Record<string, never>,
    HTMLButtonElement
  >({
    focusKey: youtubeLinkKey(youtubeId ?? track.id),
    accessibilityLabel: `Open ${track.title} on YouTube`,
    onEnterPress: () => {
      if (youtubeId) onOpen(youtubeId)
    },
  })

  const { ref: cancelRef, focused: cancelFocused } = useFocusable<
    Record<string, never>,
    HTMLButtonElement
  >({
    focusKey: `${YOUTUBE_CANCEL_KEY}-${youtubeId ?? track.id}`,
    accessibilityLabel: `Cancel extracting ${track.title}`,
    onEnterPress: onCancel,
  })

  const badge =
    source === 'youtube'
      ? preparing
        ? 'Preparing…'
        : 'MP3'
      : source === 'online'
        ? track.streamKind === 'full'
          ? 'Full'
          : 'Preview'
        : 'Local'

  return (
    <li className="flex items-center gap-1">
      <button
        ref={ref}
        type="button"
        tabIndex={-1}
        data-focus-key={trackKey(track.id)}
        aria-label={label}
        onClick={() => onPlay(track)}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2.5 py-1.5 text-left outline-none transition-colors',
          focused ? 'bg-white text-black' : 'text-white hover:bg-white/6',
        )}
        style={focused ? { boxShadow: `0 0 0 2px ${uiAccent(0.55)}` } : undefined}
      >
        <span className="grid w-3 shrink-0 place-items-center">
          {current ? (
            <MusicFilled
              className={cn(
                'size-3.5',
                focused ? 'text-black' : playing ? 'text-white' : 'text-white/45',
                preparing && 'animate-pulse',
              )}
            />
          ) : null}
        </span>
        <Cover track={track} size="size-10" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[0.86rem] font-medium">{track.title}</span>
            <span
              className={cn(
                'shrink-0 rounded-full px-2 py-0.5 text-[0.64rem] font-medium',
                focused ? 'bg-black/10 text-black/65' : 'bg-white/12 text-white/70',
              )}
            >
              {badge}
            </span>
          </span>
          <span
            className={cn(
              'mt-0.5 block truncate text-[0.78rem]',
              focused ? 'text-black/65' : 'text-white/60',
            )}
          >
            {track.artist}
            {track.publisher ? ` · ${track.publisher}` : track.album ? ` · ${track.album}` : ''}
          </span>
        </span>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[0.62rem] font-medium',
            focused ? 'bg-black/10 text-black/60' : 'bg-white/8 text-white/50',
          )}
        >
          {SOURCE_LABELS[source]}
        </span>
        <span
          className={cn(
            'w-11 shrink-0 text-right text-[0.74rem] tabular-nums',
            focused ? 'text-black/65' : 'text-white/55',
          )}
        >
          {formatDuration(track.durationMs)}
        </span>
      </button>
      {youtubeId && preparing ? (
        <button
          ref={cancelRef}
          type="button"
          tabIndex={-1}
          data-focus-key={`${YOUTUBE_CANCEL_KEY}-${youtubeId}`}
          aria-label={`Cancel extracting ${track.title}`}
          onClick={onCancel}
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-full text-[0.62rem] font-semibold outline-none transition-colors',
            cancelFocused
              ? 'bg-white text-black'
              : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white',
          )}
          style={cancelFocused ? { boxShadow: `0 0 0 2px ${uiAccent(0.55)}` } : undefined}
        >
          Stop
        </button>
      ) : null}
      {youtubeId ? (
        <button
          ref={linkRef}
          type="button"
          tabIndex={-1}
          data-focus-key={youtubeLinkKey(youtubeId)}
          aria-label={`Open ${track.title} on YouTube`}
          onClick={() => onOpen(youtubeId)}
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-full outline-none transition-colors',
            linkFocused
              ? 'bg-white text-black'
              : 'bg-white/5 text-white/55 hover:bg-white/10 hover:text-white',
          )}
          style={linkFocused ? { boxShadow: `0 0 0 2px ${uiAccent(0.55)}` } : undefined}
        >
          <ExternalLinkFilled className="size-4" />
        </button>
      ) : null}
    </li>
  )
}

interface YouTubeTrackRowProps {
  track: MusicYouTubeTrack
  current: boolean
  playing: boolean
  preparing: boolean
  onPlay: (track: MusicYouTubeTrack) => void
  onOpen: (videoId: string) => void
  onCancel: () => void
}

export function YouTubeTrackRow({
  track,
  current,
  playing,
  preparing,
  onPlay,
  onOpen,
  onCancel,
}: YouTubeTrackRowProps) {
  const { ref, focused } = useFocusable<Record<string, never>, HTMLButtonElement>({
    focusKey: trackKey(track.id),
    accessibilityLabel: `${track.title} by ${track.artist}, extract and play from YouTube`,
    onEnterPress: () => onPlay(track),
  })
  const { ref: linkRef, focused: linkFocused } = useFocusable<
    Record<string, never>,
    HTMLButtonElement
  >({
    focusKey: youtubeLinkKey(track.youtubeId),
    accessibilityLabel: `Open ${track.title} on YouTube`,
    onEnterPress: () => onOpen(track.youtubeId),
  })
  const { ref: cancelRef, focused: cancelFocused } = useFocusable<
    Record<string, never>,
    HTMLButtonElement
  >({
    focusKey: `${YOUTUBE_CANCEL_KEY}-${track.youtubeId}`,
    accessibilityLabel: `Cancel extracting ${track.title}`,
    onEnterPress: onCancel,
  })

  return (
    <li className="flex items-center gap-1">
      <button
        ref={ref}
        type="button"
        tabIndex={-1}
        data-focus-key={trackKey(track.id)}
        aria-label={`${track.title} by ${track.artist}, extract and play from YouTube`}
        onClick={() => onPlay(track)}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2.5 py-1.5 text-left outline-none transition-colors',
          focused ? 'bg-white text-black' : 'text-white hover:bg-white/6',
        )}
        style={focused ? { boxShadow: `0 0 0 2px ${uiAccent(0.55)}` } : undefined}
      >
        <span className="grid w-3 shrink-0 place-items-center">
          {current ? (
            <MusicFilled
              className={cn(
                'size-3.5',
                focused ? 'text-black' : playing ? 'text-white' : 'text-white/45',
                preparing && 'animate-pulse',
              )}
            />
          ) : null}
        </span>
        <Cover track={track} size="size-10" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[0.86rem] font-medium">{track.title}</span>
            <span
              className={cn(
                'shrink-0 rounded-full px-2 py-0.5 text-[0.64rem] font-medium',
                focused ? 'bg-black/10 text-black/65' : 'bg-white/12 text-white/70',
              )}
            >
              {preparing ? 'Preparing…' : 'MP3'}
            </span>
          </span>
          <span
            className={cn(
              'mt-0.5 block truncate text-[0.78rem]',
              focused ? 'text-black/65' : 'text-white/60',
            )}
          >
            {track.artist} · {track.publisher}
          </span>
          {track.videoTitle !== track.title ? (
            <span
              className={cn(
                'mt-0.5 block truncate text-[0.68rem] [@media(max-height:760px)]:hidden',
                focused ? 'text-black/45' : 'text-white/35',
              )}
              title={track.videoTitle}
            >
              {track.videoTitle}
            </span>
          ) : null}
        </span>
        <span
          className={cn(
            'w-11 shrink-0 text-right text-[0.74rem] tabular-nums',
            focused ? 'text-black/65' : 'text-white/55',
          )}
        >
          {formatDuration(track.durationMs)}
        </span>
      </button>
      {preparing ? (
        <button
          ref={cancelRef}
          type="button"
          tabIndex={-1}
          data-focus-key={`${YOUTUBE_CANCEL_KEY}-${track.youtubeId}`}
          aria-label={`Cancel extracting ${track.title}`}
          onClick={onCancel}
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-full text-[0.62rem] font-semibold outline-none transition-colors',
            cancelFocused
              ? 'bg-white text-black'
              : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white',
          )}
          style={cancelFocused ? { boxShadow: `0 0 0 2px ${uiAccent(0.55)}` } : undefined}
        >
          Stop
        </button>
      ) : null}
      <button
        ref={linkRef}
        type="button"
        tabIndex={-1}
        data-focus-key={youtubeLinkKey(track.youtubeId)}
        aria-label={`Open ${track.title} on YouTube`}
        onClick={() => onOpen(track.youtubeId)}
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-full outline-none transition-colors',
          linkFocused
            ? 'bg-white text-black'
            : 'bg-white/5 text-white/55 hover:bg-white/10 hover:text-white',
        )}
        style={linkFocused ? { boxShadow: `0 0 0 2px ${uiAccent(0.55)}` } : undefined}
      >
        <ExternalLinkFilled className="size-4" />
      </button>
    </li>
  )
}

interface WatchOnYouTubeProps {
  videoId: string
  title: string
  onOpen: (videoId: string) => void
}

export function WatchOnYouTube({ videoId, title, onOpen }: WatchOnYouTubeProps) {
  const { ref, focused } = useFocusable<Record<string, never>, HTMLButtonElement>({
    focusKey: YOUTUBE_WATCH_KEY,
    accessibilityLabel: `Open ${title} on YouTube`,
    onEnterPress: () => onOpen(videoId),
  })

  return (
    <button
      ref={ref}
      type="button"
      tabIndex={-1}
      data-focus-key={YOUTUBE_WATCH_KEY}
      aria-label={`Open ${title} on YouTube`}
      onClick={() => onOpen(videoId)}
      className={cn(
        'inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-[0.7rem] font-medium outline-none transition-colors',
        focused
          ? 'bg-white text-black'
          : 'bg-white/5 text-white/60 ring-1 ring-white/10 hover:bg-white/10 hover:text-white',
      )}
      style={focused ? { boxShadow: `0 0 0 2px ${uiAccent(0.6)}` } : undefined}
    >
      <YoutubeFilled className="size-3.5" />
      Watch on YouTube
      <ExternalLinkFilled className="size-3" />
    </button>
  )
}

interface TrackRowProps {
  track: MusicTrack
  current: boolean
  playing: boolean
  onPlay: (track: MusicTrack) => void
}

export function TrackRow({ track, current, playing, onPlay }: TrackRowProps) {
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
          <span className="block truncate text-[0.86rem] font-medium">{track.title}</span>
          <span
            className={cn(
              'mt-0.5 block truncate text-[0.78rem]',
              focused ? 'text-black/65' : 'text-white/60',
            )}
          >
            {track.artist}
            {track.album ? ` · ${track.album}` : ''}
          </span>
        </span>
        <span
          className={cn(
            'shrink-0 text-[0.72rem] tabular-nums',
            focused ? 'text-black/65' : 'text-white/55',
          )}
        >
          {formatDuration(track.durationMs)}
        </span>
      </button>
    </li>
  )
}

interface OnlineTrackRowProps {
  track: MusicOnlineTrack
  current: boolean
  playing: boolean
  onPlay: (track: MusicOnlineTrack) => void
}

export function OnlineTrackRow({ track, current, playing, onPlay }: OnlineTrackRowProps) {
  const kindLabel = track.streamKind === 'full' ? 'Full' : 'Preview'
  const { ref, focused } = useFocusable<Record<string, never>, HTMLButtonElement>({
    focusKey: trackKey(track.id),
    accessibilityLabel: `${track.title} by ${track.artist}, ${kindLabel.toLowerCase()} on ${track.publisher}`,
    onEnterPress: () => onPlay(track),
  })

  return (
    <li>
      <button
        ref={ref}
        type="button"
        tabIndex={-1}
        data-focus-key={trackKey(track.id)}
        aria-label={`${track.title} by ${track.artist}, ${kindLabel.toLowerCase()} on ${track.publisher}`}
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
              className={cn(
                'size-3.5',
                focused ? 'text-black' : playing ? 'text-white' : 'text-white/45',
              )}
            />
          ) : null}
        </span>
        <Cover track={track} size="size-10" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[0.86rem] font-medium">{track.title}</span>
            <span
              className={cn(
                'shrink-0 rounded-full px-2 py-0.5 text-[0.64rem] font-medium',
                focused ? 'bg-black/10 text-black/65' : 'bg-white/12 text-white/70',
              )}
            >
              {kindLabel}
            </span>
          </span>
          <span
            className={cn(
              'mt-0.5 block truncate text-[0.78rem]',
              focused ? 'text-black/65' : 'text-white/60',
            )}
          >
            {track.artist} · {track.publisher}
            {track.license ? ` · ${track.license}` : ''}
          </span>
        </span>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[0.64rem] font-medium',
            focused ? 'bg-black/10 text-black/60' : 'bg-white/12 text-white/65',
          )}
        >
          {PROVIDER_LABELS[track.provider]}
        </span>
        <span
          className={cn(
            'w-11 shrink-0 text-right text-[0.74rem] tabular-nums',
            focused ? 'text-black/65' : 'text-white/55',
          )}
        >
          {formatDuration(track.durationMs)}
        </span>
      </button>
    </li>
  )
}
