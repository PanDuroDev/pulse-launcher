import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  MusicOnlineProviderStatus,
  MusicOnlineTrack,
  MusicYouTubeSearchSource,
  MusicYouTubeTrack,
} from '@shared/contracts/music'

// One debounce for both remote search modes keeps their behaviour identical.
const SEARCH_DELAY_MS = 450

/**
 * Owns debounced online-catalog and YouTube searches, including the unified
 * search that runs both sources concurrently and discards stale responses.
 */
export function useMusicSearch() {
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
  /** Tracks completion of the combined online-catalog and YouTube search. */
  const [allSearching, setAllSearching] = useState(false)
  const searchTimer = useRef<number | null>(null)
  const searchRequest = useRef(0)
  const youtubeTimer = useRef<number | null>(null)
  const youtubeRequest = useRef(0)
  const allTimer = useRef<number | null>(null)
  const allRequest = useRef(0)

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


  return {
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
  }
}
