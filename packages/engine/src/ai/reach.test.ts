import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { Action } from '../actions';
import { emptyBits, encodeBits, setBit } from '../bitset';
import { applyAction } from '../game';
import { foundSettlement } from '../settlements/handlers';
import type { GameState } from '../state';
import { addUnit, at, ctx, testState } from '../testing/world';
import { hasSettleSite, moveSettler } from './settle';
import { Turn } from './turn';

/**
 * The AI only sends units where they can get to over tiles the player has explored (release
 * pass, November 2026). Before, it ranked every explored tile, asked the rules for a path to
 * its best few and gave up when those were refused: on island maps settlers stood idle for
 * hundreds of turns under sites across the water, and cities kept training more of them.
 */

/** A capital on a three-tile strip, and a wide island across two tiles of shallow water. */
const ISLANDS = [
  '~~~~............',
  '~~~~............',
  '..~~............',
  '..~~............',
  '..~~............',
  '~~~~............',
  '~~~~............',
];

function islands(canEmbark: boolean) {
  let s = testState(ISLANDS);
  s = produce(s, (d) => {
    foundSettlement(d, ctx, 'p1', at(s, 0, 3), () => {});
    d.players.p1!.canEmbark = canEmbark;
  });
  s = structuredClone(s) as GameState;
  const settler = addUnit(s, 'p1', 'unit_settler', at(s, 1, 3));
  return { s, settler };
}

/** One AI decision on `s`, with everything it asked of the rules and how they answered. */
function decide(s: GameState) {
  const asked: { action: Action; refused?: string }[] = [];
  let state = s;
  const t = new Turn(ctx, state, 'p1', (action) => {
    const r = applyAction(state, action, ctx);
    asked.push(r.ok ? { action } : { action, refused: r.error.code });
    if (!r.ok) return undefined;
    state = r.state;
    return state;
  });
  return { t, asked };
}

describe('AI: reach', () => {
  it('leaves a site across the water alone until its people can embark', () => {
    const { s, settler } = islands(false);
    const { t, asked } = decide(s);
    // The big island is in sight and full of good sites; none can be walked to.
    expect(t.canReach(settler, at(s, 1, 2))).toBe(true);
    expect(t.canReach(settler, at(s, 8, 3))).toBe(false);
    moveSettler(t, t.state.units[settler.id]!);
    expect(asked.filter((a) => a.action.type === 'move_unit')).toEqual([]);
    // And no more settlers are wanted for it.
    expect(hasSettleSite(t)).toBe(false);
  });

  it('crosses once it can: the move is asked for once and accepted', () => {
    const { s, settler } = islands(true);
    const { t, asked } = decide(s);
    expect(t.canReach(settler, at(s, 8, 3))).toBe(true);
    expect(hasSettleSite(t)).toBe(true);
    moveSettler(t, t.state.units[settler.id]!);
    const moves = asked.filter((a) => a.action.type === 'move_unit');
    expect(moves).toHaveLength(1);
    expect(moves[0]!.refused).toBeUndefined();
    const target = (moves[0]!.action as Extract<Action, { type: 'move_unit' }>).to;
    expect(target % s.map.width).toBeGreaterThanOrEqual(4);
  });

  it('counts land beyond the unknown as out of reach until the way is explored', () => {
    // One landmass; columns 6 and 7 have never been seen, the land on both sides has.
    let s = testState(Array.from({ length: 7 }, () => '.'.repeat(16)));
    const known = emptyBits(s.map.tiles.length);
    s.map.tiles.forEach((_, i) => {
      const col = i % s.map.width;
      if (col < 6 || col > 7) setBit(known, i);
    });
    s = produce(s, (d) => {
      d.players.p1!.explored = encodeBits(known);
    });
    s = structuredClone(s) as GameState;
    const scout = addUnit(s, 'p1', 'unit_scout', at(s, 4, 3));
    const { t, asked } = decide(s);
    const far = at(s, 10, 3);
    expect(t.isExplored(far)).toBe(true);
    expect(t.canReach(scout, far)).toBe(false);
    // The rules agree: there is no path through the unknown.
    expect(t.act({ type: 'move_unit', player: 'p1', unit: scout.id, to: far })).toBe(false);
    expect(asked[0]!.refused).toBe('no_path');
    // A step toward the gap shows the way through, and the same turn knows it at once.
    expect(t.act({ type: 'move_unit', player: 'p1', unit: scout.id, to: at(s, 5, 3) })).toBe(true);
    expect(t.isExplored(at(s, 7, 3))).toBe(true);
    expect(t.canReach(t.state.units[scout.id]!, far)).toBe(true);
  });
});
