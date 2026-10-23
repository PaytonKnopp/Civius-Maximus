export const ENGINE_VERSION = '0.0.0';

export { evaluateCondition, countAdjacent, tileMatches } from './effects/conditions';
export type { TileContext, TileFacts } from './effects/tile';
export {
  computeTileYields,
  explainYields,
  type EffectSource,
  type YieldBreakdown,
  type YieldLine,
} from './effects/yields';
export { type Fixed, FIXED_ONE, formatFixed, percentOf, toFixed } from './fixed';
export { createRng, nextInt, nextRange, nextU32, type RngState } from './rng';
