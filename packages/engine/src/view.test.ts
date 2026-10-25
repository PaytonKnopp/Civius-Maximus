import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { foundSettlement } from './settlements/handlers';
import type { GameEvent } from './events';
import type { GameState } from './state';
import { addUnit, at, ctx, testState } from './testing/world';
import { fogOfWar } from './units/vision';
import { eventsFor, playerView } from './view';

const FIELD = Array.from({ length: 7 }, () => '.'.repeat(30));

/** p1's city at (2,3) and p2's at (25,3), nothing explored but what they see. */
function world() {
  let s = testState(FIELD, { explored: false });
  s = produce(s, (d) => {
    foundSettlement(d, ctx, 'p1', at(s, 2, 3), () => {});
    foundSettlement(d, ctx, 'p2', at(s, 25, 3), () => {});
  });
  const [mine, theirs] = Object.keys(s.settlements) as [string, string];
  return { s: structuredClone(s) as GameState, mine, theirs };
}

describe('a player’s view', () => {
  it('leaves out what they can’t see, in the same shape', () => {
    const w = world();
    const s = w.s;
    const far = addUnit(s, 'p2', 'unit_warrior', at(s, 22, 3));
    const near = addUnit(s, 'p2', 'unit_warrior', at(s, 4, 3));
    s.units[near.id]!.orders = { kind: 'sleep' };
    const own = addUnit(s, 'p1', 'unit_scout', at(s, 3, 2));
    s.units[own.id]!.orders = { kind: 'sleep' };
    s.diplomacy.proposals.push({
      id: 'd1',
      from: 'p2',
      to: 'p3',
      turn: 1,
      gives: [],
      asks: [],
    } as unknown as GameState['diplomacy']['proposals'][number]);

    const v = playerView(ctx, s, 'p1');
    // Their far settlement and unit are gone; the one next door is there, without its orders.
    expect(Object.keys(v.settlements)).toEqual([w.mine]);
    expect(v.units[far.id]).toBeUndefined();
    expect(v.units[near.id]).toMatchObject({ owner: 'p2', orders: null });
    expect(v.units[own.id]!.orders).toEqual({ kind: 'sleep' });
    // Unexplored land reads as empty water.
    const theirTile = v.map.tiles[at(s, 25, 3)]!;
    expect(theirTile).toMatchObject({ owner: null, settlement: null });
    expect(ctx.content.entities.terrain[theirTile.terrain]!.water).toBe(true);
    expect(v.map.tiles[at(s, 2, 3)]).toEqual(s.map.tiles[at(s, 2, 3)]);
    // No dice, no seed, nobody else's exploration or deals.
    expect(v.rng).toEqual([0, 0, 0, 0]);
    expect(v.settings.seed).toBe('');
    expect(v.players.p2!.explored).toBe('');
    expect(v.players.p1!.explored).toBe(s.players.p1!.explored);
    expect(v.diplomacy.proposals).toEqual([]);
    // The fog the client works out from the view matches the real one.
    expect(fogOfWar(ctx, v, 'p1')).toEqual(fogOfWar(ctx, s, 'p1'));
  });

  it('shows a foreign settlement once any of its land is known, without its queue', () => {
    const w = world();
    const s = w.s;
    s.settlements[w.theirs]!.queue = [{ kind: 'unit', id: 'unit_warrior' }];
    addUnit(s, 'p1', 'unit_scout', at(s, 21, 3));
    const v = playerView(ctx, s, 'p1');
    expect(v.settlements[w.theirs]).toMatchObject({ owner: 'p2', queue: [], progress: {} });
  });

  it('passes on only the events meant for the player', () => {
    const events = [
      { type: 'turn_started', turn: 2, visibleTo: 'all' },
      { type: 'denounced', by: 'p2', target: 'p3', visibleTo: ['p2', 'p3'] },
      { type: 'denounced', by: 'p2', target: 'p1', visibleTo: ['p1', 'p2'] },
    ] as GameEvent[];
    expect(eventsFor(events, 'p1').map((e) => e.type)).toEqual(['turn_started', 'denounced']);
  });
});
