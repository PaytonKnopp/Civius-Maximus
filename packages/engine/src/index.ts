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
export { campAt, campIds } from './combat/camps';
export {
  availablePromotions,
  nextPromotionXp,
  promotionChoices,
  promotionsOf,
  promotionTree,
  unitRange,
} from './units/promotions';
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
export { checkVictory, dominationProgress, scoreOf, type ScoreLine, teamOf } from './victory';
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
export { atWar, HOSTILE, unitClassOf, unitDef, unitIds, warKey } from './context';
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
export { eventsFor, playerView } from './view';
export type {
  BuildItem,
  CampState,
  DealTerms,
  DiplomacyState,
  Incident,
  Payment,
  Proposal,
  TradeRoute,
  Religion,
  CityStateState,
  HistoryEntry,
  TurnStats,
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
  canBuyWithFaith,
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
  warWeariness,
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
export { type Act as AiAct, militaryStrength, personalityOf, playAiTurn, settleSites } from './ai';
export { baseOf, countsAs, replacementFor, uniqueProblem, uniquesOf } from './uniques';
export { answerProposals, dealVerdict, type Verdict } from './ai';
export {
  areAllies,
  areFriends,
  dealProblem,
  denounceProblem,
  influencePerTurn,
  isSurpriseWar,
  NO_TERMS,
  type OpinionLine,
  opinionOf,
  relation,
  type Relation,
  sameTeam,
  warBlock,
} from './diplomacy/rules';
export {
  allUnitsOf,
  type Command,
  commandOf,
  commandersAround,
  packableUnits,
} from './units/commanders';
export {
  hasRoad,
  roadBits,
  routeProblem,
  routesOf,
  type RouteYields,
  routeYields,
  tradeCapacity,
  tradeDestinations,
  tradePartners,
  tradePath,
  traderOrigin,
} from './trade/rules';
export {
  activateProblem,
  canRecruitWith,
  type Currency,
  greatPersonCost,
  greatPersonRates,
  inRace,
  nextGreatPerson,
  pointsOf,
  recruitCost,
} from './greatpeople/greatpeople';
export {
  faithUnitProblem,
  faithUnitReligion,
  followerBeliefs,
  followersOf,
  freeBeliefs,
  holyCityOf,
  incomingPressure,
  maxReligions,
  pantheonOf,
  pantheonProblem,
  religionFoundingProblem,
  religionsOf,
  religiousProgress,
  spreadProblem,
} from './religion/rules';
export {
  bonusesFrom,
  cityStateDef,
  cityStateIds,
  cityStateSettlement,
  cityStateType,
  envoyProblem,
  envoysOf,
  isCityState,
  type Quest,
  questsOf,
} from './citystates/rules';
export { obsoletedBy, upgradeCost, upgradeProblem, upgradeTarget } from './units/upgrades';
export {
  cultureProgress,
  domesticTourists,
  hasCultureVictory,
  tourismBonus,
  visitingTourists,
} from './culture/tourism';
export { spaceProblem, spaceProgress } from './science/space';

export { ageSources, dedicationProblem, newAgeState, thresholds } from './eras/ages';
export {
  governorOf,
  governorSources,
  titlesAvailable,
  titlesEarned,
  titlesSpent,
} from './governors/governors';
