import { useCallback, useRef, useState } from 'react'
import type { MusicYouTubeStatus } from '@shared/types'

export function useYouTubeSetup() {
  const [youtubeStatus, setYoutubeStatus] = useState<MusicYouTubeStatus | null>(null)
  const [youtubeStatusLoading, setYoutubeStatusLoading] = useState(false)
  const [youtubeStatusError, setYoutubeStatusError] = useState<string | null>(null)
  const [setupOpen, setSetupOpen] = useState(false)
  const setupOpenRef = useRef(false)
  const [youtubeApiKey, setYoutubeApiKey] = useState('')
  const [youtubeYtDlpPath, setYoutubeYtDlpPath] = useState('')
  const [youtubeFfmpegPath, setYoutubeFfmpegPath] = useState('')
  const [youtubeSaving, setYoutubeSaving] = useState(false)
  const [youtubeSaveError, setYoutubeSaveError] = useState<string | null>(null)
  const [youtubeCacheLimit, setYoutubeCacheLimit] = useState('')
  const [youtubeClearing, setYoutubeClearing] = useState(false)
  /** True once the draft fields hold the stored settings, so Save cannot blank them. */
  const [draftSynced, setDraftSynced] = useState(false)

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
    const nextOpen = !setupOpenRef.current
    setupOpenRef.current = nextOpen
    setSetupOpen(nextOpen)
    if (nextOpen && !draftSynced) loadYouTubeStatus(true)
  }, [draftSynced, loadYouTubeStatus])

  return {
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
    setYoutubeApiKey,
    setYoutubeYtDlpPath,
    setYoutubeFfmpegPath,
    setYoutubeCacheLimit,
    loadYouTubeStatus,
    saveYouTubeSettings,
    clearYouTubeCache,
    removeCachedTrack,
    toggleSetup,
  }
}
