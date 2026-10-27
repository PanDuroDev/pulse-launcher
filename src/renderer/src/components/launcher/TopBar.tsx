import {
  ClockFilled,
  MusicFilled,
  PlusFilled,
  PowerFilled,
  Refresh2Filled,
  Settings4Filled,
  WarningFilled,
} from '@mingcute/react/core-filled'
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation-react'
import type { ReactNode } from 'react'
import type { GameSource, ScanProgress } from '@shared/types'
import { useClock } from '@/hooks/use-clock'
import { announceAttention } from '@/lib/attention'
import type { MarkMood } from '@/lib/mark-mood'
import { cn } from 'cn'
import { BrandMark } from './BrandMark'

const SOURCE_NAMES: Record<GameSource, string> = {
  steam: 'Steam',
  epic: 'Epic Games',
  manual: 'local apps',
  'start-menu': 'desktop shortcuts',
}

interface TopBarProps {
  demo: boolean
  title: string
  reducedMotion: boolean
  /**
   * False while the splash ball is still crossing. The mark's box must exist for
   * the flight to be measured, but drawing it would put two balls on screen.
   */
  markVisible: boolean
  /** What the mark should look like: the launcher's mood, not the pointer's. */
  markMood: MarkMood
  refreshing: boolean
  scanProgress: Partial<Record<GameSource, ScanProgress>>
  staleSources: GameSource[]
  showTools: boolean
  onRefresh: () => void
  onAddGame: () => void
  onOpenMusic: () => void
  onOpenSettings: () => void
  onOpenPower: () => void
}

function scanLabel(
  refreshing: boolean,
  scanProgress: Partial<Record<GameSource, ScanProgress>>,
): string | null {
  const active = Object.values(scanProgress).find((progress) => progress?.phase === 'scanning')
  if (active) return `Scanning ${SOURCE_NAMES[active.source]}`
  if (refreshing) return 'Refreshing library'
  return null
}

interface ToolButtonProps {
  focusKey: string
  label: string
  icon: ReactNode
  disabled?: boolean
  onClick: () => void
}

function ToolButton({ focusKey, label, icon, disabled = false, onClick }: ToolButtonProps) {
  const { ref, focused } = useFocusable<Record<string, never>, HTMLButtonElement>({
    focusKey,
    accessibilityLabel: label,
    onEnterPress: () => {
      if (!disabled) onClick()
    },
    onFocus: () => {
      ref.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      announceAttention('focus')
    },
  })

  return (
    <button
      ref={ref}
      type="button"
      tabIndex={-1}
      aria-label={label}
      data-focus-key={focusKey}
      title={label}
      aria-disabled={disabled || undefined}
      onPointerEnter={() => announceAttention('hover')}
      onClick={() => {
        if (!disabled) onClick()
      }}
      className={cn(
        'flex h-9 items-center gap-2 rounded-full px-3 text-caption font-medium outline-none transition-colors',
        focused
          ? 'bg-white text-black'
          : 'bg-white/[0.04] text-white/65 hover:bg-white/10 hover:text-white',
        disabled && 'cursor-default opacity-60',
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

export function TopBar({
  demo,
  title,
  reducedMotion,
  markVisible,
  markMood,
  refreshing,
  scanProgress,
  staleSources,
  showTools,
  onRefresh,
  onAddGame,
  onOpenSettings,
  onOpenMusic,
  onOpenPower,
}: TopBarProps) {
  const now = useClock()
  const scanning = scanLabel(refreshing, scanProgress)
  const staleLabel =
    staleSources.length > 0
      ? `Last known: ${staleSources.map((source) => SOURCE_NAMES[source]).join(', ')}`
      : null
  const time = now.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const date = now.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  return (
    <header className="relative z-20 flex items-center justify-between gap-4 px-[6vw] pt-6 pb-3">
      <div className="flex min-w-0 items-center gap-3">
        <BrandMark reducedMotion={reducedMotion} visible={markVisible} mood={markMood} />
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="text-caption font-semibold tracking-[0.4em] text-white/90">
            PULSE
          </span>
          <span className="hidden text-white/20 sm:inline">/</span>
          <span className="truncate text-caption font-medium tracking-[0.18em] text-white/45 uppercase">
            {title}
          </span>
        </div>
        {demo ? (
          <span className="ml-1 rounded-full border border-amber-300/25 bg-amber-300/10 px-2 py-0.5 text-caption font-semibold tracking-[0.16em] text-amber-200/80">
            DEMO
          </span>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-4">
        <div className="hidden min-h-5 items-center md:flex">
          {scanning ? (
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3 py-1 text-caption font-medium text-white/60 backdrop-blur-xl">
              <Refresh2Filled className="size-4 animate-spin" />
              {scanning}
            </div>
          ) : staleLabel ? (
            <div className="flex max-w-[22rem] items-center gap-2 truncate rounded-full border border-amber-300/20 bg-amber-300/8 px-3 py-1 text-caption font-medium text-amber-100/75 backdrop-blur-xl">
              <WarningFilled className="size-4 shrink-0" />
              <span className="truncate">{staleLabel}</span>
            </div>
          ) : null}
        </div>

        <div className="hidden items-center gap-2 text-right lg:flex">
          <ClockFilled className="size-5 text-white/25" />
          <div>
            <p className="text-caption leading-none font-semibold tracking-wide text-white/75 tabular-nums">
              {time}
            </p>
            <p className="mt-1 hidden text-caption leading-none tracking-[0.1em] text-white/35 uppercase xl:block">
              {date}
            </p>
          </div>
        </div>

        {showTools ? (
          <div className="flex items-center gap-1.5">
            <ToolButton
              focusKey="tool-refresh"
              label="Refresh"
              icon={<Refresh2Filled className={cn('size-5', refreshing && 'animate-spin')} />}
              disabled={refreshing}
              onClick={onRefresh}
            />
            <ToolButton
              focusKey="tool-add"
              label="Add game"
              icon={<PlusFilled className="size-5" />}
              onClick={onAddGame}
            />
            <ToolButton
              focusKey="tool-music"
              label="Music"
              icon={<MusicFilled className="size-5" />}
              onClick={onOpenMusic}
            />
            <ToolButton
              focusKey="tool-settings"
              label="Settings"
              icon={<Settings4Filled className="size-5" />}
              onClick={onOpenSettings}
            />
            <ToolButton
              focusKey="tool-power"
              label="Power"
              icon={<PowerFilled className="size-5" />}
              onClick={onOpenPower}
            />
          </div>
        ) : null}
      </div>
    </header>
  )
}
