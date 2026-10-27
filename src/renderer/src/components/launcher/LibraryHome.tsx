import type { GameSummary } from '@shared/contracts/games'
import type { LibrarySort } from '@shared/contracts/settings'
import { Hero } from '@/components/launcher/Hero'
import { GameRow, SortControl } from '@/components/launcher/GameRow'
import type { GameActionState } from '@/lib/game-actions'

interface LibraryRow {
  id: string
  title: string
  games: GameSummary[]
}

interface LibraryHomeProps {
  game: GameSummary | undefined
  pending: boolean
  reducedMotion: boolean
  action: GameActionState
  forceQuitRemainingMs: number
  rows: LibraryRow[]
  librarySort: LibrarySort
  onLaunch: (game: GameSummary) => void
  onFocus: (game: GameSummary) => void
  onClose: (game: GameSummary) => void
  onForceQuit: (game: GameSummary) => void
  onCancelForce: (game: GameSummary) => void
  onToggleFavorite: (game: GameSummary) => void
  onDetails: (game: GameSummary) => void
  onSelect: (game: GameSummary, focusKey: string) => void
  onCycleSort: () => void
}

/** Renders the selected game's hero and the focusable library rows. */
export function LibraryHome({
  game,
  pending,
  reducedMotion,
  action,
  forceQuitRemainingMs,
  rows,
  librarySort,
  onLaunch,
  onFocus,
  onClose,
  onForceQuit,
  onCancelForce,
  onToggleFavorite,
  onDetails,
  onSelect,
  onCycleSort,
}: LibraryHomeProps) {
  return (
    <>
      <Hero
        game={game}
        pending={pending}
        reducedMotion={reducedMotion}
        action={action}
        forceRemainingMs={forceQuitRemainingMs}
        onLaunch={onLaunch}
        onFocus={onFocus}
        onClose={onClose}
        onForceQuit={onForceQuit}
        onCancelForce={onCancelForce}
        onToggleFavorite={onToggleFavorite}
        onDetails={onDetails}
      />
      <div
        data-library-scroll=""
        className="no-scrollbar relative max-h-[54vh] shrink-0 scroll-py-4 overflow-y-auto pb-24"
      >
        {rows.map((row, index) => (
          <GameRow
            key={row.id}
            rowId={row.id}
            title={row.title}
            games={row.games}
            onSelect={onSelect}
            onLaunch={onLaunch}
            upTarget={index === 0 ? 'hero-primary' : undefined}
            action={
              row.id === 'all' ? (
                <SortControl sort={librarySort} onPress={onCycleSort} />
              ) : undefined
            }
          />
        ))}
      </div>
    </>
  )
}
