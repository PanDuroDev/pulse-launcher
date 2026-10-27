import type { ReactNode } from 'react'
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation-react'
import { uiAccent } from '@/lib/accent'
import { cn } from 'cn'

interface ToolProps {
  focusKey: string
  label: string
  icon: ReactNode
  onClick: () => void
  active?: boolean
  disabled?: boolean
}

export function Tool({ focusKey, label, icon, onClick, active, disabled }: ToolProps) {
  const { ref, focused } = useFocusable<Record<string, never>, HTMLButtonElement>({
    focusKey,
    accessibilityLabel: label,
    // Spatial navigation fires this directly, so a disabled tool needs the same
    // guard the browser gives a disabled button.
    onEnterPress: () => {
      if (!disabled) onClick()
    },
  })

  return (
    <button
      ref={ref}
      type="button"
      tabIndex={-1}
      data-focus-key={focusKey}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[0.72rem] font-medium outline-none transition-colors',
        disabled && 'cursor-not-allowed opacity-35',
        focused && !disabled
          ? 'bg-white text-black'
          : active
            ? 'bg-white/12 text-white ring-1 ring-white/20'
            : 'bg-white/5 text-white/65 ring-1 ring-white/12 hover:bg-white/10 hover:text-white',
      )}
      style={focused && !disabled ? { boxShadow: `0 0 0 2px ${uiAccent(0.7)}` } : undefined}
    >
      {icon}
      {label}
    </button>
  )
}

interface ModeTabProps {
  focusKey: string
  label: string
  active: boolean
  onClick: () => void
}

export function ModeTab({ focusKey, label, active, onClick }: ModeTabProps) {
  const { ref, focused } = useFocusable<Record<string, never>, HTMLButtonElement>({
    focusKey,
    accessibilityLabel: `${label} music`,
    onEnterPress: onClick,
  })

  return (
    <button
      ref={ref}
      type="button"
      tabIndex={-1}
      data-focus-key={focusKey}
      aria-label={`${label} music`}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'h-8 rounded-full px-3.5 text-[0.72rem] font-medium outline-none transition-colors',
        focused
          ? 'bg-white text-black'
          : active
            ? 'bg-white/14 text-white ring-1 ring-white/20'
            : 'text-white/55 hover:text-white',
      )}
      style={focused ? { boxShadow: `0 0 0 2px ${uiAccent(0.7)}` } : undefined}
    >
      {label}
    </button>
  )
}

interface TransportProps {
  focusKey: string
  label: string
  onClick: () => void
  children: ReactNode
  primary?: boolean
  active?: boolean
}

export function Transport({ focusKey, label, onClick, children, primary, active }: TransportProps) {
  const { ref, focused } = useFocusable<Record<string, never>, HTMLButtonElement>({
    focusKey,
    accessibilityLabel: label,
    onEnterPress: onClick,
  })

  return (
    <button
      ref={ref}
      type="button"
      tabIndex={-1}
      data-focus-key={focusKey}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'grid place-items-center rounded-full outline-none transition-all duration-200',
        primary ? 'size-14' : 'size-11',
        focused
          ? 'scale-[1.04] bg-white text-black'
          : primary
            ? 'bg-white/12 text-white hover:bg-white/20'
            : 'bg-white/6 text-white/75 hover:bg-white/12 hover:text-white',
        active && !focused && 'text-white ring-1 ring-white/25',
      )}
      style={focused ? { boxShadow: `0 0 0 2px ${uiAccent(0.75)}` } : undefined}
    >
      {children}
    </button>
  )
}
