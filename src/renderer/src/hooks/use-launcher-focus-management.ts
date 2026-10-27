import { useCallback, useEffect, useRef } from 'react'
import type { GameSummary } from '@shared/contracts/games'
import {
  doesFocusableExist,
  getCurrentFocusKey,
  setFocus,
} from '@noriginmedia/norigin-spatial-navigation-core'

interface UseLauncherFocusManagementOptions {
  bootDone: boolean
  games: GameSummary[]
  initialFocusKey: string | null
  lastFocusKey: { current: string | null }
  refreshing: boolean
  status: 'loading' | 'ready' | 'error'
}

/** Keeps spatial focus stable as the library loads, changes, and regains window focus. */
export function useLauncherFocusManagement({
  bootDone,
  games,
  initialFocusKey,
  lastFocusKey,
  refreshing,
  status,
}: UseLauncherFocusManagementOptions): void {
  const initialFocusDone = useRef(false)
  const emptyFocusDone = useRef(false)

  const focusFirstElement = useCallback(() => {
    if (games.length === 0) {
      if (emptyFocusDone.current) return
      window.setTimeout(() => {
        if (!doesFocusableExist('empty-refresh')) return
        emptyFocusDone.current = true
        void setFocus('empty-refresh')
      }, 200)
      return
    }
    emptyFocusDone.current = false
    if (initialFocusDone.current || !initialFocusKey) return
    window.setTimeout(() => {
      if (!doesFocusableExist(initialFocusKey)) return
      initialFocusDone.current = true
      lastFocusKey.current = initialFocusKey
      void setFocus(initialFocusKey)
    }, 250)
  }, [games.length, initialFocusKey, lastFocusKey])

  useEffect(() => {
    if (status === 'loading' || !bootDone) return
    focusFirstElement()
  }, [bootDone, focusFirstElement, refreshing, status])

  useEffect(() => {
    if (status !== 'ready' || !lastFocusKey.current) return
    const timer = window.setTimeout(() => {
      if (!doesFocusableExist(lastFocusKey.current ?? '')) {
        const fallback = initialFocusKey
        if (fallback && doesFocusableExist(fallback)) {
          lastFocusKey.current = fallback
          void setFocus(fallback)
        }
      }
    }, 180)
    return () => window.clearTimeout(timer)
  }, [games, initialFocusKey, lastFocusKey, status])

  useEffect(() => {
    if (!bootDone) return
    const onWindowFocus = (): void => {
      window.setTimeout(() => {
        // Keep the user's place when it still exists. Focus is only recovered
        // when the focused control unmounted, for example a running-only hero
        // action after the game exits. Bringing a game to the front and back
        // must not move focus from the hero row to the last cover.
        const current = getCurrentFocusKey()
        if (current && doesFocusableExist(current)) return
        const target = lastFocusKey.current ?? initialFocusKey
        if (target && doesFocusableExist(target)) void setFocus(target)
      }, 60)
    }
    window.addEventListener('focus', onWindowFocus)
    return () => window.removeEventListener('focus', onWindowFocus)
  }, [bootDone, initialFocusKey, lastFocusKey])
}
