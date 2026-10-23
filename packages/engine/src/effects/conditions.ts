import type { Condition, Elevation, TileMatch } from '@cx/content';
import type { TileContext, TileFacts } from './tile';

function oneOf<T>(value: T | null, wanted: T | readonly T[]): boolean {
  return value !== null && (Array.isArray(wanted) ? wanted.includes(value) : value === wanted);
}

/** True if a tile matches every field set on `match`. */
export function tileMatches(ctx: TileContext, tile: TileFacts, match: TileMatch): boolean {
  if (match.terrain !== undefined && !oneOf(tile.terrain, match.terrain)) return false;
  if (match.feature !== undefined && !oneOf(tile.feature, match.feature)) return false;
  if (match.elevation !== undefined && !oneOf<Elevation>(tile.elevation, match.elevation))
    return false;
  if (match.resource !== undefined && !oneOf(tile.resource, match.resource)) return false;
  if (match.resourceClass !== undefined) {
    const res = tile.resource === null ? undefined : ctx.content.entities.resource[tile.resource];
    if (res?.class !== match.resourceClass) return false;
  }
  if (match.river !== undefined && tile.river !== match.river) return false;
  return true;
}

function isWater(ctx: TileContext, tile: TileFacts): boolean {
  return ctx.content.entities.terrain[tile.terrain]?.water ?? false;
}

/** Evaluates a condition for the context's tile. */
export function evaluateCondition(ctx: TileContext, c: Condition): boolean {
  const { tile } = ctx;
  if ('all' in c) return c.all.every((x) => evaluateCondition(ctx, x));
  if ('any' in c) return c.any.some((x) => evaluateCondition(ctx, x));
  if ('not' in c) return !evaluateCondition(ctx, c.not);
  if ('tile_terrain' in c) return oneOf(tile.terrain, c.tile_terrain);
  if ('tile_feature' in c) {
    return c.tile_feature === null ? tile.feature === null : oneOf(tile.feature, c.tile_feature);
  }
  if ('tile_elevation' in c) return oneOf<Elevation>(tile.elevation, c.tile_elevation);
  if ('tile_has_resource' in c) {
    return c.tile_has_resource === true
      ? tile.resource !== null
      : oneOf(tile.resource, c.tile_has_resource);
  }
  if ('tile_resource_class' in c)
    return tileMatches(ctx, tile, { resourceClass: c.tile_resource_class });
  if ('tile_on_river' in c) return tile.river === c.tile_on_river;
  if ('tile_coastal' in c) {
    const coastal = !isWater(ctx, tile) && ctx.neighbors.some((n) => isWater(ctx, n));
    return coastal === c.tile_coastal;
  }
  if ('tile_owned_by_self' in c) return (tile.ownerId === ctx.playerId) === c.tile_owned_by_self;
  if ('tile_adjacent_to' in c) {
    const { min = 1, ...match } = c.tile_adjacent_to;
    return countAdjacent(ctx, match) >= min;
  }
  const unhandled: never = c;
  throw new Error(`Unhandled condition: ${JSON.stringify(unhandled)}`);
}

export function countAdjacent(ctx: TileContext, match: TileMatch): number {
  return ctx.neighbors.filter((n) => tileMatches(ctx, n, match)).length;
}
