import { z } from 'zod';
import { Elevation, Id, IdOrIds, ResourceClass, YieldMap } from './common';

/**
 * The effects system: every ability, policy, belief, wonder and promotion is a list of effects.
 * An effect is what changes (`effect` + `params`), who it applies to (`target`), and when
 * (`condition`). See docs/05-modding.md. Effect and condition types grow with each milestone.
 */

/** Matches a single tile by what's on it. Used by adjacency counting. */
const tileMatchShape = {
  terrain: IdOrIds.optional(),
  feature: IdOrIds.optional(),
  elevation: z.union([Elevation, z.array(Elevation).min(1)]).optional(),
  /** These resources, or `true` for any resource. */
  resource: z.union([IdOrIds, z.literal(true)]).optional(),
  resourceClass: ResourceClass.optional(),
  /** These improvements, or `true` for any improvement. */
  improvement: z.union([IdOrIds, z.literal(true)]).optional(),
  /** These districts, or `true` for any district. */
  district: z.union([IdOrIds, z.literal(true)]).optional(),
  /** These wonders, or `true` for any wonder. */
  wonder: z.union([IdOrIds, z.literal(true)]).optional(),
  /** A settlement's center tile. */
  cityCenter: z.boolean().optional(),
  river: z.boolean().optional(),
};
const matchesSomething = (m: object) =>
  Object.keys(m).some((k) => k !== 'min' && k in tileMatchShape);
const NEEDS_FIELD =
  'must match on at least one of: terrain, feature, elevation, resource, resourceClass, improvement, district, wonder, cityCenter, river';

export const TileMatch = z.strictObject(tileMatchShape).refine(matchesSomething, NEEDS_FIELD);
export type TileMatch = z.infer<typeof TileMatch>;

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  // Tiles
  | { tile_terrain: IdOrIds }
  | { tile_feature: IdOrIds | null }
  | { tile_elevation: Elevation | Elevation[] }
  | { tile_has_resource: IdOrIds | true }
  | { tile_resource_class: ResourceClass }
  | { tile_has_improvement: IdOrIds | true }
  | { tile_on_river: boolean }
  | { tile_coastal: boolean }
  | { tile_owned_by_self: boolean }
  | { tile_adjacent_to: TileMatch & { min?: number | undefined } }
  // Settlements
  | { settlement_is_capital: boolean }
  | { settlement_kind: 'town' | 'city' }
  | { settlement_population_at_least: number }
  | { settlement_has_building: IdOrIds }
  /** The settlement has one of these districts (or a unique one replacing it). */
  | { settlement_has_district: IdOrIds }
  | { settlement_has_governor: IdOrIds }
  | { settlement_on_river: boolean }
  /** Fewer than this many soldiers trained there so far. */
  | { settlement_units_trained_below: number }
  // The player
  | { has_tech: Id }
  | { has_civic: Id }
  | { government_is: IdOrIds }
  | { celebrating: boolean }
  /** The player has reached this era (or a later one). */
  | { era_at_least: Id }
  // Tiles (more)
  /** The tile is a settlement's center. */
  | { tile_city_center: boolean };

export const Condition: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.strictObject({ all: z.array(Condition).min(1) }),
    z.strictObject({ any: z.array(Condition).min(1) }),
    z.strictObject({ not: Condition }),
    z.strictObject({ tile_terrain: IdOrIds }),
    z.strictObject({ tile_feature: z.union([IdOrIds, z.null()]) }),
    z.strictObject({ tile_elevation: z.union([Elevation, z.array(Elevation).min(1)]) }),
    z.strictObject({ tile_has_resource: z.union([IdOrIds, z.literal(true)]) }),
    z.strictObject({ tile_resource_class: ResourceClass }),
    z.strictObject({ tile_has_improvement: z.union([IdOrIds, z.literal(true)]) }),
    z.strictObject({ tile_on_river: z.boolean() }),
    z.strictObject({ tile_coastal: z.boolean() }),
    z.strictObject({ tile_owned_by_self: z.boolean() }),
    z.strictObject({
      tile_adjacent_to: z
        .strictObject({ ...tileMatchShape, min: z.int().min(1).max(6).optional() })
        .refine(matchesSomething, NEEDS_FIELD),
    }),
    z.strictObject({ settlement_is_capital: z.boolean() }),
    z.strictObject({ settlement_kind: z.enum(['town', 'city']) }),
    z.strictObject({ settlement_population_at_least: z.int().min(1) }),
    z.strictObject({ settlement_has_building: IdOrIds }),
    z.strictObject({ settlement_has_district: IdOrIds }),
    /** The settlement's established governor is one of these. */
    z.strictObject({ settlement_has_governor: IdOrIds }),
    z.strictObject({ has_tech: Id }),
    z.strictObject({ has_civic: Id }),
    z.strictObject({ government_is: IdOrIds }),
    z.strictObject({ celebrating: z.boolean() }),
    z.strictObject({ settlement_on_river: z.boolean() }),
    z.strictObject({ settlement_units_trained_below: z.int().min(1) }),
    z.strictObject({ era_at_least: Id }),
    z.strictObject({ tile_city_center: z.boolean() }),
  ]),
);

/** Which game objects an effect applies to. */
export const TileTarget = z.strictObject({
  scope: z.literal('tiles'),
  owner: z.enum(['self', 'any']).default('self'),
});
/** Each of the player's settlements (conditions can narrow it, e.g. to the capital). */
export const SettlementTarget = z.strictObject({ scope: z.literal('settlements') });
/** The player's empire as a whole. */
export const PlayerTarget = z.strictObject({ scope: z.literal('player') });
/** The player's units (the effect's params narrow it, e.g. to cavalry). */
export const UnitTarget = z.strictObject({ scope: z.literal('units') });
export const Target = z.discriminatedUnion('scope', [
  TileTarget,
  SettlementTarget,
  PlayerTarget,
  UnitTarget,
]);
export type Target = z.infer<typeof Target>;

const Amount = z.number().multipleOf(0.5);
const Percent = z.int().min(-100).max(1000);
export const SlotKind = z.enum(['military', 'economic', 'diplomatic', 'wildcard']);
export type SlotKind = z.infer<typeof SlotKind>;

const ModifyYield = z.strictObject({
  effect: z.literal('modify_yield'),
  params: z.union([
    z.strictObject({ yield: Id, amount: Amount }),
    z.strictObject({ yield: Id, percent: Percent }),
  ]),
  target: z.discriminatedUnion('scope', [TileTarget, SettlementTarget]),
  condition: Condition.optional(),
});

const YieldPerAdjacent = z.strictObject({
  effect: z.literal('yield_per_adjacent'),
  params: z.strictObject({
    yield: Id,
    amount: Amount,
    /** What adjacent tiles count. */
    per: TileMatch,
    /** Give `amount` for every N matching neighbors (e.g., +1 per 2 woods). Default 1. */
    every: z.int().min(1).max(6).default(1),
  }),
  target: TileTarget,
  condition: Condition.optional(),
});

const ModifyHappiness = z.strictObject({
  effect: z.literal('modify_happiness'),
  params: z.strictObject({ amount: z.int() }),
  target: SettlementTarget,
  condition: Condition.optional(),
});

/** Which items an effect is about (empty = every item). */
export const Toward = z
  .strictObject({
    kind: z.enum(['unit', 'building', 'district', 'wonder', 'project']).optional(),
    unitClass: IdOrIds.optional(),
    unit: IdOrIds.optional(),
    building: IdOrIds.optional(),
    district: IdOrIds.optional(),
    wonder: IdOrIds.optional(),
    /** Units only: soldiers (units of a class that fights). */
    military: z.boolean().optional(),
  })
  .default({});
export type Toward = z.infer<typeof Toward>;

/** Faster (or slower) production toward some kinds of items. Leave `toward` empty for all. */
const ModifyProduction = z.strictObject({
  effect: z.literal('modify_production'),
  params: z.strictObject({ percent: Percent, toward: Toward }),
  target: SettlementTarget,
  condition: Condition.optional(),
});

const ModifyGrowth = z.strictObject({
  effect: z.literal('modify_growth'),
  params: z.strictObject({ percent: Percent }),
  target: SettlementTarget,
  condition: Condition.optional(),
});

const ModifyBorderGrowth = z.strictObject({
  effect: z.literal('modify_border_growth'),
  params: z.strictObject({ percent: Percent }),
  target: SettlementTarget,
  condition: Condition.optional(),
});

const ModifySettlementLimit = z.strictObject({
  effect: z.literal('modify_settlement_limit'),
  params: z.strictObject({ amount: z.int() }),
  target: PlayerTarget,
  condition: Condition.optional(),
});

const ExtraPolicySlot = z.strictObject({
  effect: z.literal('extra_policy_slot'),
  params: z.strictObject({ slot: SlotKind, amount: z.int().min(1).default(1) }),
  target: PlayerTarget,
  condition: Condition.optional(),
});

const ModifyUnitUpkeep = z.strictObject({
  effect: z.literal('modify_unit_upkeep'),
  params: z.strictObject({ percent: Percent }),
  target: PlayerTarget,
  condition: Condition.optional(),
});

/** Cheaper (or dearer) purchases: everywhere (player) or in one settlement (a local effect). */
const ModifyPurchaseCost = z.strictObject({
  effect: z.literal('modify_purchase_cost'),
  params: z.strictObject({ percent: Percent }),
  target: z.discriminatedUnion('scope', [PlayerTarget, SettlementTarget]),
  condition: Condition.optional(),
});

/** Land units may embark onto shallow water. */
const EnableEmbark = z.strictObject({
  effect: z.literal('enable_embark'),
  params: z.strictObject({}).default({}),
  target: PlayerTarget,
  condition: Condition.optional(),
});

/**
 * An adjacency bonus: `amount` of `yield` for every `every` neighboring tiles matching `per`
 * (or, with `self`, once if the tile itself matches). Used by improvements, districts, wonders.
 */
export const Adjacency = z
  .strictObject({
    yield: Id,
    amount: Amount,
    per: TileMatch.optional(),
    self: TileMatch.optional(),
    every: z.int().min(1).max(6).default(1),
    /** Shown in breakdowns ("Mountains"). */
    label: z.string().min(1).optional(),
  })
  .refine(
    (a) => (a.per === undefined) !== (a.self === undefined),
    'needs exactly one of per or self',
  );
export type Adjacency = z.infer<typeof Adjacency>;

/** Items cost less (or more) production, and so less gold to buy. −100 makes them free. */
const ModifyItemCost = z.strictObject({
  effect: z.literal('modify_item_cost'),
  params: z.strictObject({ percent: Percent, toward: Toward }),
  target: SettlementTarget,
  condition: Condition.optional(),
});

/** Combat strength for some of the player's units, in the situations named. */
export const StrengthBonus = z.strictObject({
  amount: z.int(),
  when: z.enum(['attack', 'defend', 'always']).default('always'),
  /** Only against these classes, against settlements, against ranged attacks, or wounded foes. */
  vs: z
    .strictObject({
      classes: z.array(Id).min(1).optional(),
      settlement: z.boolean().optional(),
      ranged: z.boolean().optional(),
      wounded: z.boolean().optional(),
      /** Only against players this player has a trade route with. */
      tradePartner: z.boolean().optional(),
    })
    .optional(),
  /** Only when the unit stands (defending) or fights from (attacking) such a tile. */
  on: z
    .strictObject({
      features: z.array(Id).min(1).optional(),
      elevations: z.array(Elevation).min(1).optional(),
    })
    .optional(),
});
export type StrengthBonus = z.infer<typeof StrengthBonus>;

const ModifyStrength = z.strictObject({
  effect: z.literal('modify_strength'),
  params: StrengthBonus.extend({
    /** Only units of these classes. */
    unitClass: IdOrIds.optional(),
    /** Only these units (e.g. gunpowder units). */
    unit: IdOrIds.optional(),
    /** Only for this many turns after the player declares a war. */
    afterDeclaringWar: z.int().min(1).optional(),
  }),
  target: UnitTarget,
  condition: Condition.optional(),
});

/** Units trained (or bought) start with a promotion; local to a building, or empire-wide. */
const GrantPromotion = z.strictObject({
  effect: z.literal('grant_promotion'),
  params: z.strictObject({
    promotion: Id,
    unitClass: IdOrIds.optional(),
    domain: z.enum(['land', 'sea', 'air']).optional(),
  }),
  target: SettlementTarget,
  condition: Condition.optional(),
});

/** When the player captures a settlement. */
const OnCapture = z.strictObject({
  effect: z.literal('on_capture'),
  params: z.strictObject({
    /** Gold for each citizen the settlement has when taken. */
    goldPerCitizen: z.int().min(0).default(0),
    /** Every unit of the player heals fully. */
    healUnits: z.boolean().default(false),
    /** Boosts toward the cheapest unboosted techs or civics, per district in the settlement. */
    boostsPerDistrict: z.int().min(0).default(0),
  }),
  target: PlayerTarget,
  condition: Condition.optional(),
});

/** When the player's unit destroys an enemy unit of these classes: a chance to take it instead. */
const CaptureOnKill = z.strictObject({
  effect: z.literal('capture_on_kill'),
  params: z.strictObject({ unitClass: IdOrIds, percent: z.int().min(1).max(100) }),
  target: UnitTarget,
  condition: Condition.optional(),
});

/** Every new settlement the player founds starts with this building. */
const FreeBuilding = z.strictObject({
  effect: z.literal('free_building'),
  params: z.strictObject({ building: Id }),
  target: PlayerTarget,
  condition: Condition.optional(),
});

/** Tech and civic boosts give this much more (percent of the cost, added to the base). */
const ModifyBoost = z.strictObject({
  effect: z.literal('modify_boost'),
  params: z.strictObject({ percent: Percent }),
  target: PlayerTarget,
  condition: Condition.optional(),
});

/** Districts get this much more from each neighboring district (on top of the base). */
const DistrictNeighborBonus = z.strictObject({
  effect: z.literal('district_neighbor_bonus'),
  params: z.strictObject({ amount: z.number().multipleOf(0.5) }),
  target: PlayerTarget,
  condition: Condition.optional(),
});

/** An extra adjacency rule for some districts. */
const ExtraAdjacency = z.strictObject({
  effect: z.literal('extra_adjacency'),
  params: z.strictObject({ district: IdOrIds, adjacency: Adjacency }),
  target: PlayerTarget,
  condition: Condition.optional(),
});

/** Finishing one of these districts gives a free unit: the strongest of these classes it can train. */
const FreeUnitOnDistrict = z.strictObject({
  effect: z.literal('free_unit_on_district'),
  params: z.strictObject({ district: IdOrIds, unitClass: IdOrIds }),
  target: PlayerTarget,
  condition: Condition.optional(),
});

/** More trade routes at once. */
const ExtraTradeRoute = z.strictObject({
  effect: z.literal('extra_trade_route'),
  params: z.strictObject({ amount: z.int().min(1).default(1) }),
  target: PlayerTarget,
  condition: Condition.optional(),
});

/** Extra yields on the player's trade routes (international ones only, if set). */
const TradeRouteBonus = z.strictObject({
  effect: z.literal('trade_route_bonus'),
  params: z.strictObject({
    international: z.boolean().default(false),
    /** For the settlement the route starts from. */
    origin: YieldMap.default({}),
    /** For the destination settlement. */
    destination: YieldMap.default({}),
    /** For the origin, per tile of this terrain it owns. */
    perOriginTerrain: z.strictObject({ terrain: Id, yields: YieldMap }).optional(),
  }),
  target: PlayerTarget,
  condition: Condition.optional(),
});

/** Starting a trade route reveals the land around the destination. */
const TradeReveals = z.strictObject({
  effect: z.literal('trade_reveals'),
  params: z.strictObject({ radius: z.int().min(0).max(10) }),
  target: PlayerTarget,
  condition: Condition.optional(),
});

/** Influence each turn for every deal with running payments the player is part of. */
const InfluencePerDeal = z.strictObject({
  effect: z.literal('influence_per_deal'),
  params: z.strictObject({ amount: z.number().multipleOf(0.5) }),
  target: PlayerTarget,
  condition: Condition.optional(),
});

/** Every new settlement gets a road to the capital. */
const RoadToCapital = z.strictObject({
  effect: z.literal('road_to_capital'),
  params: z.strictObject({}).default({}),
  target: PlayerTarget,
  condition: Condition.optional(),
});

/** Great person points each turn toward one class (a district or building's, usually). */
const GreatPersonPoints = z.strictObject({
  effect: z.literal('great_person_points'),
  params: z.strictObject({ class: Id, amount: z.int().min(1) }),
  target: PlayerTarget,
  condition: Condition.optional(),
});

/** More (or fewer) great person points toward one class, in percent. */
const GreatPersonPointsPercent = z.strictObject({
  effect: z.literal('great_person_points_percent'),
  params: z.strictObject({ class: Id, percent: Percent }),
  target: PlayerTarget,
  condition: Condition.optional(),
});

/** Commanders: more strength for the units in their radius, and XP faster. */
const CommanderBonus = z.strictObject({
  effect: z.literal('commander_bonus'),
  params: z.strictObject({
    strength: z.int().default(0),
    xpPercent: z.int().min(-100).max(1000).default(0),
  }),
  target: PlayerTarget,
  condition: Condition.optional(),
});

/** Envoys to send to city-states, once, when the civic or tech carrying it is finished. */
const GrantEnvoys = z.strictObject({
  effect: z.literal('grant_envoys'),
  params: z.strictObject({ amount: z.int().min(1) }),
  target: PlayerTarget,
  condition: Condition.optional(),
});

/** For a religion's founder: yields in the holy city for every `per` settlements following it. */
const YieldPerFollower = z.strictObject({
  effect: z.literal('yield_per_follower'),
  params: z.strictObject({ yield: Id, amount: Amount, per: z.int().min(1).default(1) }),
  target: PlayerTarget,
  condition: Condition.optional(),
});

/** Loyalty a turn in matching settlements (when the loyalty setting is on). */
const ModifyLoyalty = z.strictObject({
  effect: z.literal('modify_loyalty'),
  params: z.strictObject({ amount: z.int() }),
  target: SettlementTarget,
  condition: Condition.optional(),
});

/** Stronger (or weaker) loyalty pressure from this player's citizens. */
const ModifyLoyaltyPressure = z.strictObject({
  effect: z.literal('modify_loyalty_pressure'),
  params: z.strictObject({ percent: Percent }),
  target: PlayerTarget,
  condition: Condition.optional(),
});

/** Diplomatic favor a turn (World Congress). */
const DiplomaticFavor = z.strictObject({
  effect: z.literal('diplomatic_favor'),
  params: z.strictObject({ amount: z.int() }),
  target: PlayerTarget,
  condition: Condition.optional(),
});

/** Diplomatic victory points, for as long as the source lasts (e.g. a wonder). */
const DiplomaticPoints = z.strictObject({
  effect: z.literal('diplomatic_points'),
  params: z.strictObject({ amount: z.int() }),
  target: PlayerTarget,
  condition: Condition.optional(),
});

/** Items of this kind can also be bought with faith (same price as in gold). */
const PurchaseWithFaith = z.strictObject({
  effect: z.literal('purchase_with_faith'),
  params: z.strictObject({ kind: z.enum(['unit', 'building']) }),
  target: PlayerTarget,
  condition: Condition.optional(),
});

export const Effect = z.discriminatedUnion('effect', [
  ModifyYield,
  YieldPerAdjacent,
  ModifyHappiness,
  ModifyProduction,
  ModifyGrowth,
  ModifyBorderGrowth,
  ModifySettlementLimit,
  ExtraPolicySlot,
  ModifyUnitUpkeep,
  ModifyPurchaseCost,
  EnableEmbark,
  ModifyItemCost,
  ModifyStrength,
  GrantPromotion,
  OnCapture,
  CaptureOnKill,
  FreeBuilding,
  ModifyBoost,
  DistrictNeighborBonus,
  ExtraAdjacency,
  PurchaseWithFaith,
  FreeUnitOnDistrict,
  ExtraTradeRoute,
  TradeRouteBonus,
  TradeReveals,
  InfluencePerDeal,
  RoadToCapital,
  GreatPersonPoints,
  GreatPersonPointsPercent,
  YieldPerFollower,
  GrantEnvoys,
  CommanderBonus,
  ModifyLoyalty,
  ModifyLoyaltyPressure,
  DiplomaticFavor,
  DiplomaticPoints,
]);
export type Effect = z.infer<typeof Effect>;
export const EFFECT_TYPES = Effect.options.map((o) => o.shape.effect.value);
