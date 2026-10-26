export { BloubBot } from './react/BloubBot'
export type { BloubBotHandle, BloubBotHandle as BotHandle, BloubBotProps } from './react/BloubBot'

// The engine: framework-free, `engine.sample(t)` is a pure function of time.
export { BotEngine } from './bot/engine'
export type { BotFrame, Look, RenderedEye } from './bot/engine'

export { RAYON, DEMI_VIEWBOX } from './bot/repere'

export {
  SHAPES,
  SHAPE_BY_ID,
  DEFAULT_SHAPE,
  COLORS,
  COLOR_BY_ID,
  DEFAULT_COLOR,
  mixHex
} from './bot/skins'
export type { BotShape, BotColor, ShapeId, ColorId } from './bot/skins'

export {
  EXPRESSIONS,
  EXPRESSION_BY_ID,
  DEFAULT_EXPRESSION,
  blendExpression
} from './bot/expressions'
export type { BotExpression, ExpressionId } from './bot/expressions'

export { STATES, STATE_BY_ID, SEQUENCE, POSES } from './bot/states'
export type { StateDef, StateId, Pose, EyeCfg } from './bot/states'

export {
  MIN_BLOCK,
  MAX_BLOCK,
  MAX_BLOCS,
  MAX_CYCLES,
  STEP,
  defaultCycle,
  makeBlock,
  minDurationOf,
  clampDuration,
  totalDuration,
  offsetOf,
  blockAt,
  blocksWith,
  moveBlock,
  uniqueName,
  nextCycleId,
  parseCycles
} from './bot/cycles'
export type { Block, Cycle } from './bot/cycles'

export { silhouette, circle, radiusAtAngle } from './bot/shape'
export type { Silhouette, Point } from './bot/shape'

export { NOTIF_BLUE } from './bot/decor'

export {
  YAW_MAX,
  PITCH_MAX,
  PITCH,
  TURN,
  SPIN,
  TURN_TIME,
  TOUR_TIME,
  HUMEURS,
  tourLook,
  lookTarget,
  brandLook
} from './gaze'
export type { GazeScript, Aim } from './gaze'
