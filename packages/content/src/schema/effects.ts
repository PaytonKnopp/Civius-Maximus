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
  resource: IdOrIds.optional(),
  resourceClass: ResourceClass.optional(),
  river: z.boolean().optional(),
};
const matchesSomething = (m: object) =>
  Object.keys(m).some((k) => k !== 'min' && k in tileMatchShape);
const NEEDS_FIELD =
  'must match on at least one of: terrain, feature, elevation, resource, resourceClass, river';

export const TileMatch = z.strictObject(tileMatchShape).refine(matchesSomething, NEEDS_FIELD);
export type TileMatch = z.infer<typeof TileMatch>;

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { tile_terrain: IdOrIds }
  | { tile_feature: IdOrIds | null }
  | { tile_elevation: Elevation | Elevation[] }
  | { tile_has_resource: IdOrIds | true }
  | { tile_resource_class: ResourceClass }
  | { tile_on_river: boolean }
  | { tile_coastal: boolean }
  | { tile_owned_by_self: boolean }
  | { tile_adjacent_to: TileMatch & { min?: number | undefined } };

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
    z.strictObject({ tile_on_river: z.boolean() }),
    z.strictObject({ tile_coastal: z.boolean() }),
    z.strictObject({ tile_owned_by_self: z.boolean() }),
    z.strictObject({
      tile_adjacent_to: z
        .strictObject({ ...tileMatchShape, min: z.int().min(1).max(6).optional() })
        .refine(matchesSomething, NEEDS_FIELD),
    }),
  ]),
);

/** Which game objects an effect applies to. More scopes (units, settlements, player) come later. */
export const Target = z.strictObject({
  scope: z.literal('tiles'),
  owner: z.enum(['self', 'any']).default('self'),
});
export type Target = z.infer<typeof Target>;

const ModifyYield = z.strictObject({
  effect: z.literal('modify_yield'),
  params: z.union([
    z.strictObject({ yield: Id, amount: z.number().multipleOf(0.5) }),
    z.strictObject({ yield: Id, percent: z.int().min(-100).max(1000) }),
  ]),
  target: Target,
  condition: Condition.optional(),
});

const YieldPerAdjacent = z.strictObject({
  effect: z.literal('yield_per_adjacent'),
  params: z.strictObject({
    yield: Id,
    amount: z.number().multipleOf(0.5),
    /** What adjacent tiles count. */
    per: TileMatch,
    /** Give `amount` for every N matching neighbors (e.g., +1 per 2 woods). Default 1. */
    every: z.int().min(1).max(6).default(1),
  }),
  target: Target,
  condition: Condition.optional(),
});

export const Effect = z.discriminatedUnion('effect', [ModifyYield, YieldPerAdjacent]);
export type Effect = z.infer<typeof Effect>;
export const EFFECT_TYPES = Effect.options.map((o) => o.shape.effect.value);
