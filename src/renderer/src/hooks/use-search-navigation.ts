import { useCallback, useRef } from 'react'
import {
  doesFocusableExist,
  getCurrentFocusKey,
  setFocus,
} from '@noriginmedia/norigin-spatial-navigation-core'

interface UseSearchNavigationOptions {
  addOpen: boolean
  initialFocusKey: string | null
  lastFocusKey: { current: string | null }
  powerOpen: boolean
  searchOpen: boolean
  setSearchOpen: (open: boolean) => void
  setSearchQuery: (query: string) => void
  settingsOpen: boolean
}

/** Opens/closes search and restores the previous spatial focus target. */
export function useSearchNavigation({
  addOpen,
  initialFocusKey,
  lastFocusKey,
  powerOpen,
  searchOpen,
  setSearchOpen,
  setSearchQuery,
  settingsOpen,
}: UseSearchNavigationOptions) {
  const searchReturnFocus = useRef<string | null>(null)

  const openSearch = useCallback(() => {
    if (searchOpen || settingsOpen || addOpen || powerOpen) return
    const current = getCurrentFocusKey()
    searchReturnFocus.current =
      current && !current.startsWith('search-') ? current : lastFocusKey.current
    setSearchQuery('')
    setSearchOpen(true)
  }, [
    addOpen,
    lastFocusKey,
    powerOpen,
    searchOpen,
    setSearchOpen,
    setSearchQuery,
    settingsOpen,
  ])

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    setSearchQuery('')
    window.setTimeout(() => {
      const preferred = searchReturnFocus.current
      if (
        preferred &&
        !preferred.startsWith('search-') &&
        doesFocusableExist(preferred)
      ) {
        void setFocus(preferred)
        return
      }
      const fallback = lastFocusKey.current ?? initialFocusKey
      if (
        fallback &&
        !fallback.startsWith('search-') &&
        doesFocusableExist(fallback)
      ) {
        void setFocus(fallback)
        return
      }
      if (initialFocusKey && doesFocusableExist(initialFocusKey)) {
        void setFocus(initialFocusKey)
      }
    }, 80)
  }, [initialFocusKey, lastFocusKey, setSearchOpen, setSearchQuery])

  return { openSearch, closeSearch }
}
