import { z } from 'zod';

/**
 * Content IDs are globally unique across all content types, snake_case, and start with a letter.
 * Prefixes are conventional, not required: `unit_warrior`, `leader_caesar`, `grassland`.
 */
export const Id = z
  .string()
  .regex(/^[a-z][a-z0-9_]*$/, 'must be snake_case: lowercase letters, digits and underscores');
export type Id = z.infer<typeof Id>;

/** One ID or a list of IDs. */
export const IdOrIds = z.union([Id, z.array(Id).min(1)]);
export type IdOrIds = z.infer<typeof IdOrIds>;

/**
 * Display text. Either literal text, or a string key starting with `@` that is looked up in the
 * package's `strings` files (so mods can be translated later).
 */
export const Text = z.string().min(1);
export type Text = z.infer<typeof Text>;

/** Yield amounts keyed by yield ID, e.g. `{ "food": 2, "production": 1 }`. Halves are allowed. */
export const YieldMap = z.record(Id, z.number().multipleOf(0.5));
export type YieldMap = z.infer<typeof YieldMap>;

export const Elevation = z.enum(['flat', 'hills', 'mountain']);
export type Elevation = z.infer<typeof Elevation>;

export const ResourceClass = z.enum(['bonus', 'luxury', 'strategic']);
export type ResourceClass = z.infer<typeof ResourceClass>;
