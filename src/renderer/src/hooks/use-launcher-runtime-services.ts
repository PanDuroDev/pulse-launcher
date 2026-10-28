import { useEffect } from 'react'
import { pause, resume } from '@noriginmedia/norigin-spatial-navigation-core'
import type { RunningGameInfo } from '@shared/contracts/games'
import type { Settings } from '@shared/contracts/settings'
import { useLauncherInitialization } from '@/hooks/use-launcher-initialization'
import { useMusicEngine } from '@/hooks/use-music-engine'
import { useMusicStore } from '@/store/music'
import { useAutoHideCursor } from '@/hooks/use-clock'
import { useUISounds } from '@/hooks/use-ui-sounds'

interface UseLauncherRuntimeServicesOptions {
  settings: Settings
  bootDone: boolean
  clearFinishedGameAction: (infos: RunningGameInfo[]) => void
  onDemoLoaded: (demo: boolean) => void
}

/** Owns app-wide subscriptions and ambient renderer services. */
export function useLauncherRuntimeServices({
  settings,
  bootDone,
  clearFinishedGameAction,
  onDemoLoaded,
}: UseLauncherRuntimeServicesOptions): void {
  useLauncherInitialization({
    clearFinishedGameAction,
    onDemoLoaded,
  })

  const musicTracks = useMusicStore((state) => state.tracks)
  useMusicEngine(musicTracks, bootDone)
  useAutoHideCursor(settings.hideCursorAfterMs)
  useUISounds(settings.uiSounds)

  // Spatial navigation is frozen during the boot screen and resumes on hand-off.
  useEffect(() => {
    if (bootDone) resume()
    else pause()
  }, [bootDone])
}
