import { useFocusable } from '@noriginmedia/norigin-spatial-navigation-react'
import { Game2Filled, WarningFilled } from '@mingcute/react/core-filled'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'

interface FocusableActionProps {
  focusKey: string
  label: string
  onClick: () => void
  primary?: boolean
}

function FocusableAction({ focusKey, label, onClick, primary }: FocusableActionProps) {
  const { ref, focused } = useFocusable<Record<string, never>, HTMLButtonElement>({
    focusKey,
    accessibilityLabel: label,
    onEnterPress: onClick,
    onFocus: () => ref.current?.scrollIntoView({ block: 'nearest' }),
  })

  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className={`inline-flex h-10 items-center gap-2 rounded-full px-5 text-[0.78rem] font-semibold outline-none transition-all ${
        primary
          ? 'bg-white text-black'
          : 'border border-white/15 bg-white/5 text-white/75 hover:bg-white/10'
      } ${focused ? 'scale-105 ring-3 ring-[hsl(var(--pulse-accent))]' : ''}`}
    >
      {label}
    </button>
  )
}

interface EmptyLibraryProps {
  error: string | null
  onRefresh: () => void
  onAddGame: () => void
}

export function EmptyLibrary({ error, onRefresh, onAddGame }: EmptyLibraryProps) {
  return (
    <div className="relative z-10 grid min-h-0 flex-1 place-items-center px-[6vw] pb-20">
      <Empty className="max-w-lg border border-white/8 bg-black/20 backdrop-blur-xl">
        <EmptyHeader>
          <EmptyMedia
            variant="icon"
            className="size-12 rounded-2xl bg-white/8 text-white/70"
          >
            {error ? <WarningFilled className="size-5" /> : <Game2Filled className="size-5" />}
          </EmptyMedia>
          <EmptyTitle className="text-lg text-white/90">
            {error ? 'Something went wrong' : 'No games found'}
          </EmptyTitle>
          <EmptyDescription className="text-[0.78rem] leading-relaxed text-white/35">
            {error ??
              'Pulse looked through Steam, Epic Games, and your manual library. Add a game or scan again.'}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <FocusableAction
              focusKey="empty-refresh"
              label="Scan library"
              onClick={onRefresh}
              primary
            />
            <FocusableAction focusKey="empty-add" label="Add local game" onClick={onAddGame} />
          </div>
        </EmptyContent>
      </Empty>
    </div>
  )
}
