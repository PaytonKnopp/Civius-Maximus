import { describe, expect, it } from 'vitest';
import { checkInvariants } from '../invariants';
import type { GameState } from '../state';
import { act, addUnit, at, ctx, endTurn, testState } from '../testing/world';
import { goldForecast, goldPerTurn } from './rules';

const MAP = [
  '~~~~~~~~~~~~~~~~~~',
  '~..w.m..~~..w....~',
  '~.w....w~~.......~',
  '~..m.w..~~..w..m.~',
  '~...w...~~.......~',
  '~~~~~~~~~~~~~~~~~~',
];

/** p1 with a capital (a city), p2 with one across the water. */
function twoCapitals(): GameState {
  let s = testState(MAP);
  const a = addUnit(s, 'p1', 'unit_settler', at(s, 4, 2));
  s = structuredClone(act(s, { type: 'found_settlement', player: 'p1', unit: a.id }).state);
  const b = addUnit(s, 'p2', 'unit_settler', at(s, 13, 2));
  s = structuredClone(act(s, { type: 'found_settlement', player: 'p2', unit: b.id }).state);
  return s;
}

describe('the gold forecast (what the top bar promises)', () => {
  it('is what the next turn does to the treasury', () => {
    let s = twoCapitals();
    // Something to build, so the capital isn't idle.
    s = structuredClone(
      act(s, {
        type: 'set_queue',
        player: 'p1',
        settlement: s.players.p1!.capital!,
        queue: [{ kind: 'unit', id: 'unit_warrior' }],
      }).state,
    );
    const promised = goldForecast(ctx, s, 'p1');
    expect(promised.idle).toBe(0);
    expect(promised.total).toBe(goldPerTurn(ctx, s, 'p1'));
    const gold = s.players.p1!.gold;
    const next = endTurn(s);
    expect(next.players.p1!.gold - gold).toBe(promised.total);
  });

  it('counts a city with nothing to build selling its production', () => {
    const s = twoCapitals();
    expect(s.settlements[s.players.p1!.capital!]!.queue).toEqual([]);
    const promised = goldForecast(ctx, s, 'p1');
    expect(promised.idle).toBeGreaterThan(0);
    // The plain income the AI reasons with leaves that out.
    expect(promised.total).toBe(goldPerTurn(ctx, s, 'p1') + promised.idle);
    const gold = s.players.p1!.gold;
    const next = endTurn(s);
    expect(next.players.p1!.gold - gold).toBe(promised.total);
  });

  it('counts gold a turn from deals, both ways', () => {
    const s = twoCapitals();
    s.players.p2!.gold = 100_00;
    s.diplomacy.payments.push({ from: 'p2', to: 'p1', gold: 7, until: 30 });
    const mine = goldForecast(ctx, s, 'p1');
    const theirs = goldForecast(ctx, s, 'p2');
    expect(mine.deals).toBe(7_00);
    expect(theirs.deals).toBe(-7_00);
    const before = { p1: s.players.p1!.gold, p2: s.players.p2!.gold };
    const next = endTurn(s);
    expect(next.players.p1!.gold - before.p1).toBe(mine.total);
    expect(next.players.p2!.gold - before.p2).toBe(theirs.total);
  });
});

describe('checkInvariants', () => {
  it('finds nothing wrong with a game played by the rules', () => {
    let s = twoCapitals();
    expect(checkInvariants(ctx, s)).toEqual([]);
    for (let i = 0; i < 5; i++) s = structuredClone(endTurn(s));
    expect(checkInvariants(ctx, s)).toEqual([]);
  });

  it('names what is broken', () => {
    const s = twoCapitals();
    const id = s.players.p1!.capital!;
    s.settlements[id]!.buildings.push('building_no_such_thing');
    s.players.p2!.gold = -5;
    s.units.u99 = { ...addUnit(s, 'p1', 'unit_warrior', at(s, 0, 0)), id: 'u99' };
    const found = checkInvariants(ctx, s).join('\n');
    expect(found).toContain('has no such building building_no_such_thing');
    expect(found).toContain('player p2 gold is -5, below 0');
    // A warrior in the sea, where land units cannot be.
    expect(found).toMatch(/unit u\d+ \(unit_warrior, p1\) stands on tile 0 \(coast\)/);
  });
});
