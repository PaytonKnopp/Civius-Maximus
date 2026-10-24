import { distance, tilesWithin } from '../map/hex';
import { foundingProblem, isCoastal, tileOnRiver, tileYields } from '../settlements/rules';
import type { UnitState } from '../state';
import { isWater } from '../units/movement';
import type { Turn } from './turn';

/**
 * Where to found settlements: every explored tile near the empire gets a score from the land
 * around it (food first, then production, luxuries, fresh water, coast, hills), minus crowding.
 */

/** Below this a site isn't worth a settler. */
const MIN_SITE = 70;
/** How far from the empire the AI looks for sites. */
const SEARCH = 9;

/** One tile's worth to a settlement working it (cached for the turn). */
function tileValue(t: Turn, tile: number): number {
  return t.turnMemo(`tile:${tile}`, () => {
    const y = tileYields(t.ctx, t.state, tile, t.player).total;
    const t2 = t.state.map.tiles[tile]!;
    let v = Math.floor(
      ((y.food ?? 0) * 4 +
        (y.production ?? 0) * 3 +
        (y.gold ?? 0) +
        (y.science ?? 0) +
        (y.culture ?? 0) +
        (y.faith ?? 0)) /
        100,
    );
    if (t2.resource !== null) {
      const res = t.ctx.content.entities.resource[t2.resource];
      v += res?.class === 'luxury' ? 8 : res?.class === 'strategic' ? 3 : 2;
    }
    return v;
  });
}

/** How good a place this is for a new settlement (unscaled by distance). */
export function siteScore(t: Turn, tile: number): number {
  return t.turnMemo(`site:${tile}`, () => {
    const map = t.state.map;
    let score = 0;
    for (const n of tilesWithin(map, tile, 2)) {
      if (n === tile) continue;
      if (!t.isExplored(n)) {
        score += 3;
        continue;
      }
      const nt = map.tiles[n]!;
      if (nt.owner !== null && nt.owner !== t.player) continue;
      // Shared with one of our settlements: worth a third.
      score += nt.owner === t.player ? Math.floor(tileValue(t, n) / 3) : tileValue(t, n);
    }
    const center = map.tiles[tile]!;
    if (tileOnRiver(map, tile)) score += 10;
    if (isCoastal(t.ctx, t.state, tile)) score += 5;
    if (center.elevation === 'hills') score += 4;
    // Crowding a rival: they'll resent it and it's hard to hold.
    for (const s of t.knownSettlements()) {
      if (distance(map, s.tile, tile) <= 4) score -= 15;
    }
    return score;
  });
}

/** Explored, foundable tiles near the empire with decent scores (for the whole turn). */
function candidateSites(t: Turn): number[] {
  return t.turnMemo('sites', () => {
    const map = t.state.map;
    const centers = t.mySettlements().map((s) => s.tile);
    if (centers.length === 0) {
      for (const u of t.myUnits()) centers.push(u.tile);
    }
    const seen = new Set<number>();
    const out: number[] = [];
    for (const c of centers) {
      for (const tile of tilesWithin(map, c, SEARCH)) {
        if (seen.has(tile)) continue;
        seen.add(tile);
        if (!t.isExplored(tile) || isWater(t.ctx, t.state, tile)) continue;
        if (foundingProblem(t.ctx, t.state, t.player, tile)) continue;
        if (siteScore(t, tile) >= MIN_SITE) out.push(tile);
      }
    }
    return out.sort((a, b) => a - b);
  });
}

/** Sites that are still free, safe, and not already picked by another of our settlers. */
function openSites(t: Turn, except?: UnitState): number[] {
  const map = t.state.map;
  const min = t.ctx.content.rules.settlements.minDistance;
  const claimed = t
    .myUnits()
    .filter((u) => u !== except && u.orders?.kind === 'move' && unitIsSettler(t, u))
    .map((u) => (u.orders as { target: number }).target);
  // Raiders come out after anything within their camp's aggro range.
  const campRange = t.ctx.content.rules.camps.aggroRange + 1;
  const camps = Object.values(t.state.camps)
    .map((c) => c.tile)
    .filter((tile) => t.isExplored(tile));
  return candidateSites(t).filter(
    (tile) =>
      !foundingProblem(t.ctx, t.state, t.player, tile) &&
      claimed.every((c) => distance(map, c, tile) > min) &&
      camps.every((c) => distance(map, c, tile) > campRange) &&
      t.threatNear(tile, 2) === 0,
  );
}

const unitIsSettler = (t: Turn, u: UnitState) =>
  t.ctx.content.entities.unit[u.type]?.actions.includes('found_settlement') ?? false;

export function hasSettleSite(t: Turn): boolean {
  return openSites(t).length > 0;
}

/** Score of a site for a settler standing at `from`: the land, minus travel and sprawl. */
function placeScore(t: Turn, from: number, tile: number): number {
  const map = t.state.map;
  let score = siteScore(t, tile) * 10 - distance(map, from, tile) * (14 - t.me.expansion);
  const nearest = Math.min(99, ...t.mySettlements().map((s) => distance(map, s.tile, tile)));
  if (nearest < 99 && nearest > 6) score -= (nearest - 6) * 40;
  return score;
}

/** Found a settlement where the settler stands if the spot is any good (when danger is near). */
export function settleHere(t: Turn, u: UnitState): boolean {
  if (foundingProblem(t.ctx, t.state, t.player, u.tile) || siteScore(t, u.tile) < MIN_SITE)
    return false;
  return t.act({ type: 'found_settlement', player: t.player, unit: u.id });
}

/** Found a settlement here, or head for the best site nearby. */
export function moveSettler(t: Turn, u: UnitState) {
  const here = !foundingProblem(t.ctx, t.state, t.player, u.tile);
  // The first settlement goes down at once, unless the spot is unusable.
  if (t.mySettlements().length === 0 && here) {
    t.act({ type: 'found_settlement', player: t.player, unit: u.id });
    return;
  }
  const sites = openSites(t, u)
    .map((tile) => ({ tile, score: placeScore(t, u.tile, tile) }))
    .sort((a, b) => b.score - a.score || a.tile - b.tile);
  const best = sites[0];
  if (here && siteScore(t, u.tile) >= MIN_SITE) {
    // Good enough where it stands (within a few points of the best choice).
    const stay = placeScore(t, u.tile, u.tile);
    if (!best || stay >= best.score - 40) {
      t.act({ type: 'found_settlement', player: t.player, unit: u.id });
      return;
    }
  }
  if (
    u.orders?.kind === 'move' &&
    sites.some((s) => s.tile === (u.orders as { target: number }).target)
  )
    return;
  for (const site of sites.filter((x) => x.tile !== u.tile).slice(0, 4)) {
    if (t.act({ type: 'move_unit', player: t.player, unit: u.id, to: site.tile })) {
      const moved = t.state.units[u.id];
      if (moved && moved.tile === site.tile && moved.moves > 0)
        t.act({ type: 'found_settlement', player: t.player, unit: u.id });
      return;
    }
  }
  if (here && t.mySettlements().length === 0)
    t.act({ type: 'found_settlement', player: t.player, unit: u.id });
}
