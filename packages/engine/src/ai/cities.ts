import type { Effect } from '@cx/content';
import { previewStrike, strikeTargets } from '../combat/strength';
import { unitDef } from '../context';
import { toFixed } from '../fixed';
import { distance } from '../map/hex';
import { districtLimit, districtYields, placementTiles } from '../settlements/districts';
import {
  availableItems,
  canBuyWithFaith,
  goldPerTurn,
  isBuyable,
  itemCost,
  itemDef,
  itemProblem,
  purchasableTiles,
  purchaseCost,
  settlementLimit,
  settlementYields,
  tilePurchaseCost,
  tileYields,
  townUpgradeCost,
} from '../settlements/rules';
import type { BuildItem, SettlementState } from '../state';
import { routesOf, tradeCapacity } from '../trade/rules';
import { obsoletedBy } from '../units/upgrades';
import { hasSettleSite } from './settle';
import { wantsNuke } from './nukes';
import { type Role, type Turn, unitPower, unitRole } from './turn';
import { effectValue, fixedYieldsValue, happinessWeight, yieldsValue, yieldWeight } from './values';

/** After taking a settlement the AI keeps it (raze and liberate are left to people for now). */
export function manageCaptures(t: Turn) {
  for (const s of t.mySettlements()) {
    if (s.captureChoice)
      t.act({ type: 'capture_choice', player: t.player, settlement: s.id, choice: 'keep' });
  }
}

/** Each settlement's ranged strike, at the enemy it hurts most (finishing one off first). */
export function strikeFromSettlements(t: Turn) {
  for (const s of t.mySettlements()) {
    let best: { tile: number; score: number } | undefined;
    for (const tile of strikeTargets(t.ctx, t.state, s)) {
      const p = previewStrike(t.ctx, t.state, s, tile);
      if (!p || p.target.kind !== 'unit') continue;
      const kills = p.toDefender[0] >= p.target.unit.health;
      const score = (kills ? 1000 : 0) + p.toDefender[0] + p.toDefender[1] - p.target.unit.health;
      if (!best || score > best.score) best = { tile, score };
    }
    if (best) t.act({ type: 'strike', player: t.player, settlement: s.id, tile: best.tile });
  }
}

/** Gold kept back for emergencies (hundredths). */
const reserve = (t: Turn) => toFixed(30 + 10 * t.mySettlements().length);

/** Towns: grow the best into cities when gold allows, and pick a specialization. */
export function manageTowns(t: Turn) {
  const towns = t
    .mySettlements()
    .filter((s) => s.kind === 'town')
    .sort((a, b) => b.population - a.population || (a.id < b.id ? -1 : 1));
  const minPop = t.me.gold >= 8 ? 5 : 3;
  const town = towns.find((s) => s.population >= minPop && !s.captureChoice);
  if (town && t.p.gold >= townUpgradeCost(t.ctx, t.state, t.player) + reserve(t)) {
    t.act({ type: 'upgrade_town', player: t.player, settlement: town.id });
  }
  const spec = t.ctx.content.rules.settlements.specialization;
  for (const s of t.mySettlements()) {
    if (s.kind !== 'town' || s.specialization !== null || s.population < spec.minPopulation)
      continue;
    const choice = bestSpecialization(t, s);
    if (choice)
      t.act({
        type: 'set_specialization',
        player: t.player,
        settlement: s.id,
        specialization: choice,
      });
  }
}

function bestSpecialization(t: Turn, s: SettlementState): string | undefined {
  const made = settlementYields(t.ctx, t.state, s).total;
  const local = (e: Effect) => {
    if (e.effect !== 'modify_yield') return effectValue(t, e);
    const w = yieldWeight(t.me, e.params.yield);
    if ('amount' in e.params) return e.params.amount * w;
    return Math.floor(((made[e.params.yield] ?? 0) * e.params.percent * w) / 10_000);
  };
  let best: { id: string; score: number } | undefined;
  for (const id of t.ctx.content.ids.specialization) {
    const def = t.ctx.content.entities.specialization[id]!;
    let score = def.localEffects.reduce((sum, e) => sum + local(e), 0);
    score += def.effects.reduce((sum, e) => sum + effectValue(t, e), 0);
    if (def.send)
      score += Math.floor(((made[def.send.yield] ?? 0) * yieldWeight(t.me, def.send.yield)) / 200);
    if (!best || score > best.score) best = { id, score };
  }
  return best?.id;
}

/** How big an army this leader wants right now, and how big it is. */
export function armyPlan(t: Turn): { have: number; want: number } {
  return t.memo('army', () => {
    const n = t.mySettlements().length;
    const have = t.myUnits().filter((u) => isSoldier(unitRole(t.ctx, u))).length;
    const threatened = t.mySettlements().filter((s) => t.threatNear(s.tile, 3) > 0).length;
    let want =
      n < 2 ? 1 : 1 + n + Math.floor((n * Math.max(0, t.me.aggression - 4)) / 3) + threatened;
    if (t.civWars().length > 0) want += n + 2;
    // Broke: stop adding upkeep unless in danger.
    if (goldPerTurn(t.ctx, t.state, t.player) < 0 && t.p.gold < toFixed(30) && threatened === 0)
      want = Math.min(want, have);
    return { have, want };
  });
}

export const isSoldier = (role: Role) => role === 'melee' || role === 'ranged' || role === 'siege';

/** Production queues: what each city should make next, and what's worth buying. */
export function manageProduction(t: Turn) {
  for (const s of t.mySettlements()) {
    if (s.kind !== 'city' || s.captureChoice) continue;
    const head = s.queue[0];
    // Urgent needs go to the front of the queue (progress on the rest is kept).
    const urgent = urgentBuild(t, s);
    if (urgent) {
      if (head?.id === urgent.id) continue;
      if (head?.kind === 'unit' && urgent.kind === 'unit' && sameRole(t, head, urgent)) continue;
      // (Units replaced by newer ones since they were queued are dropped.)
      const rest = s.queue.filter(
        (i) =>
          i.id !== urgent.id && !(i.kind === 'unit' && obsoletedBy(t.ctx, t.state, t.player, i.id)),
      );
      const queue = [urgent, ...rest].slice(0, 8);
      t.act({ type: 'set_queue', player: t.player, settlement: s.id, queue });
      continue;
    }
    if (head) continue;
    const choice = bestImprovement(t, s) ?? surplusUnit(t, s);
    if (choice) t.act({ type: 'set_queue', player: t.player, settlement: s.id, queue: [choice] });
  }
  buyThings(t);
}

const sameRole = (t: Turn, a: BuildItem, b: BuildItem) =>
  unitRole(t.ctx, { type: a.id }) === unitRole(t.ctx, { type: b.id });

/** Enemies nearby stronger than what guards the settlement. */
function inDanger(t: Turn, s: SettlementState): boolean {
  const threat = t.threatNear(s.tile, 3);
  if (threat === 0) return false;
  // The settlement fights back a little on its own; soldiers nearby count half.
  let guard = s.kind === 'city' ? 15 : 5;
  for (const u of t.myUnits()) {
    const d = distance(t.state.map, u.tile, s.tile);
    if (d === 0) guard += unitPower(t.ctx, u);
    else if (d <= 2) guard += Math.floor(unitPower(t.ctx, u) / 2);
  }
  return threat > guard;
}

function wallsItem(t: Turn, s: SettlementState): BuildItem | undefined {
  return t.memo(`walls:${s.id}`, () =>
    availableItems(t.ctx, t.state, s).find(
      (i) => i.kind === 'building' && t.ctx.content.entities.building[i.id]!.walls > 0,
    ),
  );
}

/** Turns to finish an item here (at least 1). */
function turnsFor(t: Turn, s: SettlementState, item: BuildItem): number {
  const production = Math.max(100, settlementYields(t.ctx, t.state, s).total.production ?? 0);
  const left =
    itemCost(t.ctx, t.state, t.player, item, s) - (s.progress[`${item.kind}:${item.id}`] ?? 0);
  return Math.max(1, Math.ceil(left / production));
}

/** Units this city can make now. */
function unitItems(t: Turn, s: SettlementState): BuildItem[] {
  return t.memo(`units:${s.id}`, () =>
    t.ctx.content.ids.unit
      // Nuclear weapons only through `urgentBuild`'s deterrent (see ai/nukes.ts).
      .filter((id) => !t.ctx.content.entities.unit[id]!.nuke)
      .map((id) => ({ kind: 'unit' as const, id }))
      .filter((item) => !itemProblem(t.ctx, t.state, s, item)),
  );
}

/** Something that should be built before anything else here, if anything. */
function urgentBuild(t: Turn, s: SettlementState): BuildItem | undefined {
  const units = unitItems(t, s);
  const army = armyPlan(t);
  const role = (i: BuildItem) => unitRole(t.ctx, { type: i.id });
  // 1. Danger: walls if they'd be ready in time, otherwise soldiers.
  if (inDanger(t, s)) {
    const walls = wallsItem(t, s);
    if (walls && turnsFor(t, s, walls) <= 3 && s.walls <= 0) return walls;
    const defender = bestUnit(t, units, ['melee', 'ranged']);
    if (defender) return defender;
  }
  if (army.have === 0) {
    const first = bestUnit(t, units, ['melee']);
    if (first) return first;
  }
  // 2. Settlers while there's room to grow.
  const settler = units.find((i) => role(i) === 'settler');
  if (settler && s.population >= 2 && wantsSettler(t)) return settler;
  // 3. The army this leader wants.
  if (army.have + armyQueued(t) < army.want) {
    const unit = bestUnit(t, units, nextRoles(t));
    if (unit) return unit;
  }
  // 4. Traders for every free trade route.
  const trader = units.find((i) => role(i) === 'trader');
  if (trader && freeRoutes(t) > 0 && !queued(t, trader.id)) return trader;
  // 5. A commander once there's an army worth leading.
  const commander = units.find((i) => role(i) === 'commander');
  const commanders = t.myUnits().filter((u) => unitRole(t.ctx, u) === 'commander').length;
  const leads = army.have >= 5 && (t.civWars().length > 0 || t.me.aggression >= 6);
  if (commander && commanders === 0 && leads && !queued(t, commander.id)) return commander;
  // 6. One explorer early on (and later, while we haven't met anyone).
  const explorers = t.myUnits().filter((u) => unitRole(t.ctx, u) === 'explorer').length;
  const scout = units.find((i) => role(i) === 'explorer');
  const curious = t.state.turn <= 40 || (t.state.turn <= 150 && t.metRivals().length === 0);
  if (scout && explorers === 0 && curious && s.capital && !queued(t, scout.id)) return scout;
  // 7. A nuclear deterrent, in the capital, for aggressive leaders at war (ai/nukes.ts).
  if (s.capital && wantsNuke(t)) {
    const nuke = t.ctx.content.ids.unit
      .filter((id) => t.ctx.content.entities.unit[id]!.nuke)
      .map((id) => ({ kind: 'unit' as const, id }))
      .filter((item) => !itemProblem(t.ctx, t.state, s, item))
      .pop();
    if (nuke && !queued(t, nuke.id)) return nuke;
  }
  return undefined;
}

/** Trade routes we could run but have no trader for yet. */
function freeRoutes(t: Turn): number {
  const traders = t.myUnits().filter((u) => unitRole(t.ctx, u) === 'trader').length;
  return tradeCapacity(t.ctx, t.state, t.player) - routesOf(t.state, t.player).length - traders;
}

/** Soldiers at the front of our queues (on their way). */
function armyQueued(t: Turn): number {
  return t.mySettlements().filter((s) => {
    const head = s.queue[0];
    return head?.kind === 'unit' && isSoldier(unitRole(t.ctx, { type: head.id }));
  }).length;
}

/** Nothing else worth building: soldiers, up to twice the army wanted. */
function surplusUnit(t: Turn, s: SettlementState): BuildItem | undefined {
  const army = armyPlan(t);
  if (army.have + armyQueued(t) >= army.want * 2) return undefined;
  return bestUnit(t, unitItems(t, s), nextRoles(t));
}

/** Some city of ours already has this as its current build. */
function queued(t: Turn, id: string): boolean {
  return t.mySettlements().some((s) => s.queue[0]?.id === id);
}

function wantsSettler(t: Turn): boolean {
  const n = t.mySettlements().length;
  const settlers =
    t.myUnits().filter((u) => unitRole(t.ctx, u) === 'settler').length +
    t.mySettlements().filter((s) => {
      const head = s.queue[0];
      return head?.kind === 'unit' && unitRole(t.ctx, { type: head.id }) === 'settler';
    }).length;
  const target =
    settlementLimit(t.ctx, t.state, t.player) + Math.max(0, Math.floor((t.me.expansion - 4) / 3));
  if (n + settlers >= target) return false;
  if (settlers >= 1 + Math.floor(n / 3)) return false;
  return hasSettleSite(t);
}

/** Which kinds of soldier the army is short of (a mix of melee, ranged and, at war, siege). */
function nextRoles(t: Turn): Role[] {
  const counts = { melee: 0, ranged: 0, siege: 0 };
  for (const u of t.myUnits()) {
    const r = unitRole(t.ctx, u);
    if (r === 'melee' || r === 'ranged' || r === 'siege') counts[r]++;
  }
  const total = counts.melee + counts.ranged + counts.siege;
  if (t.civWars().length > 0 && counts.siege * 6 < total) return ['siege', 'melee', 'ranged'];
  if (counts.ranged * 5 < total * 2) return ['ranged', 'melee'];
  return ['melee', 'ranged'];
}

/** The strongest unit of the first role that has one (ties: cheaper). */
function bestUnit(t: Turn, units: BuildItem[], roles: Role[]): BuildItem | undefined {
  for (const r of roles) {
    let best: { item: BuildItem; power: number; cost: number } | undefined;
    for (const item of units) {
      if (unitRole(t.ctx, { type: item.id }) !== r) continue;
      const def = unitDef(t.ctx, { type: item.id });
      const power = Math.max(def.strength, def.rangedStrength);
      if (!best || power > best.power || (power === best.power && def.cost < best.cost))
        best = { item, power, cost: def.cost };
    }
    if (best) return best.item;
  }
  return undefined;
}

/** Points per turn an item would add here (before cost), or 0 if it isn't worth building. */
function improvementValue(t: Turn, s: SettlementState, item: BuildItem): number {
  const me = t.me;
  const happy = happinessWeight(t, s);
  const e = t.ctx.content.entities;
  if (item.kind === 'building') {
    const def = e.building[item.id]!;
    let v =
      yieldsValue(me, def.yields) +
      def.happiness * happy -
      def.maintenance * yieldWeight(me, 'gold');
    for (const effect of [...def.localEffects, ...def.effects]) v += effectValue(t, effect);
    if (def.walls > 0) {
      const exposed = t.threatNear(s.tile, 6) > 0 || t.civWars().length > 0;
      v += exposed ? 30 + me.aggression * 2 : s.capital ? 6 : 2;
    }
    return v;
  }
  if (item.kind === 'project') {
    // The space race: worth more to scientific leaders, and more with each step done.
    return 50 + me.science * 10 + t.p.spaceProjects.length * 30;
  }
  if (item.kind === 'district') {
    const def = e.district[item.id]!;
    // The Spaceport is worth what the space race is worth.
    if (spaceDistricts(t).has(item.id)) return 60 + me.science * 10;
    let v = fixedYieldsValue(me, districtYields(t.ctx, t.state, item.tile!, item.id).total);
    v = Math.floor((v * (5 + me.districts)) / 10);
    // Buildings and specialists to come.
    v += 6 + Math.floor(yieldsValue(me, def.specialistYields) / 2) + def.happiness * happy;
    for (const effect of [...def.localEffects, ...def.effects]) v += effectValue(t, effect);
    return v;
  }
  if (item.kind === 'wonder') {
    const def = e.wonder[item.id]!;
    if (queued(t, item.id)) return 0;
    if (turnsFor(t, s, item) > 20 + me.wonders * 2) return 0;
    let v = yieldsValue(me, def.yields) + def.happiness * happy + 10;
    for (const effect of [...def.localEffects, ...def.effects]) v += effectValue(t, effect);
    return Math.floor((v * (me.wonders + 2)) / 7);
  }
  return 0;
}

function bestImprovement(t: Turn, s: SettlementState): BuildItem | undefined {
  const items = availableItems(t.ctx, t.state, s);
  let best: { item: BuildItem; score: number } | undefined;
  const specialty = s.districts.filter((d) => e(t, d.id)?.specialty).length;
  for (const raw of items) {
    if (raw.kind === 'unit' || (raw.kind === 'project' && !isSpaceProject(t, raw.id))) continue;
    const item = raw.kind === 'building' ? raw : withTile(t, s, raw);
    if (!item) continue;
    if (
      item.kind === 'district' &&
      e(t, item.id)?.specialty &&
      specialty >= districtLimit(t.ctx, s)
    )
      continue;
    const value = improvementValue(t, s, item);
    if (value <= 0) continue;
    const cost = Math.max(1, Math.floor(itemCost(t.ctx, t.state, t.player, item, s) / 100));
    const score = Math.floor((value * 1000) / cost);
    if (!best || score > best.score) best = { item, score };
  }
  return best?.item;
}

const e = (t: Turn, id: string) => t.ctx.content.entities.district[id];

const isSpaceProject = (t: Turn, id: string) =>
  t.state.settings.science !== false && t.ctx.content.rules.science.projects.includes(id);

/** Districts space projects are done on (none once the race is off). */
function spaceDistricts(t: Turn): Set<string> {
  return t.turnMemo('spaceDistricts', () => {
    if (t.state.settings.science === false) return new Set<string>();
    const out = new Set<string>();
    for (const id of t.ctx.content.rules.science.projects) {
      const d = t.ctx.content.entities.project[id]?.onDistrict;
      if (d) out.add(d);
    }
    // One is enough.
    const have = t.mySettlements().some((s) => s.districts.some((d) => out.has(d.id)));
    return have ? new Set<string>() : out;
  });
}

/** A district or wonder with its best tile: districts where they yield most, wonders where the land is poorest. */
function withTile(t: Turn, s: SettlementState, item: BuildItem): BuildItem | undefined {
  const tiles = placementTiles(t.ctx, t.state, s, item.kind as 'district', item.id);
  let best: { tile: number; score: number } | undefined;
  for (const tile of tiles) {
    const score =
      item.kind === 'district'
        ? fixedYieldsValue(t.me, districtYields(t.ctx, t.state, tile, item.id).total) * 10 -
          fixedYieldsValue(t.me, tileYields(t.ctx, t.state, tile, t.player).total)
        : -fixedYieldsValue(t.me, tileYields(t.ctx, t.state, tile, t.player).total);
    if (!best || score > best.score) best = { tile, score };
  }
  return best && { ...item, tile: best.tile };
}

/** Buys a defender for a city in danger, otherwise the current build somewhere when rich. */
function buyThings(t: Turn) {
  const cities = t
    .mySettlements()
    .filter((s) => s.kind === 'city' && !s.captureChoice)
    .sort((a, b) => b.population - a.population || (a.id < b.id ? -1 : 1));
  for (const s of cities) {
    const head = s.queue[0];
    if (!head || !isBuyable(head) || !inDanger(t, s)) continue;
    if (head.kind === 'unit' && !isSoldier(unitRole(t.ctx, { type: head.id }))) continue;
    if (t.p.gold >= purchaseCost(t.ctx, t.state, t.player, head, s)) {
      t.act({ type: 'buy_item', player: t.player, settlement: s.id, item: head });
      return;
    }
  }
  // Faith has no other use yet: spend it where an ability allows.
  for (const s of cities) {
    const head = s.queue[0];
    if (!head || !isBuyable(head) || !canBuyWithFaith(t.ctx, t.state, t.player, head)) continue;
    if (turnsFor(t, s, head) <= 2) continue;
    if (t.p.faith >= purchaseCost(t.ctx, t.state, t.player, head, s)) {
      t.act({
        type: 'buy_item',
        player: t.player,
        settlement: s.id,
        item: head,
        currency: 'faith',
      });
      return;
    }
  }
  const rich = reserve(t) * 2 + toFixed(100 + t.me.gold * 10);
  if (buyResourceTile(t, rich)) return;
  for (const s of cities) {
    const head = s.queue[0];
    if (!head || !isBuyable(head) || !itemDef(t.ctx, head)) continue;
    if (turnsFor(t, s, head) <= 2) continue;
    const cost = purchaseCost(t.ctx, t.state, t.player, head, s);
    if (t.p.gold >= cost + rich) {
      t.act({ type: 'buy_item', player: t.player, settlement: s.id, item: head });
      return;
    }
  }
}

/**
 * With gold to spare, buy a tile with a luxury or strategic resource next to a settlement
 * (luxuries first, then the cheapest). Returns true if it bought one.
 */
function buyResourceTile(t: Turn, rich: number): boolean {
  let best: { s: string; tile: number; cost: number; luxury: boolean } | undefined;
  for (const s of t.mySettlements()) {
    for (const tile of purchasableTiles(t.ctx, t.state, s)) {
      const res = t.state.map.tiles[tile]!.resource;
      const cls = res ? t.ctx.content.entities.resource[res]?.class : undefined;
      if (cls !== 'luxury' && cls !== 'strategic') continue;
      const cost = tilePurchaseCost(t.ctx, t.state, s, tile);
      const luxury = cls === 'luxury';
      if (
        !best ||
        (luxury && !best.luxury) ||
        (luxury === best.luxury && (cost < best.cost || (cost === best.cost && tile < best.tile)))
      )
        best = { s: s.id, tile, cost, luxury };
    }
  }
  if (!best || t.p.gold < best.cost + rich) return false;
  return t.act({ type: 'buy_tile', player: t.player, settlement: best.s, tile: best.tile });
}
