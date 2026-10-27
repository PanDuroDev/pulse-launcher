import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ArrowLeftFilled,
  ArrowUpFilled,
  ClockFilled,
  DriveFilled,
  EditFilled,
  FolderOpenFilled,
  PicFilled,
  PlayFilled,
  StarFilled,
} from '@mingcute/react/core-filled'
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation-react'
import {
  doesFocusableExist,
  getCurrentFocusKey,
  pause,
  resume,
  setFocus,
} from '@noriginmedia/norigin-spatial-navigation-core'
import type { GameSummary } from '@shared/types'
import { formatBytes, formatLastPlayed, sourceLabel } from '@shared/format'
import { describeRunEvidence, runAssurance } from '@shared/run-state'
import { cn } from 'cn'
import { accentAlpha, initialsFor, uiAccent } from '@/lib/accent'
import { type GameActionState, isGameActionBusy } from '@/lib/game-actions'
import { useArtwork } from '@/hooks/use-artwork'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'

export interface GameDetailsDraft {
  gameId: string
  name: string
  executable: string
  /** `undefined` keeps the current cover, `null` removes it, a string picks one. */
  artwork: string | null | undefined
}

interface GameDetailsPageProps {
  game: GameSummary
  pending: boolean
  action: GameActionState
  /** Editable fields for a manual game; null for everything else. */
  draft: GameDetailsDraft | null
  saving: boolean
  removing: boolean
  onDraftChange: (patch: Partial<Omit<GameDetailsDraft, 'gameId'>>) => void
  onSave: () => void
  onRemove: () => void
  onBack: () => void
  onLaunch: (game: GameSummary) => void
  onToggleFavorite: (game: GameSummary) => void
  onPickExecutable: () => void
  onPickArtwork: () => void
}

const FOCUS = {
  back: 'details-back',
  primary: 'details-primary',
  favorite: 'details-favorite',
  name: 'details-name',
  path: 'details-path',
  art: 'details-art',
  artClear: 'details-art-clear',
  save: 'details-save',
  cancel: 'details-cancel',
  remove: 'details-remove',
}

/** How long the remove button stays armed before it goes back to safe. */
const REMOVE_CONFIRM_MS = 3_000

function focusRing(active: boolean): { boxShadow?: string } {
  return active
    ? { boxShadow: `0 0 0 2px ${uiAccent(0.8)}, 0 0 22px -8px ${uiAccent(0.6)}` }
    : {}
}

/** Move focus and always consume the direction, so geometry cannot escape. */
function moveTo(focusKey: string | null): boolean {
  if (!focusKey || !doesFocusableExist(focusKey)) return false
  void setFocus(focusKey)
  return false
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-caption font-semibold tracking-[0.2em] text-white/55 uppercase">
      {children}
    </p>
  )
}

interface DetailsActionProps {
  focusKey: string
  label: string
  onPress: () => void
  onArrowPress: (direction: string) => boolean
  disabled?: boolean
  primary?: boolean
  danger?: boolean
  className?: string
  children: ReactNode
}

function DetailsAction({
  focusKey,
  label,
  onPress,
  onArrowPress,
  disabled = false,
  primary = false,
  danger = false,
  className,
  children,
}: DetailsActionProps) {
  const { ref, focused } = useFocusable<Record<string, never>, HTMLButtonElement>({
    focusKey,
    accessibilityLabel: label,
    onEnterPress: () => {
      if (!disabled) onPress()
    },
    onArrowPress,
    onFocus: () => ref.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' }),
  })

  return (
    <button
      ref={ref}
      type="button"
      tabIndex={-1}
      aria-label={label}
      data-focus-key={focusKey}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (!disabled) onPress()
      }}
      className={cn(
        'inline-flex h-10 items-center justify-center gap-2 rounded-full px-5 text-caption font-medium outline-none transition-colors',
        primary
          ? 'bg-white font-semibold text-black hover:bg-white/90'
          : danger
            ? 'bg-red-500/12 text-red-200 ring-1 ring-red-400/35 hover:bg-red-500/20'
            : 'border border-white/10 bg-white/[0.06] text-white/85 hover:bg-white/12 hover:text-white',
        disabled && 'cursor-default opacity-50',
        className,
      )}
      style={focusRing(focused)}
    >
      {children}
    </button>
  )
}

/**
 * The selected game's page: cover, metadata, its main action, and — for a
 * manual entry — an inline editor for the name, launch file, and cover image.
 * Editing stays local to the page; main validates and writes on Save.
 */
export function GameDetailsPage({
  game,
  pending,
  action,
  draft,
  saving,
  removing,
  onDraftChange,
  onSave,
  onRemove,
  onBack,
  onLaunch,
  onToggleFavorite,
  onPickExecutable,
  onPickArtwork,
}: GameDetailsPageProps) {
  const cover = useArtwork(game.id, 'cover')
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const removeTimer = useRef<number | null>(null)

  const manual = Boolean(draft)
  const running = game.running
  const assurance = runAssurance(game.runState)
  const evidence = describeRunEvidence(game.runState)
  const busy = isGameActionBusy(action)
  const actionLabel = game.source === 'steam' || game.source === 'epic' ? 'Play' : 'Open'
  const lastPlayed = formatLastPlayed(game.lastPlayedAt)
  const size = formatBytes(game.sizeBytes)
  const chosenArtwork =
    draft?.artwork === null
      ? 'The custom cover will be removed when you save.'
      : typeof draft?.artwork === 'string'
        ? draft.artwork
        : null
  const hasCustomArtwork = Boolean(game.customArtwork) && draft?.artwork !== null

  // A different game (or an update from main) starts a fresh confirmation.
  // The page is remounted with a `key` when its catalog id changes.
  useEffect(() => {
    return () => {
      if (removeTimer.current !== null) window.clearTimeout(removeTimer.current)
    }
  }, [])

  // A long page should start at the top like Settings does.
  useEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollTop = 0
  }, [game.id])

  // Typing a name must not move the spatial focus on every arrow key.
  useEffect(() => {
    const isTyping = (target: EventTarget | null): boolean =>
      target instanceof HTMLElement &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable)
    let paused = false

    const onFocusIn = (event: FocusEvent): void => {
      if (!isTyping(event.target) || paused) return
      pause()
      paused = true
    }

    const onFocusOut = (event: FocusEvent): void => {
      if (!isTyping(event.target) || !paused) return
      if (isTyping(event.relatedTarget)) return
      resume()
      paused = false
    }

    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      if (paused) resume()
    }
  }, [])

  const handleRemove = useCallback((): void => {
    if (removing) return
    if (confirmRemove) {
      if (removeTimer.current !== null) window.clearTimeout(removeTimer.current)
      removeTimer.current = null
      setConfirmRemove(false)
      onRemove()
      return
    }
    setConfirmRemove(true)
    if (removeTimer.current !== null) window.clearTimeout(removeTimer.current)
    removeTimer.current = window.setTimeout(() => {
      removeTimer.current = null
      setConfirmRemove(false)
    }, REMOVE_CONFIRM_MS)
  }, [confirmRemove, onRemove, removing])

  // --- Arrow graph -------------------------------------------------------
  const backArrows = (direction: string): boolean =>
    direction === 'down' ? moveTo(FOCUS.primary) : false

  const primaryArrows = (direction: string): boolean => {
    if (direction === 'left') return moveTo(FOCUS.back)
    if (direction === 'right') return moveTo(FOCUS.favorite)
    if (direction === 'down') return moveTo(manual ? FOCUS.name : FOCUS.back)
    return true
  }

  const favoriteArrows = (direction: string): boolean => {
    if (direction === 'left') return moveTo(FOCUS.primary)
    if (direction === 'down') return moveTo(manual ? FOCUS.name : FOCUS.back)
    return false
  }

  const nameArrows = (direction: string): boolean => {
    if (direction === 'up') return moveTo(FOCUS.primary)
    if (direction === 'down') return moveTo(FOCUS.path)
    return true
  }

  const pathArrows = (direction: string): boolean => {
    if (direction === 'up') return moveTo(FOCUS.name)
    if (direction === 'down') return moveTo(FOCUS.art)
    if (direction === 'right') return moveTo(FOCUS.art)
    return false
  }

  const artArrows = (direction: string): boolean => {
    if (direction === 'up') return moveTo(FOCUS.path)
    if (direction === 'right') {
      return moveTo(hasCustomArtwork ? FOCUS.artClear : FOCUS.save)
    }
    if (direction === 'down') {
      return moveTo(hasCustomArtwork ? FOCUS.artClear : FOCUS.save)
    }
    return false
  }

  const artClearArrows = (direction: string): boolean => {
    if (direction === 'left') return moveTo(FOCUS.art)
    if (direction === 'up' || direction === 'down') return moveTo(FOCUS.save)
    return false
  }

  const saveArrows = (direction: string): boolean => {
    if (direction === 'up') return moveTo(hasCustomArtwork ? FOCUS.artClear : FOCUS.art)
    if (direction === 'left') return moveTo(FOCUS.cancel)
    if (direction === 'right') return moveTo(FOCUS.remove)
    return false
  }

  const cancelArrows = (direction: string): boolean => {
    if (direction === 'up') return moveTo(FOCUS.path)
    if (direction === 'left') return moveTo(FOCUS.remove)
    if (direction === 'right') return moveTo(FOCUS.save)
    return false
  }

  const removeArrows = (direction: string): boolean => {
    if (direction === 'up') return moveTo(FOCUS.art)
    if (direction === 'left') return moveTo(FOCUS.save)
    if (direction === 'right') return moveTo(FOCUS.cancel)
    return false
  }

  // --- Focusable controls ------------------------------------------------
  const { ref: backRef, focused: backFocused } = useFocusable<
    Record<string, never>,
    HTMLButtonElement
  >({
    focusKey: FOCUS.back,
    accessibilityLabel: 'Back to library',
    onEnterPress: onBack,
    onArrowPress: backArrows,
    onFocus: () => backRef.current?.scrollIntoView({ block: 'nearest' }),
  })

  const {
    ref: nameFieldRef,
    focused: nameFocused,
  } = useFocusable<Record<string, never>, HTMLInputElement>({
    focusKey: FOCUS.name,
    accessibilityLabel: 'Game name',
    onArrowPress: nameArrows,
  })

  const tabOrder = useMemo(() => {
    const order: string[] = [FOCUS.back, FOCUS.primary, FOCUS.favorite]
    if (manual) {
      order.push(FOCUS.name, FOCUS.path, FOCUS.art)
      if (hasCustomArtwork) order.push(FOCUS.artClear)
      order.push(FOCUS.save, FOCUS.cancel, FOCUS.remove)
    }
    return order
  }, [hasCustomArtwork, manual])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab') return
      const active = document.activeElement
      if (
        active instanceof HTMLElement &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.isContentEditable)
      ) {
        active.blur()
        resume()
      }
      event.preventDefault()
      const current = getCurrentFocusKey()
      const index = current ? tabOrder.indexOf(current) : -1
      const step = event.shiftKey ? -1 : 1
      const nextIndex =
        index === -1
          ? event.shiftKey
            ? tabOrder.length - 1
            : 0
          : (index + step + tabOrder.length) % tabOrder.length
      const next = tabOrder[nextIndex]
      if (next) void setFocus(next)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [tabOrder])

  const statusText = running
    ? assurance === 'confirmed'
      ? 'Running now'
      : 'Possibly running'
    : pending
      ? 'Launch requested'
      : null

  return (
    <main
      className="relative z-10 flex min-h-0 flex-1 flex-col"
      data-page="game-details"
      data-game-id={game.id}
    >
      <div className="px-[6vw] pb-4">
        <div className="mx-auto flex w-full max-w-[64rem] items-center gap-4">
          <button
            ref={backRef}
            type="button"
            tabIndex={-1}
            aria-label="Back to library"
            data-focus-key={FOCUS.back}
            onClick={onBack}
            className={cn(
              'inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-caption font-medium outline-none transition-colors',
              backFocused
                ? 'bg-white text-black'
                : 'bg-white/[0.05] text-white/70 ring-1 ring-white/15 hover:bg-white/10 hover:text-white',
            )}
            style={backFocused ? { boxShadow: `0 0 0 2px ${uiAccent(0.45)}` } : undefined}
          >
            <ArrowLeftFilled className="size-4" />
            Library
          </button>
          <div className="min-w-0">
            <h1 className="text-label font-semibold tracking-tight text-white/95">
              Game details
            </h1>
            <p className="mt-0.5 text-caption text-white/60">
              {manual
                ? 'Edit the name, launch file, or cover of this local game.'
                : 'What Pulse knows about this game.'}
            </p>
          </div>
          <p className="ml-auto hidden text-right text-caption leading-relaxed text-white/55 md:block">
            Enter activates
            <br />
            Esc returns to the library
          </p>
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-[6vw] pb-16"
      >
        <div className="mx-auto grid w-full max-w-[64rem] gap-7 rounded-2xl border border-white/10 bg-[#08080d]/92 px-6 py-6 backdrop-blur-xl md:grid-cols-[15rem_minmax(0,1fr)]">
          <div className="flex flex-col gap-3">
            <div
              className="relative aspect-[2/3] w-full max-w-[15rem] overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/10"
              data-details-cover=""
              style={{
                background: `linear-gradient(150deg, ${accentAlpha(game.accent, 0.72)}, #0b0b12 72%)`,
              }}
            >
              {cover ? (
                <img
                  src={cover}
                  alt=""
                  draggable={false}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 grid place-items-center">
                  <span className="text-6xl font-semibold tracking-[-0.08em] text-white/25">
                    {initialsFor(game.name)}
                  </span>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-caption text-white/45">
              <span className="rounded-full bg-white/8 px-2.5 py-1 text-caption font-semibold tracking-[0.16em] text-white/65 uppercase ring-1 ring-white/12">
                {sourceLabel(game.source)}
              </span>
              {statusText ? (
                <span
                  className={
                    running && assurance === 'confirmed'
                      ? 'text-emerald-300'
                      : 'text-amber-200/85'
                  }
                >
                  {statusText}
                </span>
              ) : null}
            </div>
          </div>

          <div className="grid min-w-0 content-start gap-6">
            <div className="min-w-0">
              <h2 className="truncate text-[clamp(1.6rem,3.2vw,2.6rem)] leading-tight font-semibold tracking-[-0.03em] text-white">
                {game.name}
              </h2>
              <p className="mt-1.5 max-w-2xl text-caption leading-relaxed text-white/45">
                {running
                  ? assurance === 'confirmed'
                    ? `${game.name} is running. Use Bring to front to switch back to it.`
                    : `Probably running — matched by ${evidence ?? 'process activity'}.`
                  : pending
                    ? `Launch request sent. Waiting for ${game.name} to appear as running.`
                    : (game.subtitle ??
                      `Ready to ${actionLabel === 'Play' ? 'jump back in' : 'launch'} from your ${sourceLabel(game.source)} library.`)}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-caption text-white/45">
                {lastPlayed ? (
                  <span className="flex items-center gap-1.5">
                    <ClockFilled className="size-4" />
                    Played {lastPlayed}
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <ClockFilled className="size-4" />
                    Not played yet
                  </span>
                )}
                {size ? (
                  <span className="flex items-center gap-1.5">
                    <DriveFilled className="size-4" />
                    {size}
                  </span>
                ) : null}
                {game.playCount ? (
                  <span>
                    {game.playCount} {game.playCount === 1 ? 'launch' : 'launches'}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <DetailsAction
                focusKey={FOCUS.primary}
                label={
                  running
                    ? `Bring ${game.name} to front`
                    : pending
                      ? 'Waiting for the game to start'
                      : `${actionLabel} ${game.name}`
                }
                onPress={() => onLaunch(game)}
                onArrowPress={primaryArrows}
                disabled={busy || (!running && pending)}
                primary
              >
                {running ? (
                  <ArrowUpFilled className="size-4.5" />
                ) : pending ? (
                  <Spinner className="size-4.5" />
                ) : (
                  <PlayFilled className="size-4.5" />
                )}
                {running ? 'Bring to front' : pending ? 'Waiting' : actionLabel}
              </DetailsAction>
              <DetailsAction
                focusKey={FOCUS.favorite}
                label={
                  game.favorite
                    ? `Remove ${game.name} from favorites`
                    : `Add ${game.name} to favorites`
                }
                onPress={() => onToggleFavorite(game)}
                onArrowPress={favoriteArrows}
                className={
                  game.favorite
                    ? 'bg-amber-300/12 text-amber-200 ring-amber-300/30 hover:bg-amber-300/20'
                    : undefined
                }
              >
                <StarFilled
                  className={cn(
                    'size-4.5',
                    game.favorite ? 'text-amber-300' : 'text-white/70',
                  )}
                />
                {game.favorite ? 'Favorited' : 'Favorite'}
              </DetailsAction>
            </div>

            {manual && draft ? (
              <>
                <section className="grid gap-3 border-t border-white/10 pt-5">
                  <SectionLabel>Name and launch file</SectionLabel>
                  <div className="grid gap-1.5">
                    <label htmlFor="details-name-field" className="text-caption text-white/70">
                      Name
                    </label>
                    <Input
                      ref={nameFieldRef}
                      id="details-name-field"
                      value={draft.name}
                      onChange={(event) => onDraftChange({ name: event.target.value })}
                      maxLength={80}
                      aria-label="Game name"
                      data-focus-key={FOCUS.name}
                      className="max-w-xl border-white/15 bg-white/[0.06] text-white placeholder:text-white/35"
                      style={focusRing(nameFocused)}
                      spellCheck={false}
                      autoComplete="off"
                    />
                    <p className="text-caption text-white/40">
                      Up to 80 characters. Saving a new name keeps the game, its
                      favorite, and its play history.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-caption font-medium text-white/85">
                        <FolderOpenFilled className="size-4 text-white/50" />
                        Launch file
                      </p>
                      <p
                        className="mt-1 truncate text-caption text-white/45"
                        title={draft.executable}
                        data-details-path=""
                      >
                        {draft.executable || 'No file chosen'}
                      </p>
                      {draft.executable !== (game.executable ?? '') ? (
                        <p className="mt-1 text-caption text-amber-200/80">
                          Changed — saving also updates the game's id and play history.
                        </p>
                      ) : null}
                    </div>
                    <DetailsAction
                      focusKey={FOCUS.path}
                      label="Choose the launch file"
                      onPress={onPickExecutable}
                      onArrowPress={pathArrows}
                    >
                      <EditFilled className="size-4" />
                      Change file
                    </DetailsAction>
                  </div>
                </section>

                <section className="grid gap-3 border-t border-white/10 pt-5">
                  <SectionLabel>Cover art</SectionLabel>
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-caption font-medium text-white/85">
                        <PicFilled className="size-4 text-white/50" />
                        {hasCustomArtwork ? 'Custom image' : 'No custom image'}
                      </p>
                      <p
                        className="mt-1 truncate text-caption text-white/45"
                        title={chosenArtwork ?? undefined}
                        data-details-art=""
                      >
                        {chosenArtwork ??
                          (hasCustomArtwork
                            ? 'Using the image you picked.'
                            : 'Pulse downloads a cover or draws a placeholder.')}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <DetailsAction
                        focusKey={FOCUS.art}
                        label="Choose a cover image"
                        onPress={onPickArtwork}
                        onArrowPress={artArrows}
                      >
                        <PicFilled className="size-4" />
                        Choose image
                      </DetailsAction>
                      {hasCustomArtwork ? (
                        <DetailsAction
                          focusKey={FOCUS.artClear}
                          label="Remove the custom cover image"
                          onPress={() => onDraftChange({ artwork: null })}
                          onArrowPress={artClearArrows}
                        >
                          Remove image
                        </DetailsAction>
                      ) : null}
                    </div>
                  </div>
                </section>

                <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-5">
                  <DetailsAction
                    focusKey={FOCUS.save}
                    label={saving ? 'Saving changes' : 'Save changes'}
                    onPress={onSave}
                    onArrowPress={saveArrows}
                    disabled={saving}
                    primary
                  >
                    {saving ? <Spinner className="size-4" /> : null}
                    {saving ? 'Saving…' : 'Save changes'}
                  </DetailsAction>
                  <DetailsAction
                    focusKey={FOCUS.cancel}
                    label="Cancel changes"
                    onPress={onBack}
                    onArrowPress={cancelArrows}
                    disabled={saving}
                  >
                    Cancel
                  </DetailsAction>
                  <DetailsAction
                    focusKey={FOCUS.remove}
                    label={
                      confirmRemove
                        ? `Press again to remove ${game.name}`
                        : `Remove ${game.name} from the library`
                    }
                    onPress={handleRemove}
                    onArrowPress={removeArrows}
                    disabled={removing || saving}
                    danger
                    className="ml-auto"
                  >
                    {removing ? <Spinner className="size-4" /> : null}
                    {confirmRemove ? 'Press again to remove' : 'Remove game'}
                  </DetailsAction>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  )
}
