import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { BloubBot } from '@/components/bloub'
import {
  BOOT_CYCLES,
  BOOT_ERROR_HOLD_MS,
  BOOT_EXIT_MS,
  BOOT_INTRO_MS,
  BOOT_READY_HOLD_MS,
  BOOT_STILL_AT,
  BOOT_STILL_STATE,
  type BootPhase,
} from '@/lib/boot'
import { MARK_SLOT, measureFlight, type Flight } from '@/lib/flight'
import { playUI } from '@/lib/ui-sfx'

interface BootScreenProps {
  phase: BootPhase
  gameCount: number
  error: string | null
  /** The in-app Motion setting; the system preference is honoured as well. */
  reducedMotion: boolean
  /** Fired once the ball has landed and the header may take over. */
  onDone: () => void
}

/**
 * The last frame of `comet`, and the one the hand-off carries: the dot has grown
 * back into a whole ball, eyes open, ribbons gone. At the mark's size that is
 * the same picture the header draws, so the swap is invisible.
 */
const HANDOFF_AT = 2.4

/**
 * The three layers behind the ball.
 *
 * The splash is the first thing anyone sees, so a flat fill was too cheap. The
 * room is built in depth rather than in decoration: a cool base that is darker
 * at the edges than under the ball, two very slow counter-rotating sheens that
 * read as aurora light, a horizon glow that gives the ball something to sit on,
 * a two-scale dot grid for parallax, and a hairline lens that frames the ball
 * without touching it. Every moving layer runs on a period of at least forty
 * seconds, so the room feels lit rather than animated. All of it fades as one
 * piece when the ball leaves.
 */
function BootBackdrop({ leaving, still }: { leaving: boolean; still: boolean }) {
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      initial={false}
      animate={{ opacity: leaving ? 0 : 1 }}
      transition={{ duration: still ? 0 : 0.45, ease: 'easeOut' }}
    >
      {/* Base: cool navy in the middle, near-black at the edges. */}
      <div className="absolute inset-0 bg-[radial-gradient(125%_95%_at_50%_42%,#0d1120_0%,#080a13_44%,#030307_100%)]" />

      {/* Aurora, first pass: the accent, low and slow. */}
      <motion.div
        className="absolute top-1/2 left-1/2 h-[160vmax] w-[160vmax] -translate-x-1/2 -translate-y-1/2 opacity-[0.20]"
        style={{
          background:
            'conic-gradient(from 0deg, transparent 0deg, hsl(var(--pulse-accent) / 0.5) 26deg, transparent 92deg, transparent 200deg, hsl(var(--pulse-accent) / 0.32) 244deg, transparent 312deg)',
          maskImage: 'radial-gradient(circle, #000 0%, transparent 58%)',
          WebkitMaskImage: 'radial-gradient(circle, #000 0%, transparent 58%)',
        }}
        animate={still ? undefined : { rotate: 360 }}
        transition={{ duration: 64, repeat: Infinity, ease: 'linear' }}
      />

      {/* Aurora, second pass: cooler, the other way, so the two never lock. */}
      <motion.div
        className="absolute top-1/2 left-1/2 h-[130vmax] w-[130vmax] -translate-x-1/2 -translate-y-1/2 opacity-[0.14]"
        style={{
          background:
            'conic-gradient(from 180deg, transparent 0deg, rgba(150,205,255,0.55) 34deg, transparent 104deg, transparent 232deg, rgba(120,170,255,0.35) 274deg, transparent 330deg)',
          maskImage: 'radial-gradient(circle, #000 0%, transparent 54%)',
          WebkitMaskImage: 'radial-gradient(circle, #000 0%, transparent 54%)',
        }}
        animate={still ? undefined : { rotate: -360 }}
        transition={{ duration: 92, repeat: Infinity, ease: 'linear' }}
      />

      {/* Parallax dots: a fine grid over a coarse one, both fading at the edges. */}
      <div
        className="absolute inset-0 opacity-[0.42]"
        style={{
          backgroundImage:
            'radial-gradient(circle, rgba(255,255,255,0.14) 1px, transparent 1px)',
          backgroundSize: '38px 38px',
          maskImage:
            'radial-gradient(circle at 50% 46%, transparent 20%, #000 60%, transparent 94%)',
          WebkitMaskImage:
            'radial-gradient(circle at 50% 46%, transparent 20%, #000 60%, transparent 94%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.22]"
        style={{
          backgroundImage:
            'radial-gradient(circle, rgba(255,255,255,0.10) 1px, transparent 1px)',
          backgroundSize: '114px 114px',
          maskImage:
            'radial-gradient(circle at 50% 46%, transparent 10%, #000 55%, transparent 88%)',
          WebkitMaskImage:
            'radial-gradient(circle at 50% 46%, transparent 10%, #000 55%, transparent 88%)',
        }}
      />

      {/* Horizon: a wide, soft pool of light the ball appears to float above. */}
      <div className="absolute top-1/2 left-1/2 h-[26vmin] w-[86vmin] -translate-x-1/2 translate-y-[16vmin] rounded-[50%] bg-[hsl(var(--pulse-accent))] opacity-[0.07] blur-[52px]" />

      {/* Bloom under the ball: the only warm element in the room. */}
      <motion.div
        className="absolute top-1/2 left-1/2 h-[96vmin] w-[96vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,hsl(var(--pulse-accent))_0%,hsl(var(--pulse-accent)/0.22)_36%,transparent_70%)]"
        animate={
          still ? { opacity: 0.2 } : { opacity: [0.15, 0.27, 0.15], scale: [1, 1.04, 1] }
        }
        transition={{ duration: 6.5, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Lens: two hairlines, each fading top and bottom so it is not a hoop. */}
      <div
        className="absolute top-1/2 left-1/2 h-[62vmin] w-[62vmin] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.06]"
        style={{
          maskImage: 'linear-gradient(180deg, transparent, #000 26%, #000 74%, transparent)',
          WebkitMaskImage:
            'linear-gradient(180deg, transparent, #000 26%, #000 74%, transparent)',
        }}
      />
      <div
        className="absolute top-1/2 left-1/2 h-[82vmin] w-[82vmin] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.04]"
        style={{
          maskImage: 'linear-gradient(180deg, transparent, #000 30%, #000 70%, transparent)',
          WebkitMaskImage:
            'linear-gradient(180deg, transparent, #000 30%, #000 70%, transparent)',
        }}
      />

      {/* Film grain. Inline SVG keeps the build free of image assets. */}
      <div
        className="absolute inset-0 opacity-[0.035] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23g)'/%3E%3C/svg%3E\")",
          backgroundSize: '140px 140px',
        }}
      />

      {/* Vignette, so the corners do not compete with the ball. */}
      <div className="absolute inset-0 bg-[radial-gradient(118%_100%_at_50%_50%,transparent_38%,rgba(0,0,0,0.62)_100%)]" />
    </motion.div>
  )
}

/** The dashes the rail is cut into. One mask, so every segment moves as one. */
const RAIL_MASK = 'repeating-linear-gradient(90deg, #000 0 3px, transparent 3px 7px)'

/**
 * The signal rail.
 *
 * A continuous 3 px bar with a sliding block reads like a browser download, so
 * this one is cut into dashes: the same rhythm as the dot grid behind it. During
 * `scan` a soft beam travels through the dashes and lights them as it passes;
 * on `ready` the whole rail fills and stays lit, with the head resting at the
 * end; on `error` it fills in a dull grey and the head goes out. The dashes are
 * one masked layer rather than twenty-four nodes, so the animation costs
 * nothing.
 */
function BootProgress({
  phase,
  still,
  leaving,
}: {
  phase: BootPhase
  still: boolean
  leaving: boolean
}) {
  const tone =
    phase === 'error' ? 'hsl(0 0% 100% / 0.32)' : 'hsl(var(--pulse-accent) / 0.92)'
  const mask = {
    maskImage: RAIL_MASK,
    WebkitMaskImage: RAIL_MASK,
  }

  return (
    <div className="relative h-[4px] w-[min(46vmin,19rem)]">
      {/* The unlit rail: dashes at rest, so the lit ones have something to replace. */}
      <div
        className="absolute inset-0 opacity-40"
        style={{ background: 'rgba(255,255,255,0.22)', ...mask }}
      />

      <AnimatePresence initial={false} mode="wait">
        {phase === 'scan' ? (
          <motion.div
            key="scan"
            className="absolute inset-y-0 left-0 w-[42%]"
            style={{
              background: `linear-gradient(90deg, transparent, ${tone} 55%, transparent)`,
              ...mask,
            }}
            initial={still ? { x: '0%', opacity: 1 } : { x: '-46%', opacity: 0 }}
            animate={
              still
                ? { x: '0%', opacity: 1 }
                : { x: ['-46%', '248%'], opacity: [0, 1, 1, 0] }
            }
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            transition={
              still
                ? { duration: 0 }
                : {
                    x: { duration: 2.1, repeat: Infinity, ease: [0.45, 0, 0.55, 1] },
                    opacity: { duration: 2.1, repeat: Infinity, times: [0, 0.14, 0.8, 1] },
                  }
            }
          />
        ) : (
          <motion.div
            key={phase}
            className="absolute inset-y-0 left-0"
            style={{ background: tone, ...mask }}
            initial={still ? { width: '100%' } : { width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ duration: still ? 0 : 0.9, ease: [0.22, 1, 0.36, 1] }}
          />
        )}
      </AnimatePresence>

      {/* The head: one glowing pixel that leads the beam, gone once we leave. */}
      {!leaving ? (
        <motion.span
          aria-hidden
          className="absolute top-1/2 size-[6px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: tone, boxShadow: `0 0 14px 3px ${tone}` }}
          animate={
            still
              ? { left: phase === 'scan' ? '22%' : '100%', opacity: 0.9 }
              : phase === 'scan'
                ? { left: ['2%', '98%'], opacity: [0, 1, 1, 0] }
                : { left: '100%', opacity: [1, 1, 0] }
          }
          transition={
            still
              ? { duration: 0 }
              : phase === 'scan'
                ? {
                    left: { duration: 2.1, repeat: Infinity, ease: [0.45, 0, 0.55, 1] },
                    opacity: { duration: 2.1, repeat: Infinity, times: [0, 0.1, 0.85, 1] },
                  }
                : { duration: 0.9, ease: [0.22, 1, 0.36, 1], times: [0, 0.92, 1] }
          }
        />
      ) : null}
    </div>
  )
}

/**
 * First paint of the launcher.
 *
 * The Bloub takes about half the screen and works through a montage rather than
 * a single loop: `scan` for the store boot, `comet` for the hand-off, and the
 * alert pair if the catalog could not be read.
 *
 * The overlay does not simply fade out. `comet` is played to its end, so the dot
 * is a ball again, and then that ball — the one the user has been watching —
 * shrinks into the header and becomes the mark. The library is revealed behind
 * it. The mark is mounted (hidden) underneath, so its landing site can be
 * measured before the crossing starts.
 */
export function BootScreen({
  phase,
  gameCount,
  error,
  reducedMotion,
  onDone,
}: BootScreenProps) {
  const systemReduced = useReducedMotion()
  const still = Boolean(reducedMotion || systemReduced)
  const [mountedAt] = useState(() => performance.now())
  const [displayPhase, setDisplayPhase] = useState<BootPhase>('scan')
  const [leaving, setLeaving] = useState(false)
  const [flight, setFlight] = useState<Flight | null>(null)
  const announced = useRef<BootPhase | null>(null)
  const ballRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    playUI('start')
  }, [])

  // The real phase is promoted once the intro has had time to read. A library
  // that answers in 80 ms still deserves more than one frame of `swirl`.
  useEffect(() => {
    if (phase === 'scan') return
    const wait = Math.max(0, BOOT_INTRO_MS - (performance.now() - mountedAt))
    const timer = window.setTimeout(() => setDisplayPhase(phase), wait)
    return () => window.clearTimeout(timer)
  }, [mountedAt, phase])

  // Hand-off: play the montage out, then leave. The error phase holds longer
  // than a beat because it has text to read.
  useEffect(() => {
    if (displayPhase === 'scan' || leaving) return
    if (announced.current !== displayPhase) {
      announced.current = displayPhase
      playUI(displayPhase === 'ready' ? 'success' : 'error')
    }
    const now = performance.now()
    const target =
      displayPhase === 'ready' ? now + BOOT_READY_HOLD_MS : now + BOOT_ERROR_HOLD_MS
    const timer = window.setTimeout(() => setLeaving(true), Math.max(0, target - now))
    return () => window.clearTimeout(timer)
  }, [displayPhase, leaving])

  // Measure the crossing on the frame it starts: the ball's own square is still
  // where the user last saw it, and the header has already been laid out.
  useLayoutEffect(() => {
    if (!leaving || still) return
    setFlight(measureFlight(ballRef.current, document.querySelector(MARK_SLOT)))
  }, [leaving, still])

  // The mark owns the ball from the other side once the crossing is over.
  useEffect(() => {
    if (!leaving) return
    const timer = window.setTimeout(onDone, still ? 0 : BOOT_EXIT_MS)
    return () => window.clearTimeout(timer)
  }, [leaving, onDone, still])

  const label =
    displayPhase === 'error'
      ? 'Library unavailable'
      : displayPhase === 'ready'
        ? gameCount === 1
          ? '1 game ready'
          : gameCount > 1
            ? `${gameCount} games ready`
            : 'Ready'
        : 'Waking up your library'

  const tag =
    displayPhase === 'error' ? 'ERROR' : displayPhase === 'ready' ? 'READY' : 'SCANNING'

  return (
    <motion.div
      role="status"
      aria-live="polite"
      aria-busy={displayPhase === 'scan'}
      aria-label={label}
      initial={false}
      className="fixed inset-0 z-[120] overflow-hidden"
    >
      <BootBackdrop leaving={leaving} still={still} />

      {/* The text block leaves early; the ball stays for the crossing. */}
      <motion.div
        aria-hidden={leaving}
        className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
        initial={false}
        animate={{ opacity: leaving ? 0 : 1 }}
        transition={{ duration: still ? 0 : 0.3, ease: 'easeOut' }}
      >
        <div
          ref={ballRef}
          className="relative aspect-square w-[min(68vmin,46rem)] transition-opacity duration-[--duration-focus]"
          style={leaving ? { opacity: 0 } : undefined}
        >
          <AnimatePresence initial={false}>
            <motion.div
              key={displayPhase}
              className="absolute inset-0"
              initial={{ opacity: 0, scale: still ? 1 : 0.965 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: still ? 1 : 0.985 }}
              transition={{ duration: still ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] }}
            >
              <BloubBot
                size={640}
                shape="cercle"
                color="brume"
                expression="neutre"
                paper="#0d1120"
                cycle={still ? undefined : BOOT_CYCLES[displayPhase]}
                playing={!still}
                state={still ? BOOT_STILL_STATE[displayPhase] : undefined}
                frozenAt={still ? BOOT_STILL_AT[displayPhase] : undefined}
                ariaLabel={label}
                className="h-full w-full"
                style={{ display: 'block' }}
              />
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="relative -mt-[4vmin] flex w-[min(42vmin,17rem)] flex-col items-center gap-3.5">
          <span className="text-caption font-semibold tracking-[0.52em] text-text-primary">
            PULSE
          </span>

          <BootProgress phase={displayPhase} still={still} leaving={leaving} />

          <div className="flex w-full items-center justify-between gap-3">
            <p className="truncate text-caption font-medium tracking-[0.02em] text-text-muted">
              {label}
            </p>
            <span
              className={`shrink-0 text-caption font-semibold tracking-[0.22em] ${
                displayPhase === 'error'
                  ? 'text-text-faint'
                  : displayPhase === 'ready'
                    ? 'text-[hsl(var(--pulse-accent))]/80'
                    : 'text-text-faint'
              }`}
            >
              {tag}
            </span>
          </div>

          {displayPhase === 'error' && error ? (
            <p className="line-clamp-2 max-w-[min(70vw,30rem)] text-center text-caption leading-relaxed text-text-faint">
              {error}
            </p>
          ) : null}
        </div>
      </motion.div>

      {/*
        The travelling ball: one shared element, the composited image the user has
        been looking at, resized down to the mark's square. It does not fade — it
        ends exactly on the mark's box, and the mark takes over on that same
        frame, so the crossing reads as one ball that never blinked.
      */}
      {leaving && flight && !still ? (
        <motion.div
          aria-hidden
          className="pointer-events-none fixed"
          initial={{
            left: flight.from.left,
            top: flight.from.top,
            width: flight.from.size,
            height: flight.from.size,
          }}
          animate={{
            left: flight.to.left,
            top: flight.to.top,
            width: flight.to.size,
            height: flight.to.size,
          }}
          transition={{ duration: BOOT_EXIT_MS / 1000, ease: [0.5, 0, 0.2, 1] }}
        >
          <BloubBot
            size={640}
            shape="cercle"
            color="brume"
            expression="neutre"
            paper="#0d1120"
            state="comet"
            frozenAt={HANDOFF_AT}
            ariaLabel=""
            className="h-full w-full"
            style={{ display: 'block' }}
          />
        </motion.div>
      ) : null}
    </motion.div>
  )
}
