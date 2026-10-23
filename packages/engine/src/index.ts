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
export { type Fixed, FIXED_ONE, formatFixed, percentOf, powFloor, toFixed } from './fixed';
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
export * from './map/hex';
export {
  generateMap,
  type GenerateInput,
  type GenerateResult,
  MapGenerationError,
  scoreStarts,
} from './map/generate';
export { makeRandom, type Random } from './map/random';
export { validateMap } from './map/validate';
export type { MapSettings, MapState, MapTile, StartBias } from './map/types';
export { type Replay, runReplay } from './replay';
export { createRng, nextInt, nextRange, nextU32, type RngState } from './rng';
export { decodeBits, encodeBits, getBit } from './bitset';
export { atWar, unitClassOf, unitDef, unitIds, warKey } from './context';
export { unitsNeedingOrders } from './units/handlers';
export {
  canTraverse,
  fullMoves,
  hasRoom,
  landCost,
  MP,
  stepMoves,
  unitsOn,
} from './units/movement';
export { findPath, type PathStep } from './units/pathfind';
export { fogOfWar, lineOfSight, sightOf, visibleTiles } from './units/vision';
export type {
  BuildItem,
  CitizenFocus,
  GameSettings,
  GameState,
  PlayerId,
  PlayerState,
  SettlementId,
  SettlementState,
  UnitId,
  UnitOrders,
  UnitState,
} from './state';
export {
  availableItems,
  borderThreshold,
  developCandidates,
  foundingProblem,
  goldPerTurn,
  growthPerTurn,
  growthThreshold,
  type Happiness,
  happinessOf,
  improvementsFor,
  isCoastal,
  itemCost,
  itemDef,
  itemKey,
  itemProblem,
  type Line,
  type Mood,
  purchasableTiles,
  purchaseCost,
  settlementIds,
  settlementLimit,
  settlementsOf,
  type SettlementYields,
  settlementYields,
  tileOnRiver,
  tilePurchaseCost,
  tileYields,
  townUpgradeCost,
  workableTiles,
} from './settlements/rules';
export { bestDevelopChoice } from './settlements/handlers';
