import { type Placement, resolveText } from '@cx/content';
import type { EngineContext, RuleError } from '../context';
import { tileMatches } from '../effects/conditions';
import { adjacencyBonus } from '../effects/yields';
import { type Fixed, percentOf, toFixed } from '../fixed';
import { distance, neighbors, tilesWithin } from '../map/hex';
import type { BuildItem, GameState, PlayerId, SettlementState } from '../state';
import { isWater } from '../units/movement';
import type { Line } from './rules';
import { tileFacts } from './rules';

/**
 * Districts, wonders and tile projects (docs/03-core-mechanics.md, section 9): where they can go,
 * how many districts a city may have, what they cost, and what a district yields where it stands.
 */

export const TILE_KINDS: readonly BuildItem['kind'][] = ['district', 'wonder', 'project'];
export const needsTile = (item: BuildItem) => TILE_KINDS.includes(item.kind);

/** Specialty districts a settlement may have at its size. */
export function districtLimit(ctx: EngineContext, s: SettlementState): number {
  const d = ctx.content.rules.settlements.districts;
  return d.base + Math.floor((s.population - 1) / d.populationPer);
}

const isSpecialty = (ctx: EngineContext, id: string) =>
  ctx.content.entities.district[id]?.specialty ?? false;

/** District cost, rising with progress through the trees. */
export function districtCost(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  id: string,
): Fixed {
  const p = state.players[player]!;
  const base = toFixed(ctx.content.entities.district[id]?.cost ?? 0);
  const percent =
    ctx.content.rules.settlements.districts.costPerProgressPercent *
    (p.techs.done.length + p.civics.done.length);
  return base + percentOf(base, percent);
}

/** Whether a tile meets a placement's terrain and neighbor rules. */
export function placementFits(
  ctx: EngineContext,
  state: GameState,
  tile: number,
  p: Placement,
): boolean {
  const t = state.map.tiles[tile]!;
  if (isWater(ctx, state, tile) !== p.water) return false;
  if (!p.elevations.includes(t.elevation)) return false;
  if (p.terrains && !p.terrains.includes(t.terrain)) return false;
  if (t.feature !== null) {
    const f = ctx.content.entities.feature[t.feature];
    if (f?.impassable) return false;
    if (p.features && !p.features.includes(t.feature) && !f?.removable) return false;
  }
  const facts = (i: number) => tileFacts(state, i);
  const ctxFacts = { content: ctx.content, playerId: '' };
  if (p.self && !tileMatches(ctxFacts, facts(tile), p.self)) return false;
  const around = neighbors(state.map, tile).map(facts);
  for (const m of p.nextTo) if (!around.some((n) => tileMatches(ctxFacts, n, m))) return false;
  if (
    p.nextToAny.length > 0 &&
    !around.some((n) => p.nextToAny.some((m) => tileMatches(ctxFacts, n, m)))
  )
    return false;
  for (const m of p.notNextTo) if (around.some((n) => tileMatches(ctxFacts, n, m))) return false;
  return true;
}

/** Tiles promised to a district or wonder in the player's other settlements' queues. */
function reservedTiles(state: GameState, player: PlayerId, except: string): Set<number> {
  const out = new Set<number>();
  for (const s of Object.values(state.settlements)) {
    if (s.owner !== player || s.id === except) continue;
    for (const q of s.queue) if (q.tile !== undefined && q.kind !== 'project') out.add(q.tile);
  }
  return out;
}

/**
 * Why a district, wonder or project can't go where it's aimed, or undefined. `queue` is the
 * settlement's queue as it would be (other items in it count toward limits and reservations).
 */
export function placementProblem(
  ctx: EngineContext,
  state: GameState,
  s: SettlementState,
  item: BuildItem,
  queue: readonly BuildItem[] = s.queue,
): RuleError | undefined {
  const bad = (message: string): RuleError => ({ code: 'bad_placement', message });
  const tile = item.tile;
  if (tile === undefined || tile < 0 || tile >= state.map.tiles.length)
    return bad('Pick a tile for it');
  const t = state.map.tiles[tile]!;
  if (t.settlement !== s.id) return bad(`The tile must belong to ${s.name}`);
  if (tile === s.tile) return bad("Not on the settlement's center");
  if (distance(state.map, s.tile, tile) > ctx.content.rules.settlements.workRadius)
    return bad('Too far from the settlement');
  if (t.district !== null || t.wonder !== null) return bad('Something is already built there');
  const others = queue.filter((q) => q !== item);
  if (others.some((q) => q.tile === tile && q.kind !== 'project'))
    return bad('Something else is planned there');

  if (item.kind === 'project') {
    const def = ctx.content.entities.project[item.id];
    if (!def) return bad(`Unknown project "${item.id}"`);
    if (t.feature === null || !def.clears.includes(t.feature))
      return bad(`Nothing on that tile for ${resolveText(ctx.content, def.name)}`);
    return undefined;
  }
  if (reservedTiles(state, s.owner, s.id).has(tile))
    return bad('Another settlement has planned something there');

  if (item.kind === 'district') {
    const def = ctx.content.entities.district[item.id];
    if (!def) return bad(`Unknown district "${item.id}"`);
    const name = resolveText(ctx.content, def.name);
    if (s.districts.some((d) => d.id === item.id) || others.some((q) => q.id === item.id))
      return { code: 'already_built', message: `${s.name} already has a ${name}` };
    if (def.onePerEmpire) {
      const elsewhere = Object.values(state.settlements).some(
        (x) =>
          x.owner === s.owner &&
          (x.districts.some((d) => d.id === item.id) ||
            (x.id !== s.id && x.queue.some((q) => q.id === item.id))),
      );
      if (elsewhere) return { code: 'one_per_empire', message: `Only one ${name} per empire` };
    }
    if (def.specialty) {
      const used =
        s.districts.filter((d) => isSpecialty(ctx, d.id)).length +
        others.filter((q) => q.kind === 'district' && isSpecialty(ctx, q.id)).length;
      const limit = districtLimit(ctx, s);
      if (used >= limit) {
        return {
          code: 'district_limit',
          message: `${s.name} can have ${limit} district${limit === 1 ? '' : 's'} at this size`,
        };
      }
    }
    if (!placementFits(ctx, state, tile, def.placement))
      return bad(`A ${name} can't go on that tile`);
    return undefined;
  }

  const def = ctx.content.entities.wonder[item.id];
  if (!def) return bad(`Unknown wonder "${item.id}"`);
  const name = resolveText(ctx.content, def.name);
  if (Object.values(state.settlements).some((x) => x.wonders.includes(item.id)))
    return { code: 'wonder_built', message: `${name} has already been built` };
  if (
    others.some((q) => q.id === item.id) ||
    Object.values(state.settlements).some(
      (x) => x.owner === s.owner && x.id !== s.id && x.queue.some((q) => q.id === item.id),
    )
  )
    return { code: 'already_queued', message: `You're already building ${name}` };
  if (!placementFits(ctx, state, tile, def.placement)) return bad(`${name} can't go on that tile`);
  return undefined;
}

/** Every tile where an item could go now (for highlighting choices on the map). */
export function placementTiles(
  ctx: EngineContext,
  state: GameState,
  s: SettlementState,
  kind: 'district' | 'wonder' | 'project',
  id: string,
): number[] {
  return tilesWithin(state.map, s.tile, ctx.content.rules.settlements.workRadius)
    .filter((tile) => !placementProblem(ctx, state, s, { kind, id, tile }))
    .sort((a, b) => a - b);
}

/** A district's yields on a tile, with the "why?" lines (base, adjacency, neighboring districts). */
export function districtYields(
  ctx: EngineContext,
  state: GameState,
  tile: number,
  id: string,
): { total: Record<string, Fixed>; lines: Record<string, Line[]> } {
  const def = ctx.content.entities.district[id]!;
  const name = resolveText(ctx.content, def.name);
  const lines: Record<string, Line[]> = {};
  const add = (y: string, label: string, amount: Fixed) => {
    if (amount !== 0) (lines[y] ??= []).push({ label, amount });
  };
  for (const [y, v] of Object.entries(def.yields)) add(y, name, toFixed(v));
  const tctx = {
    content: ctx.content,
    playerId: state.map.tiles[tile]!.owner ?? '',
    tile: { ...tileFacts(state, tile), district: id },
    neighbors: neighbors(state.map, tile).map((n) => tileFacts(state, n)),
  };
  for (const a of def.adjacency) {
    add(a.yield, `${name}: ${a.label ?? 'adjacency'}`, adjacencyBonus(tctx, a));
  }
  // Clustering: every specialty district gets a bonus for each neighboring district.
  const main =
    def.adjacency[0]?.yield ?? Object.keys(def.specialistYields)[0] ?? Object.keys(def.yields)[0];
  if (def.specialty && main) {
    const near = tctx.neighbors.filter((n) => n.district).length;
    const bonus = toFixed(ctx.content.rules.settlements.districts.neighborBonus) * near;
    add(main, `${name}: neighboring districts`, bonus);
  }
  const total: Record<string, Fixed> = {};
  for (const [y, ls] of Object.entries(lines)) total[y] = ls.reduce((a, l) => a + l.amount, 0);
  return { total, lines };
}

/** Specialist slots per district in a settlement: one per building inside the district. */
export function specialistSlots(ctx: EngineContext, s: SettlementState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of s.districts) {
    const n = s.buildings.filter((b) => ctx.content.entities.building[b]?.district === d.id).length;
    if (
      n > 0 &&
      Object.keys(ctx.content.entities.district[d.id]?.specialistYields ?? {}).length > 0
    )
      out[d.id] = n;
  }
  return out;
}
