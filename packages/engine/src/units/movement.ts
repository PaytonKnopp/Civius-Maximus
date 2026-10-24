import { type EngineContext, atWar, unitClassOf, unitDef } from '../context';
import { directionTo, hasRiverEdge, neighbors } from '../map/hex';
import type { GameState, UnitState } from '../state';
import { extraMovement, ignoresTerrainCost } from './promotions';

/**
 * Movement rules (docs/03-core-mechanics.md, "Movement"). All costs are in hundredths of a
 * movement point, like `UnitState.moves`.
 */

export const MP = 100;

type Unit = Pick<UnitState, 'id' | 'owner' | 'type'> & { promotions?: string[] | undefined };

export function isWater(ctx: EngineContext, state: GameState, tile: number): boolean {
  return ctx.content.entities.terrain[state.map.tiles[tile]!.terrain]!.water;
}

/** The cost to enter a land tile, or null if land units can't enter it at all. */
export function landCost(ctx: EngineContext, state: GameState, tile: number): number | null {
  const t = state.map.tiles[tile]!;
  const rules = ctx.content.rules;
  if (t.elevation === 'mountain' && !rules.elevation.mountain.passable) return null;
  const feature = t.feature === null ? undefined : ctx.content.entities.feature[t.feature];
  if (feature?.impassable) return null;
  let cost = ctx.content.entities.terrain[t.terrain]!.moveCost;
  if (t.elevation === 'hills') cost += rules.elevation.hills.moveCostExtra;
  if (feature) cost += feature.moveCostExtra;
  return cost * MP;
}

/** Whether a unit could ever stand on this tile (terrain and domain only, ignoring other units). */
export function canTraverse(
  ctx: EngineContext,
  state: GameState,
  unit: Unit,
  tile: number,
): boolean {
  const def = unitDef(ctx, unit);
  const cls = unitClassOf(ctx, unit);
  const t = state.map.tiles[tile]!;
  const terrain = ctx.content.entities.terrain[t.terrain]!;
  const feature = t.feature === null ? undefined : ctx.content.entities.feature[t.feature];
  if (feature?.impassable) return false;
  if (cls.domain === 'sea') return terrain.water && (!terrain.deepWater || def.deepWater);
  if (cls.domain === 'land') {
    if (!terrain.water) return landCost(ctx, state, tile) !== null;
    // Embarked land units stay in shallow water until deep-water embarking exists.
    return cls.embarks && state.players[unit.owner]!.canEmbark && !terrain.deepWater;
  }
  return true;
}

/**
 * Units by tile, built once per (immutable) units object. Pathfinding asks "who is on this tile"
 * thousands of times per search; this keeps it O(1).
 */
const indexCache = new WeakMap<object, Map<number, UnitState[]>>();
function unitIndex(state: GameState): Map<number, UnitState[]> {
  let index = indexCache.get(state.units);
  if (!index) {
    index = new Map();
    for (const u of Object.values(state.units)) {
      const list = index.get(u.tile) ?? [];
      list.push(u);
      index.set(u.tile, list);
    }
    for (const list of index.values())
      list.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
    indexCache.set(state.units, index);
  }
  return index;
}

/** Units on a tile, in id order. */
export function unitsOn(state: GameState, tile: number): UnitState[] {
  return unitIndex(state).get(tile) ?? [];
}

/** True if another player's unit is on the tile (moving there would be an attack, M9). */
export function hasForeignUnit(state: GameState, unit: Unit, tile: number): boolean {
  return unitsOn(state, tile).some((u) => u.owner !== unit.owner);
}

/** True if the unit can end its move on the tile without breaking stacking limits. */
export function hasRoom(ctx: EngineContext, state: GameState, unit: Unit, tile: number): boolean {
  const layer = unitClassOf(ctx, unit).layer;
  const limit = ctx.content.rules.units.stacking[layer];
  let count = 0;
  for (const other of unitsOn(state, tile)) {
    if (other.id === unit.id) continue;
    if (other.owner !== unit.owner) return false;
    if (unitClassOf(ctx, other).layer === layer) count++;
  }
  return count < limit;
}

/** True if a tile is in the zone of control of an enemy military unit. */
export function inEnemyZoc(
  ctx: EngineContext,
  state: GameState,
  unit: Unit,
  tile: number,
): boolean {
  for (const t of [tile, ...neighbors(state.map, tile)]) {
    for (const u of unitsOn(state, t)) {
      if (atWar(state, unit.owner, u.owner) && unitClassOf(ctx, u).combat) return true;
    }
  }
  return false;
}

/**
 * Moves left after stepping from `from` to the adjacent `to`, or null if the step isn't allowed
 * with these moves. Implements the Civ 5 rule (any moves left can enter any passable tile), river
 * crossings and embarking ending the move, and zone of control.
 */
export function stepMoves(
  ctx: EngineContext,
  state: GameState,
  unit: Unit,
  from: number,
  to: number,
  moves: number,
): number | null {
  if (moves <= 0 || !canTraverse(ctx, state, unit, to)) return null;
  const def = unitDef(ctx, unit);
  const cls = unitClassOf(ctx, unit);
  const toWater = isWater(ctx, state, to);
  let cost: number;
  if (ignoresTerrainCost(ctx, unit) || cls.domain !== 'land' || toWater) cost = MP;
  else cost = landCost(ctx, state, to)!;

  const rules = ctx.content.rules;
  if (cost > moves && !rules.movement.canAlwaysMoveOneTile) return null;
  let left = Math.max(0, moves - cost);

  if (cls.domain === 'land' && toWater !== isWater(ctx, state, from)) left = 0; // embark/disembark
  const dir = directionTo(state.map, from, to);
  if (
    rules.rivers.crossingEndsMove &&
    dir !== undefined &&
    hasRiverEdge(state.map, riverBits(state), from, dir)
  ) {
    if (cls.domain === 'land' && !toWater) left = 0;
  }
  if (!def.ignoresZoc && !cls.ignoresZoc && inEnemyZoc(ctx, state, unit, to)) left = 0;
  return left;
}

/** River bits per tile, cached per map object. */
const riverCache = new WeakMap<object, number[]>();
export function riverBits(state: GameState): number[] {
  let bits = riverCache.get(state.map.tiles);
  if (!bits) {
    bits = state.map.tiles.map((t) => t.river);
    riverCache.set(state.map.tiles, bits);
  }
  return bits;
}

export function fullMoves(
  ctx: EngineContext,
  unit: Pick<UnitState, 'type'> & { promotions?: string[] | undefined },
): number {
  return (unitDef(ctx, unit).movement + extraMovement(ctx, unit)) * MP;
}
