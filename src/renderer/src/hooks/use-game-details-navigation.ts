import { useCallback, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { GameSummary } from '@shared/contracts/games'
import {
  doesFocusableExist,
  getCurrentFocusKey,
  setFocus,
} from '@noriginmedia/norigin-spatial-navigation-core'
import type { GameDetailsDraft } from '@/components/launcher/GameDetailsPage'
import type { AddMode } from '@/lib/launcher-page-types'

interface UseGameDetailsNavigationOptions {
  initialFocusKey: string | null
  lastFocusKey: { current: string | null }
  select: (gameId: string) => void
  setAddMode: (mode: AddMode) => void
  setAddOpen: (open: boolean) => void
  setDetailsOpen: (open: boolean) => void
  setDetailsSnapshot: (game: GameSummary | null) => void
  setManualDraft: Dispatch<SetStateAction<GameDetailsDraft | null>>
  setPowerOpen: (open: boolean) => void
}

/** Owns the details page and its file-picker navigation/focus hand-offs. */
export function useGameDetailsNavigation({
  initialFocusKey,
  lastFocusKey,
  select,
  setAddMode,
  setAddOpen,
  setDetailsOpen,
  setDetailsSnapshot,
  setManualDraft,
  setPowerOpen,
}: UseGameDetailsNavigationOptions) {
  const detailsReturnFocus = useRef<string | null>(null)

  const clearDetailsReturnFocus = useCallback(() => {
    detailsReturnFocus.current = null
  }, [])

  const openDetails = useCallback(
    (game: GameSummary) => {
      const current = getCurrentFocusKey()
      if (current && !current.startsWith('details-')) {
        detailsReturnFocus.current = current
      }
      setPowerOpen(false)
      setDetailsSnapshot(game)
      setManualDraft(
        game.source === 'manual'
          ? {
              gameId: game.id,
              name: game.name,
              executable: game.executable ?? '',
              artwork: undefined,
            }
          : null,
      )
      select(game.id)
      setDetailsOpen(true)
      window.setTimeout(() => {
        if (doesFocusableExist('details-back')) void setFocus('details-back')
      }, 90)
    },
    [select, setDetailsOpen, setDetailsSnapshot, setManualDraft, setPowerOpen],
  )

  const closeDetails = useCallback(() => {
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
    setDetailsOpen(false)
    setDetailsSnapshot(null)
    setManualDraft(null)
    window.setTimeout(() => {
      const preferred = detailsReturnFocus.current
      if (preferred && doesFocusableExist(preferred)) {
        void setFocus(preferred)
        return
      }
      const fallback = lastFocusKey.current ?? initialFocusKey
      if (fallback && doesFocusableExist(fallback)) {
        void setFocus(fallback)
        return
      }
      if (doesFocusableExist('tool-add')) void setFocus('tool-add')
    }, 90)
  }, [
    detailsReturnFocus,
    initialFocusKey,
    lastFocusKey,
    setDetailsOpen,
    setDetailsSnapshot,
    setManualDraft,
  ])

  // The picker replaces the details page while it is open; the draft lives here
  // so a typed name survives a trip to the file browser.
  const openDetailsPicker = useCallback(
    (mode: 'path' | 'image') => {
      setAddMode(mode)
      setAddOpen(true)
    },
    [setAddMode, setAddOpen],
  )

  const handlePickedPath = useCallback(
    (next: string) => {
      setManualDraft((current) =>
        current ? { ...current, executable: next } : current,
      )
      setAddOpen(false)
      window.setTimeout(() => {
        if (doesFocusableExist('details-path')) void setFocus('details-path')
        else if (doesFocusableExist('details-back')) void setFocus('details-back')
      }, 100)
    },
    [setAddOpen, setManualDraft],
  )

  const handlePickedArtwork = useCallback(
    (next: string) => {
      setManualDraft((current) =>
        current ? { ...current, artwork: next } : current,
      )
      setAddOpen(false)
      window.setTimeout(() => {
        if (doesFocusableExist('details-art')) void setFocus('details-art')
        else if (doesFocusableExist('details-back')) void setFocus('details-back')
      }, 100)
    },
    [setAddOpen, setManualDraft],
  )

  return {
    clearDetailsReturnFocus,
    openDetails,
    closeDetails,
    openDetailsPicker,
    handlePickedPath,
    handlePickedArtwork,
  }
}
