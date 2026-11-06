import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { Action } from '../actions';
import { dealVerdict, luxurySwap } from '../ai/diplomacy';
import { tourismBonus } from '../culture/tourism';
import type { GameEvent } from '../events';
import { applyAction } from '../game';
import { neighbors } from '../map/hex';
import { sourcesFor } from '../progress/sources';
import { stockpileIncome } from '../resources/strategic';
import { spareLuxury } from '../settlements/luxuries';
import { happinessOf } from '../settlements/rules';
import type { GameState } from '../state';
import { act, addUnit, at, ctx, endTurn, testState } from '../testing/world';
import { visibleTiles } from '../units/vision';
import {
  areAllies,
  areFriends,
  haveOpenBorders,
  haveResearchAgreement,
  opinionOf,
  warBlock,
} from './rules';

const FIELD = ['.........', '.........', '.........', '.........', '.........'];
const rules = ctx.content.rules.diplomacy;
const err = (s: GameState, a: Action) => {
  const r = applyAction(s, a, ctx);
  return r.ok ? undefined : r.error.code;
};
const none = { gold: 0, goldPerTurn: 0, maps: false, resources: {} };
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
    s = sign(s, deal({ give: { ...none, gold: 50, goldPerTurn: 10 }, turns: 3 }));
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
    s = sign(s, deal({ peace: true, give: { ...none, gold: 100 } }));
    expect(s.wars).toEqual([]);
    expect(err(s, { type: 'declare_war', player: 'p1', target: 'p2' })).toBe('peace_treaty');
  });

  it('offers expire if nobody answers', () => {
    let s = act(rich(), deal({ give: { ...none, gold: 10 } })).state;
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
      give: { ...none, gold: 30 },
    };
    expect(dealVerdict(ctx, s, 'p2', gift).accept).toBe(true);
    const ask = { ...gift, give: none, get: { ...none, gold: 500 } };
    expect(dealVerdict(ctx, s, 'p2', ask).accept).toBe(false);
  });
});

/** Two coasts of land: `h` hills. */
const LAND = [
  '~~~~~~~~~~~~~~~~',
  '~..h.......h...~',
  '~..............~',
  '~..h.......h...~',
  '~~~~~~~~~~~~~~~~',
];

/**
 * p1's capital at (3, 2) with two wine plantations and an iron mine next to it, p2's at (11, 2);
 * both rich, and both know where iron is.
 */
function twoCivs(): { s: GameState; home: string; away: string; wines: number[]; iron: number } {
  let s = testState(LAND);
  const a = addUnit(s, 'p1', 'unit_settler', at(s, 3, 2));
  s = structuredClone(act(s, { type: 'found_settlement', player: 'p1', unit: a.id }).state);
  const b = addUnit(s, 'p2', 'unit_settler', at(s, 11, 2));
  s = structuredClone(act(s, { type: 'found_settlement', player: 'p2', unit: b.id }).state);
  const home = s.players.p1!.capital!;
  const away = s.players.p2!.capital!;
  const around = neighbors(s.map, s.settlements[home]!.tile);
  const iron = around.find((t) => s.map.tiles[t]!.elevation === 'hills')!;
  s.map.tiles[iron]!.resource = 'iron';
  s.map.tiles[iron]!.improvement = 'improvement_mine';
  const wines = around
    .filter((t) => t !== iron && s.map.tiles[t]!.elevation === 'flat')
    .slice(0, 2);
  for (const t of wines) {
    s.map.tiles[t]!.resource = 'wine';
    s.map.tiles[t]!.improvement = 'improvement_plantation';
  }
  for (const p of Object.values(s.players)) {
    p.gold = 100_000;
    p.influence = 100_000;
    p.techs.done.push('tech_mining', 'tech_bronze_working');
  }
  return { s, home, away, wines, iron };
}

/** Ends the turn for everyone, keeping the events. */
function endTurnWithEvents(s: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  for (const p of s.playerOrder) {
    const r = act(s, { type: 'end_turn', player: p });
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

describe('open borders, research agreements and resource trades (D118)', () => {
  it('a spare luxury copy cheers the other capital while one copy always stays home', () => {
    const { s: start, home, away, wines } = twoCivs();
    let s = start;
    expect(spareLuxury(ctx, s, 'p1', 'wine')).toBe(1);
    expect(err(s, deal({ give: { ...none, resources: { wine: 2 } } }))).toBe('no_resource');
    expect(err(s, deal({ get: { ...none, resources: { wine: 1 } } }))).toBe('no_resource');
    s = sign(s, deal({ give: { ...none, resources: { wine: 1 } }, turns: 5 }));
    expect(s.diplomacy.trades).toEqual([
      { from: 'p1', to: 'p2', resource: 'wine', amount: 1, until: s.turn + 4 },
    ]);
    expect(happinessOf(ctx, s, s.settlements[away]!).lines).toContainEqual({
      label: 'Wine (from p1)',
      amount: 2,
    });
    // The second copy was the spare: home still enjoys its wine.
    expect(happinessOf(ctx, s, s.settlements[home]!).lines).toContainEqual({
      label: 'Wine',
      amount: 2,
    });
    expect(spareLuxury(ctx, s, 'p1', 'wine')).toBe(0);
    expect(opinionOf(ctx, s, 'p2', 'p1').lines.map((l) => l.label)).toContain('Deals with us');
    for (let i = 0; i < 5; i++) s = endTurn(s);
    expect(s.diplomacy.trades).toEqual([]);
    expect(happinessOf(ctx, s, s.settlements[away]!).lines.map((l) => l.label)).not.toContain(
      'Wine (from p1)',
    );

    // A sender that loses its copies breaks the deal, and everyone remembers.
    s = sign(s, deal({ give: { ...none, resources: { wine: 1 } }, turns: 10 }));
    s = produce(s, (d) => {
      for (const t of wines) d.map.tiles[t]!.improvement = null;
    });
    const r = endTurnWithEvents(s);
    expect(r.state.diplomacy.trades).toEqual([]);
    expect(r.events.some((e) => e.type === 'deal_broken' && e.by === 'p1')).toBe(true);
    expect(r.state.diplomacy.incidents.some((i) => i.kind === 'broke_deal' && i.by === 'p1')).toBe(
      true,
    );
  });

  it('strategic resources flow from the sender’s income into the other stockpile each turn', () => {
    const { s: start, iron } = twoCivs();
    let s = start;
    expect(stockpileIncome(ctx, s, 'p1')).toEqual({ iron: 2 });
    expect(err(s, deal({ give: { ...none, resources: { iron: 3 } } }))).toBe('no_resource');
    s = sign(s, deal({ give: { ...none, resources: { iron: 1 } }, turns: 3 }));
    expect(stockpileIncome(ctx, s, 'p1')).toEqual({ iron: 1 });
    expect(stockpileIncome(ctx, s, 'p2')).toEqual({ iron: 1 });
    // Only one more a turn to spare.
    expect(err(s, deal({ give: { ...none, resources: { iron: 2 } } }))).toBe('no_resource');
    s = endTurn(s);
    expect(s.players.p1!.resources?.iron).toBe(1);
    expect(s.players.p2!.resources?.iron).toBe(1);
    // Losing the mine breaks it.
    s = produce(s, (d) => {
      d.map.tiles[iron]!.improvement = null;
    });
    s = endTurn(s);
    expect(s.diplomacy.trades).toEqual([]);
    expect(s.diplomacy.incidents.some((i) => i.kind === 'broke_deal' && i.by === 'p1')).toBe(true);
  });

  it('open borders cost influence, carry tourism further, heal visitors; war ends them', () => {
    const { s: start, away } = twoCivs();
    let s = start;
    s = sign(s, deal({ openBorders: true }));
    expect(haveOpenBorders(s, 'p1', 'p2')).toBe(true);
    expect(s.players.p1!.influence).toBe(100_000 - rules.openBordersCost * 100);
    expect(s.players.p2!.influence).toBe(100_000 - rules.openBordersCost * 100);
    expect(tourismBonus(ctx, s, 'p1', 'p2')).toContainEqual({
      label: 'Open borders',
      percent: ctx.content.rules.culture.openBordersPercent,
    });
    expect(err(s, deal({ openBorders: true }))).toBe('already');
    // A hurt soldier in their land heals as at home.
    const spot = neighbors(s.map, s.settlements[away]!.tile)[0]!;
    s = structuredClone(s);
    const u = addUnit(s, 'p1', 'unit_warrior', spot);
    s.units[u.id]!.health = 50;
    s = endTurn(s);
    expect(s.units[u.id]!.health).toBe(50 + ctx.content.rules.combat.heal.own);
    s = act(s, { type: 'declare_war', player: 'p1', target: 'p2' }).state;
    expect(haveOpenBorders(s, 'p1', 'p2')).toBe(false);
  });

  it('research agreements need a friendship, add science, and give both a boost at the end', () => {
    const { s: start } = twoCivs();
    let s = start;
    expect(err(s, deal({ research: true }))).toBe('not_friends');
    s = sign(s, deal({ friendship: true, research: true }));
    expect(haveResearchAgreement(s, 'p1', 'p2')).toBe(true);
    expect(s.players.p1!.influence).toBe(
      100_000 - (rules.friendshipCost + rules.researchCost) * 100,
    );
    expect(sourcesFor(ctx, s, 'p1').map((x) => x.label)).toContain('Research agreement with p2');
    expect(sourcesFor(ctx, s, 'p2').map((x) => x.label)).toContain('Research agreement with p1');
    const ends = s.diplomacy.research![Object.keys(s.diplomacy.research!)[0]!]!;
    while (s.turn < ends) s = endTurn(s);
    const r = endTurnWithEvents(s);
    expect(haveResearchAgreement(r.state, 'p1', 'p2')).toBe(false);
    expect(r.events).toContainEqual(
      expect.objectContaining({ type: 'pact_ended', kind: 'research' }),
    );
    for (const p of ['p1', 'p2'])
      expect(r.events.some((e) => e.type === 'boost_earned' && e.player === p)).toBe(true);
    expect(sourcesFor(ctx, r.state, 'p1').map((x) => x.label)).not.toContain(
      'Research agreement with p2',
    );
  });

  it('the AI swaps spare luxuries neither side has, and values a luxury it lacks', () => {
    const { s: start, away } = twoCivs();
    const s = structuredClone(start);
    expect(luxurySwap(ctx, s, 'p1', 'p2')).toBeUndefined();
    const theirs = neighbors(s.map, s.settlements[away]!.tile).filter(
      (t) => s.map.tiles[t]!.elevation === 'flat',
    );
    for (const t of theirs.slice(0, 2)) {
      s.map.tiles[t]!.resource = 'incense';
      s.map.tiles[t]!.improvement = 'improvement_plantation';
    }
    expect(luxurySwap(ctx, s, 'p1', 'p2')).toEqual({ give: 'wine', get: 'incense' });
    const swap = {
      from: 'p1',
      to: 'p2',
      give: { ...none, resources: { wine: 1 } },
      get: { ...none, resources: { incense: 1 } },
      turns: 30,
      friendship: false,
      alliance: false,
      peace: false,
    };
    expect(dealVerdict(ctx, s, 'p2', swap).accept).toBe(true);
    // Their only copy isn't on the table.
    expect(err(s, deal({ get: { ...none, resources: { incense: 2 } } }))).toBe('no_resource');
  });
});
