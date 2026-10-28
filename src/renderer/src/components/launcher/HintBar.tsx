import {
  ArrowDownFilled,
  ArrowLeftFilled,
  ArrowRightFilled,
  ArrowUpFilled,
} from '@mingcute/react/core-filled'
import { Kbd, KbdGroup } from '@/components/ui/kbd'

interface HintBarProps {
  gameCount: number
}

export function HintBar({ gameCount }: HintBarProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex items-end justify-between bg-gradient-to-t from-[#050508] via-[#050508]/75 to-transparent px-gutter pt-14 pb-5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-caption text-text-muted">
        <span className="flex items-center gap-1.5">
          <KbdGroup>
            <Kbd className="bg-white/10 text-text-secondary">
              <ArrowUpFilled className="size-4" />
            </Kbd>
            <Kbd className="bg-white/10 text-text-secondary">
              <ArrowDownFilled className="size-4" />
            </Kbd>
            <Kbd className="bg-white/10 text-text-secondary">
              <ArrowLeftFilled className="size-4" />
            </Kbd>
            <Kbd className="bg-white/10 text-text-secondary">
              <ArrowRightFilled className="size-4" />
            </Kbd>
          </KbdGroup>
          Navigate
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd className="bg-white/10 text-text-secondary">Enter</Kbd>
          Play
        </span>
      </div>
      <p className="hidden text-caption font-medium tracking-[0.18em] text-text-faint uppercase sm:block">
        {gameCount} {gameCount === 1 ? 'game' : 'games'} in library
      </p>
    </div>
  )
}
