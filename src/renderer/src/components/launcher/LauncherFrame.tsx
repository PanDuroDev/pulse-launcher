import type { ReactNode } from 'react'
import type { GameSource, GameSummary, ScanProgress } from '@shared/contracts/games'
import type { MotionPreference } from '@shared/contracts/settings'
import { Backdrop } from '@/components/launcher/Backdrop'
import { TopBar } from '@/components/launcher/TopBar'
import { HintBar } from '@/components/launcher/HintBar'
import { PowerMenu } from '@/components/launcher/PowerMenu'
import { BootScreen } from '@/components/launcher/BootScreen'
import { Toaster } from '@/components/ui/sonner'
import type { BootPhase } from '@/lib/boot'
import type { MarkMood } from '@/lib/mark-mood'

interface LauncherFrameProps {
  motion: MotionPreference
  selected: GameSummary | undefined
  revealed: boolean
  bootDone: boolean
  demo: boolean
  title: string
  markMood: MarkMood
  showTools: boolean
  refreshing: boolean
  scanProgress: Partial<Record<GameSource, ScanProgress>>
  staleSources: GameSource[]
  onRefresh: () => void
  onAddGame: () => void
  onOpenMusic: () => void
  onOpenSettings: () => void
  onOpenPower: () => void
  showHintBar: boolean
  gameCount: number
  powerOpen: boolean
  onClosePower: () => void
  onHide: () => void
  onQuit: () => void
  bootPhase: BootPhase
  error: string | null
  onBootDone: () => void
  children: ReactNode
}

/** The top-level window composition, including the boot reveal and overlays. */
export function LauncherFrame({
  motion,
  selected,
  revealed,
  bootDone,
  demo,
  title,
  markMood,
  showTools,
  refreshing,
  scanProgress,
  staleSources,
  onRefresh,
  onAddGame,
  onOpenMusic,
  onOpenSettings,
  onOpenPower,
  showHintBar,
  gameCount,
  powerOpen,
  onClosePower,
  onHide,
  onQuit,
  bootPhase,
  error,
  onBootDone,
  children,
}: LauncherFrameProps) {
  return (
    <div
      className="relative h-screen w-screen overflow-hidden text-white"
      data-motion={motion}
    >
      {/* The wallpaper belongs to the library, not the splash: it arrives with the content, once the mark has landed. */}
      <div
        aria-hidden={!revealed}
        className={`transition-opacity duration-700 ease-out ${revealed ? 'opacity-100' : 'opacity-0'}`}
      >
        <Backdrop game={selected} reducedMotion={motion === 'reduced'} />
      </div>

      <div className="relative z-10 flex h-full flex-col">
        {/* Chrome first and early: the header exists underneath the splash so the ball can land on the mark. */}
        <div
          className={`transition-opacity duration-200 ease-out ${bootDone ? 'opacity-100' : 'opacity-0'}`}
        >
          <TopBar
            demo={demo}
            title={title}
            reducedMotion={motion === 'reduced'}
            markVisible={bootDone}
            markMood={markMood}
            showTools={showTools}
            refreshing={refreshing}
            scanProgress={scanProgress}
            staleSources={staleSources}
            onRefresh={onRefresh}
            onAddGame={onAddGame}
            onOpenMusic={onOpenMusic}
            onOpenSettings={onOpenSettings}
            onOpenPower={onOpenPower}
          />
        </div>

        {/* Page content only rises after the boot animation has landed. */}
        <div
          className={`flex min-h-0 flex-1 flex-col transition-opacity duration-500 ease-out ${revealed ? 'opacity-100' : 'opacity-0'}`}
        >
          {children}
        </div>

        {showHintBar ? (
          <div
            className={`transition-opacity duration-500 ease-out ${revealed ? 'opacity-100' : 'opacity-0'}`}
          >
            <HintBar gameCount={gameCount} />
          </div>
        ) : null}
      </div>

      {powerOpen ? (
        <PowerMenu onClose={onClosePower} onHide={onHide} onQuit={onQuit} />
      ) : null}
      <Toaster position="bottom-right" richColors closeButton />
      {bootDone ? null : (
        <BootScreen
          phase={bootPhase}
          gameCount={gameCount}
          error={error}
          reducedMotion={motion === 'reduced'}
          onDone={onBootDone}
        />
      )}
    </div>
  )
}
