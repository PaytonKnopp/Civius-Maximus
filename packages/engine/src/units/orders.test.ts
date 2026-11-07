import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../events';
import { applyAction } from '../game';
import type { GameState } from '../state';
import { act, addUnit, at, ctx, endTurn, testState } from '../testing/world';
import { exploredBits, exploreVisible } from './vision';
import { getBit } from '../bitset';

const FIELD = ['..............', '..............', '..............', '..............'];

function endWithEvents(s: GameState): { s: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  for (const p of s.playerOrder) {
    const r = act(s, { type: 'end_turn', player: p });
    s = r.state;
    events.push(...r.events);
  }
  return { s, events };
}

describe('unit orders', () => {
  it('a unit set to explore heads for the edge of the known map until nothing is left', () => {
    let s = testState(FIELD, { explored: false });
    const scout = addUnit(s, 'p1', 'unit_scout', at(s, 1, 1));
    s.players.p1!.explored = exploreVisible(ctx, s, 'p1');
    s.players.p1!.gold = 10_000;
    s = act(s, { type: 'explore_unit', player: 'p1', unit: scout.id }).state;
    expect(s.units[scout.id]!.orders).toEqual({ kind: 'explore' });
    const known = (st: GameState) => {
      const bits = exploredBits(st, 'p1');
      return st.map.tiles.filter((_t, i) => getBit(bits, i)).length;
    };
    const before = known(s);
    let done = false;
    for (let i = 0; i < 20 && !done; i++) {
      const r = endWithEvents(s);
      s = r.s;
      done = r.events.some((e) => e.type === 'orders_cancelled' && e.reason === 'explored');
    }
    expect(known(s)).toBeGreaterThan(before);
    expect(done).toBe(true);
    expect(known(s)).toBe(s.map.tiles.length);
    expect(s.units[scout.id]!.orders).toBeNull();
    // With the whole map known, there's nothing to explore.
    expect(applyAction(s, { type: 'explore_unit', player: 'p1', unit: scout.id }, ctx).ok).toBe(
      false,
    );
  });

  it('a unit on alert wakes when an enemy soldier comes into sight', () => {
    let s = testState(FIELD);
    s.players.p1!.gold = 10_000;
    s.players.p2!.gold = 10_000;
    const guard = addUnit(s, 'p1', 'unit_warrior', at(s, 2, 1));
    addUnit(s, 'p2', 'unit_warrior', at(s, 4, 1));
    s = act(s, { type: 'alert_unit', player: 'p1', unit: guard.id }).state;
    // At peace, it keeps watch.
    s = endTurn(s);
    expect(s.units[guard.id]!.orders).toEqual({ kind: 'alert' });
    s = act(s, { type: 'declare_war', player: 'p2', target: 'p1' }).state;
    const r = endWithEvents(s);
    expect(r.s.units[guard.id]!.orders).toBeNull();
    expect(r.events).toContainEqual(
      expect.objectContaining({ type: 'unit_alerted', unit: guard.id }),
    );
  });
});
