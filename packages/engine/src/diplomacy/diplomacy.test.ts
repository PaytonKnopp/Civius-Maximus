import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { Action } from '../actions';
import { dealVerdict } from '../ai/diplomacy';
import { applyAction } from '../game';
import type { GameState } from '../state';
import { act, addUnit, at, ctx, endTurn, testState } from '../testing/world';
import { visibleTiles } from '../units/vision';
import { areAllies, areFriends, opinionOf, warBlock } from './rules';

const FIELD = ['.........', '.........', '.........', '.........', '.........'];
const rules = ctx.content.rules.diplomacy;
const err = (s: GameState, a: Action) => {
  const r = applyAction(s, a, ctx);
  return r.ok ? undefined : r.error.code;
};
const none = { gold: 0, goldPerTurn: 0, maps: false };
const deal = (over: Partial<Extract<Action, { type: 'propose_deal' }>> = {}) =>
  ({
    type: 'propose_deal',
    player: 'p1',
    to: 'p2',
    give: none,
    get: none,
    turns: 10,
    friendship: false,
    alliance: false,
    peace: false,
    ...over,
  }) as Action;

/** Both players rich in gold and influence. */
function rich(): GameState {
  return produce(testState(FIELD), (d) => {
    for (const p of Object.values(d.players)) {
      p.gold = 100_000;
      p.influence = 100_000;
    }
  });
}

function sign(s: GameState, a: Action): GameState {
  s = act(s, a).state;
  const id = s.diplomacy.proposals.at(-1)!.id;
  return act(s, { type: 'answer_deal', player: 'p2', deal: id, accept: true }).state;
}

describe('deals', () => {
  it('declared friendship costs influence on both sides and blocks war', () => {
    let s = rich();
    s = sign(s, deal({ friendship: true }));
    expect(areFriends(s, 'p1', 'p2')).toBe(true);
    expect(s.players.p1!.influence).toBe(100_000 - rules.friendshipCost * 100);
    expect(s.players.p2!.influence).toBe(100_000 - rules.friendshipCost * 100);
    expect(err(s, { type: 'declare_war', player: 'p1', target: 'p2' })).toBe('friends');
    // It ends after its turns.
    for (let i = 0; i <= rules.friendshipTurns; i++) s = endTurn(s);
    expect(areFriends(s, 'p1', 'p2')).toBe(false);
    expect(warBlock(s, 'p1', 'p2')).toBeUndefined();
  });

  it('alliances need a friendship and share vision', () => {
    let s = rich();
    expect(err(s, deal({ alliance: true }))).toBe('not_friends');
    const far = addUnit(structuredClone(s), 'p2', 'unit_warrior', at(s, 8, 4));
    s = structuredClone(s);
    s.units[far.id] = far;
    expect(visibleTiles(ctx, s, 'p1')[far.tile]).toBe(0);
    s = sign(s, deal({ friendship: true, alliance: true }));
    expect(areAllies(s, 'p1', 'p2')).toBe(true);
    expect(visibleTiles(ctx, s, 'p1')[far.tile]).toBe(1);
  });

  it('moves gold now and every turn, and a missed payment breaks the deal', () => {
    let s = rich();
    s = sign(s, deal({ give: { gold: 50, goldPerTurn: 10, maps: false }, turns: 3 }));
    expect(s.players.p1!.gold).toBe(100_000 - 5_000);
    expect(s.players.p2!.gold).toBe(100_000 + 5_000);
    s = produce(s, (d) => {
      d.players.p1!.gold = 1_500;
    });
    s = endTurn(s);
    s = endTurn(s);
    // 15 gold covered one payment, not the second.
    expect(s.diplomacy.payments).toEqual([]);
    expect(s.diplomacy.incidents.some((i) => i.kind === 'broke_deal' && i.by === 'p1')).toBe(true);
    const o = opinionOf(ctx, s, 'p2', 'p1');
    expect(o.lines.find((l) => l.label === 'Broke a deal')!.amount).toBeLessThan(0);
  });

  it('peace in a deal brings a treaty that blocks war for a while', () => {
    let s = act(rich(), { type: 'declare_war', player: 'p1', target: 'p2' }).state;
    expect(err(s, deal({ peace: true }))).toBe('too_soon');
    s = produce(s, (d) => {
      d.turn += ctx.content.rules.combat.minWarTurns;
    });
    expect(err(s, deal({ friendship: true }))).toBe('at_war');
    s = sign(s, deal({ peace: true, give: { gold: 100, goldPerTurn: 0, maps: false } }));
    expect(s.wars).toEqual([]);
    expect(err(s, { type: 'declare_war', player: 'p1', target: 'p2' })).toBe('peace_treaty');
  });

  it('offers expire if nobody answers', () => {
    let s = act(rich(), deal({ give: { gold: 10, goldPerTurn: 0, maps: false } })).state;
    expect(s.diplomacy.proposals).toHaveLength(1);
    for (let i = 0; i < rules.proposalTurns; i++) s = endTurn(s);
    expect(s.diplomacy.proposals).toEqual([]);
  });
});

describe('war and opinions', () => {
  it('a surprise war is remembered; denouncing first makes it a formal war', () => {
    const s = act(rich(), { type: 'declare_war', player: 'p1', target: 'p2' }).state;
    expect(s.diplomacy.incidents).toEqual([
      { kind: 'surprise_war', by: 'p1', against: 'p2', turn: s.turn },
    ]);
    expect(opinionOf(ctx, s, 'p2', 'p1').lines.map((l) => l.label)).toContain('Surprise war on us');

    let f = act(rich(), { type: 'denounce', player: 'p1', target: 'p2' }).state;
    expect(f.players.p1!.influence).toBe(100_000 - rules.denounceCost * 100);
    f = act(f, { type: 'declare_war', player: 'p1', target: 'p2' }).state;
    expect(f.diplomacy.incidents).toEqual([]);
    expect(f.warSupport[Object.keys(f.warSupport)[0]!]!.p2).toBe(0);
  });

  it('the AI turns down a friendship it is not ready for, and takes free gold', () => {
    const s = rich();
    const friendship = {
      from: 'p1',
      to: 'p2',
      give: none,
      get: none,
      turns: 10,
      friendship: true,
      alliance: false,
      peace: false,
    };
    const v = dealVerdict(ctx, s, 'p2', friendship);
    expect(v.accept).toBe(false);
    expect(v.reasons).toContain('Not close enough for a friendship');
    const gift = {
      ...friendship,
      friendship: false,
      give: { gold: 30, goldPerTurn: 0, maps: false },
    };
    expect(dealVerdict(ctx, s, 'p2', gift).accept).toBe(true);
    const ask = { ...gift, give: none, get: { gold: 500, goldPerTurn: 0, maps: false } };
    expect(dealVerdict(ctx, s, 'p2', ask).accept).toBe(false);
  });
});
