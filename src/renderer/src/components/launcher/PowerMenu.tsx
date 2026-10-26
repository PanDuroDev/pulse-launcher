import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { EyeCloseFilled, PowerFilled } from '@mingcute/react/core-filled'
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation-react'
import {
  doesFocusableExist,
  getCurrentFocusKey,
  setFocus,
} from '@noriginmedia/norigin-spatial-navigation-core'
import { uiAccent } from '@/lib/accent'
import { cn } from 'cn'

interface PowerMenuProps {
  onClose: () => void
  onHide: () => void
  onQuit: () => void
}

interface PowerActionProps {
  focusKey: string
  label: string
  description: string
  icon: ReactNode
  onClick: () => void
  onArrowPress: (direction: string) => boolean
  autoFocus?: boolean
  tone?: 'default' | 'danger'
}

const QUIT_CONFIRM_MS = 3_000

function PowerAction({
  focusKey,
  label,
  description,
  icon,
  onClick,
  onArrowPress,
  autoFocus = false,
  tone = 'default',
}: PowerActionProps) {
  const { ref, focused, focusSelf } = useFocusable<Record<string, never>, HTMLButtonElement>({
    focusKey,
    accessibilityLabel: label,
    onEnterPress: onClick,
    onArrowPress,
    onFocus: () => ref.current?.scrollIntoView({ block: 'nearest' }),
  })

  useEffect(() => {
    if (autoFocus) focusSelf()
  }, [autoFocus, focusSelf])

  return (
    <button
      ref={ref}
      type="button"
      role="menuitem"
      tabIndex={-1}
      aria-label={label}
      data-focus-key={focusKey}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left outline-none transition-colors',
        tone === 'danger'
          ? focused
            ? 'bg-red-500/15'
            : 'hover:bg-red-500/10'
          : focused
            ? 'bg-white/10'
            : 'hover:bg-white/[0.06]',
      )}
      style={focused ? { boxShadow: `inset 0 0 0 1px ${uiAccent(0.55)}` } : undefined}
    >
      <span
        className={cn(
          'grid size-8 shrink-0 place-items-center rounded-lg',
          tone === 'danger'
            ? 'bg-red-500/12 text-red-300'
            : 'bg-white/8 text-white/70',
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            'block text-[0.78rem] font-medium',
            tone === 'danger' ? 'text-red-200' : 'text-white/85',
          )}
        >
          {label}
        </span>
        <span className="mt-0.5 block text-[0.62rem] leading-snug text-white/35">
          {description}
        </span>
      </span>
    </button>
  )
}

/**
 * Power is separate from Settings on purpose: Hide keeps Pulse running in the
 * tray, Quit ends it. Quit asks for a second press within a short window.
 */
export function PowerMenu({ onClose, onHide, onQuit }: PowerMenuProps) {
  const [quitArmed, setQuitArmed] = useState(false)

  useEffect(() => {
    if (!quitArmed) return
    const timer = window.setTimeout(() => setQuitArmed(false), QUIT_CONFIRM_MS)
    return () => window.clearTimeout(timer)
  }, [quitArmed])

  // Arrows stay inside the two options; geometry alone could otherwise send
  // focus into the library underneath the menu.
  const handleHide = (): void => {
    onClose()
    onHide()
  }

  // Tab is the keyboard shortcut for the same two options.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab') return
      event.preventDefault()
      const next = getCurrentFocusKey() === 'power-hide' ? 'power-quit' : 'power-hide'
      if (doesFocusableExist(next)) void setFocus(next)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])

  const hideNeighbours = (direction: string): boolean => {
    if (direction === 'down' || direction === 'right') {
      if (doesFocusableExist('power-quit')) void setFocus('power-quit')
    }
    return false
  }

  const quitNeighbours = (direction: string): boolean => {
    if (direction === 'up' || direction === 'left') {
      if (doesFocusableExist('power-hide')) void setFocus('power-hide')
    }
    return false
  }

  return (
    <div className="absolute inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/20"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="menu"
        aria-label="Power"
        className="absolute top-[4.6rem] right-[6vw] z-10 w-[17rem] rounded-2xl border border-white/10 bg-[#0b0b11]/97 p-1.5 shadow-[0_24px_70px_-20px_rgba(0,0,0,0.9)] backdrop-blur-2xl"
      >
        <div className="px-3 pt-2 pb-1.5">
          <p className="text-[0.58rem] font-semibold tracking-[0.2em] text-white/35 uppercase">
            Power
          </p>
        </div>
        <PowerAction
          focusKey="power-hide"
          label="Hide to tray"
          description="Keep Pulse running in the background."
          icon={<EyeCloseFilled className="size-4.5" />}
          onClick={handleHide}
          onArrowPress={hideNeighbours}
          autoFocus
        />
        <PowerAction
          focusKey="power-quit"
          label={quitArmed ? 'Press again to quit' : 'Quit Pulse'}
          description={
            quitArmed
              ? 'This closes Pulse now.'
              : 'Stop Pulse and game monitoring.'
          }
          icon={<PowerFilled className="size-4.5" />}
          tone="danger"
          onClick={() => {
            if (!quitArmed) {
              setQuitArmed(true)
              return
            }
            onQuit()
          }}
          onArrowPress={quitNeighbours}
        />
        <p className="px-3 py-2 text-[0.58rem] leading-relaxed text-white/25">
          Esc or Back closes this menu.
        </p>
      </div>
    </div>
  )
}
