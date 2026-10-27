import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { GameSummary, RunningGameInfo } from '@shared/types'
import {
  IDLE_GAME_ACTION,
  type GameActionState,
  actionForGame,
  cancelForceQuit,
  completeGameAction,
  failGameAction,
  forceRemainingMs,
  promptForceQuit,
  startGameAction,
} from '@/lib/game-actions'
import { playUI } from '@/lib/ui-sfx'

export function useGameActionController() {
  const [gameAction, setGameAction] = useState<GameActionState>(IDLE_GAME_ACTION)
  const [actionClock, setActionClock] = useState(0)

  // Close/force state belongs to a verified process, so drop it once the
  // watcher no longer reports that game as running.
  const clearFinishedGameAction = useCallback((infos: RunningGameInfo[]) => {
    const running = new Set(infos.map((info) => info.gameId))
    setGameAction((current) =>
      current.kind !== 'idle' && !running.has(current.gameId)
        ? IDLE_GAME_ACTION
        : current,
    )
  }, [])

  // Keep the countdown aligned with the grace period enforced by main.
  useEffect(() => {
    if (gameAction.kind !== 'close-requested') return
    const remaining = forceRemainingMs(gameAction, actionClock)
    if (remaining <= 0) return
    const timer = window.setTimeout(
      () => setActionClock(Date.now()),
      Math.min(1_000, remaining + 20),
    )
    return () => window.clearTimeout(timer)
  }, [gameAction, actionClock])

  const handleFocusGame = useCallback(async (game: GameSummary) => {
    setGameAction((current) => startGameAction(current, game.id, 'focus'))
    try {
      const result = await window.launcher.game.focus(game.id)
      setGameAction((current) => completeGameAction(current, result, Date.now()))
      if (!result.ok) {
        playUI('error')
        toast.error(result.error ?? 'Could not bring the game to the front.')
      }
    } catch (error) {
      setGameAction((current) => failGameAction(current))
      playUI('error')
      toast.error(error instanceof Error ? error.message : 'Could not reach the game.')
    }
  }, [])

  const handleCloseGame = useCallback(async (game: GameSummary) => {
    setGameAction((current) => startGameAction(current, game.id, 'close'))
    try {
      const result = await window.launcher.game.close(game.id)
      const finishedAt = Date.now()
      setActionClock(finishedAt)
      setGameAction((current) => completeGameAction(current, result, finishedAt))
      if (!result.ok) {
        playUI('error')
        toast.error(result.error ?? 'Could not close the game.')
        return
      }
      playUI('close')
      toast.success(`Close requested · ${game.name}`, {
        description: 'Force quit appears if the game does not exit on its own.',
      })
    } catch (error) {
      setGameAction((current) => failGameAction(current))
      playUI('error')
      toast.error(error instanceof Error ? error.message : 'Could not close the game.')
    }
  }, [])

  const handleForceQuit = useCallback(
    async (game: GameSummary) => {
      const now = Date.now()
      setActionClock(now)
      const current = actionForGame(gameAction, game.id)

      if (current.kind === 'close-requested') {
        const remaining = forceRemainingMs(current, now)
        if (remaining > 0) {
          toast.info(
            `Force quit unlocks in ${Math.ceil(remaining / 1000)}s.`,
            { description: 'Give the game a chance to close first.' },
          )
          return
        }
        setGameAction(promptForceQuit(current, game.id, now))
        return
      }

      if (current.kind !== 'force-confirming') return

      setGameAction((state) => startGameAction(state, game.id, 'force-close'))
      try {
        const result = await window.launcher.game.forceClose(game.id, true)
        const finishedAt = Date.now()
        setActionClock(finishedAt)
        setGameAction((state) => completeGameAction(state, result, finishedAt))
        if (!result.ok) {
          playUI('error')
          toast.error(result.error ?? 'Force quit failed.')
          return
        }
        playUI('delete')
        toast.success(`Force quit · ${game.name}`)
      } catch (error) {
        setGameAction((state) => failGameAction(state))
        playUI('error')
        toast.error(error instanceof Error ? error.message : 'Force quit failed.')
      }
    },
    [gameAction],
  )

  const handleCancelForceQuit = useCallback(() => {
    setGameAction((current) => cancelForceQuit(current))
  }, [])

  return {
    gameAction,
    actionClock,
    clearFinishedGameAction,
    handleFocusGame,
    handleCloseGame,
    handleForceQuit,
    handleCancelForceQuit,
  }
}
