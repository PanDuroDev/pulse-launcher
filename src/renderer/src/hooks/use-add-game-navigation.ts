import { useCallback } from 'react'
import {
  doesFocusableExist,
  setFocus,
} from '@noriginmedia/norigin-spatial-navigation-core'
import type { AddMode } from '@/lib/launcher-page-types'

interface UseAddGameNavigationOptions {
  addMode: AddMode
  detailsOpen: boolean
  gamesEmpty: boolean
  initialFocusKey: string | null
  lastFocusKey: { current: string | null }
  setAddMode: (mode: AddMode) => void
  setAddOpen: (open: boolean) => void
  setPowerOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
}

/** Owns the Add Game view's entry/exit and spatial-focus restoration. */
export function useAddGameNavigation({
  addMode,
  detailsOpen,
  gamesEmpty,
  initialFocusKey,
  lastFocusKey,
  setAddMode,
  setAddOpen,
  setPowerOpen,
  setSettingsOpen,
}: UseAddGameNavigationOptions) {
  const handleAddGame = useCallback(() => {
    setPowerOpen(false)
    setSettingsOpen(false)
    setAddMode('game')
    setAddOpen(true)
  }, [setAddMode, setAddOpen, setPowerOpen, setSettingsOpen])

  const closeAddGame = useCallback(() => {
    const returningToDetails = addMode !== 'game' && detailsOpen
    setAddOpen(false)
    window.setTimeout(() => {
      if (returningToDetails) {
        const key = addMode === 'image' ? 'details-art' : 'details-path'
        if (doesFocusableExist(key)) {
          void setFocus(key)
          return
        }
        if (doesFocusableExist('details-back')) {
          void setFocus('details-back')
          return
        }
      }
      if (doesFocusableExist('tool-add')) {
        void setFocus('tool-add')
        return
      }
      const target = lastFocusKey.current ?? initialFocusKey
      if (target && doesFocusableExist(target)) {
        void setFocus(target)
      } else if (gamesEmpty && doesFocusableExist('empty-add')) {
        void setFocus('empty-add')
      }
    }, 80)
  }, [
    addMode,
    detailsOpen,
    gamesEmpty,
    initialFocusKey,
    lastFocusKey,
    setAddOpen,
  ])

  return { handleAddGame, closeAddGame }
}
