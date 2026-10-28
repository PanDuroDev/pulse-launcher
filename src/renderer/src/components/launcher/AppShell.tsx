import type { ReactNode } from 'react'

interface AppShellProps {
  children: ReactNode
  /** Rendered above the destination; the destination stays mounted underneath. */
  panel?: ReactNode
}

/**
 * Two destinations and a panel layer: the destination is never unmounted, so a
 * panel can open and close without losing scroll position, selection or focus.
 * While a panel is open the destination is inert, which also keeps spatial
 * navigation inside the panel.
 */
export function AppShell({ children, panel }: AppShellProps) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        className={`flex min-h-0 flex-1 flex-col transition-opacity duration-[--duration-focus] ${
          panel ? 'pointer-events-none opacity-40' : ''
        }`}
        inert={Boolean(panel)}
        aria-hidden={panel ? true : undefined}
      >
        {children}
      </div>
      {panel}
    </div>
  )
}
