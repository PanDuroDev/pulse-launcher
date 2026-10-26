import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { brandLook, TURN_TIME, type ExpressionId, type StateId } from '@/components/bloub'
import { BloubBot } from '@/components/bloub'
import { REACTION_BY_KIND, subscribeAttention, type Reaction } from '@/lib/attention'
import type { MarkMood } from '@/lib/mark-mood'
import { playUI } from '@/lib/ui-sfx'

interface BrandMarkProps {
  /** The in-app Motion setting; the system preference is honoured as well. */
  reducedMotion: boolean
  /**
   * False while the splash ball is still crossing into this slot. The box keeps
   * its size and position so the flight can be measured against it; only the
   * paint is held back, otherwise two balls would be on screen at once.
   */
  visible?: boolean
  /** What the launcher itself is doing: idle, scanning, playing, failed. */
  mood: MarkMood
}

/**
 * Side of the mark's square, in pixels. The engine's viewBox keeps room for the
 * orbit rings, so the ball itself is about 63% of this — 64 leaves a ball of 40,
 * which reads at a glance without making the header heavy.
 */
const MARK_SIZE = 64

/** How long the mark keeps a click reaction before its mood returns. */
const CLICK_HOLD_MS = 900

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** The engine's ease-out quint, written out so the script needs no DOM. */
function easeOutQuint(t: number): number {
  return 1 - (1 - t) ** 5
}

/**
 * Pulse's mark: the Bloub ball, kept circular, with eyes that follow the
 * pointer and a short reaction on hover and click. The engine is the same one
 * the upstream React package renders; only the wrapper is ours.
 *
 * The gaze is a script rather than the engine's own `follow`: that pose looks
 * LEFT, because in Bloub's app the settings panel sits on the right. The mark
 * has no panel, so it keeps the catalogue pose — eyes up and to the right —
 * and the pointer moves them around that target. See `brandLook`.
 *
 * The mark is also the launcher's face. `mood` comes from the library (empty,
 * scanning, a favorite selected, a game running, a failed catalog) and the
 * attention bus adds short reactions when a cover or a control is pointed at,
 * focused, or used. A reaction always wins over the mood, then expires.
 */
export function BrandMark({ reducedMotion, visible = true, mood }: BrandMarkProps) {
  const systemReduced = useReducedMotion()
  const still = reducedMotion || systemReduced
  const [reaction, setReaction] = useState<Reaction | null>(null)
  const [ripple, setRipple] = useState(0)
  const reactionTimer = useRef<number | null>(null)
  const markRef = useRef<HTMLDivElement | null>(null)
  const pointerRef = useRef<{ x: number; y: number } | null>(null)

  // Stable identity on purpose: the bot restarts an arrival script whenever the
  // function changes, which would send the eyes on a full tour every render.
  const gaze = useMemo(
    () =>
      (t: number) => {
        const pointer = pointerRef.current
        const box = markRef.current?.getBoundingClientRect()
        const aimed = pointer !== null && box !== undefined && box.width > 0
        const halfW = Math.max(1, window.innerWidth / 2)
        const halfH = Math.max(1, window.innerHeight / 2)
        const nx = aimed
          ? clamp((pointer.x - (box.left + box.width / 2)) / halfW, -1, 1)
          : 0
        const ny = aimed
          ? clamp((pointer.y - (box.top + box.height / 2)) / halfH, -1, 1)
          : 0
        return brandLook({
          nx,
          ny,
          tour: easeOutQuint(clamp(t / TURN_TIME, 0, 1)),
          pointer: aimed,
        })
      },
    [],
  )

  const clearReaction = (): void => {
    if (reactionTimer.current !== null) {
      window.clearTimeout(reactionTimer.current)
      reactionTimer.current = null
    }
    setReaction(null)
  }

  /** Show `next` for its own hold, then fall back to the launcher's mood. */
  const react = (next: Reaction, hold = next.hold): void => {
    if (still) return
    if (reactionTimer.current !== null) window.clearTimeout(reactionTimer.current)
    setReaction(next)
    reactionTimer.current = window.setTimeout(() => {
      reactionTimer.current = null
      setReaction(null)
    }, hold)
  }

  useEffect(() => {
    return () => {
      if (reactionTimer.current !== null) window.clearTimeout(reactionTimer.current)
    }
  }, [])

  // Cards, rows, the hero and the header tools announce what they are doing;
  // the mark is the one place that answers, so no component needs to know it
  // exists.
  useEffect(() => {
    if (still) return
    return subscribeAttention((kind) => {
      react(REACTION_BY_KIND[kind])
    })
    // `react` closes over `still` only; the bus identity is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [still])

  useEffect(() => {
    if (still) return
    const onPointerMove = (event: PointerEvent): void => {
      // Touch has no resting cursor: a lifted finger would freeze the gaze.
      if (event.pointerType === 'touch') return
      pointerRef.current = { x: event.clientX, y: event.clientY }
    }
    const onPointerLeave = (): void => {
      pointerRef.current = null
    }
    window.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerleave', onPointerLeave)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerleave', onPointerLeave)
      pointerRef.current = null
    }
  }, [still])

  const state: StateId = reaction?.state ?? mood.state
  const expression: ExpressionId = reaction?.expression ?? mood.expression

  return (
    <div
      ref={markRef}
      role="img"
      aria-label="Pulse"
      data-sfx="off"
      data-mark-slot=""
      data-mark-state={state}
      title="Pulse"
      className={`group relative grid size-16 shrink-0 cursor-default place-items-center ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      onPointerEnter={(event) => {
        if (event.pointerType === 'touch') return
        react({ state: 'wink', expression: 'curieux', hold: 1200 }, 1200)
      }}
      onPointerLeave={() => {
        clearReaction()
      }}
      onPointerDown={() => {
        react({ state: 'wide', expression: 'surpris', hold: CLICK_HOLD_MS })
        setRipple((current) => current + 1)
        playUI('select')
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-0.5 scale-95 rounded-full ring-1 ring-[hsl(var(--pulse-accent))]/0 transition-all duration-300 group-hover:scale-105 group-hover:ring-[hsl(var(--pulse-accent))]/30"
      />
      <BloubBot
        size={MARK_SIZE}
        shape="cercle"
        color="brume"
        expression={expression}
        paper="#0a0a10"
        state={state}
        gaze={still ? null : gaze}
        frozenAt={still ? 0.85 : undefined}
        ariaLabel="Pulse"
        className="relative transition-transform duration-300 ease-out group-hover:scale-[1.05] group-active:scale-95"
      />
      {ripple > 0 ? (
        <motion.span
          key={ripple}
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full border border-[hsl(var(--pulse-accent))]/60"
          initial={{ opacity: 0.45, scale: 0.55 }}
          animate={{ opacity: 0, scale: 1.9 }}
          transition={{ duration: still ? 0 : 0.55, ease: 'easeOut' }}
        />
      ) : null}
    </div>
  )
}
