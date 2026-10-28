import { useEffect, useRef, type ReactNode } from 'react'
import { CloseFilled } from '@mingcute/react/core-filled'

interface PanelProps {
  /** Accessible name; the visible header repeats it. */
  title: string
  /** Close target — Esc, the ✕ button and the controller's Back all route here. */
  onClose: () => void
  children: ReactNode
  /** One line under the title, so a panel explains itself where a page header used to. */
  description?: string
}

/**
 * One layer above the destination. The destination stays mounted and visible
 * underneath, so closing a panel never loses library scroll or selection.
 */
export function Panel({ title, onClose, children, description }: PanelProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null)

  // Close on Escape only when no field owns the key: inside a field the first
  // Escape leaves the field, and the screen keeps that rule.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      const active = document.activeElement
      if (
        active instanceof HTMLElement &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.isContentEditable)
      ) {
        return
      }
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])

  // Page-down and page-up would otherwise scroll the library behind the panel.
  useEffect(() => {
    const surface = surfaceRef.current
    if (!surface) return
    // The panel surface itself is the scroller now; nested scrollers still win.
    const owns = (node: EventTarget | null): boolean =>
      node instanceof Node && surface.contains(node)
    const onWheel = (event: WheelEvent): void => {
      if (event.deltaY === 0 || owns(event.target)) return
      surface.scrollTop += event.deltaY
      event.preventDefault()
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [])

  return (
    <div
      ref={surfaceRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-panel={title.toLowerCase()}
      // A panel is a full screen, header included; the screen below it stays
      // mounted but is hidden and inert.
      className="panel-in absolute inset-0 z-20 flex min-h-0 flex-col overflow-y-auto bg-[#08080d]"
    >
        {/* The only close affordance: no screen keeps its own back button. */}
        <button
          type="button"
          data-focus-key="panel-close"
          aria-label={`Close ${title.toLowerCase()}`}
          onClick={onClose}
          className="absolute top-4 right-4 z-10 inline-flex size-9 items-center justify-center rounded-full bg-white/[0.06] text-text-secondary outline-none transition-colors hover:bg-white/12 hover:text-text-primary"
        >
          <CloseFilled className="size-4" />
        </button>
        <div className="shrink-0 px-gutter pt-6 pr-16 pb-4">
          <h1 className="text-title font-semibold tracking-tight text-text-primary">{title}</h1>
          {description ? (
            <p className="mt-0.5 text-caption text-text-secondary">{description}</p>
          ) : null}
        </div>
        {children}
    </div>
  )
}
