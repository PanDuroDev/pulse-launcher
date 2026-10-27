import { useCallback, useEffect, useMemo } from 'react'
import {
  ArrowLeftFilled,
  CloseFilled,
  SearchFilled,
} from '@mingcute/react/core-filled'
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation-react'
import {
  doesFocusableExist,
  pause,
  resume,
  setFocus,
} from '@noriginmedia/norigin-spatial-navigation-core'
import type { GameSummary } from '@shared/types'
import { filterGames } from '@shared/library'
import { sourceLabel } from '@shared/format'
import { uiAccent } from '@/lib/accent'
import { cn } from 'cn'
import { GameCard } from './GameCard'

interface SearchPageProps {
  games: GameSummary[]
  query: string
  onQueryChange: (query: string) => void
  onBack: () => void
  onSelect: (game: GameSummary, focusKey: string) => void
  onLaunch: (game: GameSummary) => void
}

const INPUT_KEY = 'search-input'
const BACK_KEY = 'search-back'
const resultKey = (gameId: string): string => `search-result-${gameId}`

/** First card in the result strip, used by ArrowDown and Enter. */
function firstResultKey(results: GameSummary[]): string | null {
  const first = results[0]
  return first ? resultKey(first.id) : null
}

export function SearchPage({
  games,
  query,
  onQueryChange,
  onBack,
  onSelect,
  onLaunch,
}: SearchPageProps) {
  const results = useMemo(() => filterGames(games, query), [games, query])
  const trimmed = query.trim()

  const { ref: backRef, focused: backFocused } = useFocusable<
    Record<string, never>,
    HTMLButtonElement
  >({
    focusKey: BACK_KEY,
    accessibilityLabel: 'Back to library',
    onEnterPress: onBack,
    onArrowPress: (direction) => {
      if (direction === 'down') focusInput()
      return false
    },
  })

  const { ref: inputRef, focused: inputFocused } = useFocusable<
    Record<string, never>,
    HTMLInputElement
  >({
    focusKey: INPUT_KEY,
    accessibilityLabel: 'Search your library',
    onEnterPress: () => confirmInput(),
    onArrowPress: (direction) => {
      // Arrows belong to the text caret while typing; only Down leaves.
      if (direction === 'down') {
        leaveInput()
        return false
      }
      return direction === 'left' || direction === 'right'
    },
  })

  const resumeNavigation = useCallback(() => {
    resume()
  }, [])

  // Spatial navigation must not steal text editing keys. Pause it while the
  // field has DOM focus, exactly like the Settings text fields.
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

  // A search page is for typing: put the caret in the field as soon as it
  // opens, but return focus to the keyboard graph when the page closes.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 60)
    return () => window.clearTimeout(timer)
  }, [inputRef])

  function focusInput(): void {
    resumeNavigation()
    if (doesFocusableExist(INPUT_KEY)) void setFocus(INPUT_KEY)
    inputRef.current?.focus()
  }

  function leaveInput(): void {
    const target = firstResultKey(results)
    // Release the paused navigation graph before moving focus: setFocus is a
    // no-op while the text field holds the keyboard.
    resumeNavigation()
    inputRef.current?.blur()
    if (target && doesFocusableExist(target)) void setFocus(target)
  }

  function confirmInput(): void {
    if (results.length === 1) {
      const only = results[0]
      if (only) onLaunch(only)
      return
    }
    leaveInput()
  }

  return (
    <section data-search-page="" className="flex min-h-0 flex-1 flex-col">
      <h1 className="sr-only">Search</h1>

      <div className="flex items-center gap-4 px-gutter pt-6">
        <button
          ref={backRef}
          type="button"
          tabIndex={-1}
          data-focus-key={BACK_KEY}
          aria-label="Back to library"
          onClick={onBack}
          className={cn(
            'inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-caption font-medium outline-none transition-colors',
            backFocused
              ? 'bg-white text-black'
              : 'bg-white/5 text-white/65 ring-1 ring-white/12 hover:bg-white/10 hover:text-white',
          )}
          style={
            backFocused
              ? { boxShadow: `0 0 0 2px ${uiAccent(0.7)}` }
              : undefined
          }
        >
          <ArrowLeftFilled className="size-4" />
          Library
        </button>

        <div
          className="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-2xl border bg-black/35 px-4 backdrop-blur-xl transition-colors"
          style={{
            borderColor: inputFocused ? uiAccent(0.7) : 'rgba(255,255,255,0.12)',
            boxShadow: inputFocused
              ? `0 0 0 1px ${uiAccent(0.5)}, 0 18px 50px -24px rgba(0,0,0,0.9)`
              : undefined,
          }}
        >
          <SearchFilled className="size-5 shrink-0 text-white/40" />
          <input
            ref={inputRef}
            id="library-search"
            type="text"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' || event.key === 'Tab') {
                event.preventDefault()
                leaveInput()
                return
              }
              if (event.key === 'Enter') {
                event.preventDefault()
                confirmInput()
              }
            }}
            placeholder="Search games by name, source, or subtitle"
            aria-label="Search your library"
            autoComplete="off"
            spellCheck={false}
            data-focus-key={INPUT_KEY}
            className="h-full min-w-0 flex-1 bg-transparent text-body text-white outline-none placeholder:text-white/30"
          />
          {query ? (
            <button
              type="button"
              tabIndex={-1}
              aria-label="Clear search"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onQueryChange('')}
              className="grid size-7 shrink-0 place-items-center rounded-full bg-white/8 text-white/60 hover:bg-white/15 hover:text-white"
            >
              <CloseFilled className="size-4" />
            </button>
          ) : null}
        </div>
      </div>

      <p
        aria-live="polite"
        className="mt-4 px-gutter text-caption font-medium tracking-[0.14em] text-white/40 uppercase"
      >
        {trimmed
          ? `${results.length} ${results.length === 1 ? 'match' : 'matches'} for “${trimmed}”`
          : `${games.length} games in library`}
      </p>

      {results.length > 0 ? (
        <div
          data-search-results=""
          className="no-scrollbar mt-2 flex min-h-0 flex-1 snap-x scroll-px-gutter items-start gap-4 overflow-x-auto overflow-y-hidden px-gutter pt-8 pb-20"
        >
          {results.map((game, index) => (
            <GameCard
              key={game.id}
              game={game}
              focusKey={resultKey(game.id)}
              onSelect={onSelect}
              onLaunch={onLaunch}
              onActivate={onLaunch}
              onArrowPress={(direction) => {
                if (direction === 'up') {
                  focusInput()
                  return false
                }
                if (direction === 'left' && index === 0) return false
                if (direction === 'right' && index === results.length - 1) return false
                return true
              }}
            />
          ))}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-start px-gutter pt-10">
          <p className="text-body text-white/70">
            No games match “{trimmed}”.
          </p>
          <p className="mt-2 text-caption text-white/40">
            Try a shorter name, a studio, or one of the{' '}
            {Array.from(new Set(games.map((game) => sourceLabel(game.source))))
              .slice(0, 3)
              .join(', ')}{' '}
            sources.
          </p>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex items-center gap-5 bg-gradient-to-t from-[#050508] via-[#050508]/80 to-transparent px-gutter pt-10 pb-5 text-caption text-white/50">
        <span>
          <span className="text-white/70">Type</span> to filter instantly
        </span>
        <span>
          <span className="text-white/70">↓</span> results
        </span>
        <span>
          <span className="text-white/70">Enter</span> open
        </span>
        <span>
          <span className="text-white/70">Esc</span> close
        </span>
      </div>
    </section>
  )
}
