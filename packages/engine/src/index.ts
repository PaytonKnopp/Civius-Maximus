export const ENGINE_VERSION = '0.0.0';

export { Action, type ActionType, parseAction } from './actions';
export { evaluateCondition, countAdjacent, tileMatches } from './effects/conditions';
export type { TileContext, TileFacts } from './effects/tile';
export {
  computeTileYields,
  explainYields,
  type EffectSource,
  type YieldBreakdown,
  type YieldLine,
} from './effects/yields';
export type { GameEvent } from './events';
export { type Fixed, FIXED_ONE, formatFixed, percentOf, toFixed } from './fixed';
export {
  type ActionResult,
  applyAction,
  createGame,
  type EngineContext,
  type GameSetup,
  MAX_PLAYERS,
  type RuleError,
  type TurnStep,
  validateAction,
} from './game';
export { stateHash } from './hash';
export { type Replay, runReplay } from './replay';
export { createRng, nextInt, nextRange, nextU32, type RngState } from './rng';
export type { GameSettings, GameState, PlayerId, PlayerState } from './state';
