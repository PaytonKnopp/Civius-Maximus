import type { EngineContext } from '../context';
import { tradedBy } from '../diplomacy/pacts';
import {
  areAllies,
  areFriends,
  dealProblem,
  denounceProblem,
  haveOpenBorders,
  haveResearchAgreement,
  NO_TERMS,
  opinionOf,
  relation,
  sameTeam,
} from '../diplomacy/rules';
import { toFixed } from '../fixed';
import { stockpileIncome, stockpileUpkeep } from '../resources/strategic';
import { luxuriesOf, luxuryCopies, spareLuxury } from '../settlements/luxuries';
import { goldPerTurn } from '../settlements/rules';
import type { DealTerms, GameState, PlayerId, Proposal, ResourceTrade } from '../state';
import { type Act, jitter, Turn } from './turn';
import { wantsPeace } from './war';

type Deal = Omit<Proposal, 'id' | 'turn'>;

/** Total happiness a player's luxuries give across their settlements. */
function luxuryHappiness(ctx: EngineContext, state: GameState, player: PlayerId): number {
  let total = 0;
  for (const kinds of luxuriesOf(ctx, state, player).values())
    for (const l of kinds) total += ctx.content.entities.resource[l.resource]?.happiness ?? 0;
  return total;
}

/** The state as if the deal's resource trades were already running. */
function withTrades(state: GameState, deal: Deal): GameState {
  const extra: ResourceTrade[] = [];
  const until = state.turn + deal.turns - 1;
  for (const [resource, amount] of Object.entries(deal.give.resources ?? {}))
    extra.push({ from: deal.from, to: deal.to, resource, amount, until });
  for (const [resource, amount] of Object.entries(deal.get.resources ?? {}))
    extra.push({ from: deal.to, to: deal.from, resource, amount, until });
  if (extra.length === 0) return state;
  return {
    ...state,
    diplomacy: { ...state.diplomacy, trades: [...(state.diplomacy.trades ?? []), ...extra] },
  };
}

/**
 * Roughly in gold, what the deal's resources are worth to `ai`: the luxury happiness it gains
 * or loses (1 gold a turn per point), and strategic resources by whether its units need them.
 */
function resourceValue(
  ctx: EngineContext,
  state: GameState,
  ai: PlayerId,
  deal: Deal,
  reasons: string[],
): { value: number; refuse: boolean } {
  const gets = deal.from === ai ? deal.get : deal.give;
  const gives = deal.from === ai ? deal.give : deal.get;
  const kinds = [...Object.keys(gets.resources ?? {}), ...Object.keys(gives.resources ?? {})];
  if (kinds.length === 0) return { value: 0, refuse: false };
  const after = withTrades(state, deal);
  let value = (luxuryHappiness(ctx, after, ai) - luxuryHappiness(ctx, state, ai)) * deal.turns;
  let refuse = false;
  const upkeep = stockpileUpkeep(ctx, state, ai);
  const incomeAfter = stockpileIncome(ctx, after, ai);
  const strategic = (r: string) => ctx.content.entities.resource[r]?.class === 'strategic';
  for (const [r, n] of Object.entries(gets.resources ?? {}))
    if (strategic(r)) value += n * deal.turns * ((upkeep[r] ?? 0) > 0 ? 3 : 1);
  for (const [r, n] of Object.entries(gives.resources ?? {})) {
    if (!strategic(r)) continue;
    if ((incomeAfter[r] ?? 0) < (upkeep[r] ?? 0)) {
      refuse = true;
      reasons.push('Needs it for its own army');
    }
    value -= n * deal.turns * 2;
  }
  return { value, refuse };
}

/**
 * The AI's diplomacy: answering deals (the same verdict the deal screen shows before you send
 * one), offering friendships and alliances to players it likes, and denouncing ones it doesn't.
 */

export interface Verdict {
  accept: boolean;
  /** Roughly in gold: how good the deal is for the AI. */
  value: number;
  /** Short reasons, for the deal screen ("Not close enough for an alliance"). */
  reasons: string[];
}

/** Whether AI player `ai` would sign `deal` now, and why. */
export function dealVerdict(
  ctx: EngineContext,
  state: GameState,
  ai: PlayerId,
  deal: Deal,
): Verdict {
  const rules = ctx.content.rules.diplomacy;
  const other = deal.from === ai ? deal.to : deal.from;
  const gets = deal.from === ai ? deal.get : deal.give;
  const gives = deal.from === ai ? deal.give : deal.get;
  const opinion = opinionOf(ctx, state, ai, other).total;
  const reasons: string[] = [];
  let value = 0;
  let refuse = false;
  value += gets.gold + Math.floor((gets.goldPerTurn * deal.turns * 4) / 5);
  value -= gives.gold + gives.goldPerTurn * deal.turns;
  if (gives.goldPerTurn > 0 && goldPerTurn(ctx, state, ai) < toFixed(gives.goldPerTurn)) {
    refuse = true;
    reasons.push("Can't afford the payments");
  }
  if (gets.maps) value += 25;
  if (gives.maps) value -= 25 + Math.max(0, -opinion) * 5;
  if (deal.friendship) {
    if (opinion >= rules.friendshipOpinion) value += 10;
    else {
      refuse = true;
      reasons.push('Not close enough for a friendship');
    }
  }
  if (deal.alliance) {
    if (opinion >= rules.allianceOpinion) value += 20;
    else {
      refuse = true;
      reasons.push('Not close enough for an alliance');
    }
  }
  if (deal.openBorders) {
    if (opinion >= 0) value += 5;
    else {
      refuse = true;
      reasons.push("Doesn't want your visitors");
    }
  }
  if (deal.research) {
    if (opinion >= rules.friendshipOpinion) value += 25;
    else {
      refuse = true;
      reasons.push('Not close enough to share research');
    }
  }
  const res = resourceValue(ctx, state, ai, deal, reasons);
  value += res.value;
  refuse ||= res.refuse;
  if (deal.peace) {
    const t = new Turn(ctx, state, ai, () => undefined);
    if (wantsPeace(t, other, true)) value += 40;
    else {
      value -= 150;
      reasons.push('Winning the war');
    }
  } else if (opinion <= -10) {
    refuse = true;
    reasons.push("Doesn't trust you");
  }
  // Players it likes get a little slack; ones it dislikes don't.
  const slack = Math.max(0, opinion);
  const accept = !refuse && value >= -slack;
  if (!refuse && !accept) reasons.push('Asks for more');
  return { accept, value, reasons };
}

/** Answers every deal waiting for this AI (also called by the host right after a deal arrives). */
export function answerProposals(
  ctx: EngineContext,
  state: GameState,
  ai: PlayerId,
  act: Act,
): GameState {
  let s = state;
  for (const p of state.diplomacy.proposals.filter((x) => x.to === ai)) {
    const verdict = dealVerdict(ctx, s, ai, p);
    s = act({ type: 'answer_deal', player: ai, deal: p.id, accept: verdict.accept }) ?? s;
  }
  return s;
}

/** On the AI's turn: answer deals, offer pacts to players it likes, denounce ones it dislikes. */
export function manageDiplomacy(t: Turn) {
  const rules = t.ctx.content.rules.diplomacy;
  t.state = answerProposals(t.ctx, t.state, t.player, (a) => (t.act(a) ? t.state : undefined));
  for (const other of t.metRivals()) {
    const s = t.state;
    if (sameTeam(s, t.player, other) || relation(s, t.player, other) === 'war') continue;
    if (
      s.diplomacy.proposals.some(
        (p) => [p.from, p.to].includes(other) && [p.from, p.to].includes(t.player),
      )
    )
      continue;
    const opinion = opinionOf(t.ctx, s, t.player, other).total;
    const influence = t.p.influence;
    const roll = jitter(s.gameId, t.player, other, s.turn, 'pact');
    const friendsUntil = s.diplomacy.friends[[t.player, other].sort().join('|')] ?? 0;
    const allianceUntil = s.diplomacy.alliances[[t.player, other].sort().join('|')] ?? 0;
    const ending = (until: number) => until - s.turn <= 3;
    const base = {
      player: t.player,
      to: other,
      give: NO_TERMS,
      get: NO_TERMS,
      turns: 1,
      openBorders: false,
      research: false,
    };
    // Room for the other side's share too.
    const affordable = (cost: number) => influence >= toFixed(cost + 5);
    if (
      opinion >= rules.allianceOpinion &&
      areFriends(s, t.player, other) &&
      (!areAllies(s, t.player, other) || ending(allianceUntil)) &&
      affordable(rules.allianceCost) &&
      roll < 30
    ) {
      const deal = { ...base, from: t.player, friendship: false, alliance: true, peace: false };
      if (!dealProblem(t.ctx, s, deal))
        t.act({ type: 'propose_deal', ...base, friendship: false, alliance: true, peace: false });
      continue;
    }
    if (
      opinion >= rules.friendshipOpinion &&
      (!areFriends(s, t.player, other) || ending(friendsUntil)) &&
      affordable(rules.friendshipCost) &&
      roll < 30
    ) {
      const deal = { ...base, from: t.player, friendship: true, alliance: false, peace: false };
      if (!dealProblem(t.ctx, s, deal))
        t.act({ type: 'propose_deal', ...base, friendship: true, alliance: false, peace: false });
      continue;
    }
    if (
      opinion >= rules.friendshipOpinion &&
      areFriends(s, t.player, other) &&
      !haveResearchAgreement(s, t.player, other) &&
      affordable(rules.researchCost) &&
      roll < 25
    ) {
      const pact = { ...base, research: true, friendship: false, alliance: false, peace: false };
      if (!dealProblem(t.ctx, s, { ...pact, from: t.player }))
        t.act({ type: 'propose_deal', ...pact });
      continue;
    }
    if (
      opinion >= 4 &&
      !haveOpenBorders(s, t.player, other) &&
      affordable(rules.openBordersCost) &&
      roll >= 70
    ) {
      const pact = { ...base, openBorders: true, friendship: false, alliance: false, peace: false };
      if (!dealProblem(t.ctx, s, { ...pact, from: t.player }))
        t.act({ type: 'propose_deal', ...pact });
      continue;
    }
    if (opinion >= 0 && roll >= 40 && roll < 70) {
      const swap = luxurySwap(t.ctx, s, t.player, other);
      if (swap) {
        const deal = {
          ...base,
          give: { ...NO_TERMS, resources: { [swap.give]: 1 } },
          get: { ...NO_TERMS, resources: { [swap.get]: 1 } },
          turns: rules.maxDealTurns,
          friendship: false,
          alliance: false,
          peace: false,
        };
        if (!dealProblem(t.ctx, s, { ...deal, from: t.player }))
          t.act({ type: 'propose_deal', ...deal });
        continue;
      }
    }
    if (
      opinion <= -12 &&
      roll < 15 &&
      influence >= toFixed(rules.denounceCost + 10) &&
      !denounceProblem(t.ctx, s, t.player, other)
    )
      t.act({ type: 'denounce', player: t.player, target: other });
  }
}

/** Luxury kinds a player enjoys anywhere (own, shared or received). */
function enjoyed(ctx: EngineContext, state: GameState, player: PlayerId): Set<string> {
  const out = new Set<string>();
  for (const kinds of luxuriesOf(ctx, state, player).values())
    for (const l of kinds) out.add(l.resource);
  for (const r of Object.keys(tradedBy(ctx, state, player, 'to', 'luxury'))) out.add(r);
  return out;
}

/** A one-for-one swap of spare luxuries neither side has yet, or undefined (stable choice). */
export function luxurySwap(
  ctx: EngineContext,
  state: GameState,
  a: PlayerId,
  b: PlayerId,
): { give: string; get: string } | undefined {
  const spares = (p: PlayerId) =>
    Object.keys(luxuryCopies(ctx, state, p))
      .filter((r) => spareLuxury(ctx, state, p, r) > 0)
      .sort();
  const hasA = enjoyed(ctx, state, a);
  const hasB = enjoyed(ctx, state, b);
  const give = spares(a).find((r) => !hasB.has(r));
  const get = spares(b).find((r) => !hasA.has(r));
  return give && get ? { give, get } : undefined;
}

/** Terms with nothing in them (for building deals). */
export const emptyTerms = (): Required<DealTerms> => ({ ...NO_TERMS, resources: {} });
