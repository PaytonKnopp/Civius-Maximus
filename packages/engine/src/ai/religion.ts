import { type BeliefDef, type Effect, resolveText } from '@cx/content';
import { atWar } from '../context';
import { evaluateCondition } from '../effects/conditions';
import { toFixed } from '../fixed';
import { distance, neighbors } from '../map/hex';
import {
  faithUnitProblem,
  religionFoundingProblem,
  freeBeliefs,
  pantheonOf,
  religionsOf,
  spreadProblem,
} from '../religion/rules';
import { tileFacts } from '../settlements/rules';
import type { SettlementState, UnitState } from '../state';
import { countsAs } from '../uniques';
import { goNear, hold, nearestOwnSettlement } from './military';
import type { Turn } from './turn';
import { effectValue, yieldWeight } from './values';

/** A pantheon as soon as there's the faith for one, and missionaries once there's a religion. */
export function manageReligion(t: Turn) {
  choosePantheon(t);
  buyMissionaries(t);
}

function choosePantheon(t: Turn) {
  if (pantheonOf(t.ctx, t.state, t.player)) return;
  if (t.p.faith < toFixed(t.ctx.content.rules.religion.pantheonFaith)) return;
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
    return t.act({
      type: 'found_religion',
      player: t.player,
      unit: u.id,
      name: religionName(t),
      founder: founder.id,
      follower: follower.id,
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

/** Missionaries: a few at a time, bought in a settlement that follows our religion. */
function buyMissionaries(t: Turn) {
  const religion = t.p.religion;
  if (religion === null) return;
  const unit = t.ctx.content.ids.unit.find((id) => t.ctx.content.entities.unit[id]!.faithCost > 0);
  if (!unit) return;
  const have = t.myUnits().filter((u) => u.religion !== undefined).length;
  if (have >= 1 + Math.floor(t.me.faith / 4)) return;
  const home = nearestFollower(t);
  if (!spreadTarget(t, home?.tile, religion, unit)) return;
  if (!home || faithUnitProblem(t.ctx, t.state, t.player, home.id, unit)) return;
  t.act({ type: 'buy_faith_unit', player: t.player, settlement: home.id, unit });
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

/** A missionary: preach where it stands, or walk to the next settlement worth preaching in. */
export function missionary(t: Turn, u: UnitState) {
  if (t.threatNear(u.tile, 2) > 0) {
    const home = nearestOwnSettlement(t, u);
    if (home && home.tile !== u.tile && goNear(t, u, home.tile, 0)) return;
  }
  const target = spreadTarget(t, u.tile, u.religion!, u.type);
  if (!target) return hold(t, u);
  if (!spreadProblem(t.state, t.player, u.id, target.id)) {
    t.act({ type: 'spread_religion', player: t.player, unit: u.id, settlement: target.id });
    return;
  }
  if (goNear(t, u, target.tile, 1) || goNear(t, u, target.tile, 0)) {
    const moved = t.state.units[u.id];
    if (moved && !spreadProblem(t.state, t.player, u.id, target.id))
      t.act({ type: 'spread_religion', player: t.player, unit: u.id, settlement: target.id });
    return;
  }
  hold(t, u);
}
