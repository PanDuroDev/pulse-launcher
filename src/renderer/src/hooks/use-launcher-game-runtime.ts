import type { GameSummary } from '@shared/contracts/games'
import { useGameActionController } from '@/hooks/use-game-action-controller'
import { useGameLaunchController } from '@/hooks/use-game-launch-controller'

interface UseLauncherGameRuntimeOptions {
  games: GameSummary[]
  demo: boolean
}

/** Composes launch requests with confirmed running-game actions. */
export function useLauncherGameRuntime({ games, demo }: UseLauncherGameRuntimeOptions) {
  const actions = useGameActionController()
  const launch = useGameLaunchController({
    games,
    demo,
    onFocusGame: actions.handleFocusGame,
  })

  return { ...actions, ...launch }
}
