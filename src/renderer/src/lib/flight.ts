/** A square, in viewport pixels, that both ends of the hand-off agree on. */
export interface FlightRect {
  left: number
  top: number
  size: number
}

export interface Flight {
  from: FlightRect
  to: FlightRect
}

/**
 * The header slot the splash ball lands in. It exists — empty, and with the
 * mark's size — while the overlay is up, so the crossing can be measured before
 * it starts, and it is what the mark settles into afterwards.
 */
export const MARK_SLOT = '[data-mark-slot]'

function square(element: Element | null): FlightRect | null {
  if (!(element instanceof HTMLElement)) return null
  const box = element.getBoundingClientRect()
  if (box.width < 1 || box.height < 1) return null
  return { left: box.left, top: box.top, size: box.width }
}

/**
 * Where the splash ball sits and where the header mark waits.
 *
 * Both nodes are already in the document when this runs — the overlay owns the
 * ball, the header is mounted underneath it — so the two rects describe the same
 * instant, with no animation frame in between. Both boxes are squares, which is
 * what keeps the ball a circle for the whole crossing.
 */
export function measureFlight(splash: Element | null, mark: Element | null): Flight | null {
  const from = square(splash)
  const to = square(mark)
  if (!from || !to) return null
  return { from, to }
}
