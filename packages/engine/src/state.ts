import type { SlotKind } from '@cx/content';
import type { MapSettings, MapState } from './map/types';
import type { RngState } from './rng';

export type PlayerId = string;

/** Everything about one game, as plain JSON. Nothing outside this object affects the rules. */
export interface GameState {
  /** Bumped when the state shape changes incompatibly, so old saves can be migrated. */
  stateVersion: 1;
  gameId: string;
  /** Hash of the compiled content (base + mods) this game was started with. */
  contentHash: string;
  settings: GameSettings;
  status: 'playing' | 'ended';
  /** How the game ended, once it has. */
  result: { reason: 'score' | 'conquest' | 'domination'; winner: PlayerId | null } | null;
  /** Starts at 1. */
  turn: number;
  rng: RngState;
  players: Record<PlayerId, PlayerState>;
  /** Player IDs in processing order (sorted when the game is created, never reordered). */
  playerOrder: PlayerId[];
  /** Counter for IDs of things created during play (units, settlements...). */
  nextEntityId: number;
  map: MapState;
  /** Every unit on the map, by id (`u1`, `u2`...). Iterate with `unitIds()` for a stable order. */
  units: Record<UnitId, UnitState>;
  /** Pairs of players at war, as sorted `"a|b"` keys (see `warKey`). */
  wars: string[];
  /** The turn each current war began, by war key. */
  warStarted: Record<string, number>;
  /** Peace offers waiting for an answer, as `"from>to"`. */
  peaceOffers: string[];
  /** War support per war (by war key), per side. The side behind loses happiness. */
  warSupport: Record<string, Record<PlayerId, number>>;
  /** Hostile camps, by id (`c4`...). Their raiders belong to `HOSTILE`. */
  camps: Record<string, CampState>;
  /** Every settlement, by id (`s3`...). Iterate with `settlementIds()` for a stable order. */
  settlements: Record<SettlementId, SettlementState>;
}

export type SettlementId = string;

/** A hostile camp: it trains raiders until a player's military unit moves onto it. */
export interface CampState {
  id: string;
  tile: number;
  /** Raiders it trained that are still alive. */
  units: UnitId[];
  /** The turn it trains its next raider. */
  nextUnit: number;
}

/** Something a city can produce. */
export interface BuildItem {
  kind: 'unit' | 'building' | 'district' | 'wonder' | 'project';
  /** A content id of that kind. */
  id: string;
  /** Where it goes (districts, wonders and projects). */
  tile?: number | undefined;
}

/** Which yield auto-assign favors when picking tiles for citizens. */
export type CitizenFocus =
  'balanced' | 'food' | 'production' | 'gold' | 'science' | 'culture' | 'faith';

/** A town or city (docs/03-core-mechanics.md, section 3). Amounts are fixed-point hundredths. */
export interface SettlementState {
  id: SettlementId;
  owner: PlayerId;
  name: string;
  /** The center tile. */
  tile: number;
  kind: 'town' | 'city';
  capital: boolean;
  founded: number;
  population: number;
  /** Food stored toward the next citizen. */
  food: number;
  /** Culture stored toward the next border tile. */
  culture: number;
  /** Tiles gained by border growth or purchase (raises the cost of the next one). */
  tilesAcquired: number;
  /** Production put into each item started, keyed `unit:unit_warrior` / `building:...`. */
  progress: Record<string, number>;
  /** Cities only: what to build, first item first. */
  queue: BuildItem[];
  /** `building` content ids, in the order they were finished. */
  buildings: string[];
  /** Tiles the citizens work (the center is always worked and isn't listed). */
  worked: number[];
  /** Tiles the player pinned so auto-assign keeps them worked. */
  locked: number[];
  focus: CitizenFocus;
  /** Growth choices waiting: each lets the player develop one tile with an improvement. */
  pendingDevelop: number;
  /** Districts built, in the order they were finished. */
  districts: { id: string; tile: number }[];
  /** World wonders built here. */
  wonders: string[];
  /** Citizens working as specialists, per district id. */
  specialists: Record<string, number>;
  /** Towns: a `specialization` content id. */
  specialization: string | null;
  /** How many times the specialization was chosen (the first is free). */
  specializationChanges: number;
  /** Hit points (full: `rules.combat.settlement.cityHealth` or `townHealth`). */
  health: number;
  /** Outer defense left (full: the `walls` of its buildings). */
  walls: number;
  /** The last turn it was attacked (it doesn't heal that turn). */
  attackedTurn: number | null;
  /** The last turn it made its ranged strike (one a turn). */
  struckTurn: number | null;
  /** Who founded it (liberating returns it to them). */
  founder: PlayerId;
  /** It was founded as its founder's capital (can't be razed). */
  originalCapital: boolean;
  /** Who it was taken from, if it was captured. */
  capturedFrom: PlayerId | null;
  /** Just captured: the new owner chooses keep, raze or liberate (keep, if they end the turn). */
  captureChoice: boolean;
  /** Soldiers trained here (some abilities count them). */
  unitsTrained: number;
}

export type UnitId = string;

export type UnitOrders =
  /** Keep moving toward `target`, continuing automatically on later turns. */
  | { kind: 'move'; target: number }
  /** Asleep until woken (or an enemy comes into view, later). */
  | { kind: 'sleep' }
  /** Dug in for a defense bonus that grows over the first turns (`turns` fortified so far). */
  | { kind: 'fortify'; turns: number };

export interface UnitState {
  id: UnitId;
  owner: PlayerId;
  /** A `unit` content id. */
  type: string;
  tile: number;
  /** Movement points left this turn, in hundredths (200 = 2 MP). */
  moves: number;
  health: number;
  xp: number;
  orders: UnitOrders | null;
  /** Turn on which the player chose "skip" for this unit, so it stops asking for orders. */
  skippedTurn: number | null;
  /** `promotion` content ids, in the order they were taken. */
  promotions: string[];
}

export interface GameSettings {
  seed: string;
  /** The game ends after this turn (score victory). `null` = no limit. */
  turnLimit: number | null;
  map: MapSettings;
  /** Hostile camps (on unless false). */
  camps?: boolean | undefined;
  /** Domination victory (on unless false). */
  domination?: boolean | undefined;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  /** `hostile`: the owner of camp raiders, outside the turn order (see `HOSTILE`). */
  kind: 'human' | 'ai' | 'hostile';
  /** Team number; players on the same team share victory. `null` = no team. */
  team: number | null;
  alive: boolean;
  /** Simultaneous turns: true once the player clicked End Turn this turn. */
  turnEnded: boolean;
  /** Tile index where the player starts (their first settler appears here). */
  startTile: number;
  /** Tiles this player has ever seen (base64 bitset, see bitset.ts). */
  explored: string;
  /** Land units may embark onto water (from rules now, from a tech in M7). */
  canEmbark: boolean;
  /** A `civ` content id. */
  civ: string;
  /** A `leader` content id ('' for the raiders' owner). */
  leader: string;
  /** Treasury, in hundredths. */
  gold: number;
  /** Faith stored, in hundredths (spent from M13). */
  faith: number;
  capital: SettlementId | null;
  /** How many settlements this player has founded (picks the next name). */
  settlementsFounded: number;
  /** Enemy units destroyed (for score). */
  kills: number;
  /** The last turn this player declared a war (some abilities last a while after). */
  declaredWarTurn: number | null;
  /** The tech tree (paid with science) and the civics tree (paid with culture). */
  techs: Track;
  civics: Track;
  /** A `government` content id. */
  government: string;
  /** Policy cards in each kind of slot. */
  policies: Record<SlotKind, string[]>;
  /** Changing policies and government is free this turn (right after finishing a civic). */
  policyWindow: boolean;
  celebration: {
    /** Happiness surplus saved toward the next celebration. */
    store: number;
    /** Celebrations so far (each makes the next one cost more). */
    count: number;
    /** Turns left in the current celebration (0 = not celebrating). */
    turnsLeft: number;
  };
}

/** Progress through one tree. Amounts are in hundredths. */
export interface Track {
  /** Finished, in the order they were finished. */
  done: string[];
  /** Being worked on now. */
  current: string | null;
  /** What comes after `current` (a path chosen through the tree). */
  queue: string[];
  /** Progress on each started node. */
  progress: Record<string, number>;
  /** Nodes whose boost has been earned. */
  boosted: string[];
  /** Earned while nothing was chosen; goes to the next choice. */
  stored: number;
}
