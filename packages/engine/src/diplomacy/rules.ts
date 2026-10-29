import { type AgendaRule, resolveText } from '@cx/content';
import { militaryStrength } from '../combat/strength';
import {
  atWar,
  type EngineContext,
  HOSTILE,
  type RuleError,
  unitClassOf,
  warKey,
} from '../context';
import { type Fixed, toFixed } from '../fixed';
import { distance } from '../map/hex';
import { playerEffects } from '../progress/sources';
import { goldPerTurn, settlementYields } from '../settlements/rules';
import type { DealTerms, DiplomacyState, GameState, PlayerId, Proposal } from '../state';

/**
 * Diplomacy (docs/04-advanced-systems.md, "Diplomacy & deals"): who is friends or allied with
 * whom, what blocks a war, influence, AI opinions, and whether a deal can be signed.
 */

export function emptyDiplomacy(): DiplomacyState {
  return {
    friends: {},
    alliances: {},
    peaceUntil: {},
    lastWar: {},
    denounced: {},
    payments: [],
    proposals: [],
    incidents: [],
  };
}

export const sameTeam = (state: GameState, a: PlayerId, b: PlayerId) => {
  const ta = state.players[a]?.team;
  return a !== b && ta !== null && ta !== undefined && ta === state.players[b]?.team;
};

/** A friendship (or alliance) still running this turn. */
export const areFriends = (state: GameState, a: PlayerId, b: PlayerId) =>
  (state.diplomacy.friends[warKey(a, b)] ?? 0) >= state.turn;

export const areAllies = (state: GameState, a: PlayerId, b: PlayerId) =>
  (state.diplomacy.alliances[warKey(a, b)] ?? 0) >= state.turn;

export type Relation = 'team' | 'allies' | 'friends' | 'war' | 'peace';

export function relation(state: GameState, a: PlayerId, b: PlayerId): Relation {
  if (sameTeam(state, a, b)) return 'team';
  if (atWar(state, a, b)) return 'war';
  if (areAllies(state, a, b)) return 'allies';
  if (areFriends(state, a, b)) return 'friends';
  return 'peace';
}

/** Players who share vision with `player`: teammates and allies. */
export function visionPartners(state: GameState, player: PlayerId): PlayerId[] {
  if (!state.diplomacy) return [];
  return state.playerOrder.filter(
    (other) =>
      other !== player &&
      state.players[other]!.alive &&
      (sameTeam(state, player, other) || areAllies(state, player, other)),
  );
}

/** Why `by` can't declare war on `target` because of a friendship, alliance or treaty. */
export function warBlock(state: GameState, by: PlayerId, target: PlayerId): RuleError | undefined {
  const d = state.diplomacy;
  const key = warKey(by, target);
  const name = state.players[target]?.name ?? target;
  if (areAllies(state, by, target))
    return {
      code: 'allied',
      message: `You're allied with ${name} until turn ${d.alliances[key]}`,
    };
  if (areFriends(state, by, target))
    return {
      code: 'friends',
      message: `You declared friendship with ${name} (until turn ${d.friends[key]})`,
    };
  const until = d.peaceUntil[key] ?? 0;
  if (until > state.turn)
    return {
      code: 'peace_treaty',
      message: `You signed peace with ${name}: war is possible again on turn ${until}`,
    };
  return undefined;
}

/** A war declared without denouncing the target recently. */
export function isSurpriseWar(
  ctx: EngineContext,
  state: GameState,
  by: PlayerId,
  target: PlayerId,
): boolean {
  const when = state.diplomacy.denounced[`${by}>${target}`];
  return when === undefined || state.turn - when > ctx.content.rules.diplomacy.denounceWarning;
}

/** Influence a player earns each turn: the base, plus influence from their settlements. */
export function influencePerTurn(ctx: EngineContext, state: GameState, player: PlayerId): Fixed {
  let total = toFixed(ctx.content.rules.diplomacy.baseInfluence);
  for (const s of Object.values(state.settlements)) {
    if (s.owner === player) total += settlementYields(ctx, state, s).total.influence ?? 0;
  }
  // Abilities that pay influence for every running deal.
  const deals = state.diplomacy.payments.filter((p) => p.from === player || p.to === player).length;
  for (const { effect } of playerEffects(ctx, state, player, 'influence_per_deal'))
    total += toFixed(effect.params.amount * deals);
  return total;
}

// --- Opinions ----------------------------------------------------------------------------------

export interface OpinionLine {
  label: string;
  amount: number;
}

/** How much a remembered incident still counts: full at first, fading to 0 over the memory. */
function fade(ctx: EngineContext, state: GameState, turn: number, amount: number): number {
  const memory = ctx.content.rules.diplomacy.memoryTurns;
  const age = state.turn - turn;
  if (age >= memory) return 0;
  return Math.trunc((amount * (memory - age)) / memory);
}

/** A number about `player` an agenda compares (see `AgendaRule`). */
function metric(ctx: EngineContext, state: GameState, player: PlayerId, rule: AgendaRule): number {
  switch (rule.metric) {
    case 'army':
      return militaryStrength(ctx, state, player);
    case 'units': {
      const classes =
        rule.unitClass === undefined
          ? undefined
          : Array.isArray(rule.unitClass)
            ? rule.unitClass
            : [rule.unitClass];
      return Object.values(state.units).filter((u) => {
        if (u.owner !== player) return false;
        const cls = unitClassOf(ctx, u);
        if (!cls.combat) return false;
        if (classes && !classes.includes(cls.id)) return false;
        return rule.domain === undefined || cls.domain === rule.domain;
      }).length;
    }
    case 'wonders':
      return Object.values(state.settlements)
        .filter((s) => s.owner === player)
        .reduce((n, s) => n + s.wonders.length, 0);
    case 'gold':
      return Math.floor(goldPerTurn(ctx, state, player) / 100);
    case 'captures':
      return Object.values(state.settlements).filter(
        (s) => s.owner === player && s.capturedFrom !== null && s.capturedFrom !== player,
      ).length;
    case 'surpriseWars':
      return state.diplomacy.incidents.filter(
        (i) =>
          i.kind === 'surprise_war' &&
          i.by === player &&
          state.turn - i.turn < ctx.content.rules.diplomacy.memoryTurns,
      ).length;
    case 'atPeace':
      return state.playerOrder.some((o) => o !== player && atWar(state, player, o)) ? 0 : 1;
    default: {
      const unhandled: never = rule.metric;
      throw new Error(`Unhandled agenda metric: ${String(unhandled)}`);
    }
  }
}

function agendaApplies(rule: AgendaRule, theirs: number, mine: number): boolean {
  switch (rule.when) {
    case 'more':
      return theirs > mine && theirs > 0;
    case 'less':
      return theirs * 2 < mine;
    case 'any':
      return theirs > 0;
    case 'none':
      return theirs === 0;
  }
}

/**
 * What `of` (an AI leader, usually) thinks of `toward`, with the reasons ("−20 Surprise war on
 * us"). Everything it uses is public: wars, deals, denouncements, settlements, army sizes.
 */
export function opinionOf(
  ctx: EngineContext,
  state: GameState,
  of: PlayerId,
  toward: PlayerId,
): { total: number; lines: OpinionLine[] } {
  const o = ctx.content.rules.diplomacy.opinion;
  const d = state.diplomacy;
  const lines: OpinionLine[] = [];
  const add = (label: string, amount: number) => {
    if (amount !== 0) lines.push({ label, amount });
  };
  if (sameTeam(state, of, toward)) add('Teammates', o.teammate);
  if (areAllies(state, of, toward)) add('Allies', o.allies);
  else if (areFriends(state, of, toward)) add('Declared friends', o.friends);
  if (atWar(state, of, toward)) add('At war with us', o.atWar);
  else {
    const since = state.turn - (d.lastWar[warKey(of, toward)] ?? 0);
    add('Long peace', Math.min(o.longPeaceMax, Math.floor(since / o.longPeacePer)));
  }
  const shared = state.playerOrder.some(
    (x) =>
      x !== of &&
      x !== toward &&
      state.players[x]!.alive &&
      atWar(state, of, x) &&
      atWar(state, toward, x),
  );
  if (shared) add('Fighting a common enemy', o.sharedEnemy);
  const gov = state.players[of]!.government;
  if (
    gov !== ctx.content.rules.progress.startingGovernment &&
    gov === state.players[toward]!.government
  )
    add('Same government', o.sameGovernment);
  const theyDenounced = d.denounced[`${toward}>${of}`];
  if (theyDenounced !== undefined)
    add('Denounced us', fade(ctx, state, theyDenounced, o.denouncedUs));
  const weDenounced = d.denounced[`${of}>${toward}`];
  if (weDenounced !== undefined)
    add('We denounced them', fade(ctx, state, weDenounced, o.weDenounced));
  let onUs = 0;
  let onOthers = 0;
  let broke = 0;
  let razed = 0;
  let spied = 0;
  let nuked = 0;
  for (const i of d.incidents) {
    if (i.by !== toward) continue;
    if (i.kind === 'surprise_war')
      if (i.against === of) onUs += fade(ctx, state, i.turn, o.surpriseWarOnUs);
      else onOthers += fade(ctx, state, i.turn, o.surpriseWarOnOthers);
    if (i.kind === 'broke_deal')
      broke += fade(
        ctx,
        state,
        i.turn,
        i.against === of ? o.brokeDeal : Math.trunc(o.brokeDeal / 2),
      );
    if (i.kind === 'razed') razed += fade(ctx, state, i.turn, o.razed);
    if (i.kind === 'spied' && i.against === of) spied += fade(ctx, state, i.turn, o.spiedOnUs);
    if (i.kind === 'nuked')
      nuked += fade(ctx, state, i.turn, i.against === of ? o.nukedUs : o.nukedOthers);
  }
  add('Surprise war on us', onUs);
  add('Surprise wars on others', onOthers);
  add('Broke a deal', broke);
  add('Razed settlements', razed);
  add('Caught spying on us', spied);
  add('Used nuclear weapons', nuked);
  const ours = Object.values(state.settlements).filter((s) => s.owner === of);
  const near = Object.values(state.settlements).filter(
    (s) =>
      s.owner === toward && ours.some((m) => distance(state.map, m.tile, s.tile) <= o.nearDistance),
  ).length;
  add('Settled near us', Math.min(near, o.nearMax) * o.settledNear);
  const deals = d.payments.filter(
    (p) => (p.from === of && p.to === toward) || (p.from === toward && p.to === of),
  ).length;
  add('Deals with us', Math.min(deals, 2) * o.perDeal);
  const routes = (state.routes ?? []).filter((r) => {
    const dest = state.settlements[r.to]?.owner;
    return (r.owner === of && dest === toward) || (r.owner === toward && dest === of);
  }).length;
  add('Trade routes between us', Math.min(routes, 2) * o.tradeRoute);
  const leader = ctx.content.entities.leader[state.players[of]?.leader ?? ''];
  for (const rule of leader?.agenda.rules ?? []) {
    const theirs = metric(ctx, state, toward, rule);
    const mine = metric(ctx, state, of, rule);
    if (agendaApplies(rule, theirs, mine)) add(resolveText(ctx.content, rule.label), rule.amount);
  }
  return { total: lines.reduce((sum, l) => sum + l.amount, 0), lines };
}

// --- Deals -------------------------------------------------------------------------------------

export const NO_TERMS: DealTerms = { gold: 0, goldPerTurn: 0, maps: false };

const empty = (t: DealTerms) => t.gold === 0 && t.goldPerTurn === 0 && !t.maps;

/** Why a deal (proposed or about to be signed) can't happen now, or undefined. */
export function dealProblem(
  ctx: EngineContext,
  state: GameState,
  deal: Omit<Proposal, 'id' | 'turn'>,
): RuleError | undefined {
  const rules = ctx.content.rules.diplomacy;
  const { from, to } = deal;
  const a = state.players[from];
  const b = state.players[to];
  if (!a?.alive || !b?.alive || from === to || !state.playerOrder.includes(to))
    return { code: 'bad_target', message: 'No such player in the game' };
  if (empty(deal.give) && empty(deal.get) && !deal.friendship && !deal.alliance && !deal.peace)
    return { code: 'empty_deal', message: 'Put something on the table' };
  if (deal.turns < 1 || deal.turns > rules.maxDealTurns)
    return { code: 'bad_turns', message: `Payments run 1 to ${rules.maxDealTurns} turns` };
  const war = atWar(state, from, to);
  if (deal.peace) {
    if (!war) return { code: 'not_at_war', message: "You're not at war" };
    const left =
      (state.warStarted[warKey(from, to)] ?? 0) + ctx.content.rules.combat.minWarTurns - state.turn;
    if (left > 0)
      return {
        code: 'too_soon',
        message: `Peace can be made in ${left} turn${left === 1 ? '' : 's'}`,
      };
  } else if (war) {
    return { code: 'at_war', message: 'At war, the only deal is peace' };
  }
  if ((deal.friendship || deal.alliance) && war)
    return { code: 'at_war', message: 'Make peace first' };
  if (deal.alliance && !deal.friendship && !areFriends(state, from, to))
    return { code: 'not_friends', message: 'An alliance needs a declared friendship first' };
  const cost =
    (deal.friendship ? rules.friendshipCost : 0) + (deal.alliance ? rules.allianceCost : 0);
  for (const p of [a, b]) {
    if (p.influence < toFixed(cost))
      return {
        code: 'no_influence',
        message: `${p.name} needs ${cost} influence for that`,
      };
  }
  if (a.gold < toFixed(deal.give.gold))
    return { code: 'no_gold', message: `${a.name} doesn't have ${deal.give.gold} gold` };
  if (b.gold < toFixed(deal.get.gold))
    return { code: 'no_gold', message: `${b.name} doesn't have ${deal.get.gold} gold` };
  return undefined;
}

/** Why `by` can't denounce `target` now, or undefined. */
export function denounceProblem(
  ctx: EngineContext,
  state: GameState,
  by: PlayerId,
  target: PlayerId,
): RuleError | undefined {
  const p = state.players[by];
  const t = state.players[target];
  if (
    !p?.alive ||
    !t?.alive ||
    by === target ||
    target === HOSTILE ||
    !state.playerOrder.includes(target)
  )
    return { code: 'bad_target', message: 'No such player in the game' };
  if (sameTeam(state, by, target))
    return { code: 'teammate', message: `${t.name} is on your team` };
  if (areFriends(state, by, target) || areAllies(state, by, target))
    return { code: 'friends', message: `You're friends with ${t.name}` };
  const when = state.diplomacy.denounced[`${by}>${target}`];
  if (when !== undefined && state.turn - when < ctx.content.rules.diplomacy.denounceWarning)
    return { code: 'already', message: `You denounced ${t.name} on turn ${when}` };
  const cost = ctx.content.rules.diplomacy.denounceCost;
  if (p.influence < toFixed(cost))
    return { code: 'no_influence', message: `Needs ${cost} influence` };
  return undefined;
}
