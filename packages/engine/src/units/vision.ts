import { decodeBits, emptyBits, encodeBits, getBit, setBit } from '../bitset';
import { type EngineContext, unitClassOf, unitDef } from '../context';
import { distance, hexLine, neighbors, tilesWithin } from '../map/hex';
import { extraSight } from './promotions';
import { visionPartners } from '../diplomacy/rules';
import type { GameState, PlayerId, UnitState } from '../state';
import { isWater } from './movement';

/**
 * Vision (docs/03-core-mechanics.md, "Vision and fog"): each unit sees tiles within its sight
 * radius unless the view is blocked by mountains, sight-blocking features (woods, rainforest) or
 * hills in between. Units on hills see over woods and hills. Distance 1 is always visible.
 */

function blocks(ctx: EngineContext, state: GameState, tile: number, viewerHigh: boolean): boolean {
  const t = state.map.tiles[tile]!;
  if (t.elevation === 'mountain') return ctx.content.rules.elevation.mountain.blocksSight;
  if (viewerHigh) return false;
  if (t.elevation === 'hills') return true;
  return t.feature !== null && (ctx.content.entities.feature[t.feature]?.blocksSight ?? false);
}

export function lineOfSight(
  ctx: EngineContext,
  state: GameState,
  from: number,
  to: number,
): boolean {
  if (distance(state.map, from, to) <= 1) return true;
  const high = state.map.tiles[from]!.elevation !== 'flat';
  for (const nudge of [1, -1] as const) {
    const line = hexLine(state.map, from, to, nudge);
    if (line.slice(1, -1).every((t) => !blocks(ctx, state, t, high))) return true;
  }
  return false;
}

export function sightOf(ctx: EngineContext, state: GameState, unit: UnitState): number {
  const def = unitDef(ctx, unit);
  if (unitClassOf(ctx, unit).domain === 'land' && isWater(ctx, state, unit.tile)) {
    return ctx.content.rules.units.embarkedSight;
  }
  const hills = state.map.tiles[unit.tile]!.elevation === 'hills';
  return (
    def.sight + extraSight(ctx, unit) + (hills ? ctx.content.rules.elevation.hills.sightBonus : 0)
  );
}

/** Tiles a player can see right now (1 = visible): around their units, and their territory
 * plus one tile beyond it. */
/** What a player sees now: their own sight, plus their teammates' and allies'. */
export function visibleTiles(ctx: EngineContext, state: GameState, player: PlayerId): Uint8Array {
  const vis = ownVisibleTiles(ctx, state, player);
  for (const partner of visionPartners(state, player)) {
    const theirs = ownVisibleTiles(ctx, state, partner);
    for (let i = 0; i < vis.length; i++) if (theirs[i]) vis[i] = 1;
  }
  return vis;
}

function ownVisibleTiles(ctx: EngineContext, state: GameState, player: PlayerId): Uint8Array {
  const vis = new Uint8Array(state.map.tiles.length);
  const radius = ctx.content.rules.settlements.ownRadius;
  for (const s of Object.values(state.settlements)) {
    if (s.owner !== player) continue;
    for (const t of tilesWithin(state.map, s.tile, radius)) {
      if (state.map.tiles[t]!.owner !== player) continue;
      vis[t] = 1;
      for (const n of neighbors(state.map, t)) vis[n] = 1;
    }
  }
  for (const unit of Object.values(state.units)) {
    if (unit.owner !== player) continue;
    for (const t of tilesWithin(state.map, unit.tile, sightOf(ctx, state, unit))) {
      if (vis[t] === 0 && lineOfSight(ctx, state, unit.tile, t)) vis[t] = 1;
    }
  }
  return vis;
}

export function exploredBits(state: GameState, player: PlayerId): Uint8Array {
  return decodeBits(state.players[player]!.explored, state.map.tiles.length);
}

export function isExplored(state: GameState, player: PlayerId, tile: number): boolean {
  return getBit(exploredBits(state, player), tile);
}

/** Adds what a player currently sees to what they've explored; returns the new bitset text. */
export function exploreVisible(ctx: EngineContext, state: GameState, player: PlayerId): string {
  const bits = state.players[player]!.explored
    ? exploredBits(state, player)
    : emptyBits(state.map.tiles.length);
  const vis = visibleTiles(ctx, state, player);
  for (let t = 0; t < vis.length; t++) if (vis[t]) setBit(bits, t);
  return encodeBits(bits);
}

/**
 * The fog state of every tile for one player: 2 visible, 1 explored but not visible now,
 * 0 unexplored. This is what renderers draw (and, later, what the host uses to redact).
 */
export function fogOfWar(ctx: EngineContext, state: GameState, player: PlayerId): Uint8Array {
  const out = visibleTiles(ctx, state, player);
  const explored = exploredBits(state, player);
  for (let t = 0; t < out.length; t++) out[t] = out[t] ? 2 : getBit(explored, t) ? 1 : 0;
  return out;
}
