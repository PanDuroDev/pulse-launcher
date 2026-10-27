import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ArrowLeftFilled,
  BackFilled,
  CursorFilled,
  Delete2Filled,
  Document2Filled,
  EyeCloseFilled,
  EyeFilled,
  FolderOpenFilled,
  FullscreenFilled,
  GridFilled,
  Key2Filled,
  MonitorFilled,
  Refresh2Filled,
  SpeakerFilled,
} from '@mingcute/react/core-filled'
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation-react'
import {
  doesFocusableExist,
  getCurrentFocusKey,
  pause,
  resume,
  setFocus,
} from '@noriginmedia/norigin-spatial-navigation-core'
import { toast } from 'sonner'
import type { AppInfo, GameSummary, MotionPreference, WindowMode } from '@shared/types'
import { sourceLabel } from '@shared/format'
import { useLauncherStore } from '@/store/launcher'
import { uiAccent } from '@/lib/accent'
import { playUI } from '@/lib/ui-sfx'
import { cn } from 'cn'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'

interface SettingsPageProps {
  onBack: () => void
  onAddGame: () => void
}

const MOTION_OPTIONS: Array<{ value: MotionPreference; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'reduced', label: 'Reduced' },
  { value: 'full', label: 'Full' },
]

const WINDOW_MODE_OPTIONS: Array<{ value: WindowMode; label: string }> = [
  { value: 'windowed', label: 'Windowed' },
  { value: 'fullscreen', label: 'Fullscreen' },
  { value: 'kiosk', label: 'Kiosk' },
]

const FOCUS = {
  back: 'settings-back',
  refresh: 'settings-refresh',
  add: 'settings-add',
  shortcuts: 'settings-shortcuts',
  apiKey: 'settings-api-key',
  keyToggle: 'settings-key-toggle',
  keySave: 'settings-key-save',
  cursor: 'settings-cursor',
  returnAfterGame: 'settings-return',
  sounds: 'settings-sounds',
  logs: 'settings-logs',
  remove: (gameId: string) => `settings-remove-${gameId}`,
  motion: (value: MotionPreference) => `settings-motion-${value}`,
  windowMode: (value: WindowMode) => `settings-window-${value}`,
}

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

/**
 * One tile for every row icon, so a toggle row and a value row read as the
 * same kind of control instead of two different icon styles.
 */
function RowIcon({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden
      className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/6 text-white/55 ring-1 ring-white/8"
    >
      {children}
    </span>
  )
}

interface SettingsActionProps {
  focusKey: string
  label: string
  onPress: () => void
  onArrowPress: (direction: string) => boolean
  disabled?: boolean
  className?: string
  children: ReactNode
}

/** A focusable action with a focus ring that is independent of hover. */
function SettingsAction({
  focusKey,
  label,
  onPress,
  onArrowPress,
  disabled = false,
  className,
  children,
}: SettingsActionProps) {
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
        'inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.06] px-3 text-caption font-medium text-white/85 outline-none transition-colors hover:bg-white/12 hover:text-white',
        disabled && 'cursor-default opacity-50',
        className,
      )}
      style={focusRing(focused)}
    >
      {children}
    </button>
  )
}

interface SettingsToggleProps {
  focusKey: string
  label: string
  description: string
  checked: boolean
  icon?: ReactNode
  onChange: (checked: boolean) => void
  onArrowPress: (direction: string) => boolean
}

/**
 * The whole row is the hitbox. A 32px switch alone is too small for a gamepad
 * and for accessibility, and a row avoids nesting a button inside a button.
 */
function SettingsToggle({
  focusKey,
  label,
  description,
  checked,
  icon,
  onChange,
  onArrowPress,
}: SettingsToggleProps) {
  const { ref, focused } = useFocusable<Record<string, never>, HTMLDivElement>({
    focusKey,
    accessibilityLabel: `${label}. ${checked ? 'On' : 'Off'}`,
    onEnterPress: () => onChange(!checked),
    onArrowPress,
    onFocus: () => ref.current?.scrollIntoView({ block: 'nearest' }),
  })

  const toggle = (): void => {
    playUI(checked ? 'toggle-off' : 'toggle-on')
    onChange(!checked)
  }

  return (
    <div
      ref={ref}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      data-focus-key={focusKey}
      tabIndex={-1}
      onClick={toggle}
      className={cn(
        'flex cursor-pointer items-center justify-between gap-4 rounded-xl border px-4 py-3 outline-none transition-colors',
        focused
          ? 'border-white/20 bg-white/[0.08]'
          : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.05]',
      )}
      style={focusRing(focused)}
    >
      <span className="flex min-w-0 items-start gap-3">
        {icon ? (
          <span className="mt-0.5">
            <RowIcon>{icon}</RowIcon>
          </span>
        ) : null}
        <span className="min-w-0">
          <span className="block text-caption font-medium text-white/90">{label}</span>
          <span className="mt-1 block text-caption leading-relaxed text-white/50">
            {description}
          </span>
        </span>
      </span>
      <span
        aria-hidden
        className={cn(
          'relative flex h-[1.15rem] w-8 shrink-0 items-center rounded-full p-[2px] transition-colors',
          checked ? 'bg-[hsl(var(--pulse-accent))]' : 'bg-white/20 ring-1 ring-white/15',
        )}
      >
        <span
          className={cn(
            'block size-4 rounded-full transition-transform',
            checked
              ? 'translate-x-3 bg-[#08080d]'
              : 'translate-x-[1px] bg-white/85',
          )}
        />
      </span>
    </div>
  )
}

interface SettingsChoiceProps {
  focusKey: string
  label: string
  selected: boolean
  disabled?: boolean
  onPress: () => void
  onArrowPress: (direction: string) => boolean
}

function SettingsChoice({
  focusKey,
  label,
  selected,
  disabled = false,
  onPress,
  onArrowPress,
}: SettingsChoiceProps) {
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
      role="radio"
      aria-checked={selected}
      aria-label={label}
      data-focus-key={focusKey}
      tabIndex={-1}
      disabled={disabled}
      onClick={onPress}
      className={cn(
        'rounded-md px-2.5 py-1.5 text-caption font-medium outline-none transition-colors',
        selected ? 'bg-white text-black' : 'text-white/60 hover:text-white',
        disabled && 'cursor-default opacity-60',
      )}
      style={focused ? { boxShadow: `0 0 0 2px ${uiAccent(0.85)}` } : undefined}
    >
      {label}
    </button>
  )
}

function ManualGameRow({
  game,
  onRemove,
  onArrowPress,
}: {
  game: GameSummary
  onRemove: (gameId: string) => void
  onArrowPress: (direction: string) => boolean
}) {
  const focusKey = FOCUS.remove(game.id)
  const { ref, focused } = useFocusable<Record<string, never>, HTMLButtonElement>({
    focusKey,
    accessibilityLabel: `Remove ${game.name} from the library`,
    onEnterPress: () => onRemove(game.id),
    onArrowPress,
    onFocus: () => ref.current?.scrollIntoView({ block: 'nearest' }),
  })

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-caption font-medium text-white/85">{game.name}</p>
        <p className="text-caption tracking-[0.12em] text-white/50 uppercase">
          {sourceLabel(game.source)}
        </p>
      </div>
      <button
        ref={ref}
        type="button"
        tabIndex={-1}
        aria-label={`Remove ${game.name} from the library`}
        data-focus-key={focusKey}
        onClick={() => onRemove(game.id)}
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-lg outline-none transition-colors',
          focused
            ? 'bg-red-500/15 text-red-200'
            : 'text-white/45 hover:bg-red-500/10 hover:text-red-300',
        )}
        style={focused ? { boxShadow: `0 0 0 2px rgba(248,113,113,0.55)` } : undefined}
      >
        <Delete2Filled className="size-5" />
      </button>
    </div>
  )
}

function BackToLibrary({
  onBack,
  onArrowPress,
}: {
  onBack: () => void
  onArrowPress: (direction: string) => boolean
}) {
  const { ref, focused } = useFocusable<Record<string, never>, HTMLButtonElement>({
    focusKey: FOCUS.back,
    accessibilityLabel: 'Back to library',
    onEnterPress: onBack,
    onArrowPress,
    onFocus: () => ref.current?.scrollIntoView({ block: 'nearest' }),
  })

  return (
    <button
      ref={ref}
      type="button"
      tabIndex={-1}
      aria-label="Back to library"
      data-focus-key={FOCUS.back}
      onClick={onBack}
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-caption font-medium outline-none transition-colors',
        focused
          ? 'bg-white text-black'
          : 'bg-white/[0.05] text-white/70 ring-1 ring-white/15 hover:bg-white/10 hover:text-white',
      )}
      style={focused ? { boxShadow: `0 0 0 2px ${uiAccent(0.45)}` } : undefined}
    >
      <ArrowLeftFilled className="size-4" />
      Library
    </button>
  )
}

/**
 * Settings as a page inside Pulse instead of a dialog over the library.
 * Hide and Quit live in the header Power menu, not here.
 *
 * Focus is a closed graph: every arrow either moves inside the page or is
 * consumed, and Tab walks the same controls in visual order. Text fields are
 * the only place where keys are handed back to the DOM while editing.
 */
export function SettingsPage({ onBack, onAddGame }: SettingsPageProps) {
  const games = useLauncherStore((state) => state.games)
  const settings = useLauncherStore((state) => state.settings)
  const refreshing = useLauncherStore((state) => state.refreshing)
  const refreshLibrary = useLauncherStore((state) => state.refresh)
  const updateSettings = useLauncherStore((state) => state.updateSettings)
  const [apiKey, setApiKey] = useState(settings.steamGridDbApiKey)
  const [showApiKey, setShowApiKey] = useState(false)
  const [cursorSeconds, setCursorSeconds] = useState(
    String(Math.round(settings.hideCursorAfterMs / 1000)),
  )
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [savingKey, setSavingKey] = useState(false)
  const [changingWindowMode, setChangingWindowMode] = useState(false)
  const scrollerRef = useRef<HTMLDivElement>(null)

  const manualGames = useMemo(() => games.filter((game) => game.source === 'manual'), [games])
  const manualIds = manualGames.map((game) => game.id)
  const lastManualId = manualIds[manualIds.length - 1]
  const lastManualKey = lastManualId ? FOCUS.remove(lastManualId) : null

  // Tab order mirrors the visual order of the page.
  const tabOrder = useMemo(() => {
    const order: string[] = [FOCUS.back, FOCUS.refresh, FOCUS.add, FOCUS.shortcuts]
    for (const game of games) {
      if (game.source === 'manual') order.push(FOCUS.remove(game.id))
    }
    order.push(FOCUS.apiKey, FOCUS.keyToggle, FOCUS.keySave, FOCUS.cursor)
    for (const option of MOTION_OPTIONS) order.push(FOCUS.motion(option.value))
    for (const option of WINDOW_MODE_OPTIONS) order.push(FOCUS.windowMode(option.value))
    order.push(FOCUS.returnAfterGame, FOCUS.sounds, FOCUS.logs)
    return order
  }, [games])

  // Opening Settings always starts at the top, even if the previous page was
  // scrolled or focus restoration moved the viewport first.
  useLayoutEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollTop = 0
  }, [])

  useEffect(() => {
    let cancelled = false
    void window.launcher.app.info().then((result) => {
      if (!cancelled) setInfo(result)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Spatial navigation must not steal Enter or arrow keys while a text field
  // is being edited. Pause it for the duration of typing, then restore it.
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

  const cycleTab = useCallback(
    (backwards: boolean): void => {
      const active = document.activeElement
      if (
        active instanceof HTMLElement &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.isContentEditable)
      ) {
        active.blur()
      }
      resume()
      const current = getCurrentFocusKey()
      const index = current ? tabOrder.indexOf(current) : -1
      if (index === -1) {
        const target = backwards ? tabOrder[tabOrder.length - 1] : tabOrder[0]
        if (target) void setFocus(target)
        return
      }
      const step = backwards ? -1 : 1
      const nextIndex = (index + step + tabOrder.length) % tabOrder.length
      const next = tabOrder[nextIndex]
      if (next) void setFocus(next)
    },
    [tabOrder],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab') return
      event.preventDefault()
      cycleTab(event.shiftKey)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [cycleTab])

  // --- Arrow graph -------------------------------------------------------
  const backArrows = (direction: string): boolean =>
    direction === 'down' ? moveTo(FOCUS.refresh) : false

  const refreshArrows = (direction: string): boolean => {
    if (direction === 'right') return moveTo(FOCUS.add)
    if (direction === 'down') return moveTo(FOCUS.shortcuts)
    return false
  }

  const addArrows = (direction: string): boolean => {
    if (direction === 'left') return moveTo(FOCUS.refresh)
    if (direction === 'down') return moveTo(FOCUS.shortcuts)
    return false
  }

  const shortcutsArrows = (direction: string): boolean => {
    if (direction === 'up') return moveTo(FOCUS.refresh)
    if (direction === 'down') return moveTo(lastManualKey ?? FOCUS.apiKey)
    return false
  }

  const removeArrows = (gameId: string) => (direction: string): boolean => {
    const index = manualIds.indexOf(gameId)
    if (direction === 'up') {
      const previous = manualIds[index - 1]
      if (previous) return moveTo(FOCUS.remove(previous))
      return moveTo(FOCUS.shortcuts)
    }
    if (direction === 'down') {
      const next = manualIds[index + 1]
      if (next) return moveTo(FOCUS.remove(next))
      return moveTo(FOCUS.apiKey)
    }
    return false
  }

  const apiKeyArrows = (direction: string): boolean => {
    if (direction === 'up') return moveTo(lastManualKey ?? FOCUS.shortcuts)
    if (direction === 'right') return moveTo(FOCUS.keyToggle)
    if (direction === 'down') return moveTo(FOCUS.keyToggle)
    return false
  }

  const keyToggleArrows = (direction: string): boolean => {
    if (direction === 'left') return moveTo(FOCUS.apiKey)
    if (direction === 'right') return moveTo(FOCUS.keySave)
    if (direction === 'up') return moveTo(FOCUS.apiKey)
    if (direction === 'down') return moveTo(FOCUS.cursor)
    return false
  }

  const keySaveArrows = (direction: string): boolean => {
    if (direction === 'left') return moveTo(FOCUS.keyToggle)
    if (direction === 'right') return moveTo(FOCUS.apiKey)
    if (direction === 'up') return moveTo(FOCUS.apiKey)
    if (direction === 'down') return moveTo(FOCUS.cursor)
    return false
  }

  const cursorArrows = (direction: string): boolean => {
    if (direction === 'up') return moveTo(FOCUS.keySave)
    if (direction === 'down') return moveTo(FOCUS.motion(settings.motion))
    return false
  }

  const motionArrows = (index: number) => (direction: string): boolean => {
    const previous = MOTION_OPTIONS[index - 1]
    const next = MOTION_OPTIONS[index + 1]
    if (direction === 'left' && previous) {
      return moveTo(FOCUS.motion(previous.value))
    }
    if (direction === 'right' && next) {
      return moveTo(FOCUS.motion(next.value))
    }
    if (direction === 'up') return moveTo(FOCUS.cursor)
    if (direction === 'down') return moveTo(FOCUS.sounds)
    return false
  }

  const soundsArrows = (direction: string): boolean => {
    if (direction === 'up') return moveTo(FOCUS.motion(settings.motion))
    if (direction === 'down') return moveTo(FOCUS.windowMode(settings.windowMode))
    return false
  }

  const windowModeArrows = (index: number) => (direction: string): boolean => {
    const previous = WINDOW_MODE_OPTIONS[index - 1]
    const next = WINDOW_MODE_OPTIONS[index + 1]
    if (direction === 'left' && previous) {
      return moveTo(FOCUS.windowMode(previous.value))
    }
    if (direction === 'right' && next) {
      return moveTo(FOCUS.windowMode(next.value))
    }
    if (direction === 'up') return moveTo(FOCUS.sounds)
    if (direction === 'down') return moveTo(FOCUS.returnAfterGame)
    return false
  }

  const returnArrows = (direction: string): boolean => {
    if (direction === 'up') return moveTo(FOCUS.windowMode(settings.windowMode))
    if (direction === 'down') return moveTo(FOCUS.logs)
    return false
  }

  const logsArrows = (direction: string): boolean =>
    direction === 'up' ? moveTo(FOCUS.returnAfterGame) : false

  // --- Focusable text fields --------------------------------------------
  // Browsers scroll a field into view when focus() runs, so no scrollIntoView
  // is needed here. Arrow keys belong to the text while the field is edited;
  // the pause/resume effect above enforces that.
  const {
    ref: apiKeyRef,
    focused: apiKeyFocused,
  } = useFocusable<Record<string, never>, HTMLInputElement>({
    focusKey: FOCUS.apiKey,
    accessibilityLabel: 'SteamGridDB API key',
    onArrowPress: apiKeyArrows,
  })
  const {
    ref: cursorInputRef,
    focused: cursorFocused,
  } = useFocusable<Record<string, never>, HTMLInputElement>({
    focusKey: FOCUS.cursor,
    accessibilityLabel: 'Cursor hide delay in seconds',
    onArrowPress: cursorArrows,
  })

  const handleRefresh = async (): Promise<void> => {
    const result = await refreshLibrary()
    if (!result) {
      toast.error('Could not refresh the library.')
      return
    }
    toast.success(`Library refreshed · ${result.games.length} games`)
    for (const error of result.errors) {
      toast.error(`${sourceLabel(error.source)}: ${error.message}`)
    }
  }

  const handleToggleStartMenu = async (checked: boolean): Promise<void> => {
    try {
      await updateSettings({ showStartMenuApps: checked })
      toast.success(checked ? 'Scanning desktop shortcuts' : 'Desktop shortcuts hidden')
    } catch {
      toast.error('Could not update settings.')
    }
  }

  const handleSaveKey = async (): Promise<void> => {
    setSavingKey(true)
    try {
      await updateSettings({ steamGridDbApiKey: apiKey.trim() })
      toast.success('SteamGridDB key saved')
    } catch {
      toast.error('Could not save the API key.')
    } finally {
      setSavingKey(false)
    }
  }

  const handleCursorBlur = async (): Promise<void> => {
    const parsed = Number(cursorSeconds)
    const seconds = Number.isFinite(parsed) ? Math.min(60, Math.max(1, Math.round(parsed))) : 3
    setCursorSeconds(String(seconds))
    if (seconds * 1000 === settings.hideCursorAfterMs) return
    try {
      await updateSettings({ hideCursorAfterMs: seconds * 1000 })
    } catch {
      toast.error('Could not update the cursor timeout.')
    }
  }

  const handleMotion = async (motion: MotionPreference): Promise<void> => {
    if (motion === settings.motion) return
    try {
      await updateSettings({ motion })
    } catch {
      toast.error('Could not update motion settings.')
    }
  }

  const handleWindowMode = async (windowMode: WindowMode): Promise<void> => {
    if (windowMode === settings.windowMode || changingWindowMode) return
    setChangingWindowMode(true)
    try {
      await updateSettings({ windowMode })
    } catch {
      toast.error('Could not change the window mode.')
    } finally {
      setChangingWindowMode(false)
    }
  }

  const handleReturnAfterGame = async (checked: boolean): Promise<void> => {
    try {
      await updateSettings({ returnAfterGame: checked })
    } catch {
      toast.error('Could not update the return preference.')
    }
  }

  const handleUiSounds = async (checked: boolean): Promise<void> => {
    try {
      await updateSettings({ uiSounds: checked })
    } catch {
      toast.error('Could not update the sound preference.')
    }
  }

  const handleRemoveManual = async (gameId: string): Promise<void> => {
    const result = await window.launcher.settings.removeManual(gameId)
    if (result.ok) toast.success('Removed from your library')
    else toast.error(result.error ?? 'Could not remove the game.')
  }

  return (
    <main className="relative z-10 flex min-h-0 flex-1 flex-col">
      <div className="px-[6vw] pb-4">
        <div className="mx-auto flex w-full max-w-[48rem] items-center gap-4">
          <BackToLibrary onBack={onBack} onArrowPress={backArrows} />
          <div className="min-w-0">
            <h1 className="text-label font-semibold tracking-tight text-white/95">Settings</h1>
            <p className="mt-0.5 text-caption text-white/60">
              Library, artwork, and window preferences.
            </p>
          </div>
          <p className="ml-auto hidden text-right text-caption leading-relaxed text-white/55 md:block">
            Tab moves between controls
            <br />
            Esc leaves a field, then closes
          </p>
        </div>
      </div>

      <div ref={scrollerRef} className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-[6vw] pb-16">
        <div className="mx-auto grid w-full max-w-[48rem] gap-7 rounded-2xl border border-white/10 bg-[#08080d]/92 px-6 py-6 backdrop-blur-xl">
          <section className="grid gap-3">
            <SectionLabel>Library</SectionLabel>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <SettingsAction
                focusKey={FOCUS.refresh}
                label={refreshing ? 'Refreshing library' : 'Refresh library'}
                onPress={() => void handleRefresh()}
                onArrowPress={refreshArrows}
                disabled={refreshing}
                className="justify-start"
              >
                {refreshing ? <Spinner className="size-5" /> : <Refresh2Filled className="size-5" />}
                {refreshing ? 'Scanning…' : 'Refresh library'}
              </SettingsAction>
              <SettingsAction
                focusKey={FOCUS.add}
                label="Add local game"
                onPress={onAddGame}
                onArrowPress={addArrows}
                className="justify-start"
              >
                <FolderOpenFilled className="size-5" />
                Add local game
              </SettingsAction>
            </div>
            <SettingsToggle
              focusKey={FOCUS.shortcuts}
              label="Show desktop shortcuts"
              description="Adds Start Menu shortcuts to the library. Refreshing takes a moment."
              checked={settings.showStartMenuApps}
              icon={<GridFilled className="size-4" />}
              onChange={(checked) => void handleToggleStartMenu(checked)}
              onArrowPress={shortcutsArrows}
            />
            {manualGames.length > 0 ? (
              <div className="grid gap-2">
                <p className="text-caption text-white/50">Manually added</p>
                {manualGames.map((game) => (
                  <ManualGameRow
                    key={game.id}
                    game={game}
                    onRemove={(id) => void handleRemoveManual(id)}
                    onArrowPress={removeArrows(game.id)}
                  />
                ))}
              </div>
            ) : null}
          </section>

          <Separator className="bg-white/10" />

          <section className="grid gap-3">
            <SectionLabel>Artwork</SectionLabel>
            <div className="grid gap-2">
              <div className="flex items-center gap-2.5">
                <RowIcon>
                  <Key2Filled className="size-4" />
                </RowIcon>
                <label htmlFor="sgdb-key" className="text-caption text-white/90">
                  SteamGridDB API key
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <Input
                  ref={apiKeyRef}
                  id="sgdb-key"
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  aria-label="SteamGridDB API key"
                  data-focus-key={FOCUS.apiKey}
                  placeholder="Optional — for Epic and local game covers"
                  className="min-w-0 flex-1 border-white/15 bg-white/[0.06] text-white placeholder:text-white/35"
                  style={focusRing(apiKeyFocused)}
                  spellCheck={false}
                  autoComplete="off"
                  data-1p-ignore="true"
                  data-lpignore="true"
                />
                <SettingsAction
                  focusKey={FOCUS.keyToggle}
                  label={showApiKey ? 'Hide API key' : 'Show API key'}
                  onPress={() => setShowApiKey((value) => !value)}
                  onArrowPress={keyToggleArrows}
                  className="w-12 justify-center px-0"
                >
                  {showApiKey ? (
                    <EyeCloseFilled className="size-5" />
                  ) : (
                    <EyeFilled className="size-5" />
                  )}
                  <span className="sr-only">{showApiKey ? 'Hide' : 'Show'}</span>
                </SettingsAction>
                <SettingsAction
                  focusKey={FOCUS.keySave}
                  label="Save SteamGridDB API key"
                  onPress={() => void handleSaveKey()}
                  onArrowPress={keySaveArrows}
                  disabled={savingKey}
                  className="justify-center"
                >
                  {savingKey ? <Spinner className="size-5" /> : 'Save'}
                </SettingsAction>
              </div>
              <p className="text-caption leading-relaxed text-white/50">
                Used only when a game has no Steam artwork. Leave empty to use generated covers.
              </p>
            </div>
          </section>

          <Separator className="bg-white/10" />

          <section className="grid gap-4">
            <SectionLabel>Experience</SectionLabel>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <RowIcon>
                  <CursorFilled className="size-4" />
                </RowIcon>
                <div>
                  <p className="text-caption text-white/90">Hide cursor after</p>
                  <p className="text-caption text-white/50">Seconds of inactivity</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  ref={cursorInputRef}
                  value={cursorSeconds}
                  onChange={(event) => setCursorSeconds(event.target.value)}
                  onBlur={() => void handleCursorBlur()}
                  inputMode="numeric"
                  className="w-16 border-white/15 bg-white/[0.06] text-center text-white"
                  style={focusRing(cursorFocused)}
                  data-focus-key={FOCUS.cursor}
                  aria-label="Cursor hide delay in seconds"
                />
                <span className="text-caption text-white/50">sec</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <RowIcon>
                  <MonitorFilled className="size-4" />
                </RowIcon>
                <div>
                  <p className="text-caption text-white/90">Motion</p>
                  <p className="text-caption text-white/50">Animations and parallax</p>
                </div>
              </div>
              <div
                role="radiogroup"
                aria-label="Motion"
                className="flex gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-1"
              >
                {MOTION_OPTIONS.map((option, index) => (
                  <SettingsChoice
                    key={option.value}
                    focusKey={FOCUS.motion(option.value)}
                    label={option.label}
                    selected={settings.motion === option.value}
                    onPress={() => void handleMotion(option.value)}
                    onArrowPress={motionArrows(index)}
                  />
                ))}
              </div>
            </div>

            <SettingsToggle
              focusKey={FOCUS.sounds}
              label="Interface sounds"
              description="Quiet zen cues for hover, press, selection, and page changes. Nothing plays while you type."
              checked={settings.uiSounds}
              icon={<SpeakerFilled className="size-4" />}
              onChange={(checked) => void handleUiSounds(checked)}
              onArrowPress={soundsArrows}
            />
          </section>

          <Separator className="bg-white/10" />

          <section className="grid gap-4">
            <SectionLabel>Window</SectionLabel>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <RowIcon>
                  <FullscreenFilled className="size-4" />
                </RowIcon>
                <div>
                  <p className="text-caption text-white/90">Window mode</p>
                  <p className="text-caption text-white/50">Saved and used at startup</p>
                </div>
              </div>
              <div
                role="radiogroup"
                aria-label="Window mode"
                className="flex flex-wrap gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-1"
              >
                {WINDOW_MODE_OPTIONS.map((option, index) => (
                  <SettingsChoice
                    key={option.value}
                    focusKey={FOCUS.windowMode(option.value)}
                    label={option.label}
                    selected={settings.windowMode === option.value}
                    disabled={changingWindowMode}
                    onPress={() => void handleWindowMode(option.value)}
                    onArrowPress={windowModeArrows(index)}
                  />
                ))}
              </div>
            </div>
            {settings.windowMode === 'kiosk' ? (
              <p className="rounded-lg border border-amber-300/20 bg-amber-300/[0.08] px-3 py-2 text-caption leading-relaxed text-amber-100/85">
                Kiosk stays above other windows and hides from the taskbar. Press
                <span className="font-medium text-amber-100"> Ctrl+Alt+L </span>
                to restore it, and quit from the Power menu or the tray icon.
              </p>
            ) : (
              <p className="text-caption leading-relaxed text-white/50">
                Escape and the close button only hide the launcher. Use the Power menu or the
                tray icon to exit. Switching to Windowed reloads the window.
              </p>
            )}

            <SettingsToggle
              focusKey={FOCUS.returnAfterGame}
              label="Return after game"
              description="Show Pulse again when the game it launched exits. The launcher stays hidden until the game has been detected running."
              checked={settings.returnAfterGame}
              icon={<BackFilled className="size-4" />}
              onChange={(checked) => void handleReturnAfterGame(checked)}
              onArrowPress={returnArrows}
            />
          </section>

          <Separator className="bg-white/10" />

          <section className="grid gap-3">
            <SectionLabel>About</SectionLabel>
            <div className="grid gap-1.5 text-caption text-white/55">
              <p>
                Pulse Launcher {info?.version ?? '…'}
                {info?.demo ? ' · Demo mode' : ''}
              </p>
              {info ? (
                <p>
                  Electron {info.electron} · Chromium {info.chrome} · {info.platform}
                </p>
              ) : null}
              {info ? (
                <p>
                  Restore shortcut {info.restoreShortcut.accelerator}:{' '}
                  {info.restoreShortcut.registered ? 'active' : 'unavailable — use the tray icon'}
                </p>
              ) : null}
              {info?.demo ? (
                <p className="text-amber-200/80">
                  Demo data is loaded from the bundled sample library. Launching is simulated.
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <SettingsAction
                focusKey={FOCUS.logs}
                label="Open logs"
                onPress={() => void window.launcher.app.openLogs()}
                onArrowPress={logsArrows}
                className="justify-center"
              >
                <Document2Filled className="size-5" />
                Open logs
              </SettingsAction>
              <p className="text-caption text-white/50">Hide and quit are in the Power menu.</p>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
