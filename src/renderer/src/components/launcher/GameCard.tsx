import { StarFilled } from '@mingcute/react/core-filled'
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation-react'
import { cn } from 'cn'
import type { GameSummary } from '@shared/contracts/games'
import { accentAlpha, initialsFor, uiAccent } from '@/lib/accent'
import { announceAttention } from '@/lib/attention'
import { prefersReducedMotion } from '@/lib/motion'
import { useArtwork } from '@/hooks/use-artwork'
import { useInView } from '@/hooks/use-in-view'
import { sourceLabel } from '@shared/format'

interface GameCardProps {
  game: GameSummary
  focusKey: string
  onSelect: (game: GameSummary, focusKey: string) => void
  onLaunch: (game: GameSummary) => void
  /**
   * Optional click action for views where a click should open the result.
   * The library keeps its select-on-click behaviour.
   */
  onActivate?: (game: GameSummary) => void
  onArrowPress?: (direction: string) => boolean
}

export function GameCard({
  game,
  focusKey,
  onSelect,
  onLaunch,
  onActivate,
  onArrowPress,
}: GameCardProps) {
  const { ref, focused, focusSelf } = useFocusable<Record<string, never>, HTMLButtonElement>({
    focusKey,
    accessibilityLabel: `${game.name}, ${sourceLabel(game.source)}`,
    onFocus: () => {
      announceAttention('focus')
      onSelect(game, focusKey)
      ref.current?.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      })
    },
    onEnterPress: () => {
      announceAttention('launch')
      onLaunch(game)
    },
    onArrowPress,
  })
  const [, visible] = useInView<HTMLButtonElement>('500px', ref)
  const cover = useArtwork(game.id, 'cover', visible)

  return (
    <button
      ref={ref}
      type="button"
      onPointerEnter={(event) => {
        if (event.pointerType === 'touch') return
        announceAttention('hover')
      }}
      onClick={() => {
        focusSelf()
        announceAttention('launch')
        onSelect(game, focusKey)
        onActivate?.(game)
      }}
      onDoubleClick={() => onLaunch(game)}
      data-focus-key={focusKey}
      data-card-focused={focused ? 'true' : 'false'}
      aria-label={`${game.name}. ${sourceLabel(game.source)}.${
        game.favorite ? ' Favorite.' : ''
      } ${
        game.running
          ? 'Running now.'
          : `Press Enter to ${
              game.source === 'steam' || game.source === 'epic' ? 'play' : 'open'
            }.`
      }`}
      // The outline/shadow live on this layer, so it must never clip. Only the
      // inner cover layer below owns overflow and the rounded corners.
      className={cn(
        'group relative aspect-[2/3] w-[clamp(8.5rem,11vw,12rem)] shrink-0 snap-start scroll-mt-6 scroll-mb-10 rounded-[1.35rem] bg-white/5 text-left outline-none transition-[transform,box-shadow,filter] duration-300 ease-out',
        focused
          ? 'z-20 -translate-y-1 scale-[1.035]'
          : 'ring-1 ring-white/10 hover:ring-white/25 hover:shadow-[0_10px_24px_-18px_rgba(0,0,0,0.85)]',
      )}
      style={{
        boxShadow: focused
          ? `0 0 0 2px ${uiAccent()}, 0 16px 34px -14px rgba(0,0,0,0.85)`
          : undefined,
      }}
    >
      <div
        data-card-clip=""
        className="absolute inset-0 overflow-hidden rounded-[1.35rem]"
      >
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(150deg, ${accentAlpha(game.accent, 0.72)}, #0b0b12 72%)`,
          }}
        />
        {cover ? (
          <img
            src={cover}
            alt=""
            draggable={false}
            className={`absolute inset-0 h-full w-full object-cover transition-all duration-500 ${
              focused ? 'scale-[1.03] brightness-105 saturate-[1.08]' : 'brightness-90 saturate-100'
            }`}
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center">
            <span className="text-6xl font-semibold tracking-[-0.08em] text-white/25">
              {initialsFor(game.name)}
            </span>
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-3.5">
          <p
            className={cn(
              'line-clamp-2 text-[0.86rem] leading-tight font-semibold text-white transition-all duration-200',
              focused ? 'opacity-100' : 'opacity-0',
            )}
          >
            {game.name}
          </p>
          <p
            className={cn(
              'mt-1 text-[0.62rem] font-medium tracking-[0.16em] text-white/50 uppercase transition-all duration-200',
              focused ? 'opacity-100' : 'opacity-0',
            )}
          >
            {sourceLabel(game.source)}
          </p>
        </div>

        <div
          className={`absolute top-3 left-3 size-1.5 rounded-full transition-opacity duration-200 ${
            focused ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ background: game.accent ? `hsl(${game.accent})` : undefined }}
        />
        {game.favorite ? (
          <span
            aria-hidden="true"
            data-favorite-badge=""
            className="pointer-events-none absolute top-2.5 right-2.5 grid size-7 place-items-center rounded-full bg-black/55 ring-1 ring-white/15 backdrop-blur-sm"
          >
            <StarFilled className="size-3.5 text-amber-300" />
          </span>
        ) : null}
        <div
          className={`pointer-events-none absolute inset-0 rounded-[1.35rem] transition-opacity duration-300 ${
            focused ? 'opacity-100' : 'opacity-0'
          }`}
          style={{
            background: `linear-gradient(150deg, ${accentAlpha(game.accent, 0.18)}, transparent 55%)`,
          }}
        />
      </div>
    </button>
  )
}
