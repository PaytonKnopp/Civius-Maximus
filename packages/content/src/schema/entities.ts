import { z } from 'zod';
import { Elevation, Id, ResourceClass, Text, YieldMap } from './common';

/** An inclusive range on a 0-100 scale (temperature, moisture, latitude). */
const Range100 = z
  .tuple([z.int().min(0).max(100), z.int().min(0).max(100)])
  .refine(([lo, hi]) => lo <= hi, 'the first number must not be bigger than the second');
import { Adjacency, Effect, SlotKind, TileMatch } from './effects';

/** Content that only becomes available with a tech or civic. */
const requires = {
  requiresTech: Id.optional(),
  requiresCivic: Id.optional(),
};

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
    /** What every citizen adds on top of the tile it works (e.g. 0.5 science). */
    citizenYields: YieldMap,
    districts: z.strictObject({
      /** Specialty districts allowed: `base + floor((population − 1) / populationPer)`. */
      base: z.int().min(0),
      populationPer: z.int().min(1),
      /** Each specialty district gets this much of its main yield per neighboring district. */
      neighborBonus: z.number().multipleOf(0.5),
      /** District cost rises this many percent for each tech and civic finished. */
      costPerProgressPercent: z.int().min(0),
    }),
    specialization: z.strictObject({
      minPopulation: z.int().min(1),
      /** Gold to change a town's specialization (choosing the first one is free). */
      changeCost: z.int().min(0),
      /** Food or production is sent to the nearest city within this many tiles. */
      sendRange: z.int().min(1),
    }),
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
    /** Moving along a road (road to road, settlement centers count) costs this percent of 1 MP. */
    roadCostPercent: z.int().min(1).max(100),
  }),
  /** Trade routes (docs/04-advanced-systems.md, "Trade routes"). */
  trade: z.strictObject({
    /** How many turns a route runs before its trader comes home. */
    routeTurns: z.int().min(1),
    /** The farthest a destination can be, in tiles along the route. */
    range: z.int().min(1),
    /** What a route to one of your own settlements gives the settlement it starts from. */
    domestic: YieldMap,
    /** What a route to another player's settlement gives the settlement it starts from... */
    international: YieldMap,
    /** ...plus this for each district at the destination... */
    perDestinationDistrict: YieldMap,
    /** ...and what the destination settlement gets. */
    destination: YieldMap,
  }),
  luxuryHappinessRadius: z.int().min(0),
  progress: z.strictObject({
    /** Percent of a tech's or civic's cost a boost pays. */
    boostPercent: z.int().min(0).max(100),
    /** Everyone starts with this government. */
    startingGovernment: Id,
    /** Gold per policy card changed outside the free window after finishing a civic. */
    policySwapCost: z.int().min(0),
    /** Gold to change government outside the free window. */
    governmentChangeCost: z.int().min(0),
    celebration: z.strictObject({
      /** Happiness surplus needed: `base + perCelebration × celebrations so far`. */
      base: z.int().min(1),
      perCelebration: z.int().min(0),
      turns: z.int().min(1),
      /** What a celebration gives while it lasts (e.g. a bonus policy slot, +10% production). */
      effects: z.array(Effect).default([]),
    }),
  }),
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
    /** Gold of unit upkeep each player gets for free every turn. */
    freeUpkeep: z.int().min(0),
  }),
  /** Combat (docs/03-core-mechanics.md, section 5). */
  combat: z.strictObject({
    /** Damage, in HP, between two units of equal strength. */
    baseDamage: z.int().min(1),
    /** Damage scales by e^(strengthScale × the strength difference). */
    strengthScale: z.number().min(0).max(0.5),
    /** Each hit varies by up to ± this percent. */
    randomPercent: z.int().min(0).max(100),
    /** Units' full health. */
    maxHealth: z.int().min(1),
    /** Strength for being fortified 1, 2... turns (the last value holds after that). */
    fortify: z.array(z.int()).min(1),
    /** Attacker: per other friendly military unit next to the target (melee only). */
    flanking: z.int(),
    /** Defender: per friendly military unit next to it. */
    support: z.int(),
    /** Strength lost for every 10 HP missing. */
    woundedPer10: z.int().min(0),
    /** Melee attacks from water onto land. */
    amphibiousPenalty: z.int().min(0),
    /** Embarked units defend with at most this strength. */
    embarkedStrength: z.int().min(0),
    /** XP per fight: for the attacker, the defender, and each commander with them in its radius. */
    xp: z.strictObject({
      attack: z.int().min(0),
      defend: z.int().min(0),
      commander: z.int().min(0),
    }),
    /** HP a unit regains at the end of a turn it didn't act, by where it stands. */
    heal: z.strictObject({
      enemy: z.int().min(0),
      neutral: z.int().min(0),
      own: z.int().min(0),
      settlement: z.int().min(0),
    }),
    settlement: z.strictObject({
      cityHealth: z.int().min(1),
      townHealth: z.int().min(1),
      /** Strength = the best unit strength the owner has unlocked + this. */
      cityStrengthBonus: z.int(),
      townStrengthBonus: z.int(),
      /** Extra strength while walls stand. */
      wallsStrength: z.int(),
      /** Range of the once-a-turn ranged strike. */
      strikeRange: z.int().min(0),
      /** HP and walls regained per turn when not attacked that turn. */
      heal: z.int().min(0),
      wallsRepair: z.int().min(0),
      /** Percent of citizens lost when captured. */
      capturePopulationLoss: z.int().min(0).max(100),
    }),
    /** Turns a war lasts before peace can be offered. */
    minWarTurns: z.int().min(0),
    /** XP needed for the 1st, 2nd... promotion (the last value repeats). */
    promotionXp: z.array(z.int().min(1)).min(1),
    /**
     * War support (from Civ VII): each side of a war has a score. The side behind loses
     * happiness in every settlement, so long, losing wars get harder to keep up.
     */
    warSupport: z.strictObject({
      /** The side that's declared on starts this far ahead. */
      surprise: z.int().min(0),
      /** For each enemy unit destroyed. */
      kill: z.int().min(0),
      /** For each settlement taken. */
      capture: z.int().min(0),
      /** The most one side can lead by. */
      max: z.int().min(1),
      /** Unhappiness per point behind, in every settlement, up to `maxUnhappiness`. */
      unhappinessPerPoint: z.int().min(0),
      maxUnhappiness: z.int().min(0),
    }),
  }),
  /** Score (docs/03-core-mechanics.md, section 11): decides the score victory at the turn limit. */
  score: z.strictObject({
    perCitizen: z.int().min(0),
    perTown: z.int().min(0),
    perCity: z.int().min(0),
    perTech: z.int().min(0),
    perCivic: z.int().min(0),
    perWonder: z.int().min(0),
    perDistrict: z.int().min(0),
    /** Per era reached beyond the first. */
    perEra: z.int().min(0),
    /** Per enemy unit destroyed. */
    perKill: z.int().min(0),
  }),
  /** Diplomacy (docs/04-advanced-systems.md, "Diplomacy & deals"). */
  diplomacy: z.strictObject({
    /** Influence every player earns each turn, before buildings and policies. */
    baseInfluence: z.int().min(0),
    /** How long a declared friendship and an alliance last (they can be renewed). */
    friendshipTurns: z.int().min(1),
    allianceTurns: z.int().min(1),
    /** Turns of enforced peace after a war ends. */
    peaceTreatyTurns: z.int().min(0),
    /** Influence each side pays to sign a friendship or an alliance, and to denounce. */
    friendshipCost: z.int().min(0),
    allianceCost: z.int().min(0),
    denounceCost: z.int().min(0),
    /** A war declared without denouncing the target within this many turns is a surprise war. */
    denounceWarning: z.int().min(0),
    /** The most turns a deal's per-turn payments can run. */
    maxDealTurns: z.int().min(1),
    /** Unanswered proposals expire after this many turns. */
    proposalTurns: z.int().min(1),
    /** How long surprise wars, broken deals and razed settlements are remembered, in turns. */
    memoryTurns: z.int().min(1),
    /** Opinion points: how an AI leader's view of a player is built up. */
    opinion: z.strictObject({
      teammate: z.int(),
      friends: z.int(),
      allies: z.int(),
      atWar: z.int(),
      sharedEnemy: z.int(),
      /** Both have changed to the same government. */
      sameGovernment: z.int(),
      /** +1 for every this many turns since their last war (or the start), up to the max. */
      longPeacePer: z.int().min(1),
      longPeaceMax: z.int().min(0),
      denouncedUs: z.int(),
      weDenounced: z.int(),
      /** A surprise war on us (fades over `memoryTurns`). */
      surpriseWarOnUs: z.int(),
      /** Each surprise war on anyone else (fades). */
      surpriseWarOnOthers: z.int(),
      brokeDeal: z.int(),
      razed: z.int(),
      /** Per settlement of theirs within `nearDistance` of ours, up to `nearMax` of them. */
      settledNear: z.int(),
      nearDistance: z.int().min(1),
      nearMax: z.int().min(0),
      /** Per deal with us still running. */
      perDeal: z.int(),
      /** Per trade route between us (up to 2). */
      tradeRoute: z.int(),
    }),
    /** Opinion an AI needs before it agrees to a friendship or an alliance. */
    friendshipOpinion: z.int(),
    allianceOpinion: z.int(),
  }),
  /** Religion (docs/04-advanced-systems.md, "Religion"). */
  religion: z.strictObject({
    /** Faith to found a pantheon. */
    pantheonFaith: z.int().min(0),
    /** At most (players ÷ 2) + this many religions in a game. */
    extraReligions: z.int().min(0),
    /** A religion is founded by a great prophet in a settlement with this district. */
    holyDistrict: Id,
    /** Settlements within this many tiles feel a religion's pressure... */
    pressureRadius: z.int().min(1),
    /** ...this much a turn from each settlement following it (the holy city: `holyCityPressure`). */
    pressurePerFollower: z.int().min(1),
    holyCityPressure: z.int().min(1),
    /** Each trade route carries each end's religion to the other end with this much more. */
    tradeRoutePressure: z.int().min(0),
    /** Each turn, built-up pressure toward every religion falls by this share (so it settles). */
    pressureDecayPercent: z.int().min(1).max(100),
    /** A settlement converts to the religion with the most pressure once that reaches this. */
    convertAt: z.int().min(1),
    /** What a missionary adds where it preaches, and how many times it can. */
    missionaryPressure: z.int().min(1),
    missionaryCharges: z.int().min(1),
  }),
  /** Great people: buying the one you're racing for. */
  greatPeople: z.strictObject({
    /** Gold per point still missing, to recruit a great person now. */
    goldPerPoint: z.int().min(1),
    /** Faith per point still missing, for classes that can be recruited with faith (0 = none). */
    faithPerPoint: z.int().min(0),
    /** The unit a great person walks the map as. */
    unit: Id,
  }),
  /** Hostile camps: raiders that belong to no one and attack everyone. */
  camps: z.strictObject({
    /** One camp per this many land tiles, at the start and at most (0 = no camps). */
    landTilesPerCamp: z.int().min(0),
    /** No camp within this many tiles of a start, a settlement or another camp. */
    minDistance: z.int().min(1),
    /** Every this many turns a new camp may appear, in land no player can see. */
    spawnEvery: z.int().min(1),
    /** A camp trains a raider every this many turns, while it has fewer than `maxUnits`. */
    unitEvery: z.int().min(1),
    maxUnits: z.int().min(1),
    /** Raiders go after anything of a player's within this many tiles. */
    aggroRange: z.int().min(1),
    /** Gold for clearing a camp (moving a military unit onto it). */
    reward: z.int().min(0),
    /** Raider units by era: the latest era any player has reached picks the list. */
    units: z.array(z.strictObject({ era: Id, units: z.array(Id).min(1) })).min(1),
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
  /** Strength bonuses against other classes (e.g. anti-cavalry against cavalry). */
  bonuses: z
    .array(z.strictObject({ vs: z.array(Id).min(1), amount: z.int(), label: Text.optional() }))
    .default([]),
  /** Extra strength when attacking a settlement (siege). */
  vsSettlement: z.int().default(0),
  /** Percent of its damage that gets through standing walls. */
  wallsDamagePercent: z.int().min(0).max(100).default(15),
  /** Takes settlements and captures civilians by moving in (melee and cavalry). */
  captures: z.boolean().default(false),
});

/**
 * Civ uniques: only players of `civ` can have the item, and for them it takes the place of
 * `replaces` (an item of the same kind), which they can't have.
 */
const unique = {
  civ: Id.optional(),
  replaces: Id.optional(),
};

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
  /** Gold per turn to keep. */
  upkeep: z.int().min(0).default(1),
  /** Can be bought with this much faith (missionaries); 0 = not with faith. */
  faithCost: z.int().min(0).default(0),
  ...requires,
  /** Special actions this unit can take. */
  actions: z.array(z.enum(['found_settlement', 'trade_route'])).default([]),
  /** Sea units: can enter deep ocean. */
  deepWater: z.boolean().default(false),
  /** Every tile costs 1 movement (e.g. some scouts and cavalry). */
  ignoresTerrainCost: z.boolean().default(false),
  ignoresZoc: z.boolean().default(false),
  /** Keeps its remaining moves (less one) after attacking. */
  movesAfterAttack: z.boolean().default(false),
  /** Fights at full strength when wounded. */
  ignoresWounds: z.boolean().default(false),
  /** Yields its owner gets each time it destroys an enemy unit (e.g. gold). */
  killYields: YieldMap.default({}),
  /**
   * A commander (docs/03-core-mechanics.md, "Commanders"): packs nearby units to move them as
   * one, gives units in its radius extra strength, and retreats instead of being captured.
   */
  commander: z
    .strictObject({
      /** Units it can carry packed. */
      capacity: z.int().min(1),
      /** Tiles around it where units get its bonuses. */
      radius: z.int().min(0),
      /** Strength for units in its radius. */
      strength: z.int().min(0),
      /** Turns out of action after a retreat. */
      retreatTurns: z.int().min(1),
    })
    .optional(),
  ...unique,
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
  /** The tile must be next to a river. */
  river: z.boolean().default(false),
  /** The tile must be on the edge of the player's territory. */
  edge: z.boolean().default(false),
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
  ...requires,
  /** Placeholder map color until models exist. */
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'must be a hex color like #c9a74a')
    .optional(),
  /** Which 3D model family the renderer uses. */
  model: z
    .enum([
      'farm',
      'mine',
      'quarry',
      'pasture',
      'plantation',
      'camp',
      'boats',
      'woodcutter',
      'generic',
    ])
    .default('generic'),
  /** Bonuses from neighbors (e.g. farms next to farms). */
  adjacency: z.array(Adjacency).default([]),
  /** Combat strength for a unit defending on it. */
  defense: z.int().min(0).default(0),
  ...unique,
});

/** A building in a settlement: in its center, or inside one of its districts. */
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
  /** Needs this building in the settlement first (e.g. a University needs a Library). */
  requiresBuilding: Id.optional(),
  /** Built inside this district (the settlement needs it first). */
  district: Id.optional(),
  /** Outer defenses: HP that attacks must break before they hurt the settlement much. */
  walls: z.int().min(0).default(0),
  /** Effects on the settlement it's in. */
  localEffects: z.array(Effect).default([]),
  /** Effects on the whole empire. */
  effects: z.array(Effect).default([]),
  ...unique,
  ...requires,
});

/** Where a district, wonder or project can go. A tile must pass every rule given. */
const Placement = z.strictObject({
  terrains: z.array(Id).min(1).optional(),
  elevations: z.array(Elevation).min(1).default(['flat', 'hills']),
  /** On water (e.g. a harbor) instead of land. */
  water: z.boolean().default(false),
  /** Features that may stay (others must be absent). Woods, rainforest and marsh are cleared. */
  features: z.array(Id).optional(),
  /** The tile itself must match this. */
  self: TileMatch.optional(),
  /** Each of these must match at least one neighbor. */
  nextTo: z.array(TileMatch).default([]),
  /** At least one neighbor must match one of these. */
  nextToAny: z.array(TileMatch).default([]),
  /** No neighbor may match any of these (e.g. an encampment can't touch the city center). */
  notNextTo: z.array(TileMatch).default([]),
});
export type Placement = z.infer<typeof Placement>;
const anyPlacement = {
  elevations: ['flat', 'hills'] as ('flat' | 'hills' | 'mountain')[],
  water: false,
  nextTo: [],
  nextToAny: [],
  notNextTo: [],
};

/** A district: a tile of specialized buildings with adjacency bonuses (docs/03, section 9). */
export const DistrictDef = z.strictObject({
  type: z.literal('district'),
  id: Id,
  name: Text,
  description: Text.optional(),
  icon: z.string().min(1).max(3),
  /** Base production cost (rises as you progress through the trees). */
  cost: z.int().min(1),
  /** Flat yields to the settlement. */
  yields: YieldMap.default({}),
  adjacency: z.array(Adjacency).default([]),
  /** Counts toward the district limit and gets the bonus for neighboring districts. */
  specialty: z.boolean().default(true),
  /** Only one in the whole empire (e.g. a government plaza). */
  onePerEmpire: z.boolean().default(false),
  happiness: z.int().default(0),
  placement: Placement.default(anyPlacement),
  /** Each building in the district adds one specialist slot; a specialist yields this. */
  specialistYields: YieldMap.default({}),
  localEffects: z.array(Effect).default([]),
  effects: z.array(Effect).default([]),
  ...unique,
  ...requires,
  model: z
    .enum([
      'campus',
      'holy_site',
      'theater',
      'commercial',
      'harbor',
      'industrial',
      'encampment',
      'entertainment',
      'aqueduct',
      'plaza',
      'generic',
    ])
    .default('generic'),
  /** Accent color for the map and UI. */
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a hex color like #5fb8f0'),
});

/** A world wonder: one per world, a big bonus for its builder. */
export const WonderDef = z.strictObject({
  type: z.literal('wonder'),
  id: Id,
  name: Text,
  description: Text,
  icon: z.string().min(1).max(3),
  cost: z.int().min(1),
  era: Id,
  /** Yields to the settlement that built it. */
  yields: YieldMap.default({}),
  happiness: z.int().default(0),
  placement: Placement.default(anyPlacement),
  localEffects: z.array(Effect).default([]),
  effects: z.array(Effect).default([]),
  ...requires,
  model: z
    .enum([
      'pyramid',
      'gardens',
      'stones',
      'temple',
      'library',
      'statue',
      'arena',
      'rock_city',
      'generic',
    ])
    .default('generic'),
});

/** A one-off city project on a tile (e.g. clearing woods for a burst of production). */
export const ProjectDef = z.strictObject({
  type: z.literal('project'),
  id: Id,
  name: Text,
  description: Text,
  icon: z.string().min(1).max(3),
  cost: z.int().min(1),
  /** Removes any of these features from the chosen tile. */
  clears: z.array(Id).min(1),
  /** One-time reward: food to the settlement's store, production to its next item, gold... */
  reward: YieldMap.default({}),
  ...requires,
});

/** A town specialization (docs/03, "Towns vs Cities"): one at a time, from a minimum size. */
export const SpecializationDef = z.strictObject({
  type: z.literal('specialization'),
  id: Id,
  name: Text,
  description: Text,
  icon: z.string().min(1).max(3),
  /** Effects on the town itself. */
  localEffects: z.array(Effect).default([]),
  /** Effects on the whole empire. */
  effects: z.array(Effect).default([]),
  /** Share of the town's food or production sent to its nearest city each turn. */
  send: z
    .strictObject({ yield: z.enum(['food', 'production']), percent: z.int().min(1).max(100) })
    .optional(),
  ...requires,
});

/** A unit promotion (docs/03-core-mechanics.md, "Experience and promotions"). */
export const PromotionDef = z.strictObject({
  type: z.literal('promotion'),
  id: Id,
  name: Text,
  description: Text,
  /** Unit classes that can take it. */
  classes: z.array(Id).min(1),
  /** Its row in the class's tree (shown in order). */
  tier: z.int().min(1).max(5),
  /** Needs any one of these first (empty = available from the start). */
  requires: z.array(Id).default([]),
  /** Strength bonuses, each in the situations it names. */
  strength: z
    .array(
      z.strictObject({
        amount: z.int(),
        when: z.enum(['attack', 'defend', 'always']).default('always'),
        /** Only against these classes, against settlements, or against ranged attacks. */
        vs: z
          .strictObject({
            classes: z.array(Id).min(1).optional(),
            settlement: z.boolean().optional(),
            ranged: z.boolean().optional(),
          })
          .optional(),
        /** Only when the unit stands (defending) or fights from (attacking) such a tile. */
        on: z
          .strictObject({
            features: z.array(Id).min(1).optional(),
            elevations: z.array(Elevation).min(1).optional(),
          })
          .optional(),
      }),
    )
    .default([]),
  movement: z.int().min(0).default(0),
  sight: z.int().min(0).default(0),
  range: z.int().min(0).default(0),
  /** Every tile costs 1 movement. */
  ignoresTerrainCost: z.boolean().default(false),
  /** Only ever given by an effect (a building, an ability), never chosen with XP. */
  granted: z.boolean().default(false),
  /** Commanders: more capacity, radius, or bonuses for units in the radius. */
  command: z
    .strictObject({
      capacity: z.int().min(0).default(0),
      radius: z.int().min(0).default(0),
      /** Strength for units in the radius when they attack / defend. */
      attack: z.int().min(0).default(0),
      defense: z.int().min(0).default(0),
      /** Extra healing each turn for units in the radius. */
      heal: z.int().min(0).default(0),
    })
    .optional(),
});

/** Something a player can do to earn a boost (a share of a tech's or civic's cost). */
export const Goal = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('settlements'), count: z.int().min(1) }),
  z.strictObject({ kind: z.literal('cities'), count: z.int().min(1) }),
  z.strictObject({ kind: z.literal('coastal_settlement') }),
  /** Citizens across all settlements. */
  z.strictObject({ kind: z.literal('population'), count: z.int().min(1) }),
  z.strictObject({
    kind: z.literal('units'),
    count: z.int().min(1),
    unit: z.union([Id, z.array(Id).min(1)]).optional(),
    unitClass: z.union([Id, z.array(Id).min(1)]).optional(),
  }),
  z.strictObject({
    kind: z.literal('improvements'),
    count: z.int().min(1),
    improvement: z.union([Id, z.array(Id).min(1)]).optional(),
  }),
  z.strictObject({
    kind: z.literal('buildings'),
    count: z.int().min(1),
    building: z.union([Id, z.array(Id).min(1)]).optional(),
  }),
  z.strictObject({ kind: z.literal('tiles_owned'), count: z.int().min(1) }),
  z.strictObject({ kind: z.literal('techs'), count: z.int().min(1) }),
  z.strictObject({ kind: z.literal('civics'), count: z.int().min(1) }),
  /** Adopt a government (any but the starting one, or one of these). */
  z.strictObject({
    kind: z.literal('government'),
    government: z.union([Id, z.array(Id).min(1)]).optional(),
  }),
  z.strictObject({ kind: z.literal('policies'), count: z.int().min(1) }),
  z.strictObject({ kind: z.literal('gold'), amount: z.int().min(1) }),
]);
export type Goal = z.infer<typeof Goal>;

/** An age of history. Techs and civics belong to one; the latest one you've reached is your era. */
export const EraDef = z.strictObject({
  type: z.literal('era'),
  id: Id,
  name: Text,
  order: z.int(),
});

const progressShape = {
  id: Id,
  name: Text,
  description: Text.optional(),
  era: Id,
  /** Science (techs) or culture (civics) to finish it. */
  cost: z.int().min(1),
  /** All of these must be finished first. */
  requires: z.array(Id).default([]),
  /** Vertical position in the tree (the column comes from the prerequisites). */
  row: z.int().min(0).max(20).default(0),
  boost: z.strictObject({ text: Text, goal: Goal }).optional(),
  /** Permanent effects once finished (e.g. a higher settlement limit). */
  effects: z.array(Effect).default([]),
};

/** A tech (science tree). Things it unlocks name it in their own `requiresTech`. */
export const TechDef = z.strictObject({ type: z.literal('tech'), ...progressShape });
/** A civic (culture tree). Things it unlocks name it in their own `requiresCivic`. */
export const CivicDef = z.strictObject({ type: z.literal('civic'), ...progressShape });

/** A government: policy slots and its own bonus. */
export const GovernmentDef = z.strictObject({
  type: z.literal('government'),
  id: Id,
  name: Text,
  description: Text.optional(),
  slots: z.strictObject({
    military: z.int().min(0),
    economic: z.int().min(0),
    diplomatic: z.int().min(0),
    wildcard: z.int().min(0),
  }),
  effects: z.array(Effect).default([]),
  requiresCivic: Id.optional(),
  /** Display order. */
  order: z.int().default(100),
});

/** A policy card. Wildcard slots take any card; other slots take cards of their kind. */
export const PolicyDef = z.strictObject({
  type: z.literal('policy'),
  id: Id,
  name: Text,
  description: Text,
  slot: SlotKind,
  effects: z.array(Effect).min(1),
  requiresCivic: Id.optional(),
  /** No longer available once this civic is finished. */
  obsoletedBy: Id.optional(),
});

/** A civilization: its names, colors and ability (its unique items name it with `civ`). */
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
  /** The civ's ability (docs/09-base-roster.md). */
  ability: z
    .strictObject({ name: Text, description: Text, effects: z.array(Effect).default([]) })
    .optional(),
});

/** How an AI leader weighs its choices: 0 (ignores it) to 10 (obsessed). 5 is ordinary. */
const Weight = z.int().min(0).max(10).default(5);
export const Personality = z.strictObject({
  /** Wars, armies, conquest. */
  aggression: Weight,
  /** Settling new land. */
  expansion: Weight,
  science: Weight,
  culture: Weight,
  wonders: Weight,
  faith: Weight,
  /** Gold and trade. */
  gold: Weight,
  /** Ships and the sea. */
  naval: Weight,
  /** Keeping friends, making deals, honoring them. */
  diplomacy: Weight,
  /** Planning districts by adjacency. */
  districts: Weight,
});
export type Personality = z.infer<typeof Personality>;

/**
 * One line of an agenda: compare something about a player with the leader's own and adjust the
 * leader's opinion of them. `more`: they have more than the leader; `less`: under half of the
 * leader's; `any`: they have some (for `atPeace`: they're at peace with everyone); `none`: none.
 */
export const AgendaRule = z.strictObject({
  metric: z.enum(['army', 'units', 'wonders', 'gold', 'captures', 'surpriseWars', 'atPeace']),
  /** For `units`: which classes, or which domain, count. */
  unitClass: z.union([Id, z.array(Id).min(1)]).optional(),
  domain: z.enum(['land', 'sea', 'air']).optional(),
  when: z.enum(['more', 'less', 'any', 'none']),
  amount: z.int(),
  /** Shown in the opinion breakdown ("Respects your army"). */
  label: Text,
});
export type AgendaRule = z.infer<typeof AgendaRule>;

/** A leader (docs/09-base-roster.md): who leads a civ, with an ability, an agenda and an AI personality. */
export const LeaderDef = z.strictObject({
  type: z.literal('leader'),
  id: Id,
  name: Text,
  /** The civ this leader leads unless the lobby says otherwise. */
  civ: Id,
  /** The leader's ability: its name, what it does, and its effects. */
  ability: z.strictObject({
    name: Text,
    description: Text,
    effects: z.array(Effect).default([]),
  }),
  /** What the AI leader cares about in other players (shown in diplomacy). */
  agenda: z.strictObject({
    name: Text,
    description: Text,
    /** How the agenda moves the leader's opinion of each player. */
    rules: z.array(AgendaRule).default([]),
  }),
  personality: Personality,
});

/** A kind of great person (docs/04-advanced-systems.md, "Great people"): its points race. */
export const GreatPersonClassDef = z.strictObject({
  type: z.literal('greatPersonClass'),
  id: Id,
  name: Text,
  icon: z.string().min(1).max(3),
  /** Its great people can found a religion (on a holy district) instead of activating. */
  foundsReligion: z.boolean().default(false),
  /** Can be recruited with faith (`rules.greatPeople.faithPerPoint`) as well as gold. */
  faithRecruit: z.boolean().default(true),
  /** Points for its first great person; each later one costs `costStep` more. */
  baseCost: z.int().min(1),
  costStep: z.int().min(0),
});

/** Something a great person does once, when activated in one of your settlements. */
export const GreatAction = z.discriminatedUnion('kind', [
  /**
   * Yields at once: gold, faith and influence to the treasury; science and culture toward the
   * current tech and civic; production toward the settlement's build; food into its growth.
   */
  z.strictObject({ kind: z.literal('yields'), yields: YieldMap }),
  /** Boosts toward the cheapest techs and civics you can work on. */
  z.strictObject({ kind: z.literal('boosts'), count: z.int().min(1).max(10) }),
  /** A promotion for your soldiers within `radius` of the settlement. */
  z.strictObject({ kind: z.literal('promote'), promotion: Id, radius: z.int().min(0).max(10) }),
]);
export type GreatAction = z.infer<typeof GreatAction>;

/** A named great person: one of a kind in the whole game, earned by the first to the points. */
export const GreatPersonDef = z.strictObject({
  type: z.literal('greatPerson'),
  id: Id,
  name: Text,
  class: Id,
  era: Id,
  /** What they do, for the player. */
  description: Text,
  /** Done once, when activated. */
  activate: z.array(GreatAction).default([]),
  /** Lasting effects for their player once activated. */
  effects: z.array(Effect).default([]),
});

/** A belief (docs/04-advanced-systems.md, "Religion"): a pantheon's, or a religion's. */
export const BeliefDef = z.strictObject({
  type: z.literal('belief'),
  id: Id,
  name: Text,
  description: Text,
  /**
   * `pantheon`: for the player who picks it. `founder`: for the religion's founder.
   * `follower`: for every settlement that follows the religion, whoever owns it.
   */
  kind: z.enum(['pantheon', 'founder', 'follower']),
  effects: z.array(Effect).default([]),
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
  leader: LeaderDef,
  district: DistrictDef,
  wonder: WonderDef,
  project: ProjectDef,
  specialization: SpecializationDef,
  promotion: PromotionDef,
  era: EraDef,
  tech: TechDef,
  civic: CivicDef,
  government: GovernmentDef,
  policy: PolicyDef,
  greatPersonClass: GreatPersonClassDef,
  greatPerson: GreatPersonDef,
  belief: BeliefDef,
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
export type LeaderDef = z.infer<typeof LeaderDef>;
export type EraDef = z.infer<typeof EraDef>;
export type DistrictDef = z.infer<typeof DistrictDef>;
export type WonderDef = z.infer<typeof WonderDef>;
export type ProjectDef = z.infer<typeof ProjectDef>;
export type SpecializationDef = z.infer<typeof SpecializationDef>;
export type PromotionDef = z.infer<typeof PromotionDef>;
export type TechDef = z.infer<typeof TechDef>;
export type CivicDef = z.infer<typeof CivicDef>;
export type GovernmentDef = z.infer<typeof GovernmentDef>;
export type PolicyDef = z.infer<typeof PolicyDef>;
export type GreatPersonClassDef = z.infer<typeof GreatPersonClassDef>;
export type GreatPersonDef = z.infer<typeof GreatPersonDef>;
export type BeliefDef = z.infer<typeof BeliefDef>;
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
  leader: LeaderDef;
  district: DistrictDef;
  wonder: WonderDef;
  project: ProjectDef;
  specialization: SpecializationDef;
  promotion: PromotionDef;
  era: EraDef;
  tech: TechDef;
  civic: CivicDef;
  government: GovernmentDef;
  policy: PolicyDef;
  greatPersonClass: GreatPersonClassDef;
  greatPerson: GreatPersonDef;
  belief: BeliefDef;
  rules: RulesDef;
}
export type AnyEntity = EntityByType[EntityType];
