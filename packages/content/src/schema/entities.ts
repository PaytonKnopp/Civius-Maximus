import { z } from 'zod';
import { Elevation, Id, ResourceClass, Text, YieldMap } from './common';

/** An inclusive range on a 0-100 scale (temperature, moisture, latitude). */
const Range100 = z
  .tuple([z.int().min(0).max(100), z.int().min(0).max(100)])
  .refine(([lo, hi]) => lo <= hi, 'the first number must not be bigger than the second');
import { Effect } from './effects';

/**
 * Every content file holds one entity or an array of entities, each tagged with `type`.
 * Adding a content type = add a schema here, add it to ENTITY_SCHEMAS, and teach refs.ts
 * which of its fields point at other content.
 */

export const YieldDef = z.strictObject({
  type: z.literal('yield'),
  id: Id,
  name: Text,
  /** Placeholder icon (emoji) until art exists. */
  icon: z.string().min(1),
  /** Display order in the top bar and breakdowns (lower first). */
  order: z.int().default(100),
});

export const TerrainDef = z.strictObject({
  type: z.literal('terrain'),
  id: Id,
  name: Text,
  yields: YieldMap.default({}),
  moveCost: z.int().min(1).default(1),
  water: z.boolean().default(false),
  /** Deep water needs a later tech to enter. */
  deepWater: z.boolean().default(false),
  freshWater: z.boolean().default(false),
  defense: z.int().default(0),
  appeal: z.int().default(0),
  /** Which elevations this terrain can have. Water is always flat. */
  elevations: z.array(Elevation).min(1).default(['flat']),
  /** Placeholder map color until art exists. */
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a hex color like #6b8f3a'),
  /**
   * Where map generation puts this land terrain: a box of temperature and moisture (0-100).
   * When boxes overlap, the higher priority wins. Water terrains are placed by `rules.mapgen`.
   */
  generation: z
    .strictObject({
      temperature: Range100,
      moisture: Range100,
      priority: z.int().default(0),
    })
    .optional(),
});

export const FeatureDef = z.strictObject({
  type: z.literal('feature'),
  id: Id,
  name: Text,
  /** Added on top of the terrain's yields. */
  yields: YieldMap.default({}),
  moveCostExtra: z.int().min(0).default(0),
  impassable: z.boolean().default(false),
  defense: z.int().default(0),
  appeal: z.int().default(0),
  freshWater: z.boolean().default(false),
  removable: z.boolean().default(false),
  blocksSight: z.boolean().default(false),
  requiresRiver: z.boolean().default(false),
  validTerrains: z.array(Id).min(1),
  validElevations: z.array(Elevation).min(1).default(['flat']),
  /** Placeholder map color until art exists. */
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'must be a hex color like #2f5d34')
    .optional(),
  /** Map generation: `chance` percent of eligible tiles get it, within the climate ranges given. */
  generation: z
    .strictObject({
      chance: z.int().min(0).max(100),
      temperature: Range100.optional(),
      moisture: Range100.optional(),
      latitude: Range100.optional(),
      /** Features are tried in this order (lower first); the first that passes is placed. */
      order: z.int().default(100),
    })
    .optional(),
});

export const ResourceDef = z.strictObject({
  type: z.literal('resource'),
  id: Id,
  name: Text,
  class: ResourceClass,
  yields: YieldMap.default({}),
  /** Luxury: happiness for the owning settlement (and nearby ones, per rules). */
  happiness: z.int().min(0).default(0),
  /** Strategic: stockpile gained per turn once improved. */
  stockpilePerTurn: z.int().min(0).default(0),
  /** The resource can appear on any of these terrains... */
  validTerrains: z.array(Id).default([]),
  /** ...or on any of these features. */
  validFeatures: z.array(Id).default([]),
  validElevations: z.array(Elevation).min(1).default(['flat', 'hills']),
  /** Relative placement frequency for map generation. */
  frequency: z.int().min(0).default(10),
});

/** Global rule constants. Exactly one `rules` entity exists; mods change it with patches. */
export const RulesDef = z.strictObject({
  type: z.literal('rules'),
  id: z.literal('rules'),
  settlements: z.strictObject({
    minDistance: z.int().min(1),
    workRadius: z.int().min(1),
    ownRadius: z.int().min(1),
    centerMinimumYields: YieldMap,
    foodPerCitizen: z.int().min(0),
    growth: z.strictObject({ base: z.number(), perPop: z.number(), exponent: z.number() }),
    borderGrowth: z.strictObject({ base: z.number(), perTile: z.number(), exponent: z.number() }),
    startingLimit: z.int().min(1),
    /** Tiles claimed around a new settlement (1 = the 6 neighbors). */
    startingRadius: z.int().min(0).max(3),
    /** The building every player's first settlement gets for free. */
    capitalBuilding: Id,
    /** Percent of a town's production that becomes gold. */
    townGoldPercent: z.int().min(0).max(1000),
    /** Gold to turn a town into a city: `base + perCity × cities you already have`. */
    townUpgrade: z.strictObject({ base: z.int().min(0), perCity: z.int().min(0) }),
    purchase: z.strictObject({
      /** Gold cost of buying a unit or building = production cost × this. */
      goldPerProduction: z.int().min(1),
      /** Tile cost = `tileBase + tilePerAcquired × tiles acquired + tilePerDistance × distance`. */
      tileBase: z.int().min(0),
      tilePerAcquired: z.int().min(0),
      tilePerDistance: z.int().min(0),
    }),
    happiness: z.strictObject({
      /** Every settlement starts with this much. */
      base: z.int(),
      /** One unhappiness per this many citizens. */
      citizensPerUnhappy: z.int().min(1),
      perMaintainedBuilding: z.int().min(0),
      /** In every settlement, for each settlement you have over the settlement limit. */
      perSettlementOverLimit: z.int().min(0),
      /** At or above: thriving. */
      thrivingAt: z.int(),
      /** At or below: unrest. Between 0 and this: unhappy. */
      unrestAt: z.int().max(-1),
      thrivingYieldPercent: z.int().min(0),
      thrivingGrowthPercent: z.int().min(0),
      /** Applied per point below zero (a negative number). */
      unhappyYieldPercentPerPoint: z.int().max(0),
      unrestYieldPercent: z.int().max(0),
    }),
    /** How auto-assign values yields when picking tiles for citizens (focus triples one). */
    citizenWeights: YieldMap,
  }),
  elevation: z.strictObject({
    hills: z.strictObject({
      yields: YieldMap,
      moveCostExtra: z.int().min(0),
      defense: z.int(),
      sightBonus: z.int().min(0),
    }),
    mountain: z.strictObject({
      yields: YieldMap,
      passable: z.boolean(),
      blocksSight: z.boolean(),
      appeal: z.int(),
    }),
  }),
  rivers: z.strictObject({
    crossingEndsMove: z.boolean(),
    attackAcrossPenalty: z.int().min(0),
  }),
  movement: z.strictObject({
    /** Civ 5 rule (D3): a unit with any MP left may always enter one tile. */
    canAlwaysMoveOneTile: z.boolean(),
  }),
  luxuryHappinessRadius: z.int().min(0),
  units: z.strictObject({
    /** Units of one player allowed on a tile, per layer. Other players' units never share a tile. */
    stacking: z.strictObject({
      military: z.int().min(1),
      civilian: z.int().min(1),
      support: z.int().min(1),
    }),
    /** Every player starts with these units on their start tile (and next to it if crowded). */
    startingUnits: z.array(Id).min(1),
    /** Land units may embark onto coast from the start (later this comes from a tech). */
    embarkFromStart: z.boolean(),
    /** Sight of embarked land units. */
    embarkedSight: z.int().min(0),
  }),
  mapgen: z.strictObject({
    coastTerrain: Id,
    oceanTerrain: Id,
    lakeTerrain: Id,
    /** Used when no terrain's climate box matches a land tile. */
    fallbackLandTerrain: Id,
    /** Enclosed water bodies up to this many tiles become lakes. */
    maxLakeSize: z.int().min(0),
    /** One inland lake per this many land tiles. */
    landTilesPerLake: z.int().min(1),
    /** Rows of ocean forced at the top and bottom of the map. */
    polarRows: z.int().min(0),
    /** One resource per this many eligible tiles. */
    resourceDensity: z.strictObject({
      sparse: z.int().min(1),
      standard: z.int().min(1),
      abundant: z.int().min(1),
    }),
    start: z.strictObject({
      /** Minimum total food / production on the tiles within 2 of a start; topped up with bonus resources. */
      minFood: z.int().min(0),
      minProduction: z.int().min(0),
      freshWaterBonus: z.int().min(0),
      coastalBonus: z.int().min(0),
      /** Balanced starts: every start's score is raised to at least this percent of the best one. */
      balancedPercent: z.int().min(0).max(100),
    }),
  }),
});

/** A family of units sharing rules: domain, stacking layer, whether it fights. */
export const UnitClassDef = z.strictObject({
  type: z.literal('unitClass'),
  id: Id,
  name: Text,
  domain: z.enum(['land', 'sea', 'air']),
  /** Which stacking layer the unit occupies (see rules.units.stacking). */
  layer: z.enum(['military', 'civilian', 'support']),
  /** Military units exert zone of control and can fight. */
  combat: z.boolean(),
  /** Land units of this class can embark onto water (once the player can embark). */
  embarks: z.boolean().default(true),
  ignoresZoc: z.boolean().default(false),
});

/** A unit type: stats, special actions, and how it looks. */
export const UnitDef = z.strictObject({
  type: z.literal('unit'),
  id: Id,
  name: Text,
  class: Id,
  /** Movement points per turn (whole points). */
  movement: z.int().min(0).max(20),
  sight: z.int().min(0).max(10).default(2),
  strength: z.int().min(0).default(0),
  rangedStrength: z.int().min(0).default(0),
  range: z.int().min(0).default(0),
  /** Production cost. 0 = can't be built. */
  cost: z.int().min(0).default(0),
  /** Citizens the settlement gives up when this unit is finished (settlers: 1). */
  populationCost: z.int().min(0).default(0),
  /** Special actions this unit can take. */
  actions: z.array(z.enum(['found_settlement'])).default([]),
  /** Sea units: can enter deep ocean. */
  deepWater: z.boolean().default(false),
  /** Every tile costs 1 movement (e.g. some scouts and cavalry). */
  ignoresTerrainCost: z.boolean().default(false),
  ignoresZoc: z.boolean().default(false),
  /** Short placeholder glyph until icons exist. */
  icon: z.string().min(1).max(3),
  /** Which 3D model family the renderer uses. */
  model: z
    .enum(['settler', 'warrior', 'scout', 'archer', 'cavalry', 'ship', 'generic'])
    .default('generic'),
});

/** A map type the host can pick in the lobby: a generator algorithm plus its parameters. */
export const MapScriptDef = z.strictObject({
  type: z.literal('mapScript'),
  id: Id,
  name: Text,
  description: Text.optional(),
  algorithm: z.enum(['continents', 'pangaea', 'archipelago', 'fractal']),
  /** Percent of the map that's land. */
  landPercent: z.int().min(5).max(90),
  /** Percent of land that's mountains / hills. */
  mountainPercent: z.int().min(0).max(50),
  hillPercent: z.int().min(0).max(60),
  /** For `continents`: how many. */
  continents: z.int().min(1).max(8).default(2),
  /** Starts are only placed on landmasses with at least this many tiles. */
  minStartLandmass: z.int().min(1).default(20),
  /** One river per this many land tiles. */
  landTilesPerRiver: z.int().min(5).default(35),
  /** Noise detail: higher = smaller, more scattered landmasses. */
  detail: z.int().min(2).max(32).default(6),
});

/** A map size the host can pick in the lobby. */
export const MapSizeDef = z.strictObject({
  type: z.literal('mapSize'),
  id: Id,
  name: Text,
  width: z.int().min(16).max(256),
  height: z.int().min(12).max(160),
  /** Recommended number of players. */
  players: z.int().min(1).max(16),
  /** Display order in the lobby. */
  order: z.int().default(100),
});

/** Display text for one locale. Strings have no ID; keys are global across packages. */
export const StringsDef = z.strictObject({
  type: z.literal('strings'),
  locale: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'must be a locale like "en" or "pt-BR"'),
  entries: z.record(z.string().regex(/^[a-z0-9_.]+$/, 'keys use lowercase, digits, _ and .'), Text),
});

const PatchPath = z
  .string()
  .regex(/^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$/, 'must be a dotted path like "yields.food"');

export const PatchOp = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('set'), path: PatchPath, value: z.unknown() }),
  z.strictObject({ op: z.literal('append'), path: PatchPath, value: z.unknown() }),
  /** Removes an array element equal to `value`, or deletes the field when no value is given. */
  z.strictObject({ op: z.literal('remove'), path: PatchPath, value: z.unknown().optional() }),
  /** Deletes the whole target entity. */
  z.strictObject({ op: z.literal('delete') }),
]);
export type PatchOp = z.infer<typeof PatchOp>;

export const PatchDef = z.strictObject({
  type: z.literal('patch'),
  target: Id,
  ops: z.array(PatchOp).min(1),
});

/** A named list of effects (abilities, policies...), standalone until those types exist. */
export const AbilityDef = z.strictObject({
  type: z.literal('ability'),
  id: Id,
  name: Text,
  description: Text.optional(),
  effects: z.array(Effect).min(1),
});

/**
 * Where an improvement can be placed without a resource. A tile qualifies if it matches every
 * field given. A tile with a feature only qualifies if that feature is listed in `features`.
 */
const ImprovementSite = z.strictObject({
  terrains: z.array(Id).min(1).optional(),
  elevations: z.array(Elevation).min(1).default(['flat', 'hills']),
  /** Features the tile may have. */
  features: z.array(Id).default([]),
  /** The tile must have one of `features` (e.g. a woodcutter needs woods). */
  needsFeature: z.boolean().default(false),
});

/** A tile improvement (farm, mine...). Settlements build them as they grow (docs/03, "Growth"). */
export const ImprovementDef = z.strictObject({
  type: z.literal('improvement'),
  id: Id,
  name: Text,
  /** Short placeholder glyph until icons exist. */
  icon: z.string().min(1).max(3),
  yields: YieldMap.default({}),
  /** Goes on tiles with any of these resources, whatever the terrain or feature... */
  resources: z.array(Id).default([]),
  /** ...or on tiles matching any of these sites. */
  sites: z.array(ImprovementSite).default([]),
  /** When several improvements fit a tile, the lower number is proposed first. */
  order: z.int().default(100),
  /** Placeholder map color until models exist. */
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'must be a hex color like #c9a74a')
    .optional(),
});

/** A building in a settlement. Districts arrive in M8; these sit in the settlement center. */
export const BuildingDef = z.strictObject({
  type: z.literal('building'),
  id: Id,
  name: Text,
  description: Text.optional(),
  icon: z.string().min(1).max(3),
  /** Production cost. 0 = can't be built (e.g. the Palace, which is granted). */
  cost: z.int().min(0),
  /** Gold per turn. */
  maintenance: z.int().min(0).default(0),
  /** Added to the settlement's yields. */
  yields: YieldMap.default({}),
  happiness: z.int().default(0),
  /** Only in a settlement on a river / on the coast. */
  requiresRiver: z.boolean().default(false),
  requiresCoast: z.boolean().default(false),
  /** Towns can buy buildings but not build them; some are city-only. */
  cityOnly: z.boolean().default(false),
});

/** A civilization: its names and colors (abilities and uniques arrive with the leader kits). */
export const CivDef = z.strictObject({
  type: z.literal('civ'),
  id: Id,
  name: Text,
  adjective: Text,
  colors: z.strictObject({
    primary: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a hex color like #8e1b1b'),
    secondary: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a hex color like #e8c66a'),
  }),
  /** Settlement names in founding order; the first is the capital. */
  cityNames: z.array(Text).min(1),
});

/** Schemas for entities that have an `id` and are stored in compiled content. */
export const ENTITY_SCHEMAS = {
  yield: YieldDef,
  terrain: TerrainDef,
  feature: FeatureDef,
  resource: ResourceDef,
  ability: AbilityDef,
  mapScript: MapScriptDef,
  mapSize: MapSizeDef,
  unitClass: UnitClassDef,
  unit: UnitDef,
  improvement: ImprovementDef,
  building: BuildingDef,
  civ: CivDef,
  rules: RulesDef,
} as const;

export type EntityType = keyof typeof ENTITY_SCHEMAS;
export const ENTITY_TYPES = Object.keys(ENTITY_SCHEMAS) as EntityType[];

/** All schemas a content file may use, including the non-entity `strings` and `patch`. */
export const FILE_ENTRY_SCHEMAS = { ...ENTITY_SCHEMAS, strings: StringsDef, patch: PatchDef };
export type FileEntryType = keyof typeof FILE_ENTRY_SCHEMAS;

export type YieldDef = z.infer<typeof YieldDef>;
export type TerrainDef = z.infer<typeof TerrainDef>;
export type FeatureDef = z.infer<typeof FeatureDef>;
export type ResourceDef = z.infer<typeof ResourceDef>;
export type AbilityDef = z.infer<typeof AbilityDef>;
export type RulesDef = z.infer<typeof RulesDef>;
export type MapScriptDef = z.infer<typeof MapScriptDef>;
export type MapSizeDef = z.infer<typeof MapSizeDef>;
export type UnitClassDef = z.infer<typeof UnitClassDef>;
export type UnitDef = z.infer<typeof UnitDef>;
export type ImprovementDef = z.infer<typeof ImprovementDef>;
export type BuildingDef = z.infer<typeof BuildingDef>;
export type CivDef = z.infer<typeof CivDef>;
export type StringsDef = z.infer<typeof StringsDef>;
export type PatchDef = z.infer<typeof PatchDef>;

export interface EntityByType {
  yield: YieldDef;
  terrain: TerrainDef;
  feature: FeatureDef;
  resource: ResourceDef;
  ability: AbilityDef;
  mapScript: MapScriptDef;
  mapSize: MapSizeDef;
  unitClass: UnitClassDef;
  unit: UnitDef;
  improvement: ImprovementDef;
  building: BuildingDef;
  civ: CivDef;
  rules: RulesDef;
}
export type AnyEntity = EntityByType[EntityType];
