import type { CompiledContent, Elevation } from '@cx/content';

/** What the effects system needs to know about one map tile. */
export interface TileFacts {
  terrain: string;
  feature: string | null;
  elevation: Elevation;
  resource: string | null;
  /** An `improvement` content id (missing = none). */
  improvement?: string | null;
  /** True if a river runs along any edge of the tile. */
  river: boolean;
  ownerId: string | null;
}

/** A tile, its neighbors, and whose point of view the effects are evaluated from. */
export interface TileContext {
  content: CompiledContent;
  tile: TileFacts;
  /** The up-to-6 adjacent tiles (fewer at the map edge). */
  neighbors: readonly TileFacts[];
  /** The player whose abilities, policies etc. are being applied. */
  playerId: string;
}
