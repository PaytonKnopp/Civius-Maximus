import { z } from 'zod';
import { Elevation, Id, IdOrIds, ResourceClass } from './common';

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
  // The player
  | { has_tech: Id }
  | { has_civic: Id }
  | { government_is: IdOrIds }
  | { celebrating: boolean };

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
    z.strictObject({ has_tech: Id }),
    z.strictObject({ has_civic: Id }),
    z.strictObject({ government_is: IdOrIds }),
    z.strictObject({ celebrating: z.boolean() }),
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
export const Target = z.discriminatedUnion('scope', [TileTarget, SettlementTarget, PlayerTarget]);
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

/** Faster (or slower) production toward some kinds of items. Leave `toward` empty for all. */
const ModifyProduction = z.strictObject({
  effect: z.literal('modify_production'),
  params: z.strictObject({
    percent: Percent,
    toward: z
      .strictObject({
        kind: z.enum(['unit', 'building', 'district', 'wonder', 'project']).optional(),
        unitClass: IdOrIds.optional(),
        unit: IdOrIds.optional(),
        building: IdOrIds.optional(),
        district: IdOrIds.optional(),
        wonder: IdOrIds.optional(),
      })
      .default({}),
  }),
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

const ModifyPurchaseCost = z.strictObject({
  effect: z.literal('modify_purchase_cost'),
  params: z.strictObject({ percent: Percent }),
  target: PlayerTarget,
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
]);
export type Effect = z.infer<typeof Effect>;
export const EFFECT_TYPES = Effect.options.map((o) => o.shape.effect.value);
