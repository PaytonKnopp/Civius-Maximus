import type { CompiledContent, Elevation } from '@cx/content';

/** What the effects system needs to know about one map tile. */
export interface TileFacts {
  terrain: string;
  feature: string | null;
  elevation: Elevation;
  resource: string | null;
  /** An `improvement` content id (missing = none). */
  improvement?: string | null;
  /** A `district` content id (missing = none). */
  district?: string | null;
  /** A `wonder` content id (missing = none). */
  wonder?: string | null;
  /** The tile is a settlement's center. */
  center?: boolean;
  /** True if a river runs along any edge of the tile. */
  river: boolean;
  ownerId: string | null;
}

/** What settlement conditions look at. */
export interface SettlementFacts {
  kind: 'town' | 'city';
  capital: boolean;
  population: number;
  buildings: readonly string[];
  districts?: readonly string[];
  /** A river runs along its center tile. */
  onRiver?: boolean;
  /** Soldiers trained there so far. */
  unitsTrained?: number;
  /** Its established governor (a `governor` id). */
  governor?: string;
}

/** What player conditions look at (techs and civics finished, government...). */
export interface PlayerFacts {
  techs: readonly string[];
  civics: readonly string[];
  government: string;
  celebrating: boolean;
  /** The `order` of the player's era (the latest era of a finished tech or civic). */
  eraOrder?: number;
}

/**
 * Where a condition is evaluated: whose point of view, and the tile, settlement and player facts
 * that are known there. A condition about something that isn't known (a tile condition on a
 * settlement-wide effect) is false.
 */
export interface ConditionContext {
  content: CompiledContent;
  /** The player whose abilities, policies etc. are being applied. */
  playerId: string;
  tile?: TileFacts;
  /** The up-to-6 adjacent tiles (fewer at the map edge). */
  neighbors?: readonly TileFacts[];
  settlement?: SettlementFacts;
  player?: PlayerFacts;
}

/** A tile, its neighbors, and whose point of view the effects are evaluated from. */
export interface TileContext extends ConditionContext {
  tile: TileFacts;
  neighbors: readonly TileFacts[];
}
