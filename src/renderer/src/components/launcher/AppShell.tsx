import type { ReactNode } from 'react'

interface AppShellProps {
  children: ReactNode
  /** When set, this screen replaces the destination instead of layering over it. */
  panel?: ReactNode
}

/**
 * Two destinations and the screens that replace them. A screen change keeps the
 * destination mounted but hidden, so closing a screen never loses library
 * scroll, selection or focus.
 */
export function AppShell({ children, panel }: AppShellProps) {
  const covered = Boolean(panel)
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className={`flex min-h-0 flex-1 flex-col ${covered ? 'invisible' : ''}`}>{children}</div>
      {panel}
    </div>
  )
}
