import { useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { GameSummary, UpdateManualGameInput } from '@shared/contracts/games'
import {
  doesFocusableExist,
  setFocus,
} from '@noriginmedia/norigin-spatial-navigation-core'
import type { GameDetailsDraft } from '@/components/launcher/GameDetailsPage'
import { invalidateArtwork } from '@/hooks/use-artwork'
import { playUI } from '@/lib/ui-sfx'
import { toast } from 'sonner'

interface UseGameDetailsActionsOptions {
  detailsRemoving: boolean
  clearDetailsReturnFocus: () => void
  detailsSaving: boolean
  manualDraft: GameDetailsDraft | null
  select: (gameId: string) => void
  selected: GameSummary | undefined
  setDetailsOpen: Dispatch<SetStateAction<boolean>>
  setDetailsRemoving: Dispatch<SetStateAction<boolean>>
  setDetailsSaving: Dispatch<SetStateAction<boolean>>
  setDetailsSnapshot: Dispatch<SetStateAction<GameSummary | null>>
  setManualDraft: Dispatch<SetStateAction<GameDetailsDraft | null>>
}

/** Owns persistence actions for the currently edited manual game. */
export function useGameDetailsActions({
  clearDetailsReturnFocus,
  detailsRemoving,
  detailsSaving,
  manualDraft,
  select,
  selected,
  setDetailsOpen,
  setDetailsRemoving,
  setDetailsSaving,
  setDetailsSnapshot,
  setManualDraft,
}: UseGameDetailsActionsOptions) {
  const handleSaveDetails = useCallback(async () => {
    if (!selected || !manualDraft || detailsSaving) return
    setDetailsSaving(true)
    try {
      const input: UpdateManualGameInput = {
        gameId: manualDraft.gameId,
        name: manualDraft.name,
      }
      if (
        manualDraft.executable &&
        manualDraft.executable !== (selected.executable ?? '')
      ) {
        input.executable = manualDraft.executable
      }
      if (manualDraft.artwork !== undefined) {
        input.artwork = manualDraft.artwork
      }

      const result = await window.launcher.library.update(input)
      if (!result.ok || !result.game) {
        playUI('error')
        toast.error(result.error ?? 'Could not save this game.')
        return
      }

      // A new executable means a new catalog id; both ids may have cached art.
      const previousId = result.previousId ?? result.game.id
      invalidateArtwork(previousId)
      invalidateArtwork(result.game.id)
      clearDetailsReturnFocus()
      select(result.game.id)
      setDetailsSnapshot(result.game)
      setManualDraft({
        gameId: result.game.id,
        name: result.game.name,
        executable: result.game.executable ?? '',
        artwork: undefined,
      })
      playUI('success')
      toast.success(`${result.game.name} updated`)
    } catch (error) {
      playUI('error')
      toast.error(error instanceof Error ? error.message : 'Could not save this game.')
    } finally {
      setDetailsSaving(false)
    }
  }, [
    clearDetailsReturnFocus,
    detailsSaving,
    manualDraft,
    select,
    selected,
    setDetailsSaving,
    setDetailsSnapshot,
    setManualDraft,
  ])

  const handleRemoveDetails = useCallback(async () => {
    if (!selected || detailsRemoving) return
    setDetailsRemoving(true)
    try {
      const result = await window.launcher.settings.removeManual(selected.id)
      if (!result.ok) {
        playUI('error')
        toast.error(result.error ?? 'Could not remove the game.')
        return
      }
      invalidateArtwork(selected.id)
      setDetailsOpen(false)
      setDetailsSnapshot(null)
      setManualDraft(null)
      playUI('delete')
      toast.success('Removed from your library')
      window.setTimeout(() => {
        if (doesFocusableExist('tool-add')) void setFocus('tool-add')
      }, 160)
    } catch (error) {
      playUI('error')
      toast.error(
        error instanceof Error ? error.message : 'Could not remove the game.',
      )
    } finally {
      setDetailsRemoving(false)
    }
  }, [
    detailsRemoving,
    selected,
    setDetailsOpen,
    setDetailsRemoving,
    setDetailsSnapshot,
    setManualDraft,
  ])

  return { handleSaveDetails, handleRemoveDetails }
}
