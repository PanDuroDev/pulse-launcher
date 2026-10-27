import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation-react'
import {
  doesFocusableExist,
  getCurrentFocusKey,
  setFocus,
} from '@noriginmedia/norigin-spatial-navigation-core'
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import {
  ArrowUpFilled,
  ClockFilled,
  CloseFilled,
  DriveFilled,
  InformationFilled,
  PlayFilled,
  PowerFilled,
  StarFilled,
} from '@mingcute/react/core-filled'
import { cn } from 'cn'
import type { GameSummary } from '@shared/types'
import { formatBytes, formatLastPlayed, sourceLabel } from '@shared/format'
import { describeRunEvidence, runAssurance } from '@shared/run-state'
import {
  type GameActionState,
  isGameActionBusy,
} from '@/lib/game-actions'
import { Spinner } from '@/components/ui/spinner'
import { announceAttention } from '@/lib/attention'

interface HeroProps {
  game: GameSummary | undefined
  pending: boolean
  reducedMotion: boolean
  /** Resolved action state for this game (another game's state is idle). */
  action: GameActionState
  /** Milliseconds until force quit is accepted; 0 when it is available. */
  forceRemainingMs: number
  onLaunch: (game: GameSummary) => void
  onFocus: (game: GameSummary) => void
  onClose: (game: GameSummary) => void
  onForceQuit: (game: GameSummary) => void
  onCancelForce: (game: GameSummary) => void
  onToggleFavorite: (game: GameSummary) => void
  onDetails: (game: GameSummary) => void
}

interface HeroActionProps {
  focusKey: string
  label: string
  disabled?: boolean
  onClick: () => void
  onArrowPress?: (direction: string) => boolean
  className?: string
  children: ReactNode
}

/**
 * A hero action that the gamepad and arrow keys can reach. Disabled actions
 * stay in the focus graph on purpose: pressing them is a no-op, so a state
 * change (close requested, launch pending) never drops the user's focus.
 */
function HeroAction({
  focusKey,
  label,
  disabled = false,
  onClick,
  onArrowPress,
  className,
  children,
}: HeroActionProps) {
  const { ref, focused } = useFocusable<Record<string, never>, HTMLButtonElement>({
    focusKey,
    accessibilityLabel: label,
    onEnterPress: () => {
      if (!disabled) {
        announceAttention('launch')
        onClick()
      }
    },
    onArrowPress,
    onFocus: () => {
      announceAttention('focus')
      ref.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    },
  })

  return (
    <button
      ref={ref}
      type="button"
      tabIndex={-1}
      aria-label={label}
      data-focus-key={focusKey}
      aria-disabled={disabled || undefined}
      onPointerEnter={(event) => {
        if (event.pointerType === 'touch') return
        announceAttention('hover')
      }}
      onClick={() => {
        if (!disabled) {
          announceAttention('launch')
          onClick()
        }
      }}
      className={cn(
        'outline-none transition-all',
        disabled && 'pointer-events-none cursor-default opacity-60',
        className,
      )}
      style={focused ? { boxShadow: '0 0 0 2px rgba(255,255,255,0.95), 0 0 26px rgba(255,255,255,0.28)' } : undefined}
    >
      {children}
    </button>
  )
}

export function Hero({
  game,
  pending,
  reducedMotion,
  action,
  forceRemainingMs,
  onLaunch,
  onFocus,
  onClose,
  onForceQuit,
  onCancelForce,
  onToggleFavorite,
  onDetails,
}: HeroProps) {
  const systemReduced = useReducedMotion()
  const animate = !reducedMotion && !systemReduced
  const lastPlayed = formatLastPlayed(game?.lastPlayedAt)
  const size = formatBytes(game?.sizeBytes)
  const running = Boolean(game?.running)
  const assurance = runAssurance(game?.runState)
  const evidence = describeRunEvidence(game?.runState)
  const actionLabel = game?.source === 'steam' || game?.source === 'epic' ? 'Play' : 'Open'
  const busy = isGameActionBusy(action)
  const inFlight = action.kind === 'busy' ? action.action : null
  const closeRequested = action.kind === 'close-requested' || action.kind === 'force-confirming'
  const confirming = action.kind === 'force-confirming'
  const forceReady = closeRequested && forceRemainingMs === 0
  const forceCountdown = Math.max(1, Math.ceil(forceRemainingMs / 1000))

  // The running-only actions unmount when the game exits. If one of them held
  // focus, hand it back to the primary action instead of leaving it nowhere.
  const previousRunning = useRef(running)
  useEffect(() => {
    const wasRunning = previousRunning.current
    previousRunning.current = running
    if (wasRunning === running || running) return
    const current = getCurrentFocusKey()
    const activeElement = document.activeElement
    const lostFocus =
      !current ||
      current === 'hero-close' ||
      current === 'hero-force' ||
      current === 'hero-cancel' ||
      !activeElement ||
      activeElement === document.body
    if (lostFocus && doesFocusableExist('hero-primary')) void setFocus('hero-primary')
  }, [running])

  // Keep left/right inside the hero action row: geometry alone lets the focus
  // jump from a hero button to a cover in the row below.
  const focusNeighbour = (focusKey: string): boolean => {
    if (!doesFocusableExist(focusKey)) return false
    void setFocus(focusKey)
    return false
  }

  const primaryNeighbours = (direction: string): boolean => {
    if (direction === 'left') return false
    if (direction === 'right') {
      if (running && doesFocusableExist('hero-close')) return focusNeighbour('hero-close')
      if (doesFocusableExist('hero-favorite')) return focusNeighbour('hero-favorite')
      return false
    }
    return true
  }

  const closeNeighbours = (direction: string): boolean => {
    if (direction === 'left') return focusNeighbour('hero-primary')
    if (direction === 'right') {
      if (doesFocusableExist('hero-force')) return focusNeighbour('hero-force')
      if (doesFocusableExist('hero-cancel')) return focusNeighbour('hero-cancel')
      if (doesFocusableExist('hero-favorite')) return focusNeighbour('hero-favorite')
      return false
    }
    return true
  }

  const forceNeighbours = (direction: string): boolean => {
    if (direction === 'left') return focusNeighbour('hero-close')
    if (direction === 'right') {
      if (doesFocusableExist('hero-cancel')) return focusNeighbour('hero-cancel')
      if (doesFocusableExist('hero-favorite')) return focusNeighbour('hero-favorite')
      return false
    }
    return true
  }

  const cancelNeighbours = (direction: string): boolean => {
    if (direction === 'left') {
      if (doesFocusableExist('hero-force')) return focusNeighbour('hero-force')
      return focusNeighbour('hero-close')
    }
    if (direction === 'right') {
      if (doesFocusableExist('hero-favorite')) return focusNeighbour('hero-favorite')
      return false
    }
    return true
  }

  const favoriteNeighbours = (direction: string): boolean => {
    if (direction === 'left') {
      if (doesFocusableExist('hero-cancel')) return focusNeighbour('hero-cancel')
      if (doesFocusableExist('hero-force')) return focusNeighbour('hero-force')
      if (doesFocusableExist('hero-close')) return focusNeighbour('hero-close')
      if (doesFocusableExist('hero-primary')) return focusNeighbour('hero-primary')
      return false
    }
    if (direction === 'right') {
      if (doesFocusableExist('hero-details')) return focusNeighbour('hero-details')
      return false
    }
    return true
  }

  const detailsNeighbours = (direction: string): boolean => {
    if (direction === 'left') {
      if (doesFocusableExist('hero-favorite')) return focusNeighbour('hero-favorite')
      return false
    }
    return true
  }

  return (
    <div className="relative z-10 flex min-h-0 flex-1 items-end px-[6vw] pb-7">
      <AnimatePresence mode="wait">
        {game ? (
          <motion.div
            key={game.id}
            initial={animate ? { opacity: 0, y: 18 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={animate ? { opacity: 0, y: -10 } : undefined}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-[min(58rem,68vw)]"
          >
            <div className="mb-3 flex flex-wrap items-center gap-2.5">
              <span className="rounded-full bg-white/8 px-2.5 py-1 text-caption font-semibold tracking-[0.16em] text-white/65 uppercase ring-1 ring-white/12">
                {sourceLabel(game.source)}
              </span>
              {running ? (
                <span
                  className={cn(
                    'flex items-center gap-1.5 text-caption font-medium',
                    assurance === 'confirmed' ? 'text-emerald-300' : 'text-amber-200/90',
                  )}
                >
                  <span
                    className={cn(
                      'size-2 rounded-full',
                      assurance === 'confirmed'
                        ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]'
                        : 'bg-amber-300',
                    )}
                  />
                  {assurance === 'confirmed' ? 'Running now' : 'Possibly running'}
                </span>
              ) : pending ? (
                <span className="flex items-center gap-1.5 text-caption font-medium text-amber-200/80">
                  <span className="size-2 animate-pulse rounded-full bg-amber-300" />
                  Launch requested
                </span>
              ) : null}
              {lastPlayed ? (
                <span className="flex items-center gap-1.5 text-caption text-white/45">
                  <ClockFilled className="size-4.5" />
                  Played {lastPlayed}
                </span>
              ) : null}
              {size ? (
                <span className="flex items-center gap-1.5 text-caption text-white/45">
                  <DriveFilled className="size-4.5" />
                  {size}
                </span>
              ) : null}
            </div>

            <h1 className="max-w-[min(54rem,64vw)] text-[clamp(2.6rem,5.6vw,5.4rem)] leading-[0.92] font-semibold tracking-[-0.045em] text-white drop-shadow-[0_8px_40px_rgba(0,0,0,0.65)]">
              {game.name}
            </h1>

            <p className="mt-3 max-w-xl text-caption leading-relaxed text-white/40">
              {running
                ? confirming
                  ? `Force quit will terminate ${game.name} immediately and may lose unsaved progress.`
                  : closeRequested
                    ? `Close requested. Waiting for ${game.name} to exit on its own.`
                    : assurance === 'confirmed'
                      ? `${game.name} is running. Use Bring to front to switch back to it.`
                      : `Probably running — matched by ${evidence ?? 'process activity'}. Try Bring to front if ${game.name} is open.`
                : pending
                  ? `Launch request sent. Waiting for ${game.name} to appear as running.`
                  : (game.subtitle ??
                    `Ready to ${
                      actionLabel === 'Play' ? 'jump back in' : 'launch'
                    } from your ${sourceLabel(game.source)} library.`)}
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <HeroAction
                focusKey="hero-primary"
                label={
                  running
                    ? `Bring ${game.name} to front`
                    : pending
                      ? 'Waiting for the game to start'
                      : `${actionLabel} ${game.name}`
                }
                disabled={busy || (!running && pending)}
                onClick={() => (running ? onFocus(game) : onLaunch(game))}
                onArrowPress={primaryNeighbours}
                className="group inline-flex h-11 items-center gap-2.5 rounded-full bg-white px-6 text-caption font-semibold text-black shadow-[0_10px_40px_-8px_rgba(255,255,255,0.35)] hover:scale-[1.02] hover:bg-white/90 active:scale-[0.99]"
              >
                {running ? (
                  inFlight === 'focus' ? (
                    <Spinner className="size-5 text-black" />
                  ) : (
                    <ArrowUpFilled className="size-5 text-black" />
                  )
                ) : pending ? (
                  <Spinner className="size-5 text-black" />
                ) : (
                  <PlayFilled className="size-6 text-black" />
                )}
                {running ? 'Bring to front' : pending ? 'Waiting' : actionLabel}
              </HeroAction>

              {running ? (
                <HeroAction
                  focusKey="hero-close"
                  label={closeRequested ? 'Close requested' : `Close ${game.name}`}
                  disabled={busy || closeRequested}
                  onClick={() => onClose(game)}
                  onArrowPress={closeNeighbours}
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-white/5 px-5 text-caption font-medium text-white/80 ring-1 ring-white/15 hover:bg-white/10 hover:text-white"
                >
                  {inFlight === 'close' ? (
                    <Spinner className="size-4 text-white" />
                  ) : (
                    <CloseFilled className="size-4.5" />
                  )}
                  {closeRequested ? 'Close requested' : 'Close game'}
                </HeroAction>
              ) : (
                <span className="text-caption text-white/30">
                  Press <span className="text-white/60">Enter</span> on any cover
                </span>
              )}

              {running && closeRequested ? (
                forceReady ? (
                  <HeroAction
                    focusKey="hero-force"
                    label={confirming ? 'Confirm force quit' : 'Force quit'}
                    disabled={busy}
                    onClick={() => onForceQuit(game)}
                    onArrowPress={forceNeighbours}
                    className={cn(
                      'inline-flex h-11 items-center gap-2 rounded-full px-5 text-caption font-semibold ring-1',
                      confirming
                        ? 'bg-red-500 text-white ring-red-400 hover:bg-red-500/90'
                        : 'bg-red-500/10 text-red-200 ring-red-400/40 hover:bg-red-500/20',
                    )}
                  >
                    {inFlight === 'force-close' ? (
                      <Spinner className="size-4.5 text-white" />
                    ) : (
                      <PowerFilled className="size-4.5" />
                    )}
                    {confirming ? 'Press again to force quit' : 'Force quit'}
                  </HeroAction>
                ) : (
                  <span className="text-caption text-white/35">
                    Force quit in {forceCountdown}s
                  </span>
                )
              ) : null}

              {running && confirming ? (
                <HeroAction
                  focusKey="hero-cancel"
                  label="Keep waiting for the game to exit"
                  onClick={() => onCancelForce(game)}
                  onArrowPress={cancelNeighbours}
                  className="text-caption font-medium text-white/40 underline decoration-white/20 underline-offset-4 hover:text-white/70"
                >
                  Keep waiting
                </HeroAction>
              ) : null}

              <HeroAction
                focusKey="hero-favorite"
                label={
                  game.favorite
                    ? `Remove ${game.name} from favorites`
                    : `Add ${game.name} to favorites`
                }
                onClick={() => onToggleFavorite(game)}
                onArrowPress={favoriteNeighbours}
                className={cn(
                  'inline-flex h-11 items-center gap-2 rounded-full px-5 text-caption font-medium ring-1 transition-colors',
                  game.favorite
                    ? 'bg-amber-300/12 text-amber-200 ring-amber-300/30 hover:bg-amber-300/20'
                    : 'bg-white/5 text-white/65 ring-white/15 hover:bg-white/10 hover:text-white',
                )}
              >
                <StarFilled
                  className={cn(
                    'size-4.5',
                    game.favorite ? 'text-amber-300' : 'text-white/70',
                  )}
                />
                {game.favorite ? 'Favorited' : 'Favorite'}
              </HeroAction>

              <HeroAction
                focusKey="hero-details"
                label={`Game details for ${game.name}`}
                onClick={() => onDetails(game)}
                onArrowPress={detailsNeighbours}
                className="inline-flex h-11 items-center gap-2 rounded-full bg-white/5 px-5 text-caption font-medium text-white/65 ring-1 ring-white/15 hover:bg-white/10 hover:text-white"
              >
                <InformationFilled className="size-4.5 text-white/70" />
                Details
              </HeroAction>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
