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
export type { Combatant, GameEvent } from './events';
export { damageFor, damageRange } from './combat/damage';
export {
  attackMode,
  attackProblem,
  attackStrength,
  attackTargets,
  bestUnitStrength,
  type CombatPreview,
  defenseStrength,
  previewAttack,
  previewStrike,
  settlementAt,
  settlementMaxHealth,
  settlementStrength,
  type Strength,
  type StrengthLine,
  strikeProblem,
  strikeTargets,
  type Target,
  targetAt,
  targetOwner,
  wallsMax,
} from './combat/strength';
export { liberateProblem, peaceProblem, razeProblem } from './combat/handlers';
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
  Track,
  UnitId,
  UnitOrders,
  UnitState,
} from './state';
export {
  availableItems,
  borderCulture,
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
  isBuyable,
  isUnlocked,
  itemCost,
  itemDef,
  itemKey,
  itemProblem,
  type Line,
  lockedReason,
  type Mood,
  productionToward,
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
  unitUpkeep,
  workableTiles,
} from './settlements/rules';
export { bestDevelopChoice } from './settlements/handlers';
export {
  districtCost,
  districtLimit,
  districtYields,
  needsTile,
  placementProblem,
  placementTiles,
  specialistSlots,
  TILE_KINDS,
} from './settlements/districts';
export {
  availableGovernments,
  availableNodes,
  availablePolicies,
  celebrationThreshold,
  type EmpireFacts,
  empireFacts,
  goalProgress,
  governmentChangeCost,
  isPolicyAvailable,
  nodeCost,
  pathTo,
  playerEra,
  policyChangeCost,
  policyProblem,
  trackOf,
  treeColumns,
  treeIds,
  type TreeKind,
  treeNode,
  unlocksOf,
} from './progress/rules';
export {
  activeSources,
  builtSources,
  localSources,
  playerEffects,
  policySlots,
  SLOT_KINDS,
  sourcesFor,
} from './progress/sources';
