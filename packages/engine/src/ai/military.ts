import { unitDef } from '../context';
import { getBit } from '../bitset';
import { attackTargets, previewAttack } from '../combat/strength';
import { distance, tilesWithin } from '../map/hex';
import type { SettlementState, UnitState } from '../state';
import { canTraverse, hasForeignUnit, hasRoom } from '../units/movement';
import { availablePromotions, unitRange } from '../units/promotions';
import { isSoldier } from './cities';
import { moveSettler, settleHere } from './settle';
import { type Role, type Turn, unitPower, unitRole } from './turn';

/**
 * What every unit does this turn: attack where the odds are good, guard settlements, march on the
 * war target, clear hostile camps, explore, heal.
 */
export function manageUnits(t: Turn) {
  // Ranged units soften targets before melee units go in.
  attackPass(t, ['ranged', 'siege', 'naval']);
  attackPass(t, ['melee', 'explorer']);
  // Settlers first, so their escorts can follow them.
  for (const u0 of t.myUnits()) {
    const u = t.state.units[u0.id];
    if (!u || u.moves <= 0 || unitRole(t.ctx, u) !== 'settler') continue;
    // Raiders can't take settlements: with enemies about, settling on the spot is safest.
    if (t.threatNear(u.tile, 3) > 0 && settleHere(t, u)) continue;
    if (!fleeIfThreatened(t, u)) moveSettler(t, u);
  }
  const plan = planArmy(t);
  for (const u0 of t.myUnits()) {
    const u = t.state.units[u0.id];
    if (!u || u.owner !== t.player) continue;
    promote(t, u);
    const unit = t.state.units[u.id];
    if (!unit || unit.moves <= 0) continue;
    const role = unitRole(t.ctx, unit);
    if (role === 'settler') continue;
    else if (role === 'explorer') explore(t, unit);
    else if (isSoldier(role)) soldier(t, unit, plan);
    else if (role === 'naval') hold(t, unit);
  }
  // Units that moved next to something worth hitting.
  attackPass(t, ['ranged', 'siege', 'naval', 'melee']);
}

/** Spend XP when it doesn't cost a needed move (a promotion heals and ends the unit's turn). */
function promote(t: Turn, u: UnitState) {
  const pick = availablePromotions(t.ctx, u)[0];
  if (!pick) return;
  if (u.health >= 80 && t.threatNear(u.tile, 3) > 0) return;
  t.act({ type: 'promote_unit', player: t.player, unit: u.id, promotion: pick });
}

function attackPass(t: Turn, roles: Role[]) {
  for (const u0 of t.myUnits()) {
    const u = t.state.units[u0.id];
    if (!u || u.owner !== t.player || u.moves <= 0) continue;
    if (!roles.includes(unitRole(t.ctx, u))) continue;
    const best = bestAttack(t, u);
    if (best) t.act({ type: 'attack', player: t.player, unit: u.id, tile: best });
  }
}

/** The attack with the best expected result, if any is worth it. */
function bestAttack(t: Turn, u: UnitState): number | undefined {
  let best: { tile: number; score: number } | undefined;
  // Cautious leaders weigh damage taken more.
  const caution = t.me.aggression <= 3 ? 4 : t.me.aggression >= 7 ? 2 : 3;
  for (const tile of attackTargets(t.ctx, t.state, u, t.seen())) {
    const p = previewAttack(t.ctx, t.state, u, tile);
    if (!p) continue;
    let score: number;
    const dealt = Math.floor((p.toDefender[0] + p.toDefender[1]) / 2);
    const taken = Math.floor((p.toAttacker[0] + p.toAttacker[1]) / 2);
    if (p.target.kind === 'civilian') score = 800;
    else if (p.target.kind === 'unit') {
      if (p.toAttacker[1] >= u.health) continue;
      const left = p.target.unit.health;
      const kill = p.toDefender[0] >= left ? 300 : p.toDefender[1] >= left ? 60 : 0;
      score = kill + dealt * 3 - taken * caution + (kill ? unitPower(t.ctx, p.target.unit) : 0);
    } else {
      const s = p.target.settlement;
      const health = p.split ? Math.floor((p.split.health[0] + p.split.health[1]) / 2) : dealt;
      const walls = p.split ? Math.floor((p.split.walls[0] + p.split.walls[1]) / 2) : 0;
      if (p.captures && p.split && p.split.health[0] >= s.health && p.toAttacker[1] < u.health)
        score = 2000;
      else {
        if (p.toAttacker[1] >= u.health || (p.mode === 'melee' && taken * 2 > u.health)) continue;
        score = health * 3 + walls * 2 - taken * caution;
      }
    }
    if (score > 0 && (!best || score > best.score)) best = { tile, score };
  }
  return best?.tile;
}

/** A civilian with enemies close and no soldier on its tile runs for the nearest settlement. */
function fleeIfThreatened(t: Turn, u: UnitState): boolean {
  if (t.threatNear(u.tile, 3) === 0) return false;
  const guarded = t
    .myUnits()
    .some((o) => o.tile === u.tile && o.id !== u.id && isSoldier(unitRole(t.ctx, o)));
  if (guarded) return false;
  const refuge = nearestOwnSettlement(t, u);
  if (!refuge || refuge.tile === u.tile) return false;
  return goNear(t, u, refuge.tile, 0) || goNear(t, u, refuge.tile, 1);
}

interface Plan {
  /** Soldiers assigned to guard a settlement, and where. */
  guard: Map<string, SettlementState>;
  /** Soldiers walking with a settler (soldier id → settler id). */
  escort: Map<string, string>;
  /** Where the field army goes: an enemy settlement, a camp, or a settlement to defend. */
  target: { tile: number; kind: 'siege' | 'camp' | 'defend' } | null;
  field: Set<string>;
}

function planArmy(t: Turn): Plan {
  const map = t.state.map;
  const soldiers = t.myUnits().filter((u) => isSoldier(unitRole(t.ctx, u)));
  const guard = new Map<string, SettlementState>();
  const free = new Set(soldiers.map((u) => u.id));
  const settlements = [...t.mySettlements()].sort(
    (a, b) =>
      t.threatNear(b.tile, 4) - t.threatNear(a.tile, 4) ||
      Number(b.capital) - Number(a.capital) ||
      (a.id < b.id ? -1 : 1),
  );
  for (const s of settlements) {
    const threat = t.threatNear(s.tile, 4);
    const wanted =
      (s.kind === 'city' || threat > 0 || t.civWars().length > 0 ? 1 : 0) +
      (threat > 30 ? 1 : 0) +
      (threat > 60 ? 1 : 0);
    for (let i = 0; i < wanted; i++) {
      const pick = soldiers
        .filter((u) => free.has(u.id) && distance(map, u.tile, s.tile) <= 10)
        .sort(
          (a, b) =>
            distance(map, a.tile, s.tile) - distance(map, b.tile, s.tile) ||
            Number(a.id.slice(1)) - Number(b.id.slice(1)),
        )[0];
      if (!pick) break;
      free.delete(pick.id);
      guard.set(pick.id, s);
    }
  }
  // Settlers heading out of our land get an escort (raiders carry off lone civilians).
  const escort = new Map<string, string>();
  for (const settler of t.myUnits()) {
    if (unitRole(t.ctx, settler) !== 'settler') continue;
    const going = settler.orders?.kind === 'move' ? settler.orders.target : settler.tile;
    if (map.tiles[going]!.owner === t.player && map.tiles[settler.tile]!.owner === t.player)
      continue;
    const pick = soldiers
      .filter(
        (u) =>
          (free.has(u.id) || guardIsSpare(t, u, guard)) && distance(map, u.tile, settler.tile) <= 5,
      )
      .sort(
        (a, b) =>
          distance(map, a.tile, settler.tile) - distance(map, b.tile, settler.tile) ||
          Number(a.id.slice(1)) - Number(b.id.slice(1)),
      )[0];
    if (!pick) continue;
    free.delete(pick.id);
    guard.delete(pick.id);
    escort.set(pick.id, settler.id);
  }
  return { guard, escort, target: fieldTarget(t, free), field: free };
}

/** A guard that can leave: its settlement is safe and isn't the capital. */
function guardIsSpare(t: Turn, u: UnitState, guard: Map<string, SettlementState>): boolean {
  const s = guard.get(u.id);
  return !!s && t.threatNear(s.tile, 5) === 0 && t.civWars().length === 0;
}

function fieldTarget(t: Turn, field: Set<string>): Plan['target'] {
  const map = t.state.map;
  // Defend first: a settlement with enemies close.
  const threatened = t
    .mySettlements()
    .map((s) => ({ s, threat: t.threatNear(s.tile, 3) }))
    .filter((x) => x.threat > 0)
    .sort((a, b) => b.threat - a.threat || (a.s.id < b.s.id ? -1 : 1))[0];
  if (threatened) return { tile: threatened.s.tile, kind: 'defend' };
  const home = t.mySettlements();
  const nearHome = (tile: number) => Math.min(99, ...home.map((s) => distance(map, s.tile, tile)));
  // At war: the enemy settlement nearest us (weaker ones first among equals).
  const enemies = t.civWars();
  if (enemies.length > 0) {
    const target = t
      .knownSettlements()
      .filter((s) => enemies.includes(s.owner))
      .map((s) => ({ s, score: nearHome(s.tile) * 10 + Math.floor(s.health / 10) }))
      .sort((a, b) => a.score - b.score || (a.s.id < b.s.id ? -1 : 1))[0];
    if (target && field.size >= 2) return { tile: target.s.tile, kind: 'siege' };
  }
  // Otherwise a known hostile camp near home, if the army is big enough to take it.
  if (field.size >= 2) {
    const camp = Object.values(t.state.camps)
      .filter((c) => t.isExplored(c.tile) && nearHome(c.tile) <= 8)
      .sort((a, b) => nearHome(a.tile) - nearHome(b.tile) || (a.id < b.id ? -1 : 1))[0];
    if (camp) return { tile: camp.tile, kind: 'camp' };
  }
  return null;
}

function soldier(t: Turn, u: UnitState, plan: Plan) {
  const map = t.state.map;
  const ward = plan.escort.get(u.id);
  const settler = ward ? t.state.units[ward] : undefined;
  if (settler) {
    if (settler.tile === u.tile) return hold(t, u);
    if (goNear(t, u, settler.tile, 0) || goNear(t, u, settler.tile, 1)) return;
    return hold(t, u);
  }
  const home = plan.guard.get(u.id);
  // Badly hurt: get home to heal, unless it's guarding where it stands.
  if (u.health < 45 && !(home && home.tile === u.tile)) {
    const refuge = nearestOwnSettlement(t, u);
    if (refuge && refuge.tile !== u.tile && goNear(t, u, refuge.tile, 0)) return;
    return hold(t, u);
  }
  if (home) {
    if (u.tile === home.tile) return hold(t, u);
    if (goNear(t, u, home.tile, 0) || goNear(t, u, home.tile, 1)) return;
    return hold(t, u);
  }
  const target = plan.target;
  if (!target) return idle(t, u);
  if (u.health < 70 && target.kind !== 'defend') return hold(t, u);
  const reach = unitRole(t.ctx, u) === 'melee' ? 1 : Math.max(1, unitRange(t.ctx, u));
  const d = distance(map, u.tile, target.tile);
  if (target.kind === 'camp' && d === 1 && campIsEmpty(t, target.tile)) {
    if (t.act({ type: 'move_unit', player: t.player, unit: u.id, to: target.tile })) return;
  }
  if (d <= reach) return hold(t, u);
  // Gather before closing in, so the army arrives together.
  if (target.kind === 'siege' && d <= 4) {
    const close = [...plan.field].filter((id) => {
      const other = t.state.units[id];
      return other && distance(map, other.tile, target.tile) <= 4;
    }).length;
    if (close < Math.min(3, plan.field.size)) return hold(t, u);
  }
  if (goNear(t, u, target.tile, reach)) return;
  if (goNear(t, u, target.tile, reach + 1)) return;
  hold(t, u);
}

function campIsEmpty(t: Turn, tile: number): boolean {
  return !Object.values(t.state.units).some((x) => x.tile === tile);
}

/** No job: stay inside our borders, near the frontier. */
function idle(t: Turn, u: UnitState) {
  // Early on, spare soldiers look around home (scouts don't always survive).
  if (t.state.turn <= 50 && u.health >= 80 && explore(t, u, 10)) return;
  const owner = t.state.map.tiles[u.tile]!.owner;
  if (owner === t.player) return hold(t, u);
  const refuge = nearestOwnSettlement(t, u);
  if (refuge && (goNear(t, u, refuge.tile, 1) || goNear(t, u, refuge.tile, 2))) return;
  hold(t, u);
}

/** Stay put this turn: fortify if it can (it heals by not moving either way). */
function hold(t: Turn, u: UnitState) {
  if (u.orders?.kind === 'fortify' || u.orders?.kind === 'sleep') return;
  if (!t.act({ type: 'fortify_unit', player: t.player, unit: u.id }))
    t.act({ type: 'skip_unit', player: t.player, unit: u.id });
}

function nearestOwnSettlement(t: Turn, u: UnitState): SettlementState | undefined {
  const map = t.state.map;
  return [...t.mySettlements()].sort(
    (a, b) =>
      distance(map, u.tile, a.tile) - distance(map, u.tile, b.tile) || (a.id < b.id ? -1 : 1),
  )[0];
}

/**
 * Moves toward a free tile exactly `ring` tiles from `center` (0 = onto it), trying the nearest few.
 * Returns true if the unit moved.
 */
function goNear(t: Turn, u: UnitState, center: number, ring: number): boolean {
  const map = t.state.map;
  const tiles = (ring === 0 ? [center] : tilesWithin(map, center, ring))
    .filter(
      (tile) =>
        tile !== u.tile &&
        distance(map, tile, center) === ring &&
        t.isExplored(tile) &&
        canTraverse(t.ctx, t.state, u, tile) &&
        !hasForeignUnit(t.state, u, tile) &&
        hasRoom(t.ctx, t.state, u, tile) &&
        !enemySettlementAt(t, tile),
    )
    .sort((a, b) => distance(map, u.tile, a) - distance(map, u.tile, b) || a - b)
    .slice(0, 3);
  for (const tile of tiles) {
    if (u.orders?.kind === 'move' && u.orders.target === tile) return true;
    if (t.act({ type: 'move_unit', player: t.player, unit: u.id, to: tile })) return true;
  }
  return false;
}

function enemySettlementAt(t: Turn, tile: number): boolean {
  const id = t.state.map.tiles[tile]!.settlement;
  const s = id ? t.state.settlements[id] : undefined;
  return !!s && s.tile === tile && s.owner !== t.player;
}

/**
 * Scouts: head for where the most unexplored land is, away from camps. With `homeRange`, only
 * within that distance of our settlements (soldiers looking around), and returns whether it moved.
 */
function explore(t: Turn, u: UnitState, homeRange?: number): boolean {
  const map = t.state.map;
  const explored = t.explored();
  const camps = Object.values(t.state.camps).map((c) => c.tile);
  const others = t
    .myUnits()
    .filter((o) => o.id !== u.id && o.orders?.kind === 'move' && unitRole(t.ctx, o) === 'explorer')
    .map((o) => (o.orders as { target: number }).target);
  const sight = unitDef(t.ctx, u).sight;
  const home = t.mySettlements().map((s) => s.tile);
  const nearHome = (tile: number) =>
    homeRange === undefined || home.some((h) => distance(map, h, tile) <= homeRange);
  for (const radius of homeRange === undefined ? [8, 16] : [8]) {
    const ranked = tilesWithin(map, u.tile, radius)
      .filter(
        (tile) =>
          tile !== u.tile &&
          getBit(explored, tile) &&
          canTraverse(t.ctx, t.state, u, tile) &&
          !hasForeignUnit(t.state, u, tile) &&
          hasRoom(t.ctx, t.state, u, tile) &&
          nearHome(tile),
      )
      .map((tile) => {
        let unknown = 0;
        for (const n of tilesWithin(map, tile, sight)) if (!getBit(explored, n)) unknown++;
        let score = unknown * 10 - distance(map, u.tile, tile) * 3;
        if (camps.some((c) => distance(map, c, tile) <= 2)) score -= 200;
        if (others.some((o) => distance(map, o, tile) <= 4)) score -= 40;
        if (t.threatNear(tile, 1) > 0) score -= 200;
        return { tile, unknown, score };
      })
      .filter((x) => x.unknown > 0 && x.score > 0)
      .sort((a, b) => b.score - a.score || a.tile - b.tile);
    const orders = u.orders;
    if (orders?.kind === 'move' && ranked.some((x) => x.tile === orders.target)) return true;
    for (const x of ranked.slice(0, 3)) {
      if (t.act({ type: 'move_unit', player: t.player, unit: u.id, to: x.tile })) return true;
    }
  }
  if (homeRange !== undefined) return false;
  // Nothing left to see nearby: an explorer isn't worth its upkeep once the map is known.
  if (t.state.turn > 60) t.act({ type: 'disband_unit', player: t.player, unit: u.id });
  else hold(t, u);
  return false;
}
