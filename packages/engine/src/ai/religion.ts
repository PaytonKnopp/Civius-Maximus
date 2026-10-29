import { type BeliefDef, type Effect, resolveText } from '@cx/content';
import { atWar } from '../context';
import { evaluateCondition } from '../effects/conditions';
import { distance, neighbors } from '../map/hex';
import {
  faithUnitProblem,
  religionFoundingProblem,
  freeBeliefs,
  pantheonCost,
  pantheonOf,
  religionsOf,
  spreadProblem,
} from '../religion/rules';
import { heresyProblem, theologyTargets } from '../religion/theology';
import { tileFacts } from '../settlements/rules';
import type { SettlementState, UnitState } from '../state';
import { countsAs } from '../uniques';
import { goNear, hold, nearestOwnSettlement } from './military';
import type { Turn } from './turn';
import { effectValue, yieldWeight } from './values';

/** A pantheon as soon as there's the faith for one, and religious units once there's a religion. */
export function manageReligion(t: Turn) {
  choosePantheon(t);
  buyReligiousUnits(t);
}

function choosePantheon(t: Turn) {
  if (pantheonOf(t.ctx, t.state, t.player)) return;
  if (t.p.faith < pantheonCost(t.ctx, t.state)) return;
  const best = bestBelief(t, freeBeliefs(t.ctx, t.state, 'pantheon'));
  if (best) t.act({ type: 'found_pantheon', player: t.player, belief: best.id });
}

function bestBelief(t: Turn, beliefs: BeliefDef[]): BeliefDef | undefined {
  let best: { b: BeliefDef; v: number } | undefined;
  for (const b of beliefs) {
    const v = b.effects.reduce((sum, e) => sum + beliefEffectValue(t, e), 0);
    if (!best || v > best.v) best = { b, v };
  }
  return best?.b;
}

function beliefEffectValue(t: Turn, e: Effect): number {
  if (e.effect === 'modify_yield' && e.target.scope === 'tiles' && 'amount' in e.params) {
    // About half the tiles it would apply to get worked.
    const tiles = matchingTiles(t, e);
    return Math.floor((e.params.amount * yieldWeight(t.me, e.params.yield) * tiles) / 2);
  }
  return effectValue(t, e);
}

/** How many tiles this player owns that a tile effect's condition holds on. */
function matchingTiles(t: Turn, e: Effect): number {
  const map = t.state.map;
  let n = 0;
  for (let i = 0; i < map.tiles.length; i++) {
    if (map.tiles[i]!.owner !== t.player) continue;
    if (
      e.condition === undefined ||
      evaluateCondition(
        {
          content: t.ctx.content,
          playerId: t.player,
          tile: tileFacts(t.state, i),
          neighbors: neighbors(map, i).map((x) => tileFacts(t.state, x)),
        },
        e.condition,
      )
    )
      n++;
  }
  return n;
}

/** A great prophet: found a religion if there's still room for one. Returns true if it acted. */
export function prophet(t: Turn, u: UnitState): boolean {
  const problem = religionFoundingProblem(t.ctx, t.state, t.player, u.id);
  if (!problem) {
    const founder = bestBelief(t, freeBeliefs(t.ctx, t.state, 'founder'));
    const follower = bestBelief(t, freeBeliefs(t.ctx, t.state, 'follower'));
    if (!founder || !follower) return false;
    const worship = bestBelief(t, freeBeliefs(t.ctx, t.state, 'worship'));
    return t.act({
      type: 'found_religion',
      player: t.player,
      unit: u.id,
      name: religionName(t),
      founder: founder.id,
      follower: follower.id,
      ...(worship ? { worship: worship.id } : {}),
    });
  }
  if (problem.code !== 'needs_holy_site') return false;
  const holy = t.ctx.content.rules.religion.holyDistrict;
  const site = t
    .mySettlements()
    .filter((s) => s.districts.some((d) => countsAs(t.ctx, 'district', d.id, holy)))
    .sort(
      (a, b) => distance(t.state.map, u.tile, a.tile) - distance(t.state.map, u.tile, b.tile),
    )[0];
  if (!site) return false;
  if (goNear(t, u, site.tile, 0)) {
    const moved = t.state.units[u.id];
    if (moved?.tile === site.tile && moved.moves > 0) prophet(t, moved);
    return true;
  }
  return false;
}

function religionName(t: Turn): string {
  const civ = t.ctx.content.entities.civ[t.p.civ];
  const stem = civ ? `${resolveText(t.ctx.content, civ.adjective)} Faith` : 'The Old Faith';
  const taken = new Set(religionsOf(t.state).map((r) => r.name.toLowerCase()));
  if (!taken.has(stem.toLowerCase())) return stem;
  for (let i = 2; ; i++) if (!taken.has(`${stem} ${i}`.toLowerCase())) return `${stem} ${i}`;
}

const religiousDef = (t: Turn, type: string) => t.ctx.content.entities.unit[type]?.religious;

/** Whether another religion has (or is winning) a hold on one of our settlements. */
function heresyAtHome(t: Turn, religion: string): SettlementState | undefined {
  return t.mySettlements().find((s) => {
    if (s.religion !== null && s.religion !== religion) return true;
    const ours = s.pressure[religion] ?? 0;
    return Object.entries(s.pressure).some(([r, n]) => r !== religion && n > ours && n > 0);
  });
}

/**
 * Religious units, a few at a time, bought in a settlement that follows our religion: an
 * inquisitor when another religion is taking hold at home, else the strongest preacher we can
 * buy (an apostle once we have Theology, a missionary before).
 */
function buyReligiousUnits(t: Turn) {
  const religion = t.p.religion;
  if (religion === null) return;
  const home = nearestFollower(t);
  if (!home) return;
  const mine = t.myUnits().filter((u) => u.religion !== undefined);
  if (mine.length >= 1 + Math.floor(t.me.faith / 4)) return;
  const units = t.ctx.content.ids.unit.filter(
    (id) =>
      t.ctx.content.entities.unit[id]!.faithCost > 0 &&
      !faithUnitProblem(t.ctx, t.state, t.player, home.id, id),
  );
  const buy = (unit: string) =>
    t.act({ type: 'buy_faith_unit', player: t.player, settlement: home.id, unit });
  if (heresyAtHome(t, religion) && !mine.some((u) => religiousDef(t, u.type)?.removesHeresy)) {
    const inquisitor = units.find((id) => religiousDef(t, id)?.removesHeresy);
    if (inquisitor) return void buy(inquisitor);
  }
  const preacher = units
    .filter((id) => religiousDef(t, id)?.spread !== 0)
    .sort(
      (a, b) =>
        (religiousDef(t, b)?.strength ?? 0) - (religiousDef(t, a)?.strength ?? 0) ||
        (a < b ? -1 : 1),
    )[0];
  if (preacher && spreadTarget(t, home.tile, religion, preacher)) buy(preacher);
}

/** Our holy city if we hold it, else our first settlement following our religion. */
function nearestFollower(t: Turn): SettlementState | undefined {
  const religion = t.p.religion;
  if (religion === null) return undefined;
  const holy = t.state.settlements[t.state.religions[religion]?.holyCity ?? ''];
  if (holy?.owner === t.player) return holy;
  return t.mySettlements().find((s) => s.religion === religion);
}

/**
 * The best settlement for a missionary to preach in next: close, not an enemy's, and one where
 * preaching would convert it (else the nearest that doesn't follow it yet).
 */
function spreadTarget(
  t: Turn,
  from: number | undefined,
  religion: string,
  unit: string,
): SettlementState | undefined {
  if (from === undefined) return undefined;
  const r = t.ctx.content.rules.religion;
  const areas = t.areas({ type: unit });
  let best: { s: SettlementState; score: number } | undefined;
  for (const s of [...t.mySettlements(), ...t.knownSettlements()]) {
    if (s.religion === religion || areas[s.tile] !== areas[from]) continue;
    if (s.owner !== t.player && atWar(t.state, t.player, s.owner)) continue;
    const mine = s.pressure[religion] ?? 0;
    const lead = s.religion ? (s.pressure[s.religion] ?? 0) : 0;
    const converts =
      mine + r.missionaryPressure >= r.convertAt && mine + r.missionaryPressure > lead;
    const score = distance(t.state.map, from, s.tile) + (converts ? 0 : 8);
    if (!best || score < best.score || (score === best.score && s.id < best.s.id))
      best = { s, score };
  }
  return best?.s;
}

/** Fight a rival religious unit next to this one if we'd come off better. Returns true if it did. */
function theology(t: Turn, u: UnitState): boolean {
  const ours = religiousDef(t, u.type)?.strength ?? 0;
  if (ours <= 0 || u.health * 2 < t.ctx.content.rules.combat.maxHealth) return false;
  const target = theologyTargets(t.ctx, t.state, u)
    .map((id) => t.state.units[id]!)
    .filter((o) => (religiousDef(t, o.type)?.strength ?? 0) <= ours && o.health <= u.health)
    .sort((a, b) => a.health - b.health || (a.id < b.id ? -1 : 1))[0];
  return (
    target !== undefined &&
    t.act({ type: 'theological_combat', player: t.player, unit: u.id, target: target.id })
  );
}

/** An inquisitor: purge other religions from our settlements, nearest first. */
function inquisitor(t: Turn, u: UnitState) {
  const purge = (id: string) =>
    !heresyProblem(t.ctx, t.state, t.player, u.id, id) &&
    t.act({ type: 'remove_heresy', player: t.player, unit: u.id, settlement: id });
  const target = t
    .mySettlements()
    .filter((s) => heresyProblem(t.ctx, t.state, t.player, u.id, s.id)?.code !== 'nothing')
    .sort(
      (a, b) =>
        distance(t.state.map, u.tile, a.tile) - distance(t.state.map, u.tile, b.tile) ||
        (a.id < b.id ? -1 : 1),
    )[0];
  if (!target) return hold(t, u);
  if (purge(target.id)) return;
  if (goNear(t, u, target.tile, 1) || goNear(t, u, target.tile, 0)) {
    if (t.state.units[u.id]) purge(target.id);
    return;
  }
  hold(t, u);
}

/** A guru: stay with the most hurt of our religious units. */
function guru(t: Turn, u: UnitState) {
  const max = t.ctx.content.rules.combat.maxHealth;
  const hurt = t
    .myUnits()
    .filter((o) => o.id !== u.id && o.religion === u.religion && o.health < max)
    .sort((a, b) => a.health - b.health || (a.id < b.id ? -1 : 1))[0];
  if (hurt && goNear(t, u, hurt.tile, 1)) return;
  hold(t, u);
}

/**
 * A religious unit. Missionaries and apostles preach where they stand or walk to the next
 * settlement worth preaching in, fighting rival preachers they'd beat on the way.
 */
export function missionary(t: Turn, u: UnitState) {
  if (t.threatNear(u.tile, 2) > 0) {
    const home = nearestOwnSettlement(t, u);
    if (home && home.tile !== u.tile && goNear(t, u, home.tile, 0)) return;
  }
  if (theology(t, u)) return;
  const def = religiousDef(t, u.type);
  if (def?.removesHeresy) return inquisitor(t, u);
  if (def && def.heals > 0) return guru(t, u);
  const target = spreadTarget(t, u.tile, u.religion!, u.type);
  if (!target) return hold(t, u);
  if (!spreadProblem(t.state, t.player, u.id, target.id, t.ctx)) {
    t.act({ type: 'spread_religion', player: t.player, unit: u.id, settlement: target.id });
    return;
  }
  if (goNear(t, u, target.tile, 1) || goNear(t, u, target.tile, 0)) {
    const moved = t.state.units[u.id];
    if (moved && !spreadProblem(t.state, t.player, u.id, target.id, t.ctx))
      t.act({ type: 'spread_religion', player: t.player, unit: u.id, settlement: target.id });
    return;
  }
  hold(t, u);
}
