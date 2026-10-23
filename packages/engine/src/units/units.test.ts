import { describe, expect, it } from 'vitest';
import { emptyBits, encodeBits, getBit, setBit } from '../bitset';
import { applyAction, createGame } from '../game';
import { setRiverEdge } from '../map/hex';
import { runReplay } from '../replay';
import { act, addUnit, at, ctx, endTurn, testState } from '../testing/world';
import { unitsNeedingOrders } from './handlers';
import { stepMoves } from './movement';
import { findPath } from './pathfind';
import { exploredBits, lineOfSight, visibleTiles } from './vision';

describe('starting units', () => {
  const game = createGame(
    {
      gameId: 'g',
      settings: {
        seed: 'start',
        turnLimit: null,
        map: {
          script: 'continents',
          size: 'tiny',
          wrapX: true,
          resources: 'standard',
          startBalance: 'normal',
        },
      },
      players: ['p1', 'p2', 'p3', 'p4'].map((id) => ({ id, name: id, kind: 'human' as const })),
    },
    ctx,
  );

  it('gives every player a settler, warrior and scout at their start', () => {
    for (const p of game.playerOrder) {
      const mine = Object.values(game.units).filter((u) => u.owner === p);
      expect(mine.map((u) => u.type).sort()).toEqual([
        'unit_scout',
        'unit_settler',
        'unit_warrior',
      ]);
      const start = game.players[p]!.startTile;
      expect(mine.find((u) => u.type === 'unit_settler')!.tile).toBe(start);
      // Civilian and military share the start tile; the scout goes next door.
      expect(mine.find((u) => u.type === 'unit_warrior')!.tile).toBe(start);
      expect(mine.find((u) => u.type === 'unit_scout')!.tile).not.toBe(start);
    }
  });

  it('reveals the land around each start', () => {
    for (const p of game.playerOrder) {
      expect(getBit(exploredBits(game, p), game.players[p]!.startTile)).toBe(true);
    }
  });
});

describe('movement costs', () => {
  it('charges terrain, hills and woods, and blocks mountains', () => {
    const s = testState(['.hHmw~']);
    const w = addUnit(s, 'p1', 'unit_warrior', at(s, 0, 0));
    expect(stepMoves(ctx, s, w, at(s, 0, 0), at(s, 1, 0), 300)).toBe(100); // hills: 2
    expect(stepMoves(ctx, s, w, at(s, 1, 0), at(s, 2, 0), 300)).toBe(0); // wooded hills: 3
    expect(stepMoves(ctx, s, w, at(s, 2, 0), at(s, 3, 0), 300)).toBeNull(); // mountain
    expect(stepMoves(ctx, s, w, at(s, 4, 0), at(s, 5, 0), 300)).toBeNull(); // coast, can't embark yet
  });

  it('lets a unit with any moves left enter any passable tile (Civ 5 rule)', () => {
    const s = testState(['.H']);
    const w = addUnit(s, 'p1', 'unit_warrior', at(s, 0, 0));
    expect(stepMoves(ctx, s, w, at(s, 0, 0), at(s, 1, 0), 50)).toBe(0);
    expect(stepMoves(ctx, s, w, at(s, 0, 0), at(s, 1, 0), 0)).toBeNull();
  });

  it('ends the move when crossing a river', () => {
    const s = testState(['...']);
    setRiverEdge(
      s.map,
      s.map.tiles.map((t) => t.river),
      0,
      0,
    );
    s.map.tiles[0]!.river = 1; // river on the east edge of tile 0
    const w = addUnit(s, 'p1', 'unit_scout', at(s, 0, 0));
    expect(stepMoves(ctx, s, w, at(s, 0, 0), at(s, 1, 0), 300)).toBe(0);
    expect(stepMoves(ctx, s, w, at(s, 1, 0), at(s, 2, 0), 300)).toBe(200);
  });

  it('embarks onto coast (ending the move) only once the player can embark', () => {
    const s = testState(['.~o']);
    const w = addUnit(s, 'p1', 'unit_warrior', at(s, 0, 0));
    expect(stepMoves(ctx, s, w, at(s, 0, 0), at(s, 1, 0), 200)).toBeNull();
    s.players.p1!.canEmbark = true;
    expect(stepMoves(ctx, s, w, at(s, 0, 0), at(s, 1, 0), 200)).toBe(0);
    expect(stepMoves(ctx, s, w, at(s, 1, 0), at(s, 2, 0), 200)).toBeNull(); // no deep ocean yet
  });

  it('keeps ships on water, and out of deep ocean unless they can sail it', () => {
    const s = testState(['.~o']);
    const g = addUnit(s, 'p1', 'unit_galley', at(s, 1, 0));
    expect(stepMoves(ctx, s, g, at(s, 1, 0), at(s, 0, 0), 300)).toBeNull();
    expect(stepMoves(ctx, s, g, at(s, 1, 0), at(s, 2, 0), 300)).toBeNull();
  });
});

describe('zone of control', () => {
  it('stops units entering tiles next to an enemy military unit, only at war', () => {
    const s = testState(['.....', '.....']);
    const w = addUnit(s, 'p1', 'unit_scout', at(s, 0, 0));
    addUnit(s, 'p2', 'unit_warrior', at(s, 3, 0));
    expect(stepMoves(ctx, s, w, at(s, 1, 0), at(s, 2, 0), 300)).toBe(200);
    s.wars = ['p1|p2'];
    expect(stepMoves(ctx, s, w, at(s, 1, 0), at(s, 2, 0), 300)).toBe(0);
  });
});

describe('pathfinding', () => {
  it('finds multi-turn paths with the turn of each step', () => {
    const s = testState(['.......']);
    const w = addUnit(s, 'p1', 'unit_warrior', at(s, 0, 0));
    const path = findPath(ctx, s, w, at(s, 5, 0))!;
    expect(path.map((p) => p.turn)).toEqual([0, 0, 1, 1, 2]);
  });

  it('goes around mountains and prefers cheap ground', () => {
    const s = testState(['.m.', '.m.', '...']);
    const w = addUnit(s, 'p1', 'unit_warrior', at(s, 0, 0));
    const path = findPath(ctx, s, w, at(s, 2, 0))!;
    expect(path.map((p) => p.tile)).not.toContain(at(s, 1, 0));
    expect(path[path.length - 1]!.tile).toBe(at(s, 2, 0));
  });

  it('passes through friendly units but never stops on a full tile', () => {
    const s = testState(['....']);
    const w = addUnit(s, 'p1', 'unit_warrior', at(s, 0, 0));
    addUnit(s, 'p1', 'unit_warrior', at(s, 1, 0));
    expect(findPath(ctx, s, w, at(s, 1, 0))).toBeNull();
    expect(findPath(ctx, s, w, at(s, 2, 0))!.map((p) => p.tile)).toEqual([
      at(s, 1, 0),
      at(s, 2, 0),
    ]);
    // A civilian can share the warrior's tile.
    const settler = addUnit(s, 'p1', 'unit_settler', at(s, 3, 0));
    expect(findPath(ctx, s, settler, at(s, 1, 0))).not.toBeNull();
  });

  it("won't path into other players' units or unexplored tiles", () => {
    const s = testState(['....']);
    const w = addUnit(s, 'p1', 'unit_warrior', at(s, 0, 0));
    addUnit(s, 'p2', 'unit_warrior', at(s, 2, 0));
    expect(findPath(ctx, s, w, at(s, 2, 0))).toBeNull();
    const hidden = testState(['....'], { explored: false });
    const h = addUnit(hidden, 'p1', 'unit_warrior', at(hidden, 0, 0));
    expect(findPath(ctx, hidden, h, at(hidden, 2, 0))).toBeNull();
  });
});

describe('moving units', () => {
  it('moves this turn, queues the rest, and continues automatically next turn', () => {
    let s = testState(['.......']);
    const w = addUnit(s, 'p1', 'unit_warrior', at(s, 0, 0));
    const r = act(s, { type: 'move_unit', player: 'p1', unit: w.id, to: at(s, 4, 0) });
    s = r.state;
    expect(s.units[w.id]!.tile).toBe(at(s, 2, 0));
    expect(s.units[w.id]!.moves).toBe(0);
    expect(s.units[w.id]!.orders).toEqual({ kind: 'move', target: at(s, 4, 0) });
    expect(r.events).toEqual([
      expect.objectContaining({
        type: 'unit_moved',
        path: [at(s, 0, 0), at(s, 1, 0), at(s, 2, 0)],
      }),
    ]);

    s = endTurn(s);
    expect(s.units[w.id]!.tile).toBe(at(s, 4, 0));
    expect(s.units[w.id]!.orders).toBeNull();
  });

  it('cancels queued orders when the way is blocked', () => {
    let s = testState(['.......']);
    const w = addUnit(s, 'p1', 'unit_warrior', at(s, 0, 0));
    s = act(s, { type: 'move_unit', player: 'p1', unit: w.id, to: at(s, 5, 0) }).state;
    s = structuredClone(s); // states from actions are frozen; edit a copy
    addUnit(s, 'p2', 'unit_warrior', at(s, 5, 0));
    const before = s;
    s = endTurn(s);
    expect(s.units[w.id]!.orders).toBeNull();
    expect(s.units[w.id]!.tile).toBe(before.units[w.id]!.tile);
  });

  it("rejects moving someone else's unit, or to an unreachable tile", () => {
    const s = testState(['.m.']);
    const w = addUnit(s, 'p1', 'unit_warrior', at(s, 0, 0));
    const a = applyAction(s, { type: 'move_unit', player: 'p2', unit: w.id, to: at(s, 2, 0) }, ctx);
    expect(!a.ok && a.error.code).toBe('not_your_unit');
    const b = applyAction(s, { type: 'move_unit', player: 'p1', unit: w.id, to: at(s, 1, 0) }, ctx);
    expect(!b.ok && b.error.code).toBe('no_path');
  });

  it('refreshes movement each turn', () => {
    let s = testState(['....']);
    const w = addUnit(s, 'p1', 'unit_warrior', at(s, 0, 0), 0);
    s = endTurn(s);
    expect(s.units[w.id]!.moves).toBe(200);
  });
});

describe('orders and the next-action list', () => {
  it('tracks which units still need orders', () => {
    let s = testState(['....']);
    const a = addUnit(s, 'p1', 'unit_warrior', at(s, 0, 0));
    const b = addUnit(s, 'p1', 'unit_scout', at(s, 1, 0));
    const c = addUnit(s, 'p1', 'unit_settler', at(s, 2, 0));
    expect(unitsNeedingOrders(s, 'p1')).toEqual([a.id, b.id, c.id]);
    s = act(s, { type: 'skip_unit', player: 'p1', unit: a.id }).state;
    s = act(s, { type: 'sleep_unit', player: 'p1', unit: b.id }).state;
    s = act(s, { type: 'disband_unit', player: 'p1', unit: c.id }).state;
    expect(unitsNeedingOrders(s, 'p1')).toEqual([]);
    expect(s.units[c.id]).toBeUndefined();
    s = endTurn(s);
    // Skipping lasts one turn; sleeping lasts until woken.
    expect(unitsNeedingOrders(s, 'p1')).toEqual([a.id]);
    s = act(s, { type: 'wake_unit', player: 'p1', unit: b.id }).state;
    expect(unitsNeedingOrders(s, 'p1')).toEqual([a.id, b.id]);
  });

  it('only lets military units fortify', () => {
    const s = testState(['..']);
    const settler = addUnit(s, 'p1', 'unit_settler', at(s, 0, 0));
    const r = applyAction(s, { type: 'fortify_unit', player: 'p1', unit: settler.id }, ctx);
    expect(!r.ok && r.error.code).toBe('cannot_fortify');
  });
});

describe('vision', () => {
  it('is blocked by mountains and woods, but hills see over woods', () => {
    const s = testState(['.m.', '.w.', 'h..']);
    expect(lineOfSight(ctx, s, at(s, 0, 0), at(s, 2, 0))).toBe(false); // mountain between
    expect(lineOfSight(ctx, s, at(s, 0, 0), at(s, 1, 0))).toBe(true); // adjacent always visible
  });

  it('shows more from hills and grows explored land as units move', () => {
    let s = testState(['..........'], { explored: false });
    const w = addUnit(s, 'p1', 'unit_scout', at(s, 0, 0));
    s.players.p1!.explored = encodeBits(emptyBits(10));
    const vis = visibleTiles(ctx, s, 'p1');
    expect([...vis].slice(0, 5)).toEqual([1, 1, 1, 1, 0]);
    // Explore by hand (the map starts unexplored), then move east.
    const bits = emptyBits(10);
    for (let i = 0; i < 10; i++) setBit(bits, i);
    s.players.p1!.explored = encodeBits(bits);
    s = act(s, { type: 'move_unit', player: 'p1', unit: w.id, to: at(s, 3, 0) }).state;
    expect([...visibleTiles(ctx, s, 'p1')]).toEqual([1, 1, 1, 1, 1, 1, 1, 0, 0, 0]);
  });
});

describe('determinism with units', () => {
  it('replays a game with moves to the same hash', () => {
    const setup = {
      gameId: 'r',
      settings: {
        seed: 'replay-units',
        turnLimit: null,
        map: {
          script: 'pangaea' as const,
          size: 'tiny',
          wrapX: true,
          resources: 'standard' as const,
          startBalance: 'normal' as const,
        },
      },
      players: ['p1', 'p2'].map((id) => ({ id, name: id, kind: 'human' as const })),
    };
    let s = createGame(setup, ctx);
    const actions: Parameters<typeof applyAction>[1][] = [];
    for (let turn = 0; turn < 6; turn++) {
      for (const p of s.playerOrder) {
        const scout = Object.values(s.units).find((u) => u.owner === p && u.type === 'unit_scout')!;
        // Head for the farthest explored tile it can reach.
        const explored = exploredBits(s, p);
        let target: number | undefined;
        for (let t = s.map.tiles.length - 1; t >= 0 && target === undefined; t--) {
          if (getBit(explored, t) && t !== scout.tile && findPath(ctx, s, scout, t)) target = t;
        }
        if (target !== undefined && scout.moves > 0) {
          const a = { type: 'move_unit' as const, player: p, unit: scout.id, to: target };
          s = act(s, a).state;
          actions.push(a);
        }
        const e = { type: 'end_turn' as const, player: p };
        s = act(s, e).state;
        actions.push(e);
      }
    }
    const a = runReplay({ setup, actions }, ctx);
    const b = runReplay({ setup, actions }, ctx);
    expect(a.hash).toBe(b.hash);
    expect(a.state.units).toEqual(s.units);
  });
});
