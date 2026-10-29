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
  canRecruitWith,
  type Currency,
  greatPersonCost,
  nextGreatPerson,
  pointsOf,
  recruitCost,
} from '../greatpeople/greatpeople';
import { faithUnitCost, maxReligions, pantheonCost, pantheonOf } from '../religion/rules';
import { countsAs } from '../uniques';
import { isCoastal, settlementsOf } from '../settlements/rules';
import { obsoletedBy, upgradeCost, upgradeProblem } from '../units/upgrades';
import { jitter, personalityOf, roleOf, type Turn } from './turn';
import { titlesAvailable } from '../governors/governors';
import { manageSpies } from './espionage';
import { loyaltyOf, loyaltyOn, turnsToFlip } from '../loyalty/loyalty';
import { effectValue, happinessWeight, yieldsValue } from './values';

/** Which trait each dedication serves (an AI leader picks the ones its personality likes). */
const DEDICATION_TRAITS: Record<string, keyof ReturnType<typeof personalityOf>> = {
  ded_monuments: 'wonders',
  ded_frontier: 'expansion',
  ded_learning: 'science',
  ded_muses: 'culture',
  ded_coin: 'gold',
  ded_devotion: 'faith',
  ded_banners: 'aggression',
  ded_horizons: 'naval',
};

/** Picks this era's dedications (docs/04-advanced-systems.md, "Eras and ages"). */
export function chooseDedications(t: Turn) {
  const a = t.p.ages;
  if (!a || a.pending <= 0) return;
  const traits = personalityOf(t.ctx, t.state, t.player);
  const ranked = t.ctx.content.ids.dedication
    .filter((id) => !a.dedications.includes(id))
    .map((id) => {
      const trait = DEDICATION_TRAITS[id];
      const w = trait ? Number(traits[trait] ?? 5) : 5;
      return { id, w: w * 100 + jitter(t.player, id, a.era) };
    })
    .sort((x, y) => y.w - x.w || (x.id < y.id ? -1 : 1));
  const pick = ranked.slice(0, a.pending).map((x) => x.id);
  if (pick.length > 0) t.act({ type: 'choose_dedications', player: t.player, dedications: pick });
}

/** Which trait each governor serves. */
const GOVERNOR_TRAITS: Record<string, keyof ReturnType<typeof personalityOf>> = {
  gov_architect: 'wonders',
  gov_steward: 'expansion',
  gov_envoy: 'diplomacy',
  gov_warden: 'aggression',
  gov_scholar: 'science',
  gov_treasurer: 'gold',
  gov_abbot: 'faith',
};

/**
 * Governors (docs/04-advanced-systems.md, "Governors"): appoint while settlements outnumber
 * governors, otherwise promote; post each one to the biggest settlement without a governor.
 */
export function manageGovernors(t: Turn) {
  const traits = personalityOf(t.ctx, t.state, t.player);
  const weight = (id: string) => {
    const trait = GOVERNOR_TRAITS[id];
    return (trait ? Number(traits[trait] ?? 5) : 5) * 100 + jitter(t.player, id);
  };
  for (let guard = 0; guard < 8 && titlesAvailable(t.ctx, t.p) > 0; guard++) {
    const appointed = Object.keys(t.p.governors ?? {});
    const settlements = settlementsOf(t.state, t.player).length;
    const free = t.ctx.content.ids.governor.filter((id) => !appointed.includes(id));
    if (free.length > 0 && appointed.length < settlements) {
      const best = [...free].sort((a, b) => weight(b) - weight(a))[0]!;
      if (!t.act({ type: 'appoint_governor', player: t.player, governor: best })) break;
      continue;
    }
    // Promote the governor with the most valuable promotion open.
    const options = appointed.flatMap((gid) => {
      const g = t.p.governors![gid]!;
      return t.ctx.content.entities.governor[gid]!.promotions.filter(
        (pr) => !g.promotions.includes(pr.id) && pr.requires.every((r) => g.promotions.includes(r)),
      ).map((pr) => ({ gid, pr: pr.id, w: weight(gid) + jitter(gid, pr.id) }));
    });
    const top = options.sort((a, b) => b.w - a.w)[0];
    if (
      !top ||
      !t.act({ type: 'promote_governor', player: t.player, governor: top.gid, promotion: top.pr })
    )
      break;
  }
  const govs = t.p.governors ?? {};
  const taken = new Set(Object.values(govs).map((g) => g.settlement));
  // Settlements losing loyalty come first: turns until they'd break away (null: not falling).
  const danger = new Map<string, number>();
  if (loyaltyOn(t.state)) {
    for (const s of settlementsOf(t.state, t.player)) {
      const turns = turnsToFlip(loyaltyOf(t.ctx, t.state, s));
      if (turns !== null) danger.set(s.id, turns);
    }
  }
  const open = settlementsOf(t.state, t.player)
    .filter((s) => !taken.has(s.id))
    .sort(
      (a, b) =>
        (danger.get(a.id) ?? 999) - (danger.get(b.id) ?? 999) ||
        Number(b.capital) - Number(a.capital) ||
        b.population - a.population ||
        (a.id < b.id ? -1 : 1),
    );
  for (const [gid, g] of Object.entries(govs).sort(([a], [b]) => weight(b) - weight(a))) {
    if (g.settlement !== null) continue;
    const s = open.shift();
    if (!s) break;
    t.act({ type: 'assign_governor', player: t.player, governor: gid, settlement: s.id });
  }
  // One settlement about to break away with no governor: move one from a safe settlement.
  const urgent = open.find((s) => (danger.get(s.id) ?? 999) <= 8);
  if (!urgent) return;
  const spare = Object.entries(t.p.governors ?? {})
    .filter(([, g]) => g.settlement !== null && !danger.has(g.settlement))
    .sort(([a], [b]) => weight(a) - weight(b))[0];
  if (spare)
    t.act({ type: 'assign_governor', player: t.player, governor: spare[0], settlement: urgent.id });
}

/** Research, civics, government and policy cards. */
export function manageProgress(t: Turn) {
  chooseDedications(t);
  manageGovernors(t);
  manageSpies(t);
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
 * Buys great people: with gold when rich and already leading the race (it's whatever the empire
 * was built for anyway), and with faith left over from religion (the nearest one in reach). A
 * prophet comes first while a religion can still be founded.
 */
export function recruitGreatPeople(t: Turn) {
  recruitWith(t, 'gold', t.p.gold - toFixed(250 + 20 * t.mySettlements().length));
  recruitWith(t, 'faith', t.p.faith - faithReserve(t));
}

/** Faith kept for a pantheon, or for missionaries once there's a religion. */
function faithReserve(t: Turn): number {
  if (!pantheonOf(t.ctx, t.state, t.player)) return pantheonCost(t.ctx, t.state);
  if (t.p.religion === null) return 0;
  const missionary = t.ctx.content.ids.unit
    .map((id) => t.ctx.content.entities.unit[id]!.faithCost)
    .find((c) => c > 0);
  return faithUnitCost(t.ctx, t.state, (missionary ?? 0) * 2);
}

function recruitWith(t: Turn, currency: Currency, spare: number) {
  if (spare <= 0) return;
  let best: { cls: string; cost: number; first: boolean } | undefined;
  for (const cls of t.ctx.content.ids.greatPersonClass) {
    if (!nextGreatPerson(t.ctx, t.state, cls) || !canRecruitWith(t.ctx, cls, currency)) continue;
    const first = wantsProphet(t, cls);
    const mine = pointsOf(t.state, t.player, cls);
    const need = greatPersonCost(t.ctx, t.state, cls);
    if (!first) {
      if (t.ctx.content.entities.greatPersonClass[cls]!.foundsReligion) continue;
      if (currency === 'gold' && mine * 2 < need) continue;
      const ahead = t.state.playerOrder.some(
        (o) => o !== t.player && pointsOf(t.state, o, cls) > mine,
      );
      if (ahead && currency === 'gold') continue;
    }
    const cost = recruitCost(t.ctx, t.state, t.player, cls, currency);
    if (cost > spare) continue;
    if (!best || (first && !best.first) || (first === best.first && cost < best.cost))
      best = { cls, cost, first };
  }
  if (best) t.act({ type: 'recruit_great_person', player: t.player, class: best.cls, currency });
}

/** A prophet would found our religion: there's room for one and we have a holy site. */
function wantsProphet(t: Turn, cls: string): boolean {
  if (!t.ctx.content.entities.greatPersonClass[cls]!.foundsReligion) return false;
  if (t.p.religion !== null) return false;
  if (Object.keys(t.state.religions).length >= maxReligions(t.ctx, t.state)) return false;
  // One already on its way.
  if (
    t.myUnits().some((u) => u.person && t.ctx.content.entities.greatPerson[u.person]?.class === cls)
  )
    return false;
  const holy = t.ctx.content.rules.religion.holyDistrict;
  return t
    .mySettlements()
    .some((s) => s.districts.some((d) => countsAs(t.ctx, 'district', d.id, holy)));
}

/** Upgrades units standing in our territory while there's gold to spare (soldiers first). */
export function upgradeUnits(t: Turn) {
  const reserve = toFixed(150 + 20 * t.mySettlements().length);
  for (const u of t.myUnits()) {
    if (upgradeProblem(t.ctx, t.state, t.player, u.id)) continue;
    const to = obsoletedBy(t.ctx, t.state, t.player, u.type)!;
    if (t.p.gold - upgradeCost(t.ctx, t.state, u.type, to) < reserve) return;
    t.act({ type: 'upgrade_unit', player: t.player, unit: u.id });
  }
}

/** The available node with the most value for its remaining cost. */
function bestNode(t: Turn, kind: TreeKind): string | undefined {
  const track = trackOf(t.p, kind);
  let best: { id: string; score: number } | undefined;
  for (const id of availableNodes(t.ctx, t.p, kind)) {
    const left = Math.max(
      toFixed(1),
      nodeCost(t.ctx, t.state, kind, id) - (track.progress[id] ?? 0),
    );
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
