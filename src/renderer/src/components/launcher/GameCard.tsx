import { StarFilled } from '@mingcute/react/core-filled'
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation-react'
import { cn } from 'cn'
import type { GameSummary } from '@shared/types'
import { initialsFor, uiAccent } from '@/lib/accent'
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
  const [observerRef, visible] = useInView<HTMLButtonElement>()
  const cover = useArtwork(game.id, 'cover', visible)
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

  const setRef = (node: HTMLButtonElement | null): void => {
    ;(ref as { current: HTMLButtonElement | null }).current = node
    observerRef.current = node
  }
  return (
    <button
      ref={setRef}
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
      // The ring sits on the outer button so it is never clipped. No lift, no
      // chrome tint: artwork is the only colour on a card.
      className={cn(
        'group relative aspect-[2/3] w-[clamp(8.5rem,11vw,12rem)] shrink-0 snap-start scroll-mt-6 scroll-mb-10 rounded-[1.35rem] bg-white/5 text-left outline-none transition-[box-shadow] duration-[--duration-focus] ease-out',
        focused ? 'z-20' : 'ring-1 ring-white/12 hover:ring-white/24',
      )}
      style={{ boxShadow: focused ? `0 0 0 2px ${uiAccent()}` : undefined }}
    >
      <div
        data-card-clip=""
        className="absolute inset-0 overflow-hidden rounded-[1.35rem] ring-2 ring-transparent ring-offset-2 ring-offset-[#050508]"
        style={focused ? { '--tw-ring-color': uiAccent() } as React.CSSProperties : undefined}
      >
        <div className="absolute inset-0 bg-[#0b0b12]" />
        {cover ? (
          <img
            src={cover}
            alt=""
            draggable={false}
            className="absolute inset-0 h-full w-full object-cover brightness-90"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center">
            <span className="text-heading font-semibold tracking-[-0.08em] text-text-faint">
              {initialsFor(game.name)}
            </span>
          </div>
        )}

        <div
          className="pointer-events-none absolute inset-0 rounded-[1.35rem] bg-gradient-to-t from-black/90 via-black/35 to-transparent"
        />
        <div className="absolute inset-x-0 bottom-0 p-3.5">
          <p
            className={cn(
              'line-clamp-2 text-body leading-tight font-semibold text-text-primary transition-opacity duration-[--duration-focus]',
              focused ? 'opacity-100' : 'opacity-0',
            )}
          >
            {game.name}
          </p>
          <p
            className={cn(
              'mt-1 text-caption font-medium tracking-[0.16em] text-text-muted uppercase transition-opacity duration-[--duration-focus]',
              focused ? 'opacity-100' : 'opacity-0',
            )}
          >
            {sourceLabel(game.source)}
          </p>
        </div>

        {game.favorite ? (
          <span
            aria-hidden="true"
            data-favorite-badge=""
            className="pointer-events-none absolute top-2.5 right-2.5 grid size-7 place-items-center rounded-full bg-black/55 ring-1 ring-white/12"
          >
            <StarFilled className="size-3.5 text-amber-300" />
          </span>
        ) : null}
      </div>
    </button>
  )
}
