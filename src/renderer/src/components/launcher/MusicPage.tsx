import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeftFilled,
  FolderOpenFilled,
  MiniplayerFilled,
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
  YoutubeFilled,
} from '@mingcute/react/core-filled'
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation-react'
import { pause, resume } from '@noriginmedia/norigin-spatial-navigation-core'
import type {
  MusicOnlineProviderStatus,
  MusicOnlineTrack,
  MusicTrack,
  MusicYouTubeTrack,
} from '@shared/types'
import {
  countSources,
  filterBySource,
  filterTracks,
  mergeSources,
} from '@/lib/music-queue'
import type { MusicSourceFilter } from '@/lib/music-queue'
import { uiAccent } from '@/lib/accent'
import { musicEngine } from '@/lib/music-engine'
import { useMusicEngineState } from '@/hooks/use-music-engine'
import { useMusicStore } from '@/store/music'
import { cn } from 'cn'
import { Tool, ModeTab, Transport } from '@/components/launcher/MusicControls'
import { YouTubeSetup } from '@/components/launcher/YouTubeSetup'
import { Cover, PROVIDER_LABELS, SOURCE_LABELS, SourceChip, MixedTrackRow, YouTubeTrackRow, WatchOnYouTube, TrackRow, OnlineTrackRow } from '@/components/launcher/MusicTrackRows'
import { OverlaySwitch, SeekBar, VolumeControl } from '@/components/launcher/MusicPlaybackControls'
import { useMusicSearch } from '@/hooks/use-music-search'
import { useYouTubeSetup } from '@/hooks/use-youtube-setup'

const BACK_KEY = 'music-back'
const MODE_ALL_KEY = 'music-mode-all'
const MODE_LIBRARY_KEY = 'music-mode-library'
const MODE_ONLINE_KEY = 'music-mode-online'
const MODE_YOUTUBE_KEY = 'music-mode-youtube'
const FILTER_KEY = 'music-filter'
const SOURCE_FILTER_PREFIX = 'music-source'
const YOUTUBE_SETUP_KEY = 'music-youtube-setup'
const SCAN_CANCEL_KEY = 'music-scan-cancel'
const ADD_KEY = 'music-add-folder'
const RESCAN_KEY = 'music-rescan'
const OVERLAY_PREVIEW_KEY = 'music-overlay-preview'
const PLAY_KEY = 'music-play'
const PREVIOUS_KEY = 'music-previous'
const NEXT_KEY = 'music-next'
const REPEAT_KEY = 'music-repeat'
const SHUFFLE_KEY = 'music-shuffle'


const ONLINE_CATALOG_HINT = 'iTunes · Deezer · Audius · Openverse · Archive'

type MusicMode = 'all' | 'library' | 'online' | 'youtube'
type SourceFilter = MusicSourceFilter



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
  const {
    youtubeStatus,
    youtubeStatusLoading,
    youtubeStatusError,
    setupOpen,
    youtubeApiKey,
    youtubeYtDlpPath,
    youtubeFfmpegPath,
    youtubeSaving,
    youtubeSaveError,
    youtubeCacheLimit,
    youtubeClearing,
    draftSynced,
    setYoutubeApiKey,
    setYoutubeYtDlpPath,
    setYoutubeFfmpegPath,
    setYoutubeCacheLimit,
    loadYouTubeStatus,
    saveYouTubeSettings,
    clearYouTubeCache,
    removeCachedTrack,
    toggleSetup,
  } = useYouTubeSetup()
  const [mode, setMode] = useState<MusicMode>('all')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [query, setQuery] = useState('')
  const {
    onlineQuery,
    setOnlineQuery,
    onlineTracks,
    onlineProviders,
    onlineSearching,
    onlineError,
    onlineWarning,
    youtubeQuery,
    setYoutubeQuery,
    youtubeTracks,
    youtubeSource,
    youtubeWarning,
    youtubeSearching,
    youtubeError,
    allSearching,
    searchOnline,
    searchYouTube,
    searchAll,
  } = useMusicSearch()



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
            'inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-[0.78rem] font-medium outline-none transition-colors',
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
              draftSynced={draftSynced}
              saveError={youtubeSaveError}
              clearing={youtubeClearing}
              onApiKeyChange={setYoutubeApiKey}
              onYtDlpChange={setYoutubeYtDlpPath}
              onFfmpegChange={setYoutubeFfmpegPath}
              onCacheLimitChange={setYoutubeCacheLimit}
              onSave={saveYouTubeSettings}
              onRefresh={() => loadYouTubeStatus(!draftSynced)}
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
              className="h-7 min-w-0 flex-1 bg-transparent text-[0.82rem] text-white outline-none placeholder:text-white/30"
            />
            <span className="shrink-0 text-[0.72rem] tabular-nums text-white/55">
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
                    <p className="text-[0.95rem] font-medium">One search, every source</p>
                  </div>
                  <p className="mt-1.5 max-w-lg text-[0.8rem] leading-relaxed text-white/45">
                    Type at least two characters to search your local folders, the legal online
                    catalogs, and YouTube at the same time. Local matches appear instantly; remote
                    results follow as each source answers. Use the source chips to narrow the list.
                  </p>
                  <p className="mt-3 text-[0.62rem] tracking-[0.12em] text-white/30 uppercase">
                    Local files · {ONLINE_CATALOG_HINT} · YouTube
                  </p>
                </div>
              ) : mixedVisible.length === 0 ? (
                <div className="px-4 py-8">
                  <p className="text-[0.8rem] leading-relaxed text-white/45">
                    {allSearching
                      ? 'Searching your library, the online catalogs, and YouTube…'
                      : `No match for “${query.trim()}” in any source.`}
                  </p>
                  {!allSearching && (onlineError || youtubeError) ? (
                    <p className="mt-2 text-[0.72rem] leading-relaxed text-white/40">
                      {[onlineError, youtubeError].filter(Boolean).join(' ')}
                    </p>
                  ) : null}
                </div>
              ) : (
                <>
                  {sourceFilter === 'youtube' && youtubeWarning ? (
                    <p className="mx-1 mb-1 rounded-lg bg-white/5 px-3 py-2 text-[0.7rem] leading-relaxed text-white/50">
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
                <p className="px-3 py-6 text-[0.8rem] text-white/45">
                  Reading your music library…
                </p>
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
              )
            ) : mode === 'online' ? (
              onlinePrompt ? (
              <div className="px-4 py-10">
                <p className="text-[0.95rem] font-medium text-white">Search the legal catalogs</p>
                <p className="mt-1.5 max-w-md text-[0.8rem] leading-relaxed text-white/45">
                  Type at least two characters to search Apple Music, Deezer, Audius, Openverse,
                  and Internet Archive. Pulse ranks the results and plays them through the same
                  player; nothing is downloaded.
                </p>
                <p className="mt-3 text-[0.62rem] tracking-[0.12em] text-white/30 uppercase">
                  Previews from Apple Music and Deezer · full tracks from the open catalogs
                </p>
              </div>
            ) : onlineSearching ? (
              <p className="px-3 py-6 text-[0.8rem] text-white/45">
                Searching the online catalogs…
              </p>
            ) : onlineError ? (
              <p className="px-3 py-6 text-[0.8rem] text-white/45">{onlineError}</p>
            ) : onlineFailed ? (
              <p className="px-3 py-6 text-[0.8rem] text-white/45">
                The online catalogs could not be reached. Check your connection and try again.
              </p>
            ) : onlineTracks.length === 0 ? (
              <p className="px-3 py-6 text-[0.8rem] text-white/45">
                No online match for “{onlineQuery.trim()}”. Try the artist and song title
                together.
              </p>
            ) : (
              <>
                {onlineWarning ? (
                  <p className="mx-1 mb-1 rounded-lg bg-white/5 px-3 py-2 text-[0.7rem] leading-relaxed text-white/50">
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
                  <p className="text-[0.95rem] font-medium">Search YouTube</p>
                </div>
                <p className="mt-1.5 max-w-md text-[0.8rem] leading-relaxed text-white/45">
                  Type at least two characters. Search uses the YouTube Data API when a key is
                  configured and falls back to yt-dlp. Playing a result extracts an MP3 once and
                  keeps it in the local cache.
                </p>
                {youtubeStatus && (!youtubeStatus.ytDlp.ok || !youtubeStatus.ffmpeg.ok) ? (
                  <div className="mt-3 max-w-md rounded-lg bg-white/5 px-3 py-2 text-[0.72rem] leading-relaxed text-white/55 ring-1 ring-white/8">
                    {!youtubeStatus.ffmpeg.ok
                      ? 'FFmpeg is missing. Install it with "winget install Gyan.FFmpeg", then open Setup and press Refresh.'
                      : 'yt-dlp is not installed yet; Pulse downloads the official build automatically on the first search.'}
                  </div>
                ) : null}
                <p className="mt-3 text-[0.62rem] tracking-[0.12em] text-white/30 uppercase">
                  MP3 extraction uses the official yt-dlp · only download content you have rights to
                </p>
              </div>
            ) : youtubeSearching ? (
              <p className="px-3 py-6 text-[0.8rem] text-white/45">Searching YouTube…</p>
            ) : youtubeError ? (
              <p className="px-3 py-6 text-[0.8rem] text-white/45">{youtubeError}</p>
            ) : youtubeTracks.length === 0 ? (
              <div className="px-4 py-6">
                <p className="text-[0.8rem] leading-relaxed text-white/45">
                  {youtubeWarning ?? `No YouTube match for “${youtubeQuery.trim()}”. Try the artist and song title together.`}
                </p>
              </div>
            ) : (
              <>
                {youtubeWarning ? (
                  <p className="mx-1 mb-1 rounded-lg bg-white/5 px-3 py-2 text-[0.7rem] leading-relaxed text-white/50">
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

          <div className="flex items-center justify-between gap-4 border-t border-white/8 px-4 py-2.5 text-[0.66rem] text-white/40">
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
            <p className="shrink-0 text-[0.64rem] font-medium tracking-[0.16em] text-white/45 uppercase">
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
              <p className="truncate text-[1.06rem] font-semibold text-white">
                {playback.track?.title ?? 'Nothing playing'}
              </p>
              <p className="mt-1 truncate text-[0.84rem] text-white/65">
                {playback.track?.artist ?? 'Pick a track from the list'}
              </p>
              {playback.track?.provider === 'youtube' ? (
                <p
                  className="mt-0.5 truncate text-[0.76rem] text-white/55"
                  title={playback.track.videoTitle ?? undefined}
                >
                  {playback.track.videoTitle &&
                  playback.track.videoTitle !== playback.track.title
                    ? playback.track.videoTitle
                    : ''}
                </p>
              ) : (
                <p className="mt-0.5 truncate text-[0.76rem] text-white/55">
                  {playback.track?.album || ''}
                </p>
              )}
              {/* The provider badge and the external link share one row: on a
                  720p panel a second row costs more than the sleeve can spare. */}
              {playback.track?.provider ? (
                <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5">
                  {playback.track.streamKind ? (
                    <span className="rounded-full bg-white/8 px-2 py-0.5 text-[0.6rem] font-semibold tracking-[0.06em] text-white/70 uppercase">
                      {playback.track.provider === 'youtube'
                        ? 'MP3'
                        : playback.track.streamKind === 'full'
                          ? 'Full'
                          : 'Preview'}
                    </span>
                  ) : null}
                  <span className="truncate text-[0.76rem] text-white/65">
                    {playback.track.publisher ?? PROVIDER_LABELS[playback.track.provider]}
                  </span>
                  {playback.track.license ? (
                    <span className="text-[0.64rem] text-white/50">
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
                <p className="mx-auto mt-2 line-clamp-2 max-w-[18rem] text-[0.68rem] leading-relaxed text-white/55">
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
                <p className="text-[0.8rem] font-medium text-white">Desktop overlay</p>
                <p className="mt-0.5 text-[0.7rem] leading-relaxed text-white/50 [@media(max-height:760px)]:hidden">
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


