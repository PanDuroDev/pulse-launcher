import { useCallback, useEffect, useRef } from 'react'
import type { GameSummary } from '@shared/contracts/games'
import {
  doesFocusableExist,
  setFocus,
} from '@noriginmedia/norigin-spatial-navigation-core'
import { playUI } from '@/lib/ui-sfx'
import { toast } from 'sonner'

interface LibraryRow {
  id: string
  games: GameSummary[]
}

interface UseGameAddedFocusOptions {
  addOpen: boolean
  rememberFocusKey: (focusKey: string) => void
  rows: LibraryRow[]
  select: (gameId: string) => void
  setAddOpen: (open: boolean) => void
}

/** Selects a newly added game and moves focus to its card when it appears. */
export function useGameAddedFocus({
  addOpen,
  rememberFocusKey,
  rows,
  select,
  setAddOpen,
}: UseGameAddedFocusOptions) {
  const pendingFocusGame = useRef<string | null>(null)

  const handleGameAdded = useCallback(
    (game: GameSummary) => {
      pendingFocusGame.current = game.id
      setAddOpen(false)
      select(game.id)
      playUI('success')
      toast.success(`${game.name} added to your library`)
      // The new game arrives through the catalog change event; if it somehow
      // does not, focus still lands somewhere usable.
      window.setTimeout(() => {
        if (pendingFocusGame.current !== game.id) return
        pendingFocusGame.current = null
        if (doesFocusableExist('tool-add')) void setFocus('tool-add')
      }, 1200)
    },
    [select, setAddOpen],
  )

  // Focus the new card once the updated catalog has rendered it. The timeout
  // above remains a fallback in case the catalog update never arrives.
  useEffect(() => {
    const gameId = pendingFocusGame.current
    if (!gameId || addOpen) return
    const row = rows.find((candidate) =>
      candidate.games.some((game) => game.id === gameId),
    )
    if (!row) return
    const focusKey = `${row.id}-${gameId}`
    if (!doesFocusableExist(focusKey)) return
    pendingFocusGame.current = null
    rememberFocusKey(focusKey)
    void setFocus(focusKey)
  }, [addOpen, rememberFocusKey, rows])

  return handleGameAdded
}
