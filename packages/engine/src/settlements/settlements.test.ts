import { describe, expect, it } from 'vitest';
import { getBit } from '../bitset';
import type { GameEvent } from '../events';
import { applyAction } from '../game';
import { powFloor } from '../fixed';
import { distance, neighbors } from '../map/hex';
import type { GameState } from '../state';
import { act, addUnit, at, ctx, endTurn, testState } from '../testing/world';
import { exploredBits } from '../units/vision';
import {
  availableItems,
  borderThreshold,
  developCandidates,
  growthThreshold,
  happinessOf,
  improvementsFor,
  purchasableTiles,
  purchaseCost,
  settlementYields,
  tilePurchaseCost,
} from './rules';

/** A small island: `.` grassland, `p` plains, `h` hills, `w` woods, `m` mountain, `~` coast. */
const ISLAND = [
  '~~~~~~~~~~~~~~',
  '~..p.h.w..p.~~',
  '~.p..m..p..h~~',
  '~..h..w...p.~~',
  '~.w..p..h..w~~',
  '~..p...m..p.~~',
  '~...w.....h.~~',
  '~~~~~~~~~~~~~~',
];

/** A state with a settler for p1 at (4, 3), founded there. Returns the state and the id. */
function founded(): { s: GameState; id: string } {
  let s = testState(ISLAND);
  const settler = addUnit(s, 'p1', 'unit_settler', at(s, 4, 3));
  s = act(s, { type: 'found_settlement', player: 'p1', unit: settler.id }).state;
  return { s, id: s.players.p1!.capital! };
}

const err = (s: GameState, action: Parameters<typeof applyAction>[1]) => {
  const r = applyAction(s, action, ctx);
  return r.ok ? undefined : r.error.code;
};

const gold = (s: GameState, player = 'p1') => s.players[player]!.gold;

describe('powFloor', () => {
  it('computes whole powers with fractional exponents exactly', () => {
    expect(powFloor(10, 1.5)).toBe(31);
    expect(powFloor(30, 1.3)).toBe(83);
    expect(powFloor(4, 0.5)).toBe(2);
    expect(powFloor(100, 2)).toBe(10000);
    expect(powFloor(0, 1.5)).toBe(0);
    expect(powFloor(1, 1.3)).toBe(1);
    expect(powFloor(7, 0)).toBe(1);
  });
});

describe('founding', () => {
  it('turns a settler into a capital city with a palace and the tiles around it', () => {
    const { s, id } = founded();
    const city = s.settlements[id]!;
    expect(city).toMatchObject({
      name: 'Roma',
      kind: 'city',
      capital: true,
      population: 1,
      buildings: ['building_palace'],
    });
    expect(Object.values(s.units).some((u) => u.type === 'unit_settler')).toBe(false);
    expect(s.map.tiles[city.tile]!.settlement).toBe(id);
    for (const n of neighbors(s.map, city.tile)) expect(s.map.tiles[n]!.owner).toBe('p1');
    expect(city.worked).toHaveLength(1);
    // Territory is visible: one tile beyond the border is explored.
    const far = at(s, 7, 3);
    expect(getBit(exploredBits(s, 'p1'), far)).toBe(true);
  });

  it('makes later settlements towns, with the next name on the list', () => {
    let s = structuredClone(founded().s);
    const site = s.map.tiles.findIndex(
      (t, i) =>
        t.terrain !== 'coast' && t.elevation !== 'mountain' && distance(s.map, i, at(s, 4, 3)) >= 5,
    );
    const settler = addUnit(s, 'p1', 'unit_settler', site);
    s = act(s, { type: 'found_settlement', player: 'p1', unit: settler.id }).state;
    const town = Object.values(s.settlements).find((x) => !x.capital)!;
    expect(town).toMatchObject({ name: 'Antium', kind: 'town', buildings: [] });
  });

  it('refuses water, mountains, crowding, foreign land, tired settlers and non-settlers', () => {
    const { s } = founded();
    const tryAt = (
      col: number,
      row: number,
      type = 'unit_settler',
      moves?: number,
      owner = 'p1',
    ) => {
      const copy = structuredClone(s);
      const u = addUnit(copy, owner, type, at(copy, col, row), moves);
      return err(copy, { type: 'found_settlement', player: owner, unit: u.id });
    };
    expect(tryAt(5, 2)).toBe('bad_site'); // mountain
    expect(tryAt(7, 3)).toBe('too_close');
    expect(tryAt(5, 3, 'unit_settler', undefined, 'p2')).toBe('foreign_territory');
    expect(tryAt(10, 5, 'unit_settler', 0)).toBe('no_moves');
    expect(tryAt(10, 5, 'unit_warrior')).toBe('cannot_found');
    expect(tryAt(10, 5)).toBeUndefined();
  });
});

describe('yields and growth', () => {
  it('gives the center its minimum and explains every yield', () => {
    const { s, id } = founded();
    const y = settlementYields(ctx, s, s.settlements[id]!);
    expect(y.lines.production!.map((l) => l.label)).toContain('Palace');
    expect(y.lines.food![0]).toMatchObject({ label: 'Settlement center' });
    expect(y.total.food! - y.surplus).toBe(200); // one citizen eats 2 food
    expect(happinessOf(ctx, s, s.settlements[id]!)).toMatchObject({ balance: 4, mood: 'content' });
  });

  it('grows, then lets the player develop a tile, which claims it if unowned', () => {
    const start = founded();
    const id = start.id;
    let s = start.s;
    const need = growthThreshold(ctx, s, 1);
    expect(need).toBe(1500);
    let turns = 0;
    while (s.settlements[id]!.population === 1 && turns < 30) {
      s = endTurn(s);
      turns++;
    }
    const city = s.settlements[id]!;
    expect(city.population).toBe(2);
    expect(city.pendingDevelop).toBe(1);
    expect(city.worked).toHaveLength(2);

    const candidates = developCandidates(ctx, s, city);
    const unowned = candidates.find((t) => s.map.tiles[t]!.owner === null)!;
    expect(unowned).toBeDefined();
    const improvement = improvementsFor(ctx, s, unowned)[0]!;
    expect(
      err(s, {
        type: 'develop_tile',
        player: 'p1',
        settlement: id,
        tile: at(s, 5, 2),
        improvement,
      }),
    ).toBe('bad_tile'); // mountains can't be developed
    s = act(s, {
      type: 'develop_tile',
      player: 'p1',
      settlement: id,
      tile: unowned,
      improvement,
    }).state;
    expect(s.map.tiles[unowned]).toMatchObject({ improvement, settlement: id, owner: 'p1' });
    expect(s.settlements[id]!.pendingDevelop).toBe(0);
    expect(
      err(s, { type: 'develop_tile', player: 'p1', settlement: id, tile: unowned, improvement }),
    ).toBe('no_growth');
  });

  it('develops automatically if the turn ends with a choice pending', () => {
    const start = founded();
    const id = start.id;
    let s = start.s;
    s = structuredClone(s);
    s.settlements[id]!.pendingDevelop = 1;
    s = endTurn(s);
    expect(s.settlements[id]!.pendingDevelop).toBe(0);
    expect(s.map.tiles.some((t) => t.improvement !== null)).toBe(true);
  });

  it('proposes improvements that fit the tile', () => {
    const s = testState(['.hwm~']);
    s.map.tiles[0]!.resource = 'wheat';
    expect(improvementsFor(ctx, s, 0)[0]).toBe('improvement_farm');
    expect(improvementsFor(ctx, s, 1)).toEqual(['improvement_mine']);
    expect(improvementsFor(ctx, s, 2)).toEqual(['improvement_woodcutter']);
    expect(improvementsFor(ctx, s, 3)).toEqual([]);
    expect(improvementsFor(ctx, s, 4)).toEqual(['improvement_fishing_boats']);
  });

  it('starves when citizens eat more than the land gives', () => {
    const start = founded();
    const id = start.id;
    let s = start.s;
    s = structuredClone(s);
    s.settlements[id]!.population = 8;
    s.settlements[id]!.food = 0;
    s = endTurn(s);
    expect(s.settlements[id]!.population).toBe(7);
  });

  it('grows borders with culture, one tile at a time', () => {
    const start = founded();
    const id = start.id;
    let s = start.s;
    expect(borderThreshold(ctx, s, 0)).toBe(1000);
    const owned = () => s.map.tiles.filter((t) => t.settlement === id).length;
    const before = owned();
    // The palace makes 3 culture a turn: the first tile comes on turn 4.
    for (let i = 0; i < 4; i++) s = endTurn(s);
    expect(owned()).toBe(before + 1);
    expect(s.settlements[id]!.tilesAcquired).toBe(1);
  });
});

describe('production', () => {
  it('builds the queue in order, carrying extra production over', () => {
    const start = founded();
    const id = start.id;
    let s = start.s;
    s = act(s, {
      type: 'set_queue',
      player: 'p1',
      settlement: id,
      queue: [
        { kind: 'unit', id: 'unit_warrior' },
        { kind: 'building', id: 'building_monument' },
      ],
    }).state;
    const units = () => Object.values(s.units).filter((u) => u.type === 'unit_warrior').length;
    let turns = 0;
    while (units() === 0 && turns < 40) {
      s = endTurn(s);
      turns++;
    }
    expect(units()).toBe(1);
    const city = s.settlements[id]!;
    expect(city.queue).toEqual([{ kind: 'building', id: 'building_monument' }]);
    expect(city.progress['building:building_monument']).toBeGreaterThanOrEqual(0);
    while (!s.settlements[id]!.buildings.includes('building_monument') && turns < 80) {
      s = endTurn(s);
      turns++;
    }
    expect(s.settlements[id]!.buildings).toContain('building_monument');
    expect(s.settlements[id]!.queue).toEqual([]);
  });

  it('reports finished items in events that outlive the turn', () => {
    const start = founded();
    let s = act(start.s, {
      type: 'set_queue',
      player: 'p1',
      settlement: start.id,
      queue: [{ kind: 'unit', id: 'unit_warrior' }],
    }).state;
    const events: GameEvent[] = [];
    for (let i = 0; i < 40 && !events.some((e) => e.type === 'item_completed'); i++) {
      for (const p of s.playerOrder) {
        const r = act(s, { type: 'end_turn', player: p });
        s = r.state;
        events.push(...r.events);
      }
    }
    // Throws "proxy has been revoked" if an event kept a reference into the turn's draft.
    expect(JSON.parse(JSON.stringify(events))).toContainEqual(
      expect.objectContaining({
        type: 'item_completed',
        item: { kind: 'unit', id: 'unit_warrior' },
      }),
    );
  });

  it("won't queue a building twice, one already built, or anything in a town", () => {
    const { s, id } = founded();
    const monument = { kind: 'building' as const, id: 'building_monument' };
    expect(
      err(s, { type: 'set_queue', player: 'p1', settlement: id, queue: [monument, monument] }),
    ).toBe('duplicate');
    expect(
      err(s, {
        type: 'set_queue',
        player: 'p1',
        settlement: id,
        queue: [{ kind: 'building', id: 'building_palace' }],
      }),
    ).toBe('not_buildable');
    const town = structuredClone(s);
    town.settlements[id]!.kind = 'town';
    expect(err(town, { type: 'set_queue', player: 'p1', settlement: id, queue: [monument] })).toBe(
      'town',
    );
    expect(availableItems(ctx, s, s.settlements[id]!).map((i) => i.id)).toContain('unit_warrior');
  });

  it('needs a citizen to spare before a settler can leave', () => {
    const { s, id } = founded();
    const settler = { kind: 'unit' as const, id: 'unit_settler' };
    const rich = structuredClone(s);
    rich.players.p1!.gold = purchaseCost(ctx, rich, 'p1', settler);
    expect(err(rich, { type: 'buy_item', player: 'p1', settlement: id, item: settler })).toBe(
      'needs_population',
    );
    rich.settlements[id]!.population = 2;
    const after = act(rich, {
      type: 'buy_item',
      player: 'p1',
      settlement: id,
      item: settler,
    }).state;
    expect(after.settlements[id]!.population).toBe(1);
    expect(gold(after)).toBe(0);
  });

  it('buys with gold, if there is enough', () => {
    const { s, id } = founded();
    const monument = { kind: 'building' as const, id: 'building_monument' };
    expect(err(s, { type: 'buy_item', player: 'p1', settlement: id, item: monument })).toBe(
      'not_enough_gold',
    );
    const rich = structuredClone(s);
    rich.players.p1!.gold = 100_000;
    const after = act(rich, {
      type: 'buy_item',
      player: 'p1',
      settlement: id,
      item: monument,
    }).state;
    expect(after.settlements[id]!.buildings).toContain('building_monument');
    expect(gold(after)).toBe(100_000 - purchaseCost(ctx, rich, 'p1', monument));
  });

  it('turns a town’s production into gold, and towns can be upgraded', () => {
    const start = founded();
    const id = start.id;
    let s = start.s;
    s = structuredClone(s);
    s.settlements[id]!.kind = 'town';
    const before = gold(s);
    const y = settlementYields(ctx, s, s.settlements[id]!);
    s = endTurn(s);
    expect(gold(s) - before).toBe((y.total.gold ?? 0) + (y.total.production ?? 0));
    expect(err(s, { type: 'upgrade_town', player: 'p1', settlement: id })).toBe('not_enough_gold');
    s = structuredClone(s);
    s.players.p1!.gold = 100_000;
    s = act(s, { type: 'upgrade_town', player: 'p1', settlement: id }).state;
    expect(s.settlements[id]!.kind).toBe('city');
  });
});

describe('citizens, tiles and happiness', () => {
  it('keeps locked tiles worked and follows the focus', () => {
    const start = founded();
    const id = start.id;
    let s = start.s;
    const city = s.settlements[id]!;
    const other = neighbors(s.map, city.tile).find((t) => !city.worked.includes(t))!;
    s = act(s, {
      type: 'lock_tile',
      player: 'p1',
      settlement: id,
      tile: other,
      locked: true,
    }).state;
    expect(s.settlements[id]!.worked).toEqual([other]);
    s = act(s, {
      type: 'lock_tile',
      player: 'p1',
      settlement: id,
      tile: other,
      locked: false,
    }).state;
    expect(s.settlements[id]!.locked).toEqual([]);
    s = act(s, { type: 'set_focus', player: 'p1', settlement: id, focus: 'production' }).state;
    expect(s.settlements[id]!.focus).toBe('production');
  });

  it('buys tiles next to the border', () => {
    const { s, id } = founded();
    const city = s.settlements[id]!;
    const tile = purchasableTiles(ctx, s, city)[0]!;
    const rich = structuredClone(s);
    rich.players.p1!.gold = 100_000;
    const after = act(rich, { type: 'buy_tile', player: 'p1', settlement: id, tile }).state;
    expect(after.map.tiles[tile]!.settlement).toBe(id);
    expect(gold(after)).toBe(100_000 - tilePurchaseCost(ctx, s, city, tile));
    expect(err(s, { type: 'buy_tile', player: 'p1', settlement: id, tile: city.tile })).toBe(
      'bad_tile',
    );
  });

  it('counts improved luxuries, crowding, and the settlement limit', () => {
    const { s, id } = founded();
    const copy = structuredClone(s);
    const city = copy.settlements[id]!;
    const lux = neighbors(copy.map, city.tile)[0]!;
    copy.map.tiles[lux]!.resource = 'wine';
    copy.map.tiles[lux]!.improvement = 'improvement_plantation';
    city.population = 6;
    const h = happinessOf(ctx, copy, city);
    expect(h.lines.map((l) => l.label)).toEqual(['Base', 'Palace', 'Wine', 'Citizens']);
    expect(h.balance).toBe(2 + 2 + 2 - 3);

    // Five settlements against a limit of four: -2 in each.
    for (let i = 0; i < 4; i++) {
      copy.settlements[`s9${i}`] = { ...structuredClone(city), id: `s9${i}`, capital: false };
    }
    expect(happinessOf(ctx, copy, city).balance).toBe(3 - 2);
  });
});
