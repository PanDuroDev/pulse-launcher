import { useCallback } from 'react'
import {
  doesFocusableExist,
  setFocus,
} from '@noriginmedia/norigin-spatial-navigation-core'

interface UseSecondaryPageNavigationOptions {
  gamesEmpty: boolean
  initialFocusKey: string | null
  lastFocusKey: { current: string | null }
  setMusicOpen: (open: boolean) => void
  setPowerOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
  settingsOpen: boolean
}

/** Owns focus hand-off for the Settings and Music pages. */
export function useSecondaryPageNavigation({
  gamesEmpty,
  initialFocusKey,
  lastFocusKey,
  setMusicOpen,
  setPowerOpen,
  setSettingsOpen,
  settingsOpen,
}: UseSecondaryPageNavigationOptions) {
  const openSettings = useCallback(() => {
    if (settingsOpen) return
    setPowerOpen(false)
    setSettingsOpen(true)
    window.setTimeout(() => {
      if (doesFocusableExist('settings-back')) void setFocus('settings-back')
    }, 80)
  }, [setPowerOpen, setSettingsOpen, settingsOpen])

  const closeSettings = useCallback(() => {
    // A text field owns the keyboard while it is being edited: the first
    // Escape/Back leaves the field instead of closing the page.
    const active = document.activeElement
    if (
      active instanceof HTMLElement &&
      (active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.isContentEditable)
    ) {
      active.blur()
      return
    }
    setSettingsOpen(false)
    window.setTimeout(() => {
      if (doesFocusableExist('tool-settings')) {
        void setFocus('tool-settings')
        return
      }
      const target = lastFocusKey.current ?? initialFocusKey
      if (target && doesFocusableExist(target)) {
        void setFocus(target)
      } else if (gamesEmpty && doesFocusableExist('empty-refresh')) {
        void setFocus('empty-refresh')
      }
    }, 80)
  }, [gamesEmpty, initialFocusKey, lastFocusKey, setSettingsOpen])

  const openMusic = useCallback(() => {
    setPowerOpen(false)
    setMusicOpen(true)
    window.setTimeout(() => {
      if (doesFocusableExist('music-back')) void setFocus('music-back')
    }, 80)
  }, [setMusicOpen, setPowerOpen])

  const closeMusic = useCallback(() => {
    // A field on the music page owns the keyboard: the first Escape leaves the
    // field, the second closes the page — same contract as Settings.
    const active = document.activeElement
    if (
      active instanceof HTMLElement &&
      (active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.isContentEditable)
    ) {
      active.blur()
      return
    }
    setMusicOpen(false)
    window.setTimeout(() => {
      if (doesFocusableExist('tool-music')) {
        void setFocus('tool-music')
        return
      }
      const target = lastFocusKey.current ?? initialFocusKey
      if (target && doesFocusableExist(target)) void setFocus(target)
    }, 80)
  }, [initialFocusKey, lastFocusKey, setMusicOpen])

  return { openSettings, closeSettings, openMusic, closeMusic }
}
