import type { Draft } from 'immer';
import type { Action } from '../actions';
import { decodeBits, encodeBits } from '../bitset';
import { endWar } from '../combat/handlers';
import {
  type ActionHandler,
  type EngineContext,
  type Emit,
  type RuleError,
  warKey,
} from '../context';
import { view } from '../draft';
import { toFixed } from '../fixed';
import type { GameState, PlayerId, Proposal } from '../state';
import { dealProblem, denounceProblem, influencePerTurn } from './rules';

/** Deals, denouncing, and each turn's influence, payments and expiries. */

type A<T extends Action['type']> = Extract<Action, { type: T }>;

const notPlaying = (state: GameState, player: PlayerId): RuleError | undefined =>
  state.players[player]?.alive
    ? undefined
    : { code: 'not_playing', message: `${player} is not playing` };

function findProposal(state: GameState, id: string): Proposal | undefined {
  return state.diplomacy.proposals.find((p) => p.id === id);
}

/** Signs a deal: moves the gold, shares maps, starts payments and pacts. */
function sign(draft: Draft<GameState>, ctx: EngineContext, deal: Proposal, emit: Emit) {
  const rules = ctx.content.rules.diplomacy;
  const d = draft.diplomacy;
  const { from, to } = deal;
  const a = draft.players[from]!;
  const b = draft.players[to]!;
  a.gold += toFixed(deal.get.gold - deal.give.gold);
  b.gold += toFixed(deal.give.gold - deal.get.gold);
  const last = draft.turn + deal.turns - 1;
  if (deal.give.goldPerTurn > 0)
    d.payments.push({ from, to, gold: deal.give.goldPerTurn, until: last });
  if (deal.get.goldPerTurn > 0)
    d.payments.push({ from: to, to: from, gold: deal.get.goldPerTurn, until: last });
  const share = (giver: PlayerId, taker: PlayerId) => {
    const n = draft.map.tiles.length;
    const theirs = decodeBits(draft.players[giver]!.explored, n);
    const mine = decodeBits(draft.players[taker]!.explored, n);
    for (let i = 0; i < mine.length; i++) mine[i] = mine[i]! | theirs[i]!;
    draft.players[taker]!.explored = encodeBits(mine);
  };
  if (deal.give.maps) share(from, to);
  if (deal.get.maps) share(to, from);
  const key = warKey(from, to);
  if (deal.peace) endWar(draft, ctx, from, to);
  if (deal.friendship) {
    d.friends[key] = Math.max(d.friends[key] ?? 0, draft.turn + rules.friendshipTurns);
    a.influence -= toFixed(rules.friendshipCost);
    b.influence -= toFixed(rules.friendshipCost);
  }
  if (deal.alliance) {
    d.alliances[key] = Math.max(d.alliances[key] ?? 0, draft.turn + rules.allianceTurns);
    // Allies stay friends at least as long.
    d.friends[key] = Math.max(d.friends[key] ?? 0, d.alliances[key]!);
    a.influence -= toFixed(rules.allianceCost);
    b.influence -= toFixed(rules.allianceCost);
  }
  if (deal.peace) emit({ type: 'peace_made', players: [from, to], visibleTo: 'all' });
}

export const diplomacyHandlers = {
  propose_deal: {
    validate(state, action, ctx) {
      return (
        notPlaying(state, action.player) ??
        dealProblem(ctx, state, { ...action, from: action.player, to: action.to })
      );
    },
    apply(draft, action, _ctx, emit) {
      const d = draft.diplomacy;
      // A new offer replaces an older one to the same player.
      d.proposals = d.proposals.filter((p) => !(p.from === action.player && p.to === action.to));
      const id = `d${draft.nextEntityId++}`;
      d.proposals.push({
        id,
        from: action.player,
        to: action.to,
        turn: draft.turn,
        give: action.give,
        get: action.get,
        turns: action.turns,
        friendship: action.friendship,
        alliance: action.alliance,
        peace: action.peace,
      });
      emit({
        type: 'deal_proposed',
        deal: id,
        from: action.player,
        to: action.to,
        visibleTo: [action.player, action.to],
      });
    },
  } satisfies ActionHandler<A<'propose_deal'>>,

  answer_deal: {
    validate(state, action, ctx) {
      const err = notPlaying(state, action.player);
      if (err) return err;
      const deal = findProposal(state, action.deal);
      if (!deal || deal.to !== action.player)
        return { code: 'no_deal', message: 'That offer is no longer open' };
      return action.accept ? dealProblem(ctx, state, deal) : undefined;
    },
    apply(draft, action, ctx, emit) {
      const deal = findProposal(view(draft), action.deal)!;
      // A plain copy: the draft's entry is about to go.
      const plain: Proposal = { ...deal, give: { ...deal.give }, get: { ...deal.get } };
      draft.diplomacy.proposals = draft.diplomacy.proposals.filter((p) => p.id !== action.deal);
      if (!action.accept) {
        emit({
          type: 'deal_declined',
          deal: plain.id,
          from: plain.from,
          to: plain.to,
          visibleTo: [plain.from, plain.to],
        });
        return;
      }
      sign(draft, ctx, plain, emit);
      const pact = plain.friendship || plain.alliance || plain.peace;
      emit({
        type: 'deal_accepted',
        deal: plain.id,
        from: plain.from,
        to: plain.to,
        friendship: plain.friendship,
        alliance: plain.alliance,
        peace: plain.peace,
        visibleTo: pact ? 'all' : [plain.from, plain.to],
      });
    },
  } satisfies ActionHandler<A<'answer_deal'>>,

  withdraw_deal: {
    validate(state, action) {
      const deal = findProposal(state, action.deal);
      if (!deal || deal.from !== action.player)
        return { code: 'no_deal', message: 'That offer is no longer open' };
      return undefined;
    },
    apply(draft, action) {
      draft.diplomacy.proposals = draft.diplomacy.proposals.filter((p) => p.id !== action.deal);
    },
  } satisfies ActionHandler<A<'withdraw_deal'>>,

  denounce: {
    validate(state, action, ctx) {
      return (
        notPlaying(state, action.player) ??
        denounceProblem(ctx, state, action.player, action.target)
      );
    },
    apply(draft, action, ctx, emit) {
      draft.diplomacy.denounced[`${action.player}>${action.target}`] = draft.turn;
      draft.players[action.player]!.influence -= toFixed(ctx.content.rules.diplomacy.denounceCost);
      emit({ type: 'denounced', by: action.player, target: action.target, visibleTo: 'all' });
    },
  } satisfies ActionHandler<A<'denounce'>>,
} satisfies {
  [T in 'propose_deal' | 'answer_deal' | 'withdraw_deal' | 'denounce']: ActionHandler<A<T>>;
};

/**
 * End of each turn: influence comes in, per-turn payments are made (one the payer can't afford
 * breaks the deal, and everyone remembers), and pacts, offers and old memories expire.
 */
export function diplomacyTurn(draft: Draft<GameState>, ctx: EngineContext, emit: Emit) {
  const rules = ctx.content.rules.diplomacy;
  const d = draft.diplomacy;
  const turn = draft.turn;
  for (const id of draft.playerOrder) {
    const p = draft.players[id]!;
    if (p.alive) p.influence += influencePerTurn(ctx, view(draft), id);
  }
  const kept = [];
  for (const pay of d.payments) {
    const payer = draft.players[pay.from];
    const payee = draft.players[pay.to];
    if (!payer?.alive || !payee?.alive) continue;
    const amount = toFixed(pay.gold);
    if (payer.gold < amount) {
      d.incidents.push({ kind: 'broke_deal', by: pay.from, against: pay.to, turn });
      emit({ type: 'deal_broken', by: pay.from, to: pay.to, visibleTo: 'all' });
      continue;
    }
    payer.gold -= amount;
    payee.gold += amount;
    if (pay.until > turn) kept.push(pay);
  }
  d.payments = kept;
  for (const kind of ['friendship', 'alliance'] as const) {
    const table = kind === 'friendship' ? d.friends : d.alliances;
    for (const key of Object.keys(table).sort()) {
      if (table[key]! > turn) continue;
      delete table[key];
      const [a, b] = key.split('|') as [PlayerId, PlayerId];
      emit({ type: 'pact_ended', kind, players: [a, b], visibleTo: [a, b] });
    }
  }
  for (const key of Object.keys(d.peaceUntil))
    if (d.peaceUntil[key]! <= turn) delete d.peaceUntil[key];
  const open = [];
  for (const p of d.proposals) {
    if (turn - p.turn + 1 >= rules.proposalTurns) {
      emit({ type: 'deal_expired', deal: p.id, from: p.from, to: p.to, visibleTo: [p.from, p.to] });
    } else open.push(p);
  }
  d.proposals = open;
  d.incidents = d.incidents.filter((i) => turn - i.turn < rules.memoryTurns);
  for (const key of Object.keys(d.denounced)) {
    if (turn - d.denounced[key]! >= rules.memoryTurns) delete d.denounced[key];
  }
}

/** A defeated player's pacts, payments and offers end (what they did is still remembered). */
export function forgetPlayer(draft: Draft<GameState>, player: PlayerId) {
  const d = draft.diplomacy;
  const involves = (key: string) => key.split(/[|>]/).includes(player);
  for (const table of [d.friends, d.alliances, d.peaceUntil, d.lastWar, d.denounced]) {
    for (const key of Object.keys(table)) if (involves(key)) delete table[key];
  }
  d.payments = d.payments.filter((p) => p.from !== player && p.to !== player);
  d.proposals = d.proposals.filter((p) => p.from !== player && p.to !== player);
}
