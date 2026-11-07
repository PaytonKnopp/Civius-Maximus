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
import { grantBoost } from '../progress/handlers';
import { sourceIncome } from '../resources/strategic';
import { luxuryCopies } from '../settlements/luxuries';
import type { GameState, PlayerId, Proposal, ResourceTrade } from '../state';
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
  if (deal.openBorders) {
    d.openBorders = { ...d.openBorders, [key]: draft.turn + rules.openBordersTurns };
    a.influence -= toFixed(rules.openBordersCost);
    b.influence -= toFixed(rules.openBordersCost);
  }
  if (deal.research) {
    d.research = { ...d.research, [key]: draft.turn + rules.researchTurns };
    a.influence -= toFixed(rules.researchCost);
    b.influence -= toFixed(rules.researchCost);
  }
  const trades: ResourceTrade[] = [];
  for (const [resource, amount] of Object.entries(deal.give.resources ?? {}).sort())
    trades.push({ from, to, resource, amount, until: last });
  for (const [resource, amount] of Object.entries(deal.get.resources ?? {}).sort())
    trades.push({ from: to, to: from, resource, amount, until: last });
  if (trades.length > 0) d.trades = [...(d.trades ?? []), ...trades];
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
        ...(action.openBorders ? { openBorders: true } : {}),
        ...(action.research ? { research: true } : {}),
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
      const plain: Proposal = {
        ...deal,
        give: { ...deal.give, resources: { ...deal.give.resources } },
        get: { ...deal.get, resources: { ...deal.get.resources } },
      };
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
      const pact =
        plain.friendship ||
        plain.alliance ||
        plain.peace ||
        plain.openBorders === true ||
        plain.research === true;
      emit({
        type: 'deal_accepted',
        deal: plain.id,
        from: plain.from,
        to: plain.to,
        friendship: plain.friendship,
        alliance: plain.alliance,
        peace: plain.peace,
        ...(plain.openBorders ? { openBorders: true } : {}),
        ...(plain.research ? { research: true } : {}),
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
  if (d.trades?.length) d.trades = deliverTrades(draft, ctx, emit);
  for (const kind of ['friendship', 'alliance'] as const) {
    const table = kind === 'friendship' ? d.friends : d.alliances;
    for (const key of Object.keys(table).sort()) {
      if (table[key]! > turn) continue;
      delete table[key];
      const [a, b] = key.split('|') as [PlayerId, PlayerId];
      emit({ type: 'pact_ended', kind, players: [a, b], visibleTo: [a, b] });
    }
  }
  for (const kind of ['open_borders', 'research'] as const) {
    const table = kind === 'open_borders' ? d.openBorders : d.research;
    if (!table) continue;
    for (const key of Object.keys(table).sort()) {
      if (table[key]! > turn) continue;
      delete table[key];
      const [a, b] = key.split('|') as [PlayerId, PlayerId];
      // A research agreement that ran its course: a boost for each side.
      if (kind === 'research')
        for (const p of [a, b])
          if (draft.players[p]?.alive)
            grantBoost(draft, ctx, p, emit, 'tech', draft.players[p]!.techs.current ?? undefined);
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

/**
 * This turn's resource trades: a luxury needs a copy for every one sent (each improved tile is
 * one), a strategic resource the sender's own income per turn (the stockpiles move with each
 * player's resource turn). One the sender can no longer cover breaks the deal, like a missed
 * payment; the rest run until their last turn.
 */
function deliverTrades(draft: Draft<GameState>, ctx: EngineContext, emit: Emit): ResourceTrade[] {
  const snap = view(draft);
  const turn = draft.turn;
  const kept: ResourceTrade[] = [];
  const copies = new Map<PlayerId, Record<string, number>>();
  const income = new Map<PlayerId, Record<string, number>>();
  const used = new Map<string, number>();
  for (const t of draft.diplomacy.trades ?? []) {
    if (!draft.players[t.from]?.alive || !draft.players[t.to]?.alive) continue;
    const res = ctx.content.entities.resource[t.resource];
    if (!res) continue;
    let have: number;
    if (res.class === 'luxury') {
      if (!copies.has(t.from)) copies.set(t.from, luxuryCopies(ctx, snap, t.from));
      have = copies.get(t.from)![t.resource] ?? 0;
    } else {
      if (!income.has(t.from)) income.set(t.from, sourceIncome(ctx, snap, t.from));
      have = income.get(t.from)![t.resource] ?? 0;
    }
    const key = `${t.from}:${t.resource}`;
    const after = (used.get(key) ?? 0) + t.amount;
    if (after > have) {
      draft.diplomacy.incidents.push({ kind: 'broke_deal', by: t.from, against: t.to, turn });
      emit({ type: 'deal_broken', by: t.from, to: t.to, visibleTo: 'all' });
      continue;
    }
    used.set(key, after);
    if (t.until > turn) kept.push({ ...t });
  }
  return kept;
}

/** A defeated player's pacts, payments and offers end (what they did is still remembered). */
export function forgetPlayer(draft: Draft<GameState>, player: PlayerId) {
  const d = draft.diplomacy;
  const involves = (key: string) => key.split(/[|>]/).includes(player);
  for (const table of [
    d.friends,
    d.alliances,
    d.peaceUntil,
    d.lastWar,
    d.denounced,
    d.openBorders ?? {},
    d.research ?? {},
  ]) {
    for (const key of Object.keys(table)) if (involves(key)) delete table[key];
  }
  d.payments = d.payments.filter((p) => p.from !== player && p.to !== player);
  d.proposals = d.proposals.filter((p) => p.from !== player && p.to !== player);
  if (d.trades) d.trades = d.trades.filter((t) => t.from !== player && t.to !== player);
}

/** War ends every deal between the two: payments, trades, open borders, research, offers. */
export function endDealsBetween(draft: Draft<GameState>, a: PlayerId, b: PlayerId) {
  const d = draft.diplomacy;
  const between = (x: string, y: string) => (x === a && y === b) || (x === b && y === a);
  d.payments = d.payments.filter((p) => !between(p.from, p.to));
  d.proposals = d.proposals.filter((p) => !between(p.from, p.to));
  if (d.trades) d.trades = d.trades.filter((t) => !between(t.from, t.to));
  const key = warKey(a, b);
  if (d.openBorders?.[key] !== undefined) delete d.openBorders[key];
  if (d.research?.[key] !== undefined) delete d.research[key];
}
