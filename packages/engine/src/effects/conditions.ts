import type { Condition, Elevation, TileMatch } from '@cx/content';
import { baseOf } from '../uniques';
import type { ConditionContext, TileFacts } from './tile';

function oneOf<T>(value: T | null, wanted: T | readonly T[]): boolean {
  return value !== null && (Array.isArray(wanted) ? wanted.includes(value) : value === wanted);
}

/** No requirement (undefined), any value (true), or one of the listed ids. */
function anyOrOneOf(value: string | null, wanted: string | string[] | true | undefined): boolean {
  if (wanted === undefined) return true;
  if (wanted === true) return value !== null;
  return oneOf(value, wanted);
}

/** True if a tile matches every field set on `match`. */
export function tileMatches(ctx: ConditionContext, tile: TileFacts, match: TileMatch): boolean {
  if (match.terrain !== undefined && !oneOf(tile.terrain, match.terrain)) return false;
  if (match.feature !== undefined && !oneOf(tile.feature, match.feature)) return false;
  if (match.elevation !== undefined && !oneOf<Elevation>(tile.elevation, match.elevation))
    return false;
  if (
    match.resource !== undefined &&
    match.resource !== true &&
    !oneOf(tile.resource, match.resource)
  )
    return false;
  if (match.resourceClass !== undefined) {
    const res = tile.resource === null ? undefined : ctx.content.entities.resource[tile.resource];
    if (res?.class !== match.resourceClass) return false;
  }
  if (match.resource === true && tile.resource === null) return false;
  // A civ's unique counts as the item it replaces (a unique district is still a Campus...).
  const base = (kind: 'improvement' | 'district', id: string | null | undefined) =>
    id ? baseOf({ content: ctx.content }, kind, id) : null;
  if (
    !anyOrOneOf(tile.improvement ?? null, match.improvement) &&
    !anyOrOneOf(base('improvement', tile.improvement), match.improvement)
  )
    return false;
  if (
    !anyOrOneOf(tile.district ?? null, match.district) &&
    !anyOrOneOf(base('district', tile.district), match.district)
  )
    return false;
  if (!anyOrOneOf(tile.wonder ?? null, match.wonder)) return false;
  if (match.cityCenter !== undefined && (tile.center ?? false) !== match.cityCenter) return false;
  if (match.river !== undefined && tile.river !== match.river) return false;
  return true;
}

function isWater(ctx: ConditionContext, tile: TileFacts): boolean {
  return ctx.content.entities.terrain[tile.terrain]?.water ?? false;
}

/**
 * Evaluates a condition in a context. Conditions about something the context doesn't have (a
 * tile, a settlement, the player's progress) are false.
 */
export function evaluateCondition(ctx: ConditionContext, c: Condition): boolean {
  if ('all' in c) return c.all.every((x) => evaluateCondition(ctx, x));
  if ('any' in c) return c.any.some((x) => evaluateCondition(ctx, x));
  if ('not' in c) return !evaluateCondition(ctx, c.not);

  const { tile, settlement, player } = ctx;
  if ('tile_terrain' in c) return !!tile && oneOf(tile.terrain, c.tile_terrain);
  if ('tile_feature' in c) {
    if (!tile) return false;
    return c.tile_feature === null ? tile.feature === null : oneOf(tile.feature, c.tile_feature);
  }
  if ('tile_elevation' in c) return !!tile && oneOf<Elevation>(tile.elevation, c.tile_elevation);
  if ('tile_has_resource' in c) {
    if (!tile) return false;
    return c.tile_has_resource === true
      ? tile.resource !== null
      : oneOf(tile.resource, c.tile_has_resource);
  }
  if ('tile_resource_class' in c)
    return !!tile && tileMatches(ctx, tile, { resourceClass: c.tile_resource_class });
  if ('tile_has_improvement' in c) {
    if (!tile) return false;
    const imp = tile.improvement ?? null;
    return c.tile_has_improvement === true ? imp !== null : oneOf(imp, c.tile_has_improvement);
  }
  if ('tile_on_river' in c) return !!tile && tile.river === c.tile_on_river;
  if ('tile_coastal' in c) {
    if (!tile) return false;
    const coastal = !isWater(ctx, tile) && (ctx.neighbors ?? []).some((n) => isWater(ctx, n));
    return coastal === c.tile_coastal;
  }
  if ('tile_owned_by_self' in c)
    return !!tile && (tile.ownerId === ctx.playerId) === c.tile_owned_by_self;
  if ('tile_adjacent_to' in c) {
    if (!tile) return false;
    const { min = 1, ...match } = c.tile_adjacent_to;
    return countAdjacent(ctx, match) >= min;
  }

  if ('settlement_is_capital' in c)
    return !!settlement && settlement.capital === c.settlement_is_capital;
  if ('settlement_kind' in c) return !!settlement && settlement.kind === c.settlement_kind;
  if ('settlement_population_at_least' in c)
    return !!settlement && settlement.population >= c.settlement_population_at_least;
  if ('settlement_has_building' in c) {
    if (!settlement) return false;
    const wanted = c.settlement_has_building;
    return settlement.buildings.some(
      (b) => oneOf(b, wanted) || oneOf(baseOf({ content: ctx.content }, 'building', b), wanted),
    );
  }

  if ('settlement_has_district' in c) {
    const wanted = c.settlement_has_district;
    return (settlement?.districts ?? []).some(
      (d) => oneOf(d, wanted) || oneOf(baseOf({ content: ctx.content }, 'district', d), wanted),
    );
  }
  if ('has_tech' in c) return !!player && player.techs.includes(c.has_tech);
  if ('has_civic' in c) return !!player && player.civics.includes(c.has_civic);
  if ('government_is' in c) return !!player && oneOf(player.government, c.government_is);
  if ('celebrating' in c) return !!player && player.celebrating === c.celebrating;
  if ('era_at_least' in c) {
    const era = ctx.content.entities.era[c.era_at_least];
    return !!player && !!era && (player.eraOrder ?? 0) >= era.order;
  }
  if ('settlement_on_river' in c)
    return !!settlement && (settlement.onRiver ?? false) === c.settlement_on_river;
  if ('settlement_units_trained_below' in c)
    return !!settlement && (settlement.unitsTrained ?? 0) < c.settlement_units_trained_below;
  if ('tile_city_center' in c) return !!tile && (tile.center ?? false) === c.tile_city_center;

  const unhandled: never = c;
  throw new Error(`Unhandled condition: ${JSON.stringify(unhandled)}`);
}

export function countAdjacent(ctx: ConditionContext, match: TileMatch): number {
  return (ctx.neighbors ?? []).filter((n) => tileMatches(ctx, n, match)).length;
}
