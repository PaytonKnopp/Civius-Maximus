import { type BeliefDef, resolveText } from '@cx/content';
import type { EngineContext, RuleError } from '../context';
import { toFixed } from '../fixed';
import { distance } from '../map/hex';
import { settlementAt } from '../combat/strength';
import type { GameState, PlayerId, Religion, SettlementState } from '../state';
import { countsAs } from '../uniques';
import { ownedUnit } from '../units/handlers';
import { teamOf } from '../victory';

/**
 * Religion (docs/04-advanced-systems.md, "Religion"): a pantheon belief for some faith; a great
 * prophet on a holy site founds a religion with a founder and a follower belief. Religions
 * spread by pressure from the settlements already following them (stronger from the holy
 * city, and along trade routes) and by missionaries; a settlement follows the religion with
 * the most pressure once it reaches `convertAt`.
 */

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const settlementOrder = (a: SettlementState, b: SettlementState) =>
  Number(a.id.slice(1)) - Number(b.id.slice(1));

/** How many religions a game can have: half the players (rounded down), plus a few. */
export function maxReligions(ctx: EngineContext, state: GameState): number {
  return Math.floor(state.playerOrder.length / 2) + ctx.content.rules.religion.extraReligions;
}

export const religionsOf = (state: GameState): Religion[] =>
  Object.values(state.religions).sort(byId);

/** A player's pantheon belief, if they have one. */
export function pantheonOf(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
): BeliefDef | undefined {
  return state.players[player]!.beliefs.map((id) => ctx.content.entities.belief[id]).find(
    (b) => b?.kind === 'pantheon',
  );
}

/** Beliefs someone already has: each one can only be taken once in a game. */
export function takenBeliefs(state: GameState): Set<string> {
  const out = new Set<string>();
  for (const id of state.playerOrder) for (const b of state.players[id]!.beliefs) out.add(b);
  for (const r of Object.values(state.religions)) for (const b of r.beliefs) out.add(b);
  return out;
}

/** Beliefs of a kind nobody has taken yet, in content order. */
export function freeBeliefs(
  ctx: EngineContext,
  state: GameState,
  kind: BeliefDef['kind'],
): BeliefDef[] {
  const taken = takenBeliefs(state);
  return ctx.content.ids.belief
    .map((id) => ctx.content.entities.belief[id]!)
    .filter((b) => b.kind === kind && !taken.has(b.id));
}

/** Settlements following a religion, in id order. */
export function followersOf(state: GameState, religion: string): SettlementState[] {
  return Object.values(state.settlements)
    .filter((s) => s.religion === religion)
    .sort(settlementOrder);
}

/** A religion's follower beliefs (they apply in every settlement that follows it). */
export function followerBeliefs(
  ctx: EngineContext,
  state: GameState,
  religion: string | null,
): BeliefDef[] {
  const r = religion === null ? undefined : state.religions[religion];
  if (!r) return [];
  return r.beliefs
    .map((id) => ctx.content.entities.belief[id])
    .filter((b): b is BeliefDef => b?.kind === 'follower');
}

/**
 * Where a founder's `yield_per_follower` yields arrive: the holy city while they hold it,
 * otherwise their capital.
 */
export function founderSeat(state: GameState, player: PlayerId): SettlementState | undefined {
  const p = state.players[player]!;
  const r = p.religion === null ? undefined : state.religions[p.religion];
  if (!r) return undefined;
  const holy = state.settlements[r.holyCity];
  if (holy?.owner === player) return holy;
  return p.capital ? state.settlements[p.capital] : undefined;
}

/**
 * Pressure toward each religion a settlement feels this turn: from every settlement following
 * it within range (itself included), from its holy city (more, and even if the holy city lost
 * it), and from both ends of trade routes. Religions in id order.
 */
export function incomingPressure(
  ctx: EngineContext,
  state: GameState,
  s: SettlementState,
): Record<string, number> {
  const r = ctx.content.rules.religion;
  const out: Record<string, number> = {};
  const add = (religion: string | null, amount: number) => {
    if (religion !== null && state.religions[religion])
      out[religion] = (out[religion] ?? 0) + amount;
  };
  for (const other of Object.values(state.settlements).sort(settlementOrder)) {
    if (distance(state.map, other.tile, s.tile) > r.pressureRadius) continue;
    // A holy city always spreads its own religion, more strongly, even if it lost it.
    const holyOf = holyCityOf(state, other.id);
    if (holyOf) add(holyOf, r.holyCityPressure);
    if (other.religion !== null && other.religion !== holyOf)
      add(other.religion, r.pressurePerFollower);
  }
  for (const route of state.routes) {
    if (route.to === s.id)
      add(state.settlements[route.from]?.religion ?? null, r.tradeRoutePressure);
    if (route.from === s.id)
      add(state.settlements[route.to]?.religion ?? null, r.tradeRoutePressure);
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
}

/** The religion whose holy city this settlement is, if any. */
export function holyCityOf(state: GameState, settlement: string): string | undefined {
  return Object.values(state.religions).find((r) => r.holyCity === settlement)?.id;
}

/** The religion a settlement would follow with this pressure, or its current one. */
export function leadingReligion(
  ctx: EngineContext,
  s: Pick<SettlementState, 'religion' | 'pressure'>,
): string | null {
  const convertAt = ctx.content.rules.religion.convertAt;
  let best = s.religion;
  let bestPressure = s.religion === null ? convertAt - 1 : (s.pressure[s.religion] ?? 0);
  for (const id of Object.keys(s.pressure).sort()) {
    const p = s.pressure[id]!;
    if (id !== s.religion && p >= convertAt && p > bestPressure) {
      best = id;
      bestPressure = p;
    }
  }
  return best;
}

/**
 * Religious victory progress: for every other team's civ with settlements, how many follow the
 * religion and how many it needs (more than half of them).
 */
export function religiousProgress(
  state: GameState,
  religion: string,
): { player: PlayerId; following: number; needed: number; total: number }[] {
  const r = state.religions[religion];
  if (!r) return [];
  const team = new Set(teamOf(state, r.founder));
  const out = [];
  for (const id of state.playerOrder) {
    if (team.has(id) || !state.players[id]!.alive) continue;
    const mine = Object.values(state.settlements).filter((s) => s.owner === id);
    if (mine.length === 0) continue;
    out.push({
      player: id,
      following: mine.filter((s) => s.religion === religion).length,
      needed: Math.floor(mine.length / 2) + 1,
      total: mine.length,
    });
  }
  return out;
}

/** Whether a religion has won: it's the majority in more than half of every other civ's settlements. */
export function hasReligiousVictory(state: GameState, religion: string): boolean {
  const progress = religiousProgress(state, religion);
  return progress.length > 0 && progress.every((p) => p.following >= p.needed);
}

export function pantheonProblem(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  belief: string,
): RuleError | undefined {
  const p = state.players[player];
  if (!p?.alive) return { code: 'not_playing', message: `${player} is not playing` };
  if (pantheonOf(ctx, state, player))
    return { code: 'has_pantheon', message: 'You already have a pantheon' };
  const def = ctx.content.entities.belief[belief];
  if (def?.kind !== 'pantheon') return { code: 'unknown', message: 'No such pantheon belief' };
  if (takenBeliefs(state).has(belief))
    return { code: 'belief_taken', message: 'Someone already follows that belief' };
  const cost = toFixed(ctx.content.rules.religion.pantheonFaith);
  if (p.faith < cost) return { code: 'no_faith', message: `Needs ${Math.ceil(cost / 100)} faith` };
  return undefined;
}

/** Why this unit can't found a religion where it stands (beliefs aside), or undefined. */
export function religionFoundingProblem(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  unitId: string,
): RuleError | undefined {
  const u = ownedUnit(state, player, unitId);
  if ('code' in u) return u;
  const person = u.person ? ctx.content.entities.greatPerson[u.person] : undefined;
  if (!person || !ctx.content.entities.greatPersonClass[person.class]?.foundsReligion)
    return { code: 'not_prophet', message: 'Only a great prophet can found a religion' };
  if (state.players[player]!.religion !== null)
    return { code: 'has_religion', message: 'You already founded a religion' };
  if (Object.keys(state.religions).length >= maxReligions(ctx, state))
    return { code: 'no_room', message: 'No more religions can be founded in this game' };
  const s = settlementAt(state, u.tile);
  const holy = ctx.content.rules.religion.holyDistrict;
  if (!s || s.owner !== player || !s.districts.some((d) => countsAs(ctx, 'district', d.id, holy))) {
    const name = resolveText(ctx.content, ctx.content.entities.district[holy]?.name ?? holy);
    return {
      code: 'needs_holy_site',
      message: `Found it in one of your settlements with a ${name}`,
    };
  }
  return undefined;
}

/** Why a missionary can't preach in this settlement, or undefined. */
export function spreadProblem(
  state: GameState,
  player: PlayerId,
  unitId: string,
  settlementId: string,
): RuleError | undefined {
  const u = ownedUnit(state, player, unitId);
  if ('code' in u) return u;
  if (!u.religion || !u.charges)
    return { code: 'not_missionary', message: "That unit can't spread a religion" };
  const s = state.settlements[settlementId];
  if (!s) return { code: 'no_such_settlement', message: 'That settlement no longer exists' };
  if (distance(state.map, u.tile, s.tile) > 1)
    return { code: 'too_far', message: 'Stand on or next to the settlement' };
  if (s.religion === u.religion)
    return { code: 'already_follows', message: `${s.name} already follows it` };
  if (u.moves <= 0) return { code: 'no_moves', message: 'No moves left this turn' };
  return undefined;
}

/**
 * The religion a missionary bought here spreads: the one the settlement follows, or in its
 * founder's holy city, theirs (even if the holy city has lost it).
 */
export function faithUnitReligion(state: GameState, s: SettlementState): string | null {
  const holy = holyCityOf(state, s.id);
  if (holy && state.religions[holy]!.founder === s.owner) return holy;
  return s.religion;
}

/** Why a unit can't be bought with faith in this settlement, or undefined. */
export function faithUnitProblem(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  settlementId: string,
  unit: string,
): RuleError | undefined {
  const p = state.players[player];
  if (!p?.alive) return { code: 'not_playing', message: `${player} is not playing` };
  const s = state.settlements[settlementId];
  if (!s || s.owner !== player)
    return { code: 'not_your_settlement', message: "That isn't your settlement" };
  const def = ctx.content.entities.unit[unit];
  if (!def || def.faithCost <= 0)
    return { code: 'not_faith_unit', message: "That can't be bought with faith" };
  if (faithUnitReligion(state, s) === null)
    return { code: 'no_religion', message: `${s.name} doesn't follow a religion yet` };
  const cost = toFixed(def.faithCost);
  if (p.faith < cost) return { code: 'no_faith', message: `Needs ${Math.ceil(cost / 100)} faith` };
  return undefined;
}
