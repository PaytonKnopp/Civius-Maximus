import { type SlotKind } from '@cx/content';
import { toFixed } from '../fixed';
import {
  availableGovernments,
  availableNodes,
  availablePolicies,
  nodeCost,
  policyProblem,
  type TreeKind,
  trackOf,
} from '../progress/rules';
import { policySlots, SLOT_KINDS } from '../progress/sources';
import {
  greatPersonCost,
  nextGreatPerson,
  pointsOf,
  recruitCost,
} from '../greatpeople/greatpeople';
import { isCoastal } from '../settlements/rules';
import { roleOf, type Turn } from './turn';
import { effectValue, happinessWeight, yieldsValue } from './values';

/** Research, civics, government and policy cards. */
export function manageProgress(t: Turn) {
  for (const kind of ['tech', 'civic'] as const) {
    if (trackOf(t.p, kind).current) continue;
    const next = bestNode(t, kind);
    if (!next) continue;
    t.act(
      kind === 'tech'
        ? { type: 'set_research', player: t.player, tech: next }
        : { type: 'set_civic', player: t.player, civic: next },
    );
  }
  // Governments and cards change for free right after a civic is finished.
  if (!t.p.policyWindow) return;
  const gov = bestGovernment(t);
  if (gov && gov !== t.p.government)
    t.act({ type: 'set_government', player: t.player, government: gov });
  const cards = bestPolicies(t);
  if (cards) t.act({ type: 'set_policies', player: t.player, policies: cards });
}

/**
 * Buys a great person when rich and already leading its race (closest to the cost): it's
 * whatever the empire was built for anyway.
 */
export function recruitGreatPeople(t: Turn) {
  const spare = t.p.gold - toFixed(250 + 20 * t.mySettlements().length);
  if (spare <= 0) return;
  let best: { cls: string; cost: number } | undefined;
  for (const cls of t.ctx.content.ids.greatPersonClass) {
    if (!nextGreatPerson(t.ctx, t.state, cls)) continue;
    const mine = pointsOf(t.state, t.player, cls);
    const need = greatPersonCost(t.ctx, t.state, cls);
    if (mine * 2 < need) continue;
    const ahead = t.state.playerOrder.some(
      (o) => o !== t.player && pointsOf(t.state, o, cls) > mine,
    );
    if (ahead) continue;
    const cost = recruitCost(t.ctx, t.state, t.player, cls);
    if (cost <= spare && (!best || cost < best.cost)) best = { cls, cost };
  }
  if (best) t.act({ type: 'recruit_great_person', player: t.player, class: best.cls });
}

/** The available node with the most value for its remaining cost. */
function bestNode(t: Turn, kind: TreeKind): string | undefined {
  const track = trackOf(t.p, kind);
  let best: { id: string; score: number } | undefined;
  for (const id of availableNodes(t.ctx, t.p, kind)) {
    const left = Math.max(toFixed(1), nodeCost(t.ctx, kind, id) - (track.progress[id] ?? 0));
    // What it unlocks, plus a little of what the nodes after it unlock (so paths get followed).
    const later = followers(t, kind, id).reduce((sum, next) => sum + nodeValue(t, kind, next), 0);
    const value = 30 + nodeValue(t, kind, id) + Math.floor(later / 4);
    const score = Math.floor((value * 100_000) / left);
    if (!best || score > best.score || (score === best.score && id < best.id)) best = { id, score };
  }
  return best?.id;
}

function followers(t: Turn, kind: TreeKind, id: string): string[] {
  return t.turnMemo(`followers:${kind}:${id}`, () => {
    const entities = kind === 'tech' ? t.ctx.content.entities.tech : t.ctx.content.entities.civic;
    return Object.keys(entities)
      .sort()
      .filter((other) => entities[other]!.requires.includes(id));
  });
}

/** Points for everything a tech or civic unlocks, by this leader's tastes. */
function nodeValue(t: Turn, kind: TreeKind, id: string): number {
  return t.turnMemo(`node:${kind}:${id}`, () => {
    const me = t.me;
    const e = t.ctx.content.entities;
    const unlockedBy = (x: {
      requiresTech?: string | undefined;
      requiresCivic?: string | undefined;
    }) => (kind === 'tech' ? x.requiresTech : x.requiresCivic) === id;
    const coastal = t.mySettlements().some((s) => isCoastal(t.ctx, t.state, s.tile));
    let value = 0;
    for (const unitId of t.ctx.content.ids.unit) {
      const def = e.unit[unitId]!;
      if (!unlockedBy(def) || def.cost <= 0) continue;
      const role = roleOf(def, e.unitClass[def.class]!);
      if (role === 'naval') value += coastal ? 4 + me.naval * 2 : 0;
      else if (role === 'settler' || role === 'civilian') value += 10;
      else
        value += 8 + me.aggression * 2 + Math.floor(Math.max(def.strength, def.rangedStrength) / 5);
    }
    const happy = t.mySettlements()[0] ? happinessWeight(t, t.mySettlements()[0]!) : 7;
    for (const bId of t.ctx.content.ids.building) {
      const def = e.building[bId]!;
      if (!unlockedBy(def) || def.cost <= 0) continue;
      value += Math.max(
        4,
        yieldsValue(me, def.yields) +
          def.happiness * happy +
          (def.walls > 0 ? 8 + me.aggression : 0),
      );
    }
    for (const dId of t.ctx.content.ids.district) {
      const def = e.district[dId]!;
      if (!unlockedBy(def)) continue;
      value +=
        14 +
        me.districts +
        Math.floor(yieldsValue(me, def.specialistYields) / 2) +
        def.happiness * happy;
    }
    for (const wId of t.ctx.content.ids.wonder) {
      if (unlockedBy(e.wonder[wId]!)) value += 4 + me.wonders * 3;
    }
    for (const iId of t.ctx.content.ids.improvement) {
      const def = e.improvement[iId]!;
      if (unlockedBy(def)) value += 6 + Math.floor(yieldsValue(me, def.yields) / 2);
    }
    for (const gId of t.ctx.content.ids.government) {
      if (unlockedBy(e.government[gId]!)) value += 30;
    }
    for (const pId of t.ctx.content.ids.policy) {
      if (unlockedBy(e.policy[pId]!)) value += 6;
    }
    return value;
  });
}

const SLOT_WEIGHT = (t: Turn): Record<SlotKind, number> => ({
  military: 10 + t.me.aggression * 2,
  economic: 16 + t.me.gold,
  diplomatic: 6 + t.me.diplomacy * 2,
  wildcard: 24,
});

/** The government whose slots and effects suit this leader best (ties: keep the current one). */
function bestGovernment(t: Turn): string | undefined {
  const weights = SLOT_WEIGHT(t);
  const score = (id: string) => {
    const g = t.ctx.content.entities.government[id]!;
    let v = 0;
    for (const kind of SLOT_KINDS) v += g.slots[kind] * weights[kind];
    for (const effect of g.effects) v += effectValue(t, effect);
    return v;
  };
  let best = { id: t.p.government, score: score(t.p.government) };
  for (const id of availableGovernments(t.ctx, t.p)) {
    const s = score(id);
    if (s > best.score) best = { id, score: s };
  }
  return best.id;
}

/** The best cards for every slot, or undefined if nothing would change. */
function bestPolicies(t: Turn): Record<SlotKind, string[]> | undefined {
  const slots = policySlots(t.ctx, t.state, t.player);
  const ranked = availablePolicies(t.ctx, t.p)
    .map((id) => {
      const pol = t.ctx.content.entities.policy[id]!;
      const value = pol.effects.reduce((sum, e) => sum + effectValue(t, e), 0);
      return { id, slot: pol.slot, value };
    })
    .sort((a, b) => b.value - a.value || (a.id < b.id ? -1 : 1));
  const fill: Record<SlotKind, string[]> = {
    military: [],
    economic: [],
    diplomatic: [],
    wildcard: [],
  };
  const used = new Set<string>();
  for (const kind of ['military', 'economic', 'diplomatic'] as const) {
    for (const r of ranked) {
      if (fill[kind].length >= slots[kind]) break;
      if (r.slot === kind) {
        fill[kind].push(r.id);
        used.add(r.id);
      }
    }
  }
  for (const r of ranked) {
    if (fill.wildcard.length >= slots.wildcard) break;
    if (!used.has(r.id)) {
      fill.wildcard.push(r.id);
      used.add(r.id);
    }
  }
  const same = SLOT_KINDS.every(
    (k) =>
      fill[k].length === t.p.policies[k].length &&
      fill[k].every((id) => t.p.policies[k].includes(id)),
  );
  if (same || policyProblem(t.ctx, t.state, t.player, fill)) return undefined;
  return fill;
}
