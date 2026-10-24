import { decodeBits, getBit } from '../bitset';
import { atWar, type EngineContext, HOSTILE, type RuleError, unitDef } from '../context';
import { type Fixed, toFixed } from '../fixed';
import { neighbors } from '../map/hex';
import { playerEffects } from '../progress/sources';
import type { GameState, PlayerId, SettlementState, UnitState } from '../state';
import { landCost } from '../units/movement';
import { exploredBits } from '../units/vision';

/**
 * Trade routes and roads (docs/04-advanced-systems.md, "Trade routes"): a trader in one of your
 * settlements is sent to another settlement (yours or another player's) within range over land;
 * the route pays yields every turn for a while, builds a road along its way, then the trader
 * comes home. Roads make movement cheaper.
 */

let roadCache: { text: string; size: number; bits: Uint8Array } | null = null;

export function roadBits(state: Pick<GameState, 'roads' | 'map'>): Uint8Array {
  const size = state.map.tiles.length;
  if (roadCache?.text !== state.roads || roadCache.size !== size)
    roadCache = { text: state.roads, size, bits: decodeBits(state.roads, size) };
  return roadCache.bits;
}

/** A road on the tile (every settlement center counts as one). */
export function hasRoad(state: GameState, tile: number): boolean {
  if (getBit(roadBits(state), tile)) return true;
  const id = state.map.tiles[tile]!.settlement;
  return !!id && state.settlements[id]?.tile === tile;
}

/** How many routes a player can run at once. */
export function tradeCapacity(ctx: EngineContext, state: GameState, player: PlayerId): number {
  return playerEffects(ctx, state, player, 'extra_trade_route').reduce(
    (n, e) => n + e.effect.params.amount,
    0,
  );
}

export const routesOf = (state: GameState, player: PlayerId) =>
  state.routes.filter((r) => r.owner === player);

/** A trade route runs between these two players (either way). */
export function tradePartners(state: GameState, a: PlayerId, b: PlayerId): boolean {
  if (!state.routes) return false;
  return state.routes.some((r) => {
    const to = state.settlements[r.to]?.owner;
    return (r.owner === a && to === b) || (r.owner === b && to === a);
  });
}

/**
 * The cheapest land path between two tiles (no further than `range` tiles), ignoring units:
 * the tiles from `from` to `to`, or null.
 */
export function tradePath(
  ctx: EngineContext,
  state: GameState,
  from: number,
  to: number,
  range: number,
): number[] | null {
  const best = new Map<number, { cost: number; steps: number; prev: number }>([
    [from, { cost: 0, steps: 0, prev: -1 }],
  ]);
  const heap = new Heap();
  heap.push(0, from);
  while (heap.size > 0) {
    const [cost0, tile] = heap.pop();
    const here = best.get(tile)!;
    if (here.cost !== cost0) continue; // stale entry
    if (tile === to) break;
    if (here.steps >= range) continue;
    for (const n of neighbors(state.map, tile)) {
      const step = landCost(ctx, state, n);
      if (step === null || ctx.content.entities.terrain[state.map.tiles[n]!.terrain]!.water)
        continue;
      const cost = here.cost + step;
      const seen = best.get(n);
      if (seen && (seen.cost < cost || (seen.cost === cost && seen.prev <= tile))) continue;
      best.set(n, { cost, steps: here.steps + 1, prev: tile });
      heap.push(cost, n);
    }
  }
  if (!best.has(to)) return null;
  const path: number[] = [];
  for (let t = to; t !== -1; t = best.get(t)!.prev) path.push(t);
  return path.reverse();
}

export interface RouteYields {
  /** For the settlement the route starts from, in hundredths. */
  origin: Record<string, Fixed>;
  /** For the destination (international routes), in hundredths. */
  destination: Record<string, Fixed>;
}

/** What a route from `from` to `to`, run by `owner`, yields each turn. */
export function routeYields(
  ctx: EngineContext,
  state: GameState,
  owner: PlayerId,
  from: SettlementState,
  to: SettlementState,
): RouteYields {
  const rules = ctx.content.rules.trade;
  const origin: Record<string, Fixed> = {};
  const destination: Record<string, Fixed> = {};
  const add = (into: Record<string, Fixed>, yields: Record<string, number>, times = 1) => {
    for (const [y, v] of Object.entries(yields)) into[y] = (into[y] ?? 0) + toFixed(v * times);
  };
  const international = to.owner !== owner;
  if (!international) add(origin, rules.domestic);
  else {
    add(origin, rules.international);
    add(origin, rules.perDestinationDistrict, to.districts.length);
    add(destination, rules.destination);
  }
  for (const { effect } of playerEffects(ctx, state, owner, 'trade_route_bonus')) {
    const p = effect.params;
    if (p.international && !international) continue;
    add(origin, p.origin);
    add(destination, p.destination);
    if (p.perOriginTerrain) {
      const n = state.map.tiles.filter(
        (t) => t.settlement === from.id && t.terrain === p.perOriginTerrain!.terrain,
      ).length;
      add(origin, p.perOriginTerrain.yields, n);
    }
  }
  return { origin, destination };
}

/** The settlement a trader stands in (its own player's), if any. */
export function traderOrigin(state: GameState, unit: UnitState): SettlementState | undefined {
  const id = state.map.tiles[unit.tile]!.settlement;
  const s = id ? state.settlements[id] : undefined;
  return s && s.tile === unit.tile && s.owner === unit.owner ? s : undefined;
}

/** Why `unit` can't start a route to settlement `to`, or undefined. */
export function routeProblem(
  ctx: EngineContext,
  state: GameState,
  unit: UnitState,
  to: string,
): RuleError | undefined {
  if (!unitDef(ctx, unit).actions.includes('trade_route'))
    return { code: 'not_trader', message: 'Only traders run trade routes' };
  if (unit.moves <= 0) return { code: 'no_moves', message: 'No moves left this turn' };
  const from = traderOrigin(state, unit);
  if (!from)
    return { code: 'not_in_settlement', message: 'The trader must be in one of your settlements' };
  const cap = tradeCapacity(ctx, state, unit.owner);
  if (routesOf(state, unit.owner).length >= cap)
    return {
      code: 'no_capacity',
      message:
        cap === 0
          ? 'You have no trade routes yet (Foreign Trade, Commercial Hubs and Harbors add them)'
          : `All ${cap} of your trade routes are in use`,
    };
  const dest = state.settlements[to];
  if (!dest || dest.id === from.id)
    return { code: 'bad_destination', message: 'Pick another settlement' };
  if (!getBit(exploredBits(state, unit.owner), dest.tile))
    return { code: 'unknown', message: "You haven't found that settlement" };
  if (dest.owner === HOSTILE || !state.players[dest.owner]?.alive)
    return { code: 'bad_destination', message: 'Pick another settlement' };
  if (dest.owner !== unit.owner && atWar(state, unit.owner, dest.owner))
    return { code: 'at_war', message: "You can't trade with a player you're at war with" };
  if (state.routes.some((r) => r.from === from.id && r.to === dest.id))
    return {
      code: 'duplicate',
      message: `There's already a route from ${from.name} to ${dest.name}`,
    };
  if (!tradePath(ctx, state, from.tile, dest.tile, ctx.content.rules.trade.range))
    return {
      code: 'out_of_range',
      message: `${dest.name} is more than ${ctx.content.rules.trade.range} tiles away over land`,
    };
  return undefined;
}

/** Every settlement a trader could go to, with what the route would give (for choosing one). */
export function tradeDestinations(
  ctx: EngineContext,
  state: GameState,
  unit: UnitState,
): { settlement: SettlementState; yields: RouteYields; problem: RuleError | undefined }[] {
  const from = traderOrigin(state, unit);
  if (!from) return [];
  const explored = exploredBits(state, unit.owner);
  return Object.values(state.settlements)
    .filter((s) => s.id !== from.id && getBit(explored, s.tile) && s.owner !== HOSTILE)
    .sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)))
    .map((s) => ({
      settlement: s,
      yields: routeYields(ctx, state, unit.owner, from, s),
      problem: routeProblem(ctx, state, unit, s.id),
    }));
}

/** "Trade route to Roma" lines for a settlement's yields: routes from it and (foreign) to it. */
export function routeLines(
  ctx: EngineContext,
  state: GameState,
  s: SettlementState,
): { label: string; yields: Record<string, Fixed> }[] {
  const out: { label: string; yields: Record<string, Fixed> }[] = [];
  for (const r of state.routes ?? []) {
    const from = state.settlements[r.from];
    const to = state.settlements[r.to];
    if (!from || !to) continue;
    if (r.from === s.id && from.owner === r.owner) {
      out.push({
        label: `Trade route to ${to.name}`,
        yields: routeYields(ctx, state, r.owner, from, to).origin,
      });
    } else if (r.to === s.id && to.owner !== r.owner) {
      out.push({
        label: `Trade route from ${from.name}`,
        yields: routeYields(ctx, state, r.owner, from, to).destination,
      });
    }
  }
  return out;
}

/** A min-heap of [cost, tile], ties broken by tile index (deterministic). */
class Heap {
  private items: [number, number][] = [];
  get size() {
    return this.items.length;
  }
  push(cost: number, tile: number) {
    const a = this.items;
    a.push([cost, tile]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(a[i]!, a[p]!)) break;
      [a[i], a[p]] = [a[p]!, a[i]!];
      i = p;
    }
  }
  pop(): [number, number] {
    const a = this.items;
    const top = a[0]!;
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && less(a[l]!, a[m]!)) m = l;
        if (r < a.length && less(a[r]!, a[m]!)) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m]!, a[i]!];
        i = m;
      }
    }
    return top;
  }
}

const less = (a: [number, number], b: [number, number]) =>
  a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
