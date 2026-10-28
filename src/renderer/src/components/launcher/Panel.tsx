import { useEffect, useRef, type ReactNode } from 'react'
import { CloseFilled } from '@mingcute/react/core-filled'

interface PanelProps {
  /** Accessible name; the visible header repeats it. */
  title: string
  /** Close target — Esc, the ✕ button and the controller's Back all route here. */
  onClose: () => void
  children: ReactNode
  /** Card-sized panels (details) stay narrower than work surfaces (settings). */
  width?: 'card' | 'wide'
}

/**
 * One layer above the destination. The destination stays mounted and visible
 * underneath, so closing a panel never loses library scroll or selection.
 */
export function Panel({ title, onClose, children, width = 'wide' }: PanelProps) {
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
    let scroller: HTMLElement | null = null
    for (const candidate of surface.querySelectorAll<HTMLElement>('*')) {
      const overflow = getComputedStyle(candidate).overflowY
      if (overflow === 'auto' || overflow === 'scroll') {
        scroller = candidate
        break
      }
    }
    if (!scroller) return
    const target = scroller
    const onWheel = (event: WheelEvent): void => {
      if (event.deltaY === 0 || target.contains(event.target as Node)) return
      target.scrollTop += event.deltaY
      event.preventDefault()
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [])

  return (
    <div className="absolute inset-0 z-20">
      {/* Dismiss target: a click on the dimmed library closes the panel. */}
      <button
        type="button"
        tabIndex={-1}
        aria-label={`Close ${title.toLowerCase()}`}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/45"
      />
      <div
        ref={surfaceRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-panel={title.toLowerCase()}
        className={`panel-in absolute inset-x-0 top-4 bottom-4 mx-auto flex min-h-0 flex-col overflow-hidden rounded-card border border-white/10 bg-[#08080d]/92 shadow-panel backdrop-blur-xl ${
          width === 'card' ? 'max-w-[45rem]' : 'max-w-[64rem]'
        }`}
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
        {children}
      </div>
    </div>
  )
}
