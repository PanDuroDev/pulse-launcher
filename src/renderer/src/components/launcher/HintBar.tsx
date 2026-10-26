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
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex items-end justify-between bg-gradient-to-t from-[#050508] via-[#050508]/75 to-transparent px-[6vw] pt-14 pb-5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.62rem] text-white/55">
        <span className="flex items-center gap-1.5">
          <KbdGroup>
            <Kbd className="bg-white/10 text-white/70">
              <ArrowUpFilled className="size-4" />
            </Kbd>
            <Kbd className="bg-white/10 text-white/70">
              <ArrowDownFilled className="size-4" />
            </Kbd>
            <Kbd className="bg-white/10 text-white/70">
              <ArrowLeftFilled className="size-4" />
            </Kbd>
            <Kbd className="bg-white/10 text-white/70">
              <ArrowRightFilled className="size-4" />
            </Kbd>
          </KbdGroup>
          Navigate
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd className="bg-white/10 text-white/70">Enter</Kbd>
          Play
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd className="bg-white/10 text-white/70">S</Kbd>
          Settings
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd className="bg-white/10 text-white/70">/</Kbd>
          Search
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd className="bg-white/10 text-white/70">F</Kbd>
          Favorite
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd className="bg-white/10 text-white/70">O</Kbd>
          Sort
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd className="bg-white/10 text-white/70">P</Kbd>
          Power
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd className="bg-white/10 text-white/70">Tab</Kbd>
          Tools
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd className="bg-white/10 text-white/70">R</Kbd>
          Refresh
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd className="bg-white/10 text-white/70">Esc</Kbd>
          Hide
        </span>
      </div>
      <p className="hidden text-[0.6rem] font-medium tracking-[0.18em] text-white/40 uppercase sm:block">
        {gameCount} {gameCount === 1 ? 'game' : 'games'} in library
      </p>
    </div>
  )
}
