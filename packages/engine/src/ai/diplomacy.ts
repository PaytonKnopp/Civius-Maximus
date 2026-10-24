import type { EngineContext } from '../context';
import {
  areAllies,
  areFriends,
  denounceProblem,
  opinionOf,
  relation,
  sameTeam,
} from '../diplomacy/rules';
import { toFixed } from '../fixed';
import { goldPerTurn } from '../settlements/rules';
import type { GameState, PlayerId, Proposal } from '../state';
import { type Act, jitter, Turn } from './turn';
import { wantsPeace } from './war';

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
  deal: Omit<Proposal, 'id' | 'turn'>,
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
      give: { gold: 0, goldPerTurn: 0, maps: false },
      get: { gold: 0, goldPerTurn: 0, maps: false },
      turns: 1,
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
      t.act({ type: 'propose_deal', ...base, friendship: false, alliance: true, peace: false });
      continue;
    }
    if (
      opinion >= rules.friendshipOpinion &&
      (!areFriends(s, t.player, other) || ending(friendsUntil)) &&
      affordable(rules.friendshipCost) &&
      roll < 30
    ) {
      t.act({ type: 'propose_deal', ...base, friendship: true, alliance: false, peace: false });
      continue;
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
