import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ArrowLeftFilled,
  ArrowRightFilled,
  ArrowUpFilled,
  DriveFilled,
  FolderOpenFilled,
  PicFilled,
  PlayFilled,
} from '@mingcute/react/core-filled'
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation-react'
import {
  doesFocusableExist,
  getCurrentFocusKey,
  setFocus,
} from '@noriginmedia/norigin-spatial-navigation-core'
import { toast } from 'sonner'
import type {
  DirectoryListing,
  GameSummary,
  PickerEntry,
  PickerLocation,
} from '@shared/contracts/games'
import { uiAccent } from '@/lib/accent'
import { cn } from 'cn'
import { Spinner } from '@/components/ui/spinner'

interface AddGamePageProps {
  onBack: () => void
  /** Called after main accepted the file; the library is already updated. */
  onAdded?: (game: GameSummary) => void
  /**
   * `game` browses .exe/.lnk files and adds one; `path` only hands back the
   * chosen executable (used when editing a manual game); `image` browses
   * images and hands back the chosen file (custom cover art).
   */
  mode?: 'game' | 'path' | 'image'
  /** Called with the chosen file path in `path` and `image` mode. */
  onPicked?: (path: string) => void
}

const FOCUS = {
  back: 'add-back',
  up: 'add-up',
  confirm: 'add-confirm',
  cancel: 'add-cancel',
  place: (id: string) => `add-place-${id}`,
  entry: (index: number) => `add-entry-${index}`,
}

function focusRing(active: boolean): { boxShadow?: string } {
  return active ? { boxShadow: `0 0 0 2px ${uiAccent(0.8)}, 0 0 22px -8px ${uiAccent(0.5)}` } : {}
}

/** Move focus, then always consume the arrow so geometry cannot escape. */
function moveTo(focusKey: string | null): boolean {
  if (!focusKey || !doesFocusableExist(focusKey)) return false
  void setFocus(focusKey)
  return false
}

interface PageActionProps {
  focusKey: string
  label: string
  onPress: () => void
  onArrowPress: (direction: string) => boolean
  disabled?: boolean
  primary?: boolean
  className?: string
  children: ReactNode
}

function PageAction({
  focusKey,
  label,
  onPress,
  onArrowPress,
  disabled = false,
  primary = false,
  className,
  children,
}: PageActionProps) {
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
        'inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-[0.78rem] font-semibold outline-none transition-colors',
        primary
          ? 'bg-white text-black hover:bg-white/90'
          : 'border border-white/10 bg-white/[0.06] text-white/80 hover:bg-white/12 hover:text-white',
        disabled && 'cursor-default opacity-50',
        className,
      )}
      style={focused ? focusRing(true) : undefined}
    >
      {children}
    </button>
  )
}

interface PlaceButtonProps {
  place: PickerLocation
  activePath: string | null
  onOpen: (place: PickerLocation) => void
  onArrowPress: (direction: string) => boolean
}

function PlaceButton({ place, activePath, onOpen, onArrowPress }: PlaceButtonProps) {
  const active = activePath === place.path
  const { ref, focused } = useFocusable<Record<string, never>, HTMLButtonElement>({
    focusKey: FOCUS.place(place.id),
    accessibilityLabel: `${place.label}, ${place.path}`,
    onEnterPress: () => onOpen(place),
    onArrowPress,
    onFocus: () => ref.current?.scrollIntoView({ block: 'nearest' }),
  })

  return (
    <button
      ref={ref}
      type="button"
      tabIndex={-1}
      aria-label={`${place.label}, ${place.path}`}
      data-focus-key={FOCUS.place(place.id)}
      onClick={() => onOpen(place)}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[0.72rem] outline-none transition-colors',
        active
          ? 'bg-white/12 text-white'
          : 'text-white/60 hover:bg-white/[0.07] hover:text-white/90',
        focused && 'text-white',
      )}
      style={focusRing(focused)}
    >
      {place.kind === 'drive' ? (
        <DriveFilled className="size-4 shrink-0 text-white/55" />
      ) : (
        <FolderOpenFilled className="size-4 shrink-0 text-white/55" />
      )}
      <span className="truncate">{place.label}</span>
    </button>
  )
}

interface EntryRowProps {
  entry: PickerEntry
  index: number
  selected: boolean
  kind: 'game' | 'image'
  onOpen: (entry: PickerEntry) => void
  onChoose: (entry: PickerEntry) => void
  onArrowPress: (direction: string) => boolean
}

/**
 * One folder or file. Folders open on Enter; files become the selection and
 * move focus to the confirm action, so a remote needs two presses and never
 * adds a game or picks a cover by accident.
 */
function EntryRow({
  entry,
  index,
  selected,
  kind,
  onOpen,
  onChoose,
  onArrowPress,
}: EntryRowProps) {
  const isFile = entry.kind === 'file'
  const label = isFile
    ? kind === 'image'
      ? `Image file ${entry.name}`
      : `Game file ${entry.name}`
    : `Folder ${entry.name}`
  const { ref, focused } = useFocusable<Record<string, never>, HTMLButtonElement>({
    focusKey: FOCUS.entry(index),
    accessibilityLabel: label,
    onEnterPress: () => (isFile ? onChoose(entry) : onOpen(entry)),
    onArrowPress,
    onFocus: () => ref.current?.scrollIntoView({ block: 'nearest' }),
  })

  return (
    <button
      ref={ref}
      type="button"
      tabIndex={-1}
      aria-label={label}
      data-focus-key={FOCUS.entry(index)}
      data-kind={entry.kind}
      aria-current={selected || undefined}
      onClick={() => (isFile ? onChoose(entry) : onOpen(entry))}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left outline-none transition-colors',
        selected
          ? 'border-white/25 bg-white/12 text-white'
          : focused
            ? 'border-white/20 bg-white/[0.08] text-white'
            : 'border-transparent text-white/80 hover:border-white/10 hover:bg-white/[0.05] hover:text-white',
      )}
      style={focusRing(focused)}
    >
      <span
        aria-hidden
        className={cn(
          'grid size-10 shrink-0 place-items-center rounded-lg',
          isFile ? 'bg-white/10 text-white/85' : 'bg-white/[0.06] text-white/60',
        )}
      >
        {isFile ? (
          kind === 'image' ? (
            <PicFilled className="size-5" />
          ) : (
            <PlayFilled className="size-5" />
          )
        ) : (
          <FolderOpenFilled className="size-5" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.8rem] font-medium">{entry.name}</span>
        <span className="mt-0.5 block text-[0.62rem] tracking-wide text-white/45 uppercase">
          {isFile
            ? kind === 'image'
              ? `${entry.extension} image`
              : `${entry.extension} file`
            : 'Folder'}
        </span>
      </span>
      {isFile ? (
        <span className="shrink-0 rounded-md border border-white/10 px-1.5 py-0.5 text-[0.58rem] font-semibold tracking-wider text-white/50 uppercase">
          {entry.extension}
        </span>
      ) : (
        <ArrowRightFilled className="size-4 shrink-0 text-white/30" />
      )}
    </button>
  )
}

/**
 * The in-app file picker. It replaces the native Windows dialog on the main
 * "Add game" path and also picks custom cover art: the renderer only ever
 * receives folder names, file names and paths, and the actual add/edit remains
 * a separate, validated call.
 */
export function AddGamePage({
  onBack,
  onAdded,
  mode = 'game',
  onPicked,
}: AddGamePageProps) {
  const imageMode = mode === 'image'
  const pickOnly = mode !== 'game'
  const [places, setPlaces] = useState<PickerLocation[]>([])
  const [listing, setListing] = useState<DirectoryListing | null>(null)
  const [selected, setSelected] = useState<PickerEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef(0)
  const scrollerRef = useRef<HTMLDivElement>(null)

  const entries = useMemo(() => listing?.entries ?? [], [listing])
  const currentPath = listing?.path ?? null
  const crumbs = listing?.crumbs ?? []
  const lastPlaceKey = places.length > 0 ? FOCUS.place(places[places.length - 1]!.id) : null
  const lastEntryKey = entries.length > 0 ? FOCUS.entry(entries.length - 1) : null

  const focusFirstEntry = useCallback((delay = 60) => {
    window.setTimeout(() => {
      if (doesFocusableExist(FOCUS.entry(0))) {
        void setFocus(FOCUS.entry(0))
        return
      }
      if (doesFocusableExist(FOCUS.up)) void setFocus(FOCUS.up)
      else if (doesFocusableExist(FOCUS.back)) void setFocus(FOCUS.back)
    }, delay)
  }, [])

  const openPath = useCallback(
    async (target: string): Promise<void> => {
      const request = ++requestRef.current
      setLoading(true)
      setError(null)
      try {
        const result = await window.launcher.library.list(
          target,
          imageMode ? 'image' : 'game',
        )
        if (request !== requestRef.current) return
        if (!result.ok) {
          const message = result.error ?? 'Could not read that folder.'
          setError(message)
          toast.error(message)
          return
        }
        setListing(result)
        setSelected(null)
        if (scrollerRef.current) scrollerRef.current.scrollTop = 0
        focusFirstEntry()
      } catch (cause) {
        if (request !== requestRef.current) return
        const message = cause instanceof Error ? cause.message : 'Could not read that folder.'
        setError(message)
        toast.error(message)
      } finally {
        if (request === requestRef.current) setLoading(false)
      }
    },
    [focusFirstEntry, imageMode],
  )

  // Places and drives come from main; the first real place is the start path.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const roots = await window.launcher.library.roots()
        if (cancelled) return
        setPlaces(roots.places)
        const start =
          roots.places.find((place) => place.kind === 'place') ?? roots.places[0]
        if (start) {
          await openPath(start.path)
        } else {
          setLoading(false)
          setError('No folders are available to browse.')
        }
      } catch (cause) {
        if (cancelled) return
        setLoading(false)
        setError(cause instanceof Error ? cause.message : 'Could not list your folders.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [openPath])

  // Something must own focus while the first folder is loading.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const current = getCurrentFocusKey()
      if (current && current.startsWith('add-')) return
      if (doesFocusableExist(FOCUS.back)) void setFocus(FOCUS.back)
    }, 90)
    return () => window.clearTimeout(timer)
  }, [])

  const chooseFile = useCallback((entry: PickerEntry): void => {
    setSelected(entry)
    window.setTimeout(() => {
      if (doesFocusableExist(FOCUS.confirm)) void setFocus(FOCUS.confirm)
    }, 50)
  }, [])

  const openEntry = useCallback(
    (entry: PickerEntry): void => {
      if (entry.kind === 'directory') {
        void openPath(entry.path)
        return
      }
      chooseFile(entry)
    },
    [chooseFile, openPath],
  )

  const clearSelection = useCallback((): void => {
    const index = selected ? entries.findIndex((entry) => entry.path === selected.path) : -1
    setSelected(null)
    const target = index >= 0 ? FOCUS.entry(index) : FOCUS.entry(0)
    window.setTimeout(() => {
      if (doesFocusableExist(target)) void setFocus(target)
      else if (doesFocusableExist(FOCUS.up)) void setFocus(FOCUS.up)
    }, 30)
  }, [entries, selected])

  const confirmSelected = useCallback(async (): Promise<void> => {
    if (!selected || adding) return
    if (pickOnly) {
      onPicked?.(selected.path)
      return
    }
    if (!onAdded) return
    setAdding(true)
    setError(null)
    try {
      const result = await window.launcher.library.add(selected.path)
      if (result.ok && result.game) {
        onAdded(result.game)
        return
      }
      const message = result.error ?? 'Could not add that game.'
      setError(message)
      toast.error(message)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not add that game.'
      setError(message)
      toast.error(message)
    } finally {
      setAdding(false)
    }
  }, [adding, onAdded, onPicked, pickOnly, selected])

  // --- Arrow graph -------------------------------------------------------
  const backArrows = (direction: string): boolean => {
    if (direction === 'down' || direction === 'right') {
      return moveTo(places[0] ? FOCUS.place(places[0].id) : FOCUS.up)
    }
    return false
  }

  const upArrows = (direction: string): boolean => {
    if (direction === 'up') return moveTo(FOCUS.back)
    if (direction === 'down' || direction === 'right') return moveTo(FOCUS.entry(0))
    if (direction === 'left') return moveTo(lastPlaceKey ?? FOCUS.back)
    return false
  }

  const placeArrows = (index: number) => (direction: string): boolean => {
    if (direction === 'up') {
      if (index > 0) return moveTo(FOCUS.place(places[index - 1]!.id))
      return moveTo(FOCUS.back)
    }
    if (direction === 'down') {
      const next = places[index + 1]
      if (next) return moveTo(FOCUS.place(next.id))
      return moveTo(FOCUS.entry(0))
    }
    if (direction === 'right') return moveTo(FOCUS.entry(0))
    return false
  }

  const entryArrows = (index: number) => (direction: string): boolean => {
    if (direction === 'up') {
      if (index > 0) return moveTo(FOCUS.entry(index - 1))
      return moveTo(FOCUS.up)
    }
    if (direction === 'down') {
      const next = entries[index + 1]
      if (next) return moveTo(FOCUS.entry(index + 1))
      return selected ? moveTo(FOCUS.confirm) : false
    }
    if (direction === 'left') return moveTo(lastPlaceKey ?? FOCUS.back)
    if (direction === 'right') return selected ? moveTo(FOCUS.confirm) : false
    return false
  }

  const confirmArrows = (direction: string): boolean => {
    if (direction === 'up') return moveTo(lastEntryKey ?? FOCUS.up)
    if (direction === 'left' || direction === 'right') return moveTo(FOCUS.cancel)
    return false
  }

  const cancelArrows = (direction: string): boolean => {
    if (direction === 'up') return moveTo(lastEntryKey ?? FOCUS.up)
    if (direction === 'left' || direction === 'right') return moveTo(FOCUS.confirm)
    return false
  }

  // --- Focusable header actions -----------------------------------------
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
  const { ref: upRef, focused: upFocused } = useFocusable<
    Record<string, never>,
    HTMLButtonElement
  >({
    focusKey: FOCUS.up,
    accessibilityLabel: 'Up one level',
    onEnterPress: () => {
      if (listing?.parent) void openPath(listing.parent)
    },
    onArrowPress: upArrows,
  })

  const tabOrder = useMemo(() => {
    const order: string[] = [FOCUS.back, FOCUS.up]
    for (const place of places) order.push(FOCUS.place(place.id))
    for (let index = 0; index < entries.length; index += 1) order.push(FOCUS.entry(index))
    if (selected) order.push(FOCUS.cancel, FOCUS.confirm)
    return order
  }, [entries.length, places, selected])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab') return
      event.preventDefault()
      const index = tabOrder.indexOf(getCurrentFocusKey() ?? '')
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

  const fileCount = entries.filter((entry) => entry.kind === 'file').length
  const folderCount = entries.length - fileCount

  return (
    <main className="relative z-10 flex min-h-0 flex-1 flex-col">
      <div className="px-[6vw] pb-4">
        <div className="mx-auto flex w-full max-w-[64rem] items-center gap-4">
          <button
            ref={backRef}
            type="button"
            tabIndex={-1}
            aria-label={pickOnly ? 'Back to game details' : 'Back to library'}
            data-focus-key={FOCUS.back}
            onClick={onBack}
            className={cn(
              'inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-[0.72rem] font-medium outline-none transition-colors',
              backFocused
                ? 'bg-white text-black'
                : 'bg-white/[0.05] text-white/70 ring-1 ring-white/15 hover:bg-white/10 hover:text-white',
            )}
            style={backFocused ? { boxShadow: `0 0 0 2px ${uiAccent(0.45)}` } : undefined}
          >
            <ArrowLeftFilled className="size-4" />
            {pickOnly ? 'Details' : 'Library'}
          </button>
          <div className="min-w-0">
            <h1 className="text-[1.05rem] font-semibold tracking-tight text-white/95">
              {imageMode
                ? 'Choose cover art'
                : mode === 'path'
                  ? 'Choose the game file'
                  : 'Add a local game'}
            </h1>
            <p className="mt-0.5 text-[0.7rem] text-white/60">
              {imageMode
                ? 'Browse for a PNG, JPEG, WebP, or AVIF image to use as the cover.'
                : mode === 'path'
                  ? 'Browse for the .exe or .lnk this entry should launch.'
                  : 'Browse for a game .exe or a .lnk shortcut, then add it to your library.'}
            </p>
          </div>
          <p className="ml-auto hidden text-right text-[0.62rem] leading-relaxed text-white/55 md:block">
            Enter opens or selects
            <br />
            {pickOnly ? 'Esc returns to game details' : 'Esc returns to the library'}
          </p>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-4 px-[6vw] pb-8">
        {places.length > 0 ? (
          <aside className="hidden w-52 shrink-0 flex-col rounded-2xl border border-white/10 bg-[#08080d]/92 p-2 backdrop-blur-xl sm:flex">
            <p className="px-2 pt-1.5 pb-2 text-[0.58rem] font-semibold tracking-[0.2em] text-white/45 uppercase">
              Places
            </p>
            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
              {places.map((place, index) => (
                <PlaceButton
                  key={place.id}
                  place={place}
                  activePath={currentPath}
                  onOpen={(next) => void openPath(next.path)}
                  onArrowPress={placeArrows(index)}
                />
              ))}
            </div>
          </aside>
        ) : null}

        <section
          className="flex min-w-0 flex-1 flex-col rounded-2xl border border-white/10 bg-[#08080d]/92 backdrop-blur-xl"
          data-picker-path={currentPath ?? ''}
        >
          <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5">
            <button
              ref={upRef}
              type="button"
              tabIndex={-1}
              aria-label="Up one level"
              data-focus-key={FOCUS.up}
              disabled={!listing?.parent}
              onClick={() => {
                if (listing?.parent) void openPath(listing.parent)
              }}
              className={cn(
                'grid size-8 shrink-0 place-items-center rounded-lg outline-none transition-colors',
                listing?.parent
                  ? 'text-white/70 hover:bg-white/10 hover:text-white'
                  : 'cursor-default text-white/20',
                upFocused && 'bg-white/12 text-white',
              )}
              style={upFocused ? focusRing(true) : undefined}
            >
              <ArrowUpFilled className="size-4" />
            </button>
            <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap text-[0.68rem]">
              {crumbs.map((crumb, index) => (
                <span key={crumb.path} className="flex shrink-0 items-center gap-1">
                  {index > 0 ? <span className="text-white/25">/</span> : null}
                  <span
                    className={
                      index === crumbs.length - 1
                        ? 'font-medium text-white/85'
                        : 'text-white/45'
                    }
                  >
                    {crumb.name}
                  </span>
                </span>
              ))}
              {crumbs.length === 0 ? (
                <span className="text-white/45">Select a place to start</span>
              ) : null}
            </div>
            <span className="hidden shrink-0 text-[0.62rem] text-white/40 sm:inline">
              {folderCount} folders · {fileCount} {imageMode ? 'images' : 'games'}
            </span>
          </div>

          {error ? (
            <p
              role="alert"
              className="mx-3 mt-3 rounded-lg border border-amber-300/20 bg-amber-300/[0.08] px-3 py-2 text-[0.68rem] text-amber-100/85"
            >
              {error}
            </p>
          ) : null}

          <div ref={scrollerRef} className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
            {loading ? (
              <div className="grid gap-1.5" aria-live="polite" aria-busy>
                <p className="flex items-center gap-2 px-2 py-1.5 text-[0.68rem] text-white/55">
                  <Spinner className="size-4" />
                  Reading folder…
                </p>
                {Array.from({ length: 6 }, (_, index) => (
                  <div
                    key={index}
                    className="h-[3.35rem] animate-pulse rounded-xl bg-white/[0.04]"
                  />
                ))}
              </div>
            ) : entries.length === 0 ? (
              <div className="grid place-items-center gap-2 px-4 py-12 text-center">
                <FolderOpenFilled className="size-8 text-white/25" />
                <p className="text-[0.8rem] font-medium text-white/75">
                  {imageMode ? 'No folders or images here' : 'No folders or game files here'}
                </p>
                <p className="max-w-[22rem] text-[0.68rem] leading-relaxed text-white/45">
                  {imageMode
                    ? 'Pulse shows folders plus PNG, JPEG, WebP and AVIF images. Use Up one level or pick another place.'
                    : 'Pulse shows folders plus .exe and .lnk files. Use Up one level or pick another place.'}
                </p>
              </div>
            ) : (
              <div className="grid gap-1">
                {entries.map((entry, index) => (
                  <EntryRow
                    key={entry.path}
                    entry={entry}
                    index={index}
                    kind={imageMode ? 'image' : 'game'}
                    selected={selected?.path === entry.path}
                    onOpen={openEntry}
                    onChoose={chooseFile}
                    onArrowPress={entryArrows(index)}
                  />
                ))}
                {listing?.truncated ? (
                  <p className="px-3 py-2 text-[0.64rem] text-white/40">
                    Showing the first entries only. Open a subfolder to narrow the list.
                  </p>
                ) : null}
              </div>
            )}
          </div>

          <div className="border-t border-white/10 px-3 py-2.5">
            {selected ? (
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.78rem] font-medium text-white/90">
                    {selected.name}
                  </p>
                  <p
                    className="truncate text-[0.62rem] text-white/45"
                    title={selected.path}
                  >
                    {selected.path}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <PageAction
                    focusKey={FOCUS.cancel}
                    label={imageMode ? 'Choose another image' : 'Choose another file'}
                    onPress={clearSelection}
                    onArrowPress={cancelArrows}
                  >
                    Choose another
                  </PageAction>
                  <PageAction
                    focusKey={FOCUS.confirm}
                    label={
                      imageMode
                        ? `Use ${selected.name} as cover art`
                        : pickOnly
                          ? `Use ${selected.name}`
                          : adding
                            ? `Adding ${selected.name}`
                            : `Add ${selected.name} to library`
                    }
                    onPress={() => void confirmSelected()}
                    onArrowPress={confirmArrows}
                    disabled={adding}
                    primary
                  >
                    {adding ? <Spinner className="size-4" /> : null}
                    {imageMode
                      ? 'Use this image'
                      : pickOnly
                        ? 'Use this file'
                        : adding
                          ? 'Adding…'
                          : 'Add to library'}
                  </PageAction>
                </div>
              </div>
            ) : (
              <p className="px-1 text-[0.64rem] text-white/45">
                {loading
                  ? 'Reading this folder…'
                  : imageMode
                    ? 'Select an image, or open a folder to keep looking.'
                    : 'Select a game file, or open a folder to keep looking.'}
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
