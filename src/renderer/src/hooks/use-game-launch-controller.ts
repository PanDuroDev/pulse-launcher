import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { GameSummary } from '@shared/contracts/games'
import { runAssurance } from '@shared/run-state'
import { announceAttention } from '@/lib/attention'
import { playUI } from '@/lib/ui-sfx'

const LAUNCH_DETECT_TIMEOUT_MS = 60_000

interface PendingLaunch {
  id: string
  name: string
}

interface UseGameLaunchControllerOptions {
  games: GameSummary[]
  demo: boolean
  onFocusGame: (game: GameSummary) => void | Promise<void>
}

export function useGameLaunchController({
  games,
  demo,
  onFocusGame,
}: UseGameLaunchControllerOptions) {
  const [pendingLaunch, setPendingLaunch] = useState<PendingLaunch | null>(null)
  const pendingLaunchRef = useRef<PendingLaunch | null>(null)
  const launchResetTimer = useRef<number | null>(null)
  const launchRequestRef = useRef(0)

  const updatePendingLaunch = useCallback((value: PendingLaunch | null) => {
    pendingLaunchRef.current = value
    setPendingLaunch(value)
  }, [])

  const clearDetectTimer = useCallback(() => {
    if (launchResetTimer.current === null) return
    window.clearTimeout(launchResetTimer.current)
    launchResetTimer.current = null
  }, [])

  useEffect(() => {
    return () => {
      if (launchResetTimer.current !== null) {
        window.clearTimeout(launchResetTimer.current)
      }
    }
  }, [])

  // A launch is only considered running once the catalog reports the process.
  useEffect(() => {
    const pending = pendingLaunchRef.current
    if (!pending) return
    const runningGame = games.find((game) => game.id === pending.id && game.running)
    if (!runningGame) return

    clearDetectTimer()
    updatePendingLaunch(null)
    toast.info(
      runAssurance(runningGame.runState) === 'confirmed'
        ? `${pending.name} is running.`
        : `${pending.name} appears to be running.`,
    )
  }, [games, clearDetectTimer, updatePendingLaunch])

  const handleLaunch = useCallback(
    async (game: GameSummary) => {
      if (game.running) {
        if (runAssurance(game.runState) === 'confirmed') {
          void onFocusGame(game)
        } else {
          toast.info(`${game.name} appears to be running.`, {
            description:
              'The launcher could not identify a single game process, so it cannot target it.',
          })
        }
        return
      }
      if (pendingLaunchRef.current?.id === game.id) return
      const launchRequest = ++launchRequestRef.current
      announceAttention('launch')
      updatePendingLaunch({ id: game.id, name: game.name })
      try {
        const result = await window.launcher.launch(game.id)
        // A newer launch request owns the pending state and detection timer.
        if (launchRequest !== launchRequestRef.current) return
        if (!result.ok) {
          playUI('error')
          toast.error(result.error ?? 'Could not launch this game.')
          updatePendingLaunch(null)
          return
        }

        playUI('start')
        if (demo) {
          updatePendingLaunch(null)
          toast.success(`Demo mode · ${game.name} would launch`)
          return
        }

        toast.success(`Launch requested · ${game.name}`, {
          description: 'Waiting for the game process to appear.',
        })
        clearDetectTimer()
        launchResetTimer.current = window.setTimeout(() => {
          launchResetTimer.current = null
          const pending = pendingLaunchRef.current
          if (launchRequest !== launchRequestRef.current || !pending || pending.id !== game.id) return
          updatePendingLaunch(null)
          toast.info(`${game.name} was not detected as running`, {
            description:
              'It may still be starting. Check the taskbar before trying again.',
          })
        }, LAUNCH_DETECT_TIMEOUT_MS)
      } catch (launchError) {
        if (launchRequest !== launchRequestRef.current) return
        playUI('error')
        toast.error(launchError instanceof Error ? launchError.message : 'Launch failed.')
        updatePendingLaunch(null)
      }
    },
    [clearDetectTimer, demo, onFocusGame, updatePendingLaunch],
  )

  return { pendingLaunch, handleLaunch }
}
