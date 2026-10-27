import { useEffect } from 'react'
import type { RunningGameInfo } from '@shared/types'
import { useLauncherStore } from '@/store/launcher'
import { useMusicStore } from '@/store/music'

interface UseLauncherInitializationOptions {
  clearFinishedGameAction: (infos: RunningGameInfo[]) => void
  onDemoLoaded: (demo: boolean) => void
}

/** Owns app-wide store initialization and subscriptions to main-process events. */
export function useLauncherInitialization({
  clearFinishedGameAction,
  onDemoLoaded,
}: UseLauncherInitializationOptions): void {
  const initialize = useLauncherStore((state) => state.initialize)
  const receiveGames = useLauncherStore((state) => state.receiveGames)
  const receiveRunning = useLauncherStore((state) => state.receiveRunning)
  const receiveScanProgress = useLauncherStore((state) => state.receiveScanProgress)
  const receiveStaleSources = useLauncherStore((state) => state.receiveStaleSources)
  const setSettings = useLauncherStore((state) => state.setSettings)
  const initializeMusic = useMusicStore((state) => state.initialize)

  useEffect(() => {
    void initialize()
    const offGames = window.launcher.catalog.onChanged(receiveGames)
    const offRunning = window.launcher.catalog.onRunningChanged((infos) => {
      receiveRunning(infos)
      clearFinishedGameAction(infos)
    })
    const offProgress = window.launcher.catalog.onScanProgress(receiveScanProgress)
    const offStale = window.launcher.catalog.onStaleChanged(receiveStaleSources)
    const offSettings = window.launcher.settings.onChanged(setSettings)
    void window.launcher.app
      .info()
      .then((info) => onDemoLoaded(info.demo))
      .catch(() => undefined)
    return () => {
      offGames()
      offRunning()
      offProgress()
      offStale()
      offSettings()
    }
  }, [
    clearFinishedGameAction,
    initialize,
    onDemoLoaded,
    receiveGames,
    receiveRunning,
    receiveScanProgress,
    receiveStaleSources,
    setSettings,
  ])

  useEffect(() => {
    void initializeMusic()
  }, [initializeMusic])
}
