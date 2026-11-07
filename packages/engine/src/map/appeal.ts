import type { EngineContext } from '../context';
import type { GameState } from '../state';
import { neighbors } from './hex';
import type { MapState } from './types';

/**
 * Appeal (docs/03-core-mechanics.md, "Appeal"): how pleasant a tile is, from what's around it.
 * Each neighbor adds its terrain's, feature's, district's and improvement's `appeal` (mountains
 * and wonders from `rules.appeal`). National parks, seaside resorts and resort towns are built on
 * it; the appeal lens shows it.
 */
export function appealOf(ctx: EngineContext, state: Pick<GameState, 'map'>, tile: number): number {
  const e = ctx.content.entities;
  const rules = ctx.content.rules;
  let total = 0;
  for (const n of neighbors(state.map, tile)) {
    const t = state.map.tiles[n]!;
    total += e.terrain[t.terrain]?.appeal ?? 0;
    if (t.elevation === 'mountain') total += rules.elevation.mountain.appeal;
    if (t.feature !== null) total += e.feature[t.feature]?.appeal ?? 0;
    if (t.district !== null) total += e.district[t.district]?.appeal ?? 0;
    if (t.improvement !== null) total += e.improvement[t.improvement]?.appeal ?? 0;
    if (t.wonder !== null) total += rules.appeal.wonder;
  }
  return total;
}

/** A word for a tile's appeal, like Civ's (breathtaking, charming, average...). */
export function appealWord(ctx: EngineContext, appeal: number): string {
  const a = ctx.content.rules.appeal;
  if (appeal >= a.breathtaking) return 'Breathtaking';
  if (appeal >= a.charming) return 'Charming';
  if (appeal <= a.disgusting) return 'Disgusting';
  if (appeal <= a.uninviting) return 'Uninviting';
  return 'Average';
}

const continentCache = new WeakMap<object, Int32Array>();

/**
 * Which landmass each tile belongs to (-1 for water): connected land, numbered from the
 * landmass holding the lowest tile index, so the numbers are the same on every machine.
 */
export function continentsOf(ctx: EngineContext, map: MapState): Int32Array {
  const known = continentCache.get(map.tiles);
  if (known) return known;
  const ids = new Int32Array(map.tiles.length).fill(-1);
  const water = (i: number) => ctx.content.entities.terrain[map.tiles[i]!.terrain]?.water ?? false;
  let next = 0;
  for (let start = 0; start < map.tiles.length; start++) {
    if (ids[start] !== -1 || water(start)) continue;
    const stack = [start];
    ids[start] = next;
    while (stack.length > 0) {
      const t = stack.pop()!;
      for (const n of neighbors(map, t))
        if (ids[n] === -1 && !water(n)) {
          ids[n] = next;
          stack.push(n);
        }
    }
    next++;
  }
  continentCache.set(map.tiles, ids);
  return ids;
}

/** The landmass a tile is on, or null for water. */
export function continentOf(ctx: EngineContext, map: MapState, tile: number): number | null {
  const id = continentsOf(ctx, map)[tile] ?? -1;
  return id < 0 ? null : id;
}
