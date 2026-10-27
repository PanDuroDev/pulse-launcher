import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ArrowLeftFilled,
  CheckFilled,
  ExternalLinkFilled,
  FolderOpenFilled,
  MiniplayerFilled,
  MusicFilled,
  PauseFilled,
  PlayFilled,
  Refresh2Filled,
  RepeatFilled,
  RepeatOneFilled,
  SearchFilled,
  Settings3Filled,
  ShuffleFilled,
  SkipForwardFilled,
  SkipPreviousFilled,
  VolumeFilled,
  VolumeMuteFilled,
  YoutubeFilled,
} from '@mingcute/react/core-filled'
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation-react'
import { pause, resume } from '@noriginmedia/norigin-spatial-navigation-core'
import type {
  MusicOnlineProviderStatus,
  MusicOnlineTrack,
  MusicProvider,
  MusicTrack,
  MusicYouTubeSearchSource,
  MusicYouTubeStatus,
  MusicYouTubeTrack,
} from '@shared/types'
import {
  countSources,
  filterBySource,
  filterTracks,
  formatDuration,
  mergeSources,
  progressRatio,
  trackSource,
} from '@/lib/music-queue'
import type { MusicSourceFilter } from '@/lib/music-queue'
import { uiAccent } from '@/lib/accent'
import { musicEngine } from '@/lib/music-engine'
import { useMusicEngineState } from '@/hooks/use-music-engine'
import { useMusicStore } from '@/store/music'
import { cn } from 'cn'

const BACK_KEY = 'music-back'
const MODE_ALL_KEY = 'music-mode-all'
const MODE_LIBRARY_KEY = 'music-mode-library'
const MODE_ONLINE_KEY = 'music-mode-online'
const MODE_YOUTUBE_KEY = 'music-mode-youtube'
const FILTER_KEY = 'music-filter'
const SOURCE_FILTER_PREFIX = 'music-source'
const YOUTUBE_SETUP_KEY = 'music-youtube-setup'
const YOUTUBE_KEY_FIELD = 'music-youtube-key'
const YOUTUBE_YTDLP_FIELD = 'music-youtube-ytdlp'
const YOUTUBE_FFMPEG_FIELD = 'music-youtube-ffmpeg'
const YOUTUBE_SAVE_KEY = 'music-youtube-save'
const YOUTUBE_REFRESH_KEY = 'music-youtube-refresh'
const YOUTUBE_CACHE_LIMIT_FIELD = 'music-youtube-cache-limit'
const YOUTUBE_CLEAR_KEY = 'music-youtube-clear-cache'
const YOUTUBE_CANCEL_KEY = 'music-youtube-cancel'
const YOUTUBE_REMOVE_KEY = 'music-youtube-remove'
const SCAN_CANCEL_KEY = 'music-scan-cancel'
const YOUTUBE_WATCH_KEY = 'music-youtube-watch'
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
const MUTE_KEY = 'music-mute'
const SEEK_KEY = 'music-seek'

const trackKey = (trackId: string): string => `music-track-${trackId}`
const youtubeLinkKey = (videoId: string): string => `music-youtube-link-${videoId}`

// One debounce for both remote search modes keeps their behaviour identical.
const SEARCH_DELAY_MS = 450

const PROVIDER_LABELS: Record<MusicProvider, string> = {
  itunes: 'iTunes',
  deezer: 'Deezer',
  audius: 'Audius',
  openverse: 'Openverse',
  archive: 'Archive',
  youtube: 'YouTube',
}

const ONLINE_CATALOG_HINT = 'iTunes · Deezer · Audius · Openverse · Archive'
const YOUTUBE_TOOL_SOURCES: Record<MusicYouTubeStatus['ytDlp']['source'], string> = {
  configured: 'Configured',
  path: 'PATH',
  downloaded: 'Downloaded',
  missing: 'Missing',
}

type MusicMode = 'all' | 'library' | 'online' | 'youtube'
type SourceFilter = MusicSourceFilter

const SOURCE_LABELS: Record<SourceFilter, string> = {
  all: 'All',
  library: 'Library',
  online: 'Online',
  youtube: 'YouTube',
}


function providerSummary(statuses: MusicOnlineProviderStatus[]): string {
  if (statuses.length === 0) return ONLINE_CATALOG_HINT
  const available = statuses.filter((status) => status.ok)
  if (available.length === 0) return 'Online catalogs unavailable'
  const withResults = available.filter((status) => status.count > 0)
  const unavailable = statuses.length - available.length
  if (withResults.length === 0) {
    return unavailable > 0
      ? `No matches · ${unavailable} unavailable`
      : 'Catalogs responded with no matches'
  }
  const summary = withResults
    .map((status) => `${PROVIDER_LABELS[status.provider]} ${status.count}`)
    .join(' · ')
  return unavailable > 0 ? `${summary} · ${unavailable} unavailable` : summary
}

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
        'inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-caption font-medium outline-none transition-colors',
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

interface ModeTabProps {
  focusKey: string
  label: string
  active: boolean
  onClick: () => void
}

function ModeTab({ focusKey, label, active, onClick }: ModeTabProps) {
  const { ref, focused } = useFocusable<Record<string, never>, HTMLButtonElement>({
    focusKey,
    accessibilityLabel: `${label} music`,
    onEnterPress: onClick,
  })

  return (
    <button
      ref={ref}
      type="button"
      tabIndex={-1}
      data-focus-key={focusKey}
      aria-label={`${label} music`}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'h-8 rounded-full px-3.5 text-caption font-medium outline-none transition-colors',
        focused
          ? 'bg-white text-black'
          : active
            ? 'bg-white/14 text-white ring-1 ring-white/20'
            : 'text-white/55 hover:text-white',
      )}
      style={focused ? { boxShadow: `0 0 0 2px ${uiAccent(0.7)}` } : undefined}
    >
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
        'grid place-items-center rounded-full outline-none transition-all duration-[--duration-focus]',
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
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-[--duration-focus]"
          style={{ width: `${ratio * 100}%`, background: uiAccent(0.95) }}
        />
      </div>
      <span
        className={cn(
          'ml-3 w-20 shrink-0 text-right text-caption tabular-nums transition-colors',
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
  const cancelScan = useMusicStore((state) => state.cancelScan)
  const updateOverlay = useMusicStore((state) => state.updateOverlay)
  const toggleOverlay = useMusicStore((state) => state.toggleOverlay)

  const playback = useMusicEngineState()
  const [mode, setMode] = useState<MusicMode>('all')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [query, setQuery] = useState('')
  const [onlineQuery, setOnlineQuery] = useState('')
  const [onlineTracks, setOnlineTracks] = useState<MusicOnlineTrack[]>([])
  const [onlineProviders, setOnlineProviders] = useState<MusicOnlineProviderStatus[]>([])
  const [onlineSearching, setOnlineSearching] = useState(false)
  const [onlineError, setOnlineError] = useState<string | null>(null)
  const [onlineWarning, setOnlineWarning] = useState<string | null>(null)
  const [youtubeQuery, setYoutubeQuery] = useState('')
  const [youtubeTracks, setYoutubeTracks] = useState<MusicYouTubeTrack[]>([])
  const [youtubeSource, setYoutubeSource] = useState<MusicYouTubeSearchSource | null>(null)
  const [youtubeWarning, setYoutubeWarning] = useState<string | null>(null)
  const [youtubeSearching, setYoutubeSearching] = useState(false)
  const [youtubeError, setYoutubeError] = useState<string | null>(null)
  const [youtubeStatus, setYoutubeStatus] = useState<MusicYouTubeStatus | null>(null)
  const [youtubeStatusLoading, setYoutubeStatusLoading] = useState(false)
  const [youtubeStatusError, setYoutubeStatusError] = useState<string | null>(null)
  const [setupOpen, setSetupOpen] = useState(false)
  const [youtubeApiKey, setYoutubeApiKey] = useState('')
  const [youtubeYtDlpPath, setYoutubeYtDlpPath] = useState('')
  const [youtubeFfmpegPath, setYoutubeFfmpegPath] = useState('')
  const [youtubeSaving, setYoutubeSaving] = useState(false)
  const [youtubeSaveError, setYoutubeSaveError] = useState<string | null>(null)
  const [youtubeCacheLimit, setYoutubeCacheLimit] = useState('')
  const [youtubeClearing, setYoutubeClearing] = useState(false)
  /** True once the draft fields hold the stored settings, so Save cannot blank them. */
  const [draftSynced, setDraftSynced] = useState(false)
  /** One search fans out to the online catalogs and YouTube at the same time. */
  const [allSearching, setAllSearching] = useState(false)

  const searchTimer = useRef<number | null>(null)
  const searchRequest = useRef(0)
  const youtubeTimer = useRef<number | null>(null)
  const youtubeRequest = useRef(0)
  const allTimer = useRef<number | null>(null)
  const allRequest = useRef(0)

  const visible = useMemo(() => filterTracks(tracks, query), [tracks, query])
  const onlinePrompt = onlineQuery.trim().length < 2
  const onlineFailed =
    onlineProviders.length > 0 && onlineProviders.every((provider) => !provider.ok)
  const youtubePrompt = youtubeQuery.trim().length < 2
  const allPrompt = query.trim().length < 2

  /**
   * YouTube leads the unified list (see `mergeSources`): it is the source with
   * the most complete metadata and the one users reach for when a song is not
   * in their own files. The merged order is also the playback queue.
   */
  const mixedTracks = useMemo<MusicTrack[]>(
    () => mergeSources(youtubeTracks, visible, onlineTracks),
    [visible, onlineTracks, youtubeTracks],
  )
  const sourceCounts = useMemo(() => countSources(mixedTracks), [mixedTracks])
  const mixedVisible = useMemo(
    () => filterBySource(mixedTracks, sourceFilter),
    [mixedTracks, sourceFilter],
  )

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

  /**
   * Search is scheduled from the input event, not an effect: an effect would
   * set state synchronously on every keystroke, which the lint baseline avoids.
   * The request id discards responses that arrive after a newer query.
   */
  const searchOnline = useCallback((value: string) => {
    if (searchTimer.current !== null) {
      window.clearTimeout(searchTimer.current)
      searchTimer.current = null
    }
    const requestId = ++searchRequest.current
    const trimmed = value.trim()
    if (trimmed.length < 2) {
      setOnlineTracks([])
      setOnlineProviders([])
      setOnlineSearching(false)
      setOnlineError(null)
      setOnlineWarning(null)
      return
    }

    setOnlineTracks([])
    setOnlineProviders([])
    setOnlineSearching(true)
    setOnlineError(null)
    setOnlineWarning(null)
    searchTimer.current = window.setTimeout(() => {
      searchTimer.current = null
      void window.launcher.music.online
        .search(trimmed)
        .then((result) => {
          if (searchRequest.current !== requestId) return
          setOnlineTracks(result.tracks)
          setOnlineProviders(result.providers)
          setOnlineWarning(result.warning)
          setOnlineSearching(false)
        })
        .catch(() => {
          if (searchRequest.current !== requestId) return
          setOnlineTracks([])
          setOnlineProviders([])
          setOnlineWarning(null)
          setOnlineError('Online search failed. Check your connection and try again.')
          setOnlineSearching(false)
        })
    }, SEARCH_DELAY_MS)
  }, [])

  const searchYouTube = useCallback((value: string) => {
    if (youtubeTimer.current !== null) {
      window.clearTimeout(youtubeTimer.current)
      youtubeTimer.current = null
    }
    const requestId = ++youtubeRequest.current
    const trimmed = value.trim()
    if (trimmed.length < 2) {
      setYoutubeTracks([])
      setYoutubeSource(null)
      setYoutubeWarning(null)
      setYoutubeSearching(false)
      setYoutubeError(null)
      return
    }

    setYoutubeTracks([])
    setYoutubeSource(null)
    setYoutubeWarning(null)
    setYoutubeSearching(true)
    setYoutubeError(null)
    youtubeTimer.current = window.setTimeout(() => {
      youtubeTimer.current = null
      void window.launcher.music.youtube
        .search(trimmed)
        .then((result) => {
          if (youtubeRequest.current !== requestId) return
          setYoutubeTracks(result.tracks)
          setYoutubeSource(result.source)
          setYoutubeWarning(result.warning)
          setYoutubeSearching(false)
        })
        .catch(() => {
          if (youtubeRequest.current !== requestId) return
          setYoutubeTracks([])
          setYoutubeSource(null)
          setYoutubeWarning(null)
          setYoutubeError('YouTube search failed. Check your connection and try again.')
          setYoutubeSearching(false)
        })
    }, SEARCH_DELAY_MS)
  }, [])

  /**
   * The All tab searches every source at once. Local files are filtered
   * synchronously, so only the two remote calls are awaited here; a failing
   * source never hides the results of the other one.
   */
  const searchAll = useCallback((value: string) => {
    if (allTimer.current !== null) {
      window.clearTimeout(allTimer.current)
      allTimer.current = null
    }
    const requestId = ++allRequest.current
    const trimmed = value.trim()
    if (trimmed.length < 2) {
      setOnlineTracks([])
      setOnlineProviders([])
      setOnlineSearching(false)
      setOnlineError(null)
      setOnlineWarning(null)
      setYoutubeTracks([])
      setYoutubeSource(null)
      setYoutubeWarning(null)
      setYoutubeSearching(false)
      setYoutubeError(null)
      setAllSearching(false)
      return
    }

    setOnlineTracks([])
    setOnlineProviders([])
    setOnlineError(null)
    setOnlineWarning(null)
    setYoutubeTracks([])
    setYoutubeSource(null)
    setYoutubeWarning(null)
    setYoutubeError(null)
    setAllSearching(true)
    setOnlineSearching(true)
    setYoutubeSearching(true)

    allTimer.current = window.setTimeout(() => {
      allTimer.current = null
      const online = window.launcher.music.online
        .search(trimmed)
        .then((result) => {
          if (allRequest.current !== requestId) return
          setOnlineTracks(result.tracks)
          setOnlineProviders(result.providers)
          setOnlineWarning(result.warning)
          setOnlineError(null)
        })
        .catch(() => {
          if (allRequest.current !== requestId) return
          setOnlineTracks([])
          setOnlineProviders([])
          setOnlineWarning(null)
          setOnlineError('Online search failed. Check your connection and try again.')
        })
      const youtube = window.launcher.music.youtube
        .search(trimmed)
        .then((result) => {
          if (allRequest.current !== requestId) return
          setYoutubeTracks(result.tracks)
          setYoutubeSource(result.source)
          setYoutubeWarning(result.warning)
          setYoutubeError(null)
        })
        .catch(() => {
          if (allRequest.current !== requestId) return
          setYoutubeTracks([])
          setYoutubeSource(null)
          setYoutubeWarning(null)
          setYoutubeError('YouTube search failed. Check your connection and try again.')
        })

      void Promise.allSettled([online, youtube]).then(() => {
        if (allRequest.current !== requestId) return
        setOnlineSearching(false)
        setYoutubeSearching(false)
        setAllSearching(false)
      })
    }, SEARCH_DELAY_MS)
  }, [])

  const loadYouTubeStatus = useCallback((syncDraft: boolean) => {
    setYoutubeStatusLoading(true)
    setYoutubeStatusError(null)
    void window.launcher.music.youtube
      .status()
      .then((status) => {
        setYoutubeStatus(status)
        if (syncDraft) {
          setYoutubeApiKey(status.settings.apiKey)
          setYoutubeYtDlpPath(status.settings.ytDlpPath)
          setYoutubeFfmpegPath(status.settings.ffmpegPath)
          setYoutubeCacheLimit(String(status.settings.cacheLimitMb))
          setDraftSynced(true)
        }
        setYoutubeStatusLoading(false)
      })
      .catch(() => {
        setYoutubeStatusError('Could not read the YouTube setup on this machine.')
        setYoutubeStatusLoading(false)
      })
  }, [])

  const saveYouTubeSettings = useCallback(() => {
    setYoutubeSaving(true)
    setYoutubeSaveError(null)
    const parsedLimit = Number.parseInt(youtubeCacheLimit, 10)
    void window.launcher.music.youtube
      .updateSettings({
        apiKey: youtubeApiKey,
        ytDlpPath: youtubeYtDlpPath,
        ffmpegPath: youtubeFfmpegPath,
        // An unreadable value falls back to the stored limit instead of 0.
        cacheLimitMb: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
      })
      .then((status) => {
        setYoutubeStatus(status)
        setYoutubeApiKey(status.settings.apiKey)
        setYoutubeYtDlpPath(status.settings.ytDlpPath)
        setYoutubeFfmpegPath(status.settings.ffmpegPath)
        setYoutubeCacheLimit(String(status.settings.cacheLimitMb))
        setDraftSynced(true)
        setYoutubeSaving(false)
      })
      .catch(() => {
        setYoutubeSaveError('Could not save the YouTube setup.')
        setYoutubeSaving(false)
      })
  }, [youtubeApiKey, youtubeCacheLimit, youtubeFfmpegPath, youtubeYtDlpPath])

  const clearYouTubeCache = useCallback(() => {
    setYoutubeClearing(true)
    void window.launcher.music.youtube
      .clearCache()
      .then((status) => {
        setYoutubeStatus(status)
        setYoutubeClearing(false)
      })
      .catch(() => {
        setYoutubeSaveError('Could not clear the MP3 cache.')
        setYoutubeClearing(false)
      })
  }, [])

  const removeCachedTrack = useCallback((videoId: string) => {
    void window.launcher.music.youtube
      .removeCached(videoId)
      .then((status) => setYoutubeStatus(status))
      .catch(() => setYoutubeSaveError('Could not delete that cached MP3.'))
  }, [])

  /**
   * The setup panel is reachable from the All tab too, which never loads the
   * status. Opening it must hydrate the draft fields first, otherwise Save
   * would write empty values over a key that is already stored.
   */
  const toggleSetup = useCallback(() => {
    setSetupOpen((open) => {
      if (!open && !draftSynced) loadYouTubeStatus(true)
      return !open
    })
  }, [draftSynced, loadYouTubeStatus])

  useEffect(() => {
    return () => {
      if (searchTimer.current !== null) window.clearTimeout(searchTimer.current)
      if (youtubeTimer.current !== null) window.clearTimeout(youtubeTimer.current)
      if (allTimer.current !== null) window.clearTimeout(allTimer.current)
      searchRequest.current += 1
      youtubeRequest.current += 1
      allRequest.current += 1
    }
  }, [])

  const selectMode = (next: MusicMode): void => {
    if (next === mode) return
    setMode(next)
    if (
      next === 'online' &&
      onlineQuery.trim().length >= 2 &&
      onlineTracks.length === 0 &&
      !onlineSearching
    ) {
      searchOnline(onlineQuery)
    }
    if (next === 'youtube') {
      if (!youtubeStatus && !youtubeStatusLoading) loadYouTubeStatus(true)
      if (
        youtubeQuery.trim().length >= 2 &&
        youtubeTracks.length === 0 &&
        !youtubeSearching
      ) {
        searchYouTube(youtubeQuery)
      }
    }
    if (next === 'all' && query.trim().length >= 2 && !allSearching) {
      searchAll(query)
    }
  }

  const changeQuery = (value: string): void => {
    if (mode === 'library') {
      setQuery(value)
      return
    }
    if (mode === 'online') {
      setOnlineQuery(value)
      searchOnline(value)
      return
    }
    if (mode === 'all') {
      setQuery(value)
      searchAll(value)
      return
    }
    setYoutubeQuery(value)
    searchYouTube(value)
  }

  const play = useCallback((track: MusicTrack) => {
    musicEngine.playTrack(track)
  }, [])

  const playOnline = useCallback(
    (track: MusicOnlineTrack) => {
      musicEngine.playOnlineQueue(onlineTracks, track)
    },
    [onlineTracks],
  )

  const playYouTube = useCallback(
    (track: MusicYouTubeTrack) => {
      musicEngine.playYouTubeQueue(youtubeTracks, track)
    },
    [youtubeTracks],
  )

  /** In the unified list the queue is whatever the source filter shows. */
  const playMixed = useCallback(
    (track: MusicTrack) => {
      musicEngine.playMixedQueue(mixedVisible, track)
    },
    [mixedVisible],
  )

  const openYouTube = useCallback((videoId: string) => {
    void window.launcher.music.youtube.open(videoId).catch(() => undefined)
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
            'inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-caption font-medium outline-none transition-colors',
            backFocused
              ? 'bg-white text-black'
              : 'bg-white/5 text-white/65 ring-1 ring-white/12 hover:bg-white/10 hover:text-white',
          )}
          style={backFocused ? { boxShadow: `0 0 0 2px ${uiAccent(0.7)}` } : undefined}
        >
          <ArrowLeftFilled className="size-4" />
          Back
        </button>

        <div className="flex shrink-0 items-center gap-1 rounded-full bg-white/5 p-1 ring-1 ring-white/10">
          <ModeTab
            focusKey={MODE_ALL_KEY}
            label="All"
            active={mode === 'all'}
            onClick={() => selectMode('all')}
          />
          <ModeTab
            focusKey={MODE_LIBRARY_KEY}
            label="Library"
            active={mode === 'library'}
            onClick={() => selectMode('library')}
          />
          <ModeTab
            focusKey={MODE_ONLINE_KEY}
            label="Online"
            active={mode === 'online'}
            onClick={() => selectMode('online')}
          />
          <ModeTab
            focusKey={MODE_YOUTUBE_KEY}
            label="YouTube"
            active={mode === 'youtube'}
            onClick={() => selectMode('youtube')}
          />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {mode === 'library' ? (
            <>
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
              {scanning ? (
                <Tool
                  focusKey={SCAN_CANCEL_KEY}
                  label="Stop"
                  icon={<PauseFilled className="size-4" />}
                  onClick={() => void cancelScan()}
                />
              ) : null}
            </>
          ) : null}
          {mode === 'youtube' || mode === 'all' ? (
            <Tool
              focusKey={YOUTUBE_SETUP_KEY}
              label="Setup"
              icon={<Settings3Filled className="size-4" />}
              onClick={toggleSetup}
              active={setupOpen}
            />
          ) : null}
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
          {(mode === 'youtube' || mode === 'all') && setupOpen ? (
            <YouTubeSetup
              status={youtubeStatus}
              loading={youtubeStatusLoading}
              statusError={youtubeStatusError}
              apiKey={youtubeApiKey}
              ytDlpPath={youtubeYtDlpPath}
              ffmpegPath={youtubeFfmpegPath}
              cacheLimitMb={youtubeCacheLimit}
              saving={youtubeSaving}
              saveError={youtubeSaveError}
              clearing={youtubeClearing}
              onApiKeyChange={setYoutubeApiKey}
              onYtDlpChange={setYoutubeYtDlpPath}
              onFfmpegChange={setYoutubeFfmpegPath}
              onCacheLimitChange={setYoutubeCacheLimit}
              onSave={saveYouTubeSettings}
              onRefresh={() => loadYouTubeStatus(false)}
              onClearCache={clearYouTubeCache}
              onRemoveCached={removeCachedTrack}
            />
          ) : null}
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
              value={
                mode === 'library' || mode === 'all'
                  ? query
                  : mode === 'online'
                    ? onlineQuery
                    : youtubeQuery
              }
              onChange={(event) => changeQuery(event.target.value)}
              placeholder={
                mode === 'library'
                  ? 'Filter by title, artist, or album'
                  : mode === 'all'
                    ? 'Search your library, online catalogs, and YouTube'
                    : mode === 'online'
                      ? 'Search a song, artist, or album online'
                      : 'Search YouTube by song, artist, or video'
              }
              aria-label={
                mode === 'library'
                  ? 'Filter music'
                  : mode === 'all'
                    ? 'Search every music source'
                    : mode === 'online'
                      ? 'Search music online'
                      : 'Search YouTube'
              }
              autoComplete="off"
              spellCheck={false}
              data-focus-key={FILTER_KEY}
              className="h-7 min-w-0 flex-1 bg-transparent text-caption text-white outline-none placeholder:text-white/30"
            />
            <span className="shrink-0 text-caption tabular-nums text-white/55">
              {mode === 'library'
                ? `${visible.length} / ${tracks.length}`
                : mode === 'all'
                  ? allSearching
                    ? 'Searching…'
                    : mixedVisible.length > 0
                      ? `${mixedVisible.length} found`
                      : ''
                  : mode === 'online'
                    ? onlineSearching
                      ? 'Searching…'
                      : onlineTracks.length > 0
                        ? `${onlineTracks.length} found`
                        : ''
                    : youtubeSearching
                      ? 'Searching…'
                      : youtubeTracks.length > 0
                        ? `${youtubeTracks.length} found`
                        : ''}
            </span>
          </div>

          {mode === 'all' && query.trim().length >= 2 ? (
            <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto border-b border-white/8 px-3 py-2">
              {(['all', 'library', 'online', 'youtube'] as const).map((source) => (
                <SourceChip
                  key={source}
                  focusKey={`${SOURCE_FILTER_PREFIX}-${source}`}
                  label={SOURCE_LABELS[source]}
                  count={sourceCounts[source]}
                  active={sourceFilter === source}
                  onClick={() => setSourceFilter(source)}
                />
              ))}
            </div>
          ) : null}

          <div ref={listRef} className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
            {mode === 'all' ? (
              allPrompt ? (
                <div className="px-4 py-10">
                  <div className="flex items-center gap-2 text-white">
                    <SearchFilled className="size-5" />
                    <p className="text-body font-medium">One search, every source</p>
                  </div>
                  <p className="mt-1.5 max-w-lg text-caption leading-relaxed text-white/45">
                    Type at least two characters to search your local folders, the legal online
                    catalogs, and YouTube at the same time. Local matches appear instantly; remote
                    results follow as each source answers. Use the source chips to narrow the list.
                  </p>
                  <p className="mt-3 text-caption tracking-[0.12em] text-white/30 uppercase">
                    Local files · {ONLINE_CATALOG_HINT} · YouTube
                  </p>
                </div>
              ) : mixedVisible.length === 0 ? (
                <div className="px-4 py-8">
                  <p className="text-caption leading-relaxed text-white/45">
                    {allSearching
                      ? 'Searching your library, the online catalogs, and YouTube…'
                      : `No match for “${query.trim()}” in any source.`}
                  </p>
                  {!allSearching && (onlineError || youtubeError) ? (
                    <p className="mt-2 text-caption leading-relaxed text-white/40">
                      {[onlineError, youtubeError].filter(Boolean).join(' ')}
                    </p>
                  ) : null}
                </div>
              ) : (
                <>
                  {sourceFilter === 'youtube' && youtubeWarning ? (
                    <p className="mx-1 mb-1 rounded-lg bg-white/5 px-3 py-2 text-caption leading-relaxed text-white/50">
                      {youtubeWarning}
                    </p>
                  ) : null}
                  <ul className="flex flex-col gap-0.5">
                    {mixedVisible.map((track) => (
                      <MixedTrackRow
                        key={track.id}
                        track={track}
                        current={playback.track?.id === track.id}
                        playing={playing}
                        preparing={
                          playback.track?.id === track.id &&
                          playback.status === 'loading' &&
                          !track.streamUrl
                        }
                        onPlay={playMixed}
                        onOpen={openYouTube}
                        onCancel={() => musicEngine.cancelPreparing()}
                      />
                    ))}
                  </ul>
                </>
              )
            ) : mode === 'library' ? (
              loading ? (
                <p className="px-3 py-6 text-caption text-white/45">
                  Reading your music library…
                </p>
              ) : tracks.length === 0 ? (
                <div className="px-4 py-10">
                  <p className="text-body font-medium text-white">No music yet</p>
                  <p className="mt-1.5 max-w-md text-caption leading-relaxed text-white/45">
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
                <p className="px-3 py-6 text-caption text-white/45">
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
              )
            ) : mode === 'online' ? (
              onlinePrompt ? (
              <div className="px-4 py-10">
                <p className="text-body font-medium text-white">Search the legal catalogs</p>
                <p className="mt-1.5 max-w-md text-caption leading-relaxed text-white/45">
                  Type at least two characters to search Apple Music, Deezer, Audius, Openverse,
                  and Internet Archive. Pulse ranks the results and plays them through the same
                  player; nothing is downloaded.
                </p>
                <p className="mt-3 text-caption tracking-[0.12em] text-white/30 uppercase">
                  Previews from Apple Music and Deezer · full tracks from the open catalogs
                </p>
              </div>
            ) : onlineSearching ? (
              <p className="px-3 py-6 text-caption text-white/45">
                Searching the online catalogs…
              </p>
            ) : onlineError ? (
              <p className="px-3 py-6 text-caption text-white/45">{onlineError}</p>
            ) : onlineFailed ? (
              <p className="px-3 py-6 text-caption text-white/45">
                The online catalogs could not be reached. Check your connection and try again.
              </p>
            ) : onlineTracks.length === 0 ? (
              <p className="px-3 py-6 text-caption text-white/45">
                No online match for “{onlineQuery.trim()}”. Try the artist and song title
                together.
              </p>
            ) : (
              <>
                {onlineWarning ? (
                  <p className="mx-1 mb-1 rounded-lg bg-white/5 px-3 py-2 text-caption leading-relaxed text-white/50">
                    {onlineWarning}
                  </p>
                ) : null}
                <ul className="flex flex-col gap-0.5">
                  {onlineTracks.map((track) => (
                    <OnlineTrackRow
                      key={track.id}
                      track={track}
                      current={playback.track?.id === track.id}
                      playing={playing}
                      onPlay={playOnline}
                    />
                  ))}
                </ul>
              </>
              )
            ) : youtubePrompt ? (
              <div className="px-4 py-10">
                <div className="flex items-center gap-2 text-white">
                  <YoutubeFilled className="size-5" />
                  <p className="text-body font-medium">Search YouTube</p>
                </div>
                <p className="mt-1.5 max-w-md text-caption leading-relaxed text-white/45">
                  Type at least two characters. Search uses the YouTube Data API when a key is
                  configured and falls back to yt-dlp. Playing a result extracts an MP3 once and
                  keeps it in the local cache.
                </p>
                {youtubeStatus && (!youtubeStatus.ytDlp.ok || !youtubeStatus.ffmpeg.ok) ? (
                  <div className="mt-3 max-w-md rounded-lg bg-white/5 px-3 py-2 text-caption leading-relaxed text-white/55 ring-1 ring-white/8">
                    {!youtubeStatus.ffmpeg.ok
                      ? 'FFmpeg is missing. Install it with "winget install Gyan.FFmpeg", then open Setup and press Refresh.'
                      : 'yt-dlp is not installed yet; Pulse downloads the official build automatically on the first search.'}
                  </div>
                ) : null}
                <p className="mt-3 text-caption tracking-[0.12em] text-white/30 uppercase">
                  MP3 extraction uses the official yt-dlp · only download content you have rights to
                </p>
              </div>
            ) : youtubeSearching ? (
              <p className="px-3 py-6 text-caption text-white/45">Searching YouTube…</p>
            ) : youtubeError ? (
              <p className="px-3 py-6 text-caption text-white/45">{youtubeError}</p>
            ) : youtubeTracks.length === 0 ? (
              <div className="px-4 py-6">
                <p className="text-caption leading-relaxed text-white/45">
                  {youtubeWarning ?? `No YouTube match for “${youtubeQuery.trim()}”. Try the artist and song title together.`}
                </p>
              </div>
            ) : (
              <>
                {youtubeWarning ? (
                  <p className="mx-1 mb-1 rounded-lg bg-white/5 px-3 py-2 text-caption leading-relaxed text-white/50">
                    {youtubeWarning}
                  </p>
                ) : null}
                <ul className="flex flex-col gap-0.5">
                  {youtubeTracks.map((track) => (
                    <YouTubeTrackRow
                      key={track.id}
                      track={track}
                      current={playback.track?.id === track.id}
                      playing={playing}
                      preparing={
                        playback.track?.id === track.id &&
                        playback.status === 'loading' &&
                        !track.streamUrl
                      }
                      onPlay={playYouTube}
                      onOpen={openYouTube}
                      onCancel={() => musicEngine.cancelPreparing()}
                    />
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-white/8 px-4 py-2.5 text-caption text-white/40">
            <span className="min-w-0 truncate">
              {mode === 'library'
                ? `${folders.length === 0 ? 'No folders added' : `${folders.length} ${folders.length === 1 ? 'folder' : 'folders'}`}${scanning ? ` · scanning ${scannedFiles} files…` : ''}${scanError ? ` · ${scanError}` : ''}`
                : mode === 'all'
                  ? allSearching
                    ? 'Searching every source…'
                    : `${sourceCounts.library} local · ${sourceCounts.online} online · ${sourceCounts.youtube} YouTube${
                        youtubeSource
                          ? ` (${youtubeSource === 'api' ? 'API' : 'yt-dlp'})`
                          : ''
                      }`
                  : mode === 'online'
                    ? onlineSearching
                      ? 'Searching legal catalogs…'
                      : providerSummary(onlineProviders)
                    : youtubeSearching
                      ? 'Searching YouTube…'
                      : youtubeSource === 'api'
                        ? 'YouTube Data API'
                        : youtubeSource === 'yt-dlp'
                          ? 'yt-dlp search'
                          : youtubeStatus
                            ? `${youtubeStatus.cache.tracks} MP3 cached · yt-dlp ${youtubeStatus.ytDlp.ok ? 'ready' : 'missing'} · FFmpeg ${youtubeStatus.ffmpeg.ok ? 'ready' : 'missing'}`
                            : 'YouTube'}
            </span>
            <span className="shrink-0">
              {mode === 'library'
                ? `${tracks.length} tracks`
                : mode === 'all'
                  ? mixedVisible.length > 0
                    ? `${mixedVisible.length} results`
                    : 'All sources'
                  : mode === 'online'
                    ? onlineTracks.length > 0
                      ? `${onlineTracks.length} results`
                      : 'Online'
                    : youtubeTracks.length > 0
                      ? `${youtubeTracks.length} results`
                      : 'YouTube'}
            </span>
          </div>
        </div>

        <aside className="relative isolate flex w-[clamp(19rem,24vw,23rem)] shrink-0 flex-col overflow-hidden rounded-[1.35rem] border border-white/10 bg-black/30 p-5 backdrop-blur-xl [@media(max-height:760px)]:p-4">
          {/* The cover tints the panel the way the hero tints the library.
              The wrapper clips the scale-125 blur: without it the oversized
              image becomes scrollable overflow and drags a horizontal
              scrollbar (and clipped text) into the panel. */}
          {playback.track?.artworkUrl ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[inherit]"
            >
              <img
                src={playback.track.artworkUrl}
                alt=""
                draggable={false}
                className="size-full scale-125 object-cover opacity-40 blur-3xl"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/35 to-black/85" />
            </div>
          ) : null}

          {/* The identity block takes the space the controls leave, so the
              sleeve always fits instead of overflowing into a scroll area.
              The transport and the overlay switch below never move. */}
          <div className="flex min-h-0 flex-1 flex-col">
            <p className="shrink-0 text-caption font-medium tracking-[0.16em] text-white/45 uppercase">
              Now playing
            </p>

            {/* A large sleeve is what makes this panel read as a player rather
                than a form: the list already carries the small covers. A vh
                clamp grows smoothly instead of jumping between two fixed
                steps, and the wrapper clips so the square can never spill
                over the label above it on short screens. */}
            <div className="mt-3 flex min-h-0 flex-1 items-center justify-center overflow-hidden">
              <Cover track={playback.track} size="size-[clamp(6rem,19vh,13rem)]" />
            </div>

            <div className="mt-3 min-w-0 shrink-0 text-center">
              <p className="truncate text-label font-semibold text-white">
                {playback.track?.title ?? 'Nothing playing'}
              </p>
              <p className="mt-1 truncate text-caption text-white/65">
                {playback.track?.artist ?? 'Pick a track from the list'}
              </p>
              {playback.track?.provider === 'youtube' ? (
                <p
                  className="mt-0.5 truncate text-caption text-white/55"
                  title={playback.track.videoTitle ?? undefined}
                >
                  {playback.track.videoTitle &&
                  playback.track.videoTitle !== playback.track.title
                    ? playback.track.videoTitle
                    : ''}
                </p>
              ) : (
                <p className="mt-0.5 truncate text-caption text-white/55">
                  {playback.track?.album || ''}
                </p>
              )}
              {/* The provider badge and the external link share one row: on a
                  720p panel a second row costs more than the sleeve can spare. */}
              {playback.track?.provider ? (
                <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5">
                  {playback.track.streamKind ? (
                    <span className="rounded-full bg-white/8 px-2 py-0.5 text-caption font-semibold tracking-[0.06em] text-white/70 uppercase">
                      {playback.track.provider === 'youtube'
                        ? 'MP3'
                        : playback.track.streamKind === 'full'
                          ? 'Full'
                          : 'Preview'}
                    </span>
                  ) : null}
                  <span className="truncate text-caption text-white/65">
                    {playback.track.publisher ?? PROVIDER_LABELS[playback.track.provider]}
                  </span>
                  {playback.track.license ? (
                    <span className="text-caption text-white/50">
                      {playback.track.license}
                    </span>
                  ) : null}
                  {playback.track.youtubeId ? (
                    <WatchOnYouTube
                      videoId={playback.track.youtubeId}
                      title={playback.track.title}
                      onOpen={openYouTube}
                    />
                  ) : null}
                </div>
              ) : null}
              {playback.status === 'error' && playback.error ? (
                <p className="mx-auto mt-2 line-clamp-2 max-w-[18rem] text-caption leading-relaxed text-white/55">
                  {playback.error}
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-3 shrink-0">
            <SeekBar positionMs={playback.positionMs} durationMs={playback.durationMs} />
          </div>

          <div className="mt-3 flex shrink-0 items-center justify-center gap-3">
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

          <div className="mt-3 flex shrink-0 items-center justify-center gap-2">
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

            <VolumeControl volume={playback.volume} muted={playback.muted} />
          </div>

          <div className="mt-3 shrink-0 border-t border-white/8 pt-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-caption font-medium text-white">Desktop overlay</p>
                <p className="mt-0.5 text-caption leading-relaxed text-white/50 [@media(max-height:760px)]:hidden">
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

interface SourceChipProps {
  focusKey: string
  label: string
  count: number
  active: boolean
  onClick: () => void
}

function SourceChip({ focusKey, label, count, active, onClick }: SourceChipProps) {
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
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-medium outline-none transition-colors',
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
function MixedTrackRow({
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
            <span className="truncate text-caption font-medium">{track.title}</span>
            <span
              className={cn(
                'shrink-0 rounded-full px-2 py-0.5 text-caption font-medium',
                focused ? 'bg-black/10 text-black/65' : 'bg-white/12 text-white/70',
              )}
            >
              {badge}
            </span>
          </span>
          <span
            className={cn(
              'mt-0.5 block truncate text-caption',
              focused ? 'text-black/65' : 'text-white/60',
            )}
          >
            {track.artist}
            {track.publisher ? ` · ${track.publisher}` : track.album ? ` · ${track.album}` : ''}
          </span>
        </span>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-caption font-medium',
            focused ? 'bg-black/10 text-black/60' : 'bg-white/8 text-white/50',
          )}
        >
          {SOURCE_LABELS[source]}
        </span>
        <span
          className={cn(
            'w-11 shrink-0 text-right text-caption tabular-nums',
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
            'grid size-9 shrink-0 place-items-center rounded-full text-caption font-semibold outline-none transition-colors',
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

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB'
  const megabytes = bytes / (1024 * 1024)
  return megabytes >= 1024
    ? `${(megabytes / 1024).toFixed(1)} GB`
    : `${megabytes.toFixed(1)} MB`
}

interface SetupFieldProps {
  focusKey: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  secret?: boolean
  wide?: boolean
}

function SetupField({
  focusKey,
  label,
  value,
  onChange,
  placeholder,
  secret,
  wide,
}: SetupFieldProps) {
  const { ref, focused } = useFocusable<Record<string, never>, HTMLInputElement>({
    focusKey,
    accessibilityLabel: label,
    onEnterPress: () => ref.current?.focus(),
  })

  return (
    <label className={cn('block min-w-0', wide && 'md:col-span-2')}>
      <span className="text-caption font-medium tracking-[0.08em] text-white/45 uppercase">
        {label}
      </span>
      <input
        ref={ref}
        type={secret ? 'password' : 'text'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        autoComplete="off"
        spellCheck={false}
        data-focus-key={focusKey}
        className={cn(
          'mt-1 h-8 w-full rounded-lg border bg-black/25 px-2.5 text-caption text-white outline-none placeholder:text-white/25',
          focused ? 'border-white/35' : 'border-white/10',
        )}
        style={focused ? { boxShadow: `0 0 0 2px ${uiAccent(0.55)}` } : undefined}
      />
    </label>
  )
}

interface ToolBadgeProps {
  label: string
  info: MusicYouTubeStatus['ytDlp'] | null
}

function ToolBadge({ label, info }: ToolBadgeProps) {
  const ready = info?.ok ?? false
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 rounded-lg bg-black/20 px-2 py-1.5 ring-1 ring-white/8">
      <span className="shrink-0 text-caption text-white/40">{label}</span>
      <span
        className={cn(
          'min-w-0 truncate text-caption',
          ready ? 'text-white/70' : 'text-white/40',
        )}
        title={info?.path ?? undefined}
      >
        {info
          ? ready
            ? `${info.version ?? 'Ready'} · ${YOUTUBE_TOOL_SOURCES[info.source]}`
            : 'Missing'
          : 'Checking…'}
      </span>
    </div>
  )
}

interface YouTubeSetupProps {
  status: MusicYouTubeStatus | null
  loading: boolean
  statusError: string | null
  apiKey: string
  ytDlpPath: string
  ffmpegPath: string
  cacheLimitMb: string
  saving: boolean
  saveError: string | null
  clearing: boolean
  onApiKeyChange: (value: string) => void
  onYtDlpChange: (value: string) => void
  onFfmpegChange: (value: string) => void
  onCacheLimitChange: (value: string) => void
  onSave: () => void
  onRefresh: () => void
  onClearCache: () => void
  onRemoveCached: (videoId: string) => void
}

function YouTubeSetup({
  status,
  loading,
  statusError,
  apiKey,
  ytDlpPath,
  ffmpegPath,
  cacheLimitMb,
  saving,
  saveError,
  clearing,
  onApiKeyChange,
  onYtDlpChange,
  onFfmpegChange,
  onCacheLimitChange,
  onSave,
  onRefresh,
  onClearCache,
  onRemoveCached,
}: YouTubeSetupProps) {
  const { ref: clearRef, focused: clearFocused } = useFocusable<
    Record<string, never>,
    HTMLButtonElement
  >({
    focusKey: YOUTUBE_CLEAR_KEY,
    accessibilityLabel: 'Clear the YouTube MP3 cache',
    onEnterPress: onClearCache,
  })
  const entries = status?.cache.entries ?? []
  const limit = Number(cacheLimitMb)
  const overLimit =
    status !== null && Number.isFinite(limit) && status.cache.bytes > limit * 1024 * 1024

  return (
    <div className="m-2 mb-0 rounded-xl border border-white/10 bg-white/4 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-caption font-medium text-white">
            <YoutubeFilled className="size-4" />
            YouTube setup
          </p>
          <p className="mt-1 max-w-xl text-caption leading-relaxed text-white/45">
            Add a YouTube Data API v3 key for structured search. It is optional: without a key,
            Pulse searches with yt-dlp. The key is stored locally and only sent to googleapis.com.
          </p>
        </div>
        <Tool
          focusKey={YOUTUBE_REFRESH_KEY}
          label={loading ? 'Checking' : 'Refresh'}
          icon={<Refresh2Filled className={cn('size-4', loading && 'animate-spin')} />}
          onClick={onRefresh}
          disabled={loading}
        />
      </div>

      {statusError ? (
        <p className="mt-2 text-caption text-white/45">{statusError}</p>
      ) : null}

      <div className="mt-2 grid gap-2 md:grid-cols-2">
        <SetupField
          focusKey={YOUTUBE_KEY_FIELD}
          label="YouTube Data API key"
          value={apiKey}
          onChange={onApiKeyChange}
          placeholder="AIza…"
          secret
          wide
        />
        <SetupField
          focusKey={YOUTUBE_YTDLP_FIELD}
          label="yt-dlp path (optional)"
          value={ytDlpPath}
          onChange={onYtDlpChange}
          placeholder="Auto-detect / auto-download"
        />
        <SetupField
          focusKey={YOUTUBE_FFMPEG_FIELD}
          label="FFmpeg path (optional)"
          value={ffmpegPath}
          onChange={onFfmpegChange}
          placeholder="Auto-detect"
        />
        <SetupField
          focusKey={YOUTUBE_CACHE_LIMIT_FIELD}
          label="MP3 cache limit (MB)"
          value={cacheLimitMb}
          onChange={onCacheLimitChange}
          placeholder="2048"
          wide
        />
      </div>

      <div className="mt-2 grid gap-1.5 md:grid-cols-3">
        <ToolBadge label="yt-dlp" info={status?.ytDlp ?? null} />
        <ToolBadge label="FFmpeg" info={status?.ffmpeg ?? null} />
        <div className="flex items-center justify-between gap-2 rounded-lg bg-black/20 px-2 py-1.5 ring-1 ring-white/8">
          <span className="text-caption text-white/40">MP3 cache</span>
          <span className={cn('truncate text-caption', overLimit ? 'text-white' : 'text-white/70')}>
            {status ? `${status.cache.tracks} · ${formatBytes(status.cache.bytes)}` : 'Checking…'}
          </span>
        </div>
      </div>

      {entries.length > 0 ? (
        <div className="mt-2 rounded-lg bg-black/20 p-1.5 ring-1 ring-white/8">
          <div className="flex items-center justify-between gap-2 px-1 pb-1">
            <span className="text-caption tracking-[0.08em] text-white/35 uppercase">
              Cached tracks · oldest first
            </span>
            <button
              ref={clearRef}
              type="button"
              tabIndex={-1}
              data-focus-key={YOUTUBE_CLEAR_KEY}
              aria-label="Clear the YouTube MP3 cache"
              onClick={onClearCache}
              disabled={clearing}
              className={cn(
                'rounded-full px-2 py-0.5 text-caption font-medium outline-none transition-colors',
                clearing
                  ? 'text-white/25'
                  : clearFocused
                    ? 'bg-white text-black'
                    : 'text-white/60 hover:bg-white/10 hover:text-white',
              )}
              style={clearFocused ? { boxShadow: `0 0 0 2px ${uiAccent(0.55)}` } : undefined}
            >
              {clearing ? 'Clearing…' : 'Clear cache'}
            </button>
          </div>
          <ul className="max-h-24 overflow-y-auto no-scrollbar">
            {entries.slice(0, 12).map((entry) => (
              <li
                key={entry.videoId}
                className="flex items-center justify-between gap-2 rounded px-1 py-0.5 text-caption text-white/55"
              >
                <span className="min-w-0 truncate">
                  {entry.title} · {entry.artist}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="tabular-nums text-white/35">{formatBytes(entry.bytes)}</span>
                  <button
                    type="button"
                    tabIndex={-1}
                    data-focus-key={`${YOUTUBE_REMOVE_KEY}-${entry.videoId}`}
                    aria-label={`Delete the cached MP3 for ${entry.title}`}
                    onClick={() => onRemoveCached(entry.videoId)}
                    className="rounded-full px-1.5 text-caption text-white/40 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    Delete
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="max-w-xl text-caption leading-relaxed text-white/35">
          Pulse downloads the official yt-dlp automatically. FFmpeg must be installed separately
          (for example with winget install Gyan.FFmpeg) or pointed to above.
        </p>
        <Tool
          focusKey={YOUTUBE_SAVE_KEY}
          label={saving ? 'Saving' : 'Save'}
          icon={<CheckFilled className={cn('size-4', saving && 'animate-pulse')} />}
          onClick={onSave}
          disabled={saving}
        />
      </div>
      {saveError ? <p className="mt-1 text-caption text-white/45">{saveError}</p> : null}
      {status && !status.ffmpeg.ok ? (
        <p className="mt-1 text-caption leading-relaxed text-white/40">{status.ffmpeg.error}</p>
      ) : null}
    </div>
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

function YouTubeTrackRow({
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
            <span className="truncate text-caption font-medium">{track.title}</span>
            <span
              className={cn(
                'shrink-0 rounded-full px-2 py-0.5 text-caption font-medium',
                focused ? 'bg-black/10 text-black/65' : 'bg-white/12 text-white/70',
              )}
            >
              {preparing ? 'Preparing…' : 'MP3'}
            </span>
          </span>
          <span
            className={cn(
              'mt-0.5 block truncate text-caption',
              focused ? 'text-black/65' : 'text-white/60',
            )}
          >
            {track.artist} · {track.publisher}
          </span>
          {track.videoTitle !== track.title ? (
            <span
              className={cn(
                'mt-0.5 block truncate text-caption [@media(max-height:760px)]:hidden',
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
            'w-11 shrink-0 text-right text-caption tabular-nums',
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
            'grid size-9 shrink-0 place-items-center rounded-full text-caption font-semibold outline-none transition-colors',
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

function WatchOnYouTube({ videoId, title, onOpen }: WatchOnYouTubeProps) {
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
        'inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-caption font-medium outline-none transition-colors',
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
          <span className="block truncate text-caption font-medium">{track.title}</span>
          <span
            className={cn(
              'mt-0.5 block truncate text-caption',
              focused ? 'text-black/65' : 'text-white/60',
            )}
          >
            {track.artist}
            {track.album ? ` · ${track.album}` : ''}
          </span>
        </span>
        <span
          className={cn(
            'shrink-0 text-caption tabular-nums',
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

function OnlineTrackRow({ track, current, playing, onPlay }: OnlineTrackRowProps) {
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
            <span className="truncate text-caption font-medium">{track.title}</span>
            <span
              className={cn(
                'shrink-0 rounded-full px-2 py-0.5 text-caption font-medium',
                focused ? 'bg-black/10 text-black/65' : 'bg-white/12 text-white/70',
              )}
            >
              {kindLabel}
            </span>
          </span>
          <span
            className={cn(
              'mt-0.5 block truncate text-caption',
              focused ? 'text-black/65' : 'text-white/60',
            )}
          >
            {track.artist} · {track.publisher}
            {track.license ? ` · ${track.license}` : ''}
          </span>
        </span>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-caption font-medium',
            focused ? 'bg-black/10 text-black/60' : 'bg-white/12 text-white/65',
          )}
        >
          {PROVIDER_LABELS[track.provider]}
        </span>
        <span
          className={cn(
            'w-11 shrink-0 text-right text-caption tabular-nums',
            focused ? 'text-black/65' : 'text-white/55',
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
