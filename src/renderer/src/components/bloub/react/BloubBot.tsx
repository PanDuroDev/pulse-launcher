import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties
} from 'react'
import { flushSync } from 'react-dom'
import { blockAt, defaultCycle, offsetOf, type Block } from '../bot/cycles'
import { NOTIF_BLUE } from '../bot/decor'
import { BotEngine, type BotFrame } from '../bot/engine'
import { DEFAULT_EXPRESSION, EXPRESSION_BY_ID } from '../bot/expressions'
import { clamp, easings } from '../bot/math'
import { DEMI_VIEWBOX, RAYON } from '../bot/repere'
import { COLOR_BY_ID, DEFAULT_COLOR, DEFAULT_SHAPE, SHAPE_BY_ID, mixHex } from '../bot/skins'
import { STATE_BY_ID, type StateId } from '../bot/states'
import { lookTarget, TURN_TIME, type GazeScript } from '../gaze'

export interface BloubBotHandle {
  /** Move the playhead to block `index`, `offset` seconds into it. */
  seek: (index: number, offset?: number) => void
  /**
   * Render the whole montage at absolute date `t`, with no clock — used to
   * capture a cycle frame by frame, faster than real time.
   */
  rendAt: (t: number) => void
  /**
   * Force a single state's frame at date `t`, with no clock, bypassing the
   * `frozenAt` prop — used to capture the rest expression's own animation
   * (breathing, blinking) frame by frame for the animated SVG/GIF export.
   */
  sample: (t: number) => void
  /** The live SVG node, for capture/export. */
  readonly svg: SVGSVGElement | null
}

export interface BloubBotProps {
  size?: number
  /** shape id from the customiser catalogue (`SHAPES`) */
  shape?: string
  /** color id from the customiser catalogue (`COLORS`) */
  color?: string
  /** rest-expression id from the customiser catalogue (`EXPRESSIONS`) */
  expression?: string
  /** background color, used for the particles' depth haze and the eye holes */
  paper?: string
  /**
   * Freeze the render at this date (seconds since the state began). The engine
   * being a pure function of time, this gives a pixel-reproducible frame with
   * no animation loop — a state board, a customiser thumbnail, a test.
   */
  frozenAt?: number
  /** Montage played by the reader: a sequence of states, each held its block's duration. */
  cycle?: Block[]
  /** The gaze follows the pointer. Meaningless on a frozen thumbnail (no loop to feed it). */
  follow?: boolean
  /**
   * Scripted arrival gaze: evaluated every frame with the time elapsed since it
   * was set. Independent of `follow`, which targets the pointer — here the
   * script decides everything, including its own duration.
   */
  gaze?: GazeScript | null
  className?: string
  style?: CSSProperties
  ariaLabel?: string

  /** Playhead, as a **block index** (a montage can hold the same state twice). */
  block?: number
  defaultBlock?: number
  onBlockChange?: (block: number) => void
  /** Output: the state of the current block. */
  state?: StateId
  defaultState?: StateId
  onStateChange?: (state: StateId) => void
  playing?: boolean
  defaultPlaying?: boolean
  onPlayingChange?: (playing: boolean) => void
  /** Time elapsed in the current block, for a timeline playhead. */
  elapsed?: number
  defaultElapsed?: number
  onElapsedChange?: (elapsed: number) => void
}

/** Render frame layers -> SVG element props for a single dot/particle. */
function dotAttrs(dot: BotFrame['dots'][number], paper: string, ink: string) {
  const fill =
    dot.color ?? (dot.depth === undefined ? ink : mixHex(paper, ink, dot.depth))
  if (dot.d) {
    return {
      fill,
      opacity: dot.opacity,
      d: dot.d,
      transform: `translate(${dot.x} ${dot.y}) rotate(${dot.rot ?? 0}) scale(${RAYON})`
    }
  }
  return { fill, opacity: dot.opacity, cx: dot.x, cy: dot.y, r: dot.r }
}

/**
 * SVG recreation of the x.ai bot avatar: `src/bot/` (this package's `bot/`
 * folder) is a clock-free, framework-free engine — `engine.sample(t)` is a
 * pure function of time — and this component is only one client of it.
 */
export const BloubBot = forwardRef<BloubBotHandle, BloubBotProps>(function BloubBot(props, ref) {
  const {
    size = 320,
    shape = DEFAULT_SHAPE,
    color = DEFAULT_COLOR,
    expression = DEFAULT_EXPRESSION,
    paper = '#f9f9f9',
    frozenAt,
    follow = false,
    gaze = null,
    className,
    style,
    ariaLabel = 'Animated bloub avatar'
  } = props

  const R = RAYON
  const VB = DEMI_VIEWBOX

  // Always read through this ref inside the rAF loop / imperative helpers, never
  // the destructured props above: the loop is started once and must see fresh
  // values on every frame without needing to be torn down and restarted.
  const propsRef = useRef(props)
  propsRef.current = props

  const defaultCycleRef = useRef<Block[] | null>(null)
  if (!defaultCycleRef.current) defaultCycleRef.current = defaultCycle().blocks
  const cycleProp = props.cycle ?? defaultCycleRef.current

  const shapeRadii = SHAPE_BY_ID.get(shape)?.radii ?? null
  const ink = COLOR_BY_ID.get(color)?.hex ?? '#0a0a0c'
  const exprObj = EXPRESSION_BY_ID.get(expression) ?? null

  const blockRef = useRef(props.block ?? props.defaultBlock ?? 0)
  const stateRef = useRef<StateId>(props.state ?? props.defaultState ?? 'idle')
  const playingRef = useRef(props.playing ?? props.defaultPlaying ?? false)
  const elapsedRef = useRef(props.elapsed ?? props.defaultElapsed ?? 0)

  const engineRef = useRef<BotEngine | null>(null)
  if (!engineRef.current) {
    engineRef.current = new BotEngine(R, stateRef.current, shapeRadii, exprObj)
  }
  const engine = engineRef.current

  const [frame, setFrame] = useState<BotFrame>(() => engine.sample(frozenAt ?? 0))

  const uidRef = useRef<string | null>(null)
  if (!uidRef.current) uidRef.current = Math.random().toString(36).slice(2, 8)
  const maskId = `bot-mask-${uidRef.current}`

  const svgRef = useRef<SVGSVGElement | null>(null)

  const rafRef = useRef(0)
  const nextAtRef = useRef(Infinity)
  const lastRef = useRef(0)
  const clockRef = useRef(0)
  const blockStartRef = useRef(0)
  const pendingOffsetRef = useRef(0)
  const dernierBlocRef = useRef(-1)

  const pointerRef = useRef<{ x: number; y: number } | null>(null)
  const aimingRef = useRef(false)
  const turnSinceRef = useRef(0)
  const gazeSinceRef = useRef(0)
  const scriptedRef = useRef(false)

  function setBlock(v: number) {
    if (blockRef.current === v) return
    blockRef.current = v
    propsRef.current.onBlockChange?.(v)
  }
  function setStateId(v: StateId) {
    if (stateRef.current === v) return
    stateRef.current = v
    propsRef.current.onStateChange?.(v)
  }
  function setElapsed(v: number) {
    elapsedRef.current = v
    propsRef.current.onElapsedChange?.(v)
  }

  /** Apply block `i`: state, engine, end date. Idempotent — safe to call twice. */
  function applyInternal(i: number, from = 0) {
    const b = propsRef.current.cycle?.[i] ?? defaultCycleRef.current![i]
    if (!b) {
      nextAtRef.current = Infinity
      return
    }
    blockStartRef.current = clockRef.current - from
    setElapsed(from)
    setStateId(b.state)
    engine.setState(b.state, clockRef.current)
    nextAtRef.current = playingRef.current ? blockStartRef.current + b.duration : Infinity
  }

  function goToBlock(i: number) {
    applyInternal(i)
    setBlock(i)
  }

  function seek(index: number, offset = 0) {
    if (blockRef.current === index) {
      applyInternal(index, offset)
      return
    }
    pendingOffsetRef.current = offset
    setBlock(index)
    // Uncontrolled fallback: nobody will feed `index` back as a prop, so apply now.
    if (propsRef.current.block === undefined) applyInternal(index, offset)
  }

  function rendAt(t: number) {
    const blocks = propsRef.current.cycle ?? defaultCycleRef.current!
    if (!blocks.length) return
    const { index } = blockAt(blocks, t)
    if (index !== dernierBlocRef.current) {
      const b = blocks[index]!
      setStateId(b.state)
      if (index < dernierBlocRef.current) engine.reset(b.state, offsetOf(blocks, index))
      else engine.setState(b.state, offsetOf(blocks, index))
      dernierBlocRef.current = index
    }
    // `flushSync`: an off-screen capture loop reads the SVG right after this
    // call returns, with no `await` in between — the commit must be synchronous.
    flushSync(() => setFrame(engine.sample(t)))
  }

  function sample(t: number) {
    flushSync(() => setFrame(engine.sample(t)))
  }

  useImperativeHandle(ref, () => ({
    seek,
    rendAt,
    sample,
    get svg() {
      return svgRef.current
    }
  }))

  function release() {
    if (!aimingRef.current) return
    engine.setLook(null, clockRef.current, TURN_TIME)
    aimingRef.current = false
  }

  function aim() {
    if (!STATE_BY_ID.get(stateRef.current)?.baseFace) {
      release()
      return
    }
    const box = svgRef.current?.getBoundingClientRect()
    if (!box || box.width === 0 || box.height === 0) return
    if (!aimingRef.current) turnSinceRef.current = clockRef.current
    const halfW = Math.max(1, window.innerWidth / 2)
    const halfH = Math.max(1, window.innerHeight / 2)
    const pointer = pointerRef.current
    engine.setLook(
      lookTarget({
        nx: pointer ? clamp((pointer.x - (box.left + box.width / 2)) / halfW, -1, 1) : 0,
        ny: pointer ? clamp((pointer.y - (box.top + box.height / 2)) / halfH, -1, 1) : 0,
        tour: easings.easeOutQuint(clamp((clockRef.current - turnSinceRef.current) / TURN_TIME)),
        pointer: pointer !== null
      }),
      clockRef.current
    )
    aimingRef.current = true
  }

  const SCRIPT_MORPH = 1 / 60
  function scriptedGaze(run: GazeScript) {
    engine.setLook(run(clockRef.current - gazeSinceRef.current), clockRef.current, SCRIPT_MORPH)
  }

  function redrawFrozen() {
    if (propsRef.current.frozenAt === undefined) return
    setFrame(engine.sample(propsRef.current.frozenAt))
  }

  function tick(ms: number) {
    rafRef.current = requestAnimationFrame(tick)
    const dt = lastRef.current ? Math.min((ms - lastRef.current) / 1000, 0.064) : 0
    lastRef.current = ms
    clockRef.current += dt

    if (playingRef.current) {
      const blocks = propsRef.current.cycle ?? defaultCycleRef.current!
      if (clockRef.current >= nextAtRef.current && blocks.length) {
        goToBlock((blockRef.current + 1) % blocks.length)
      } else {
        setElapsed(clockRef.current - blockStartRef.current)
      }
    }

    if (propsRef.current.follow) aim()
    else if (propsRef.current.gaze) scriptedGaze(propsRef.current.gaze)

    setFrame(engine.sample(clockRef.current))
  }

  function onPointerMove(event: PointerEvent) {
    if (event.pointerType === 'touch') return
    pointerRef.current = { x: event.clientX, y: event.clientY }
  }
  function onPointerLeave() {
    pointerRef.current = null
  }

  // Mount: start the render loop (unless this is a frozen, static frame).
  useEffect(() => {
    if (frozenAt !== undefined) return
    applyInternal(blockRef.current, elapsedRef.current)
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // External block changes (a timeline scrubber moving the playhead directly).
  useEffect(() => {
    if (props.block === undefined || props.block === blockRef.current) return
    applyInternal(props.block, pendingOffsetRef.current)
    pendingOffsetRef.current = 0
    blockRef.current = props.block
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.block])

  // External state changes (a frozen thumbnail with no block/cycle of its own).
  useEffect(() => {
    if (props.state === undefined || engine.state === props.state) return
    engine.setState(props.state, clockRef.current)
    stateRef.current = props.state
    redrawFrozen()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.state])

  // Resume where the playhead stopped, not at the start of the block.
  useEffect(() => {
    if (props.playing === undefined || props.playing === playingRef.current) return
    playingRef.current = props.playing
    if (props.playing) applyInternal(blockRef.current, elapsedRef.current)
    else nextAtRef.current = Infinity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.playing])

  // The montage changed under our feet: keep the cursor in bounds and recompute
  // the end date against the (possibly shortened) new duration.
  useEffect(() => {
    if (frozenAt !== undefined) return
    const blocks = cycleProp
    if (!blocks.length) {
      nextAtRef.current = Infinity
      return
    }
    const i = Math.min(blockRef.current, blocks.length - 1)
    if (i !== blockRef.current) {
      goToBlock(i)
      return
    }
    nextAtRef.current = playingRef.current ? blockStartRef.current + blocks[i]!.duration : Infinity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleProp])

  useEffect(() => {
    engine.setShape(shapeRadii, clockRef.current)
    redrawFrozen()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shapeRadii])

  useEffect(() => {
    engine.setExpression(exprObj, clockRef.current)
    redrawFrozen()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exprObj])

  useEffect(() => {
    redrawFrozen()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frozenAt])

  // Arrival gaze script: starts/releases as `gaze` is set/cleared.
  useEffect(() => {
    if (gaze) {
      gazeSinceRef.current = clockRef.current
      scriptedRef.current = true
      // Seed one catch-up morph earlier so the first frame is already settled,
      // instead of jumping from neutral to the script's pose on frame two.
      engine.setLook(gaze(0), clockRef.current - SCRIPT_MORPH, SCRIPT_MORPH)
      return
    }
    if (!scriptedRef.current) return
    engine.setLook(null, clockRef.current)
    scriptedRef.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gaze])

  // Pointer tracking only runs while `follow` is on and the frame isn't frozen.
  useEffect(() => {
    if (!follow || frozenAt !== undefined) {
      release()
      return
    }
    window.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerleave', onPointerLeave)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerleave', onPointerLeave)
      release()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [follow, frozenAt])

  return (
    <svg
      ref={svgRef}
      width={size}
      height={size}
      viewBox={`${-VB} ${-VB} ${VB * 2} ${VB * 2}`}
      role="img"
      aria-label={ariaLabel}
      className={className}
      style={style}
    >
      <defs>
        {/*
          The eyes are real holes punched through the body (like on x.ai), not
          white shapes laid on top: that's what clips them at the silhouette's
          edge with no cropping code of our own.
        */}
        <mask id={maskId} maskUnits="userSpaceOnUse" x={-VB} y={-VB} width={VB * 2} height={VB * 2}>
          <path d={frame.bodyPath} fill="#fff" />
          {frame.eyes.map((eye, i) => (
            <path key={i} d={eye.d} transform={eye.matrix} opacity={eye.alpha} fill="#000" />
          ))}
          {frame.notch && <circle cx={frame.notch.x} cy={frame.notch.y} r={frame.notch.r} fill="#000" />}
        </mask>

        {frame.arcs.map((arc) => (
          <linearGradient
            key={arc.id}
            id={`${uidRef.current}-${arc.id}`}
            gradientUnits="userSpaceOnUse"
            x1={arc.grad.x1}
            y1={arc.grad.y1}
            x2={arc.grad.x2}
            y2={arc.grad.y2}
          >
            {arc.grad.stops.map((c, i) => (
              <stop key={i} offset={i / (arc.grad.stops.length - 1)} stopColor={c} />
            ))}
          </linearGradient>
        ))}
      </defs>

      {/* back half of the orbits: drawn before the body, so occluded by it */}
      <g fill="none" strokeLinecap="round">
        {frame.arcs.map((arc) => (
          <path
            key={`b${arc.id}`}
            d={arc.back}
            stroke={`url(#${uidRef.current}-${arc.id})`}
            strokeWidth={arc.width}
            opacity={arc.opacity}
          />
        ))}
      </g>

      {/* burst particles: they pass behind the core */}
      {frame.dotsBehind && (
        <g>
          {frame.dots.map((dot, i) => {
            const attrs = dotAttrs(dot, paper, ink)
            return dot.d ? <path key={`pb${i}`} {...attrs} /> : <circle key={`pb${i}`} {...attrs} />
          })}
        </g>
      )}

      <g opacity={frame.bodyAlpha}>
        {/*
          Opaque backing, exactly the body's shape, under the body itself. The
          eyes are holes, so they'd otherwise show whatever is drawn behind them
          — the back half of the rings and the burst particles, which are drawn
          there on purpose to be occluded by the body.
        */}
        <path d={frame.bodyPath} fill={paper} />
        <g mask={`url(#${maskId})`}>
          <rect x={-VB} y={-VB} width={VB * 2} height={VB * 2} fill={ink} />
        </g>
      </g>

      {!frame.dotsBehind && (
        <g>
          {frame.dots.map((dot, i) => {
            const attrs = dotAttrs(dot, paper, ink)
            return dot.d ? <path key={`pf${i}`} {...attrs} /> : <circle key={`pf${i}`} {...attrs} />
          })}
        </g>
      )}

      {frame.notif && <circle cx={frame.notif.x} cy={frame.notif.y} r={frame.notif.r} fill={NOTIF_BLUE} />}

      {/* front half of the orbits */}
      <g fill="none" strokeLinecap="round">
        {frame.arcs.map((arc) => (
          <path
            key={`f${arc.id}`}
            d={arc.front}
            stroke={`url(#${uidRef.current}-${arc.id})`}
            strokeWidth={arc.width}
            opacity={arc.opacity}
          />
        ))}
      </g>
    </svg>
  )
})
