import { CheckFilled, Refresh2Filled, YoutubeFilled } from '@mingcute/react/core-filled'
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation-react'
import type { MusicYouTubeStatus } from '@shared/types'
import { uiAccent } from '@/lib/accent'
import { cn } from 'cn'
import { Tool } from '@/components/launcher/MusicControls'

const YOUTUBE_TOOL_SOURCES: Record<MusicYouTubeStatus['ytDlp']['source'], string> = {
  configured: 'Configured',
  path: 'PATH',
  downloaded: 'Downloaded',
  missing: 'Missing',
}

const YOUTUBE_REFRESH_KEY = 'music-youtube-refresh'
const YOUTUBE_KEY_FIELD = 'music-youtube-key'
const YOUTUBE_YTDLP_FIELD = 'music-youtube-ytdlp'
const YOUTUBE_FFMPEG_FIELD = 'music-youtube-ffmpeg'
const YOUTUBE_SAVE_KEY = 'music-youtube-save'
const YOUTUBE_CACHE_LIMIT_FIELD = 'music-youtube-cache-limit'
const YOUTUBE_CLEAR_KEY = 'music-youtube-clear-cache'
const YOUTUBE_REMOVE_KEY = 'music-youtube-remove'

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
      <span className="text-[0.62rem] font-medium tracking-[0.08em] text-white/45 uppercase">
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
          'mt-1 h-8 w-full rounded-lg border bg-black/25 px-2.5 text-[0.72rem] text-white outline-none placeholder:text-white/25',
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
      <span className="shrink-0 text-[0.62rem] text-white/40">{label}</span>
      <span
        className={cn(
          'min-w-0 truncate text-[0.64rem]',
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
  draftSynced: boolean
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

export function YouTubeSetup({
  status,
  loading,
  statusError,
  apiKey,
  ytDlpPath,
  ffmpegPath,
  cacheLimitMb,
  saving,
  draftSynced,
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
          <p className="flex items-center gap-2 text-[0.78rem] font-medium text-white">
            <YoutubeFilled className="size-4" />
            YouTube setup
          </p>
          <p className="mt-1 max-w-xl text-[0.66rem] leading-relaxed text-white/45">
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
        <p className="mt-2 text-[0.68rem] text-white/45">{statusError}</p>
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
          <span className="text-[0.62rem] text-white/40">MP3 cache</span>
          <span className={cn('truncate text-[0.64rem]', overLimit ? 'text-white' : 'text-white/70')}>
            {status ? `${status.cache.tracks} · ${formatBytes(status.cache.bytes)}` : 'Checking…'}
          </span>
        </div>
      </div>

      {entries.length > 0 ? (
        <div className="mt-2 rounded-lg bg-black/20 p-1.5 ring-1 ring-white/8">
          <div className="flex items-center justify-between gap-2 px-1 pb-1">
            <span className="text-[0.6rem] tracking-[0.08em] text-white/35 uppercase">
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
                'rounded-full px-2 py-0.5 text-[0.62rem] font-medium outline-none transition-colors',
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
                className="flex items-center justify-between gap-2 rounded px-1 py-0.5 text-[0.64rem] text-white/55"
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
                    className="rounded-full px-1.5 text-[0.6rem] text-white/40 transition-colors hover:bg-white/10 hover:text-white"
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
        <p className="max-w-xl text-[0.62rem] leading-relaxed text-white/35">
          Pulse downloads the official yt-dlp automatically. FFmpeg must be installed separately
          (for example with winget install Gyan.FFmpeg) or pointed to above.
        </p>
        <Tool
          focusKey={YOUTUBE_SAVE_KEY}
          label={saving ? 'Saving' : 'Save'}
          icon={<CheckFilled className={cn('size-4', saving && 'animate-pulse')} />}
          onClick={onSave}
          disabled={saving || !draftSynced}
        />
      </div>
      {saveError ? <p className="mt-1 text-[0.66rem] text-white/45">{saveError}</p> : null}
      {status && !status.ffmpeg.ok ? (
        <p className="mt-1 text-[0.64rem] leading-relaxed text-white/40">{status.ffmpeg.error}</p>
      ) : null}
    </div>
  )
}
