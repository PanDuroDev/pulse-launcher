import type { ReactNode } from 'react'
import { AzSortAscendingLettersFilled } from '@mingcute/react/core-filled'
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation-react'
import type { GameSummary, LibrarySort } from '@shared/types'
import { uiAccent } from '@/lib/accent'
import {
  doesFocusableExist,
  setFocus,
} from '@noriginmedia/norigin-spatial-navigation-core'
import {
  librarySortLabel,
  librarySortDescription,
} from '@shared/library'
import { cn } from 'cn'
import { GameCard } from './GameCard'

interface GameRowProps {
  rowId: string
  title: string
  games: GameSummary[]
  onSelect: (game: GameSummary, focusKey: string) => void
  onLaunch: (game: GameSummary) => void
  /** Optional header control, e.g. the sort action on All Games. */
  action?: ReactNode
  /**
   * Focus key reached with ArrowUp from this row. The top-most row uses it so
   * Up always lands on the hero's primary action instead of being pulled to
   * whichever hero button happens to sit nearest horizontally.
   */
  upTarget?: string
}

interface SortControlProps {
  sort: LibrarySort
  onPress: () => void
}

/**
 * The sort control lives in the All Games header. It is focusable with arrows
 * but deliberately stays out of the Tab cycle, which only walks the four
 * header tools and the current card.
 */
export function SortControl({ sort, onPress }: SortControlProps) {
  const label = librarySortLabel(sort)
  const { ref, focused } = useFocusable<Record<string, never>, HTMLButtonElement>({
    focusKey: 'sort-all',
    accessibilityLabel: `Sort library, currently ${librarySortDescription(sort)}`,
    onEnterPress: onPress,
    onFocus: () => ref.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' }),
  })

  return (
    <button
      ref={ref}
      type="button"
      tabIndex={-1}
      data-focus-key="sort-all"
      aria-label={`Sort library, currently ${librarySortDescription(sort)}`}
      onClick={onPress}
      className={cn(
        'ml-auto inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-caption font-semibold tracking-[0.08em] uppercase outline-none transition-colors',
        focused
          ? 'bg-white text-black'
          : 'bg-white/5 text-white/55 ring-1 ring-white/10 hover:bg-white/10 hover:text-white',
      )}
      style={focused ? { boxShadow: `0 0 0 2px ${uiAccent(0.7)}` } : undefined}
    >
      <AzSortAscendingLettersFilled className="size-4" />
      {label}
    </button>
  )
}

export function GameRow({
  rowId,
  title,
  games,
  onSelect,
  onLaunch,
  action,
  upTarget,
}: GameRowProps) {
  const { ref, hasFocusedChild } = useFocusable({
    focusKey: `row-${rowId}`,
    focusable: false,
    trackChildren: true,
    saveLastFocusedChild: true,
  })

  const onArrowPress = upTarget
    ? (direction: string): boolean => {
        if (direction !== 'up') return true
        if (!doesFocusableExist(upTarget)) return true
        void setFocus(upTarget)
        return false
      }
    : undefined

  return (
    <section ref={ref} className="relative">
      <div className="mb-2.5 flex items-center gap-3 px-gutter">
        <h2
          className={`text-body font-semibold tracking-wide transition-colors duration-[--duration-focus] ${
            hasFocusedChild ? 'text-white' : 'text-white/70'
          }`}
        >
          {title}
        </h2>
        <span className="text-caption font-medium text-white/25">{games.length}</span>
        <div
          className={`h-px flex-1 transition-opacity duration-[--duration-focus] ${
            hasFocusedChild ? 'opacity-30' : 'opacity-0'
          }`}
          style={{
            background: `linear-gradient(90deg, ${uiAccent()}, transparent 70%)`,
          }}
        />
        {action}
      </div>
      <div
        data-game-strip={rowId}
        className="no-scrollbar flex snap-x scroll-px-gutter gap-4 overflow-x-auto overflow-y-hidden px-gutter pt-8 pb-12"
      >
        {games.map((game) => (
          <GameCard
            key={`${rowId}-${game.id}`}
            game={game}
            focusKey={`${rowId}-${game.id}`}
            onSelect={onSelect}
            onLaunch={onLaunch}
            onArrowPress={onArrowPress}
          />
        ))}
      </div>
    </section>
  )
}
