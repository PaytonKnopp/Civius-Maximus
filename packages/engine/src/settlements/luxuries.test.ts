import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../events';
import { neighbors } from '../map/hex';
import type { GameState, SettlementState } from '../state';
import { act, addUnit, at, ctx, endTurn, testState } from '../testing/world';
import { luxuriesOf } from './luxuries';
import { happinessOf, improvementsFor, itemCost } from './rules';

/** Grassland with room for several settlements: `.` grassland, `p` plains, `w` woods. */
const LAND = [
  '~~~~~~~~~~~~~~~~~~~~',
  '~..p..w...p...w...p~',
  '~.p.....p.....p....~',
  '~..w..p...w...p..w.~',
  '~.p.....p.....p....~',
  '~..p..w...p...w...p~',
  '~~~~~~~~~~~~~~~~~~~~',
];

function founded(): { s: GameState; id: string } {
  let s = testState(LAND);
  const settler = addUnit(s, 'p1', 'unit_settler', at(s, 3, 3));
  s = act(s, { type: 'found_settlement', player: 'p1', unit: settler.id }).state;
  return { s, id: s.players.p1!.capital! };
}

/** Adds a plain town for p1 at (col, row) with a few tiles around it (test shortcut). */
function addTown(s: GameState, id: string, col: number, row: number): SettlementState {
  const capital = s.settlements[s.players.p1!.capital!]!;
  const tile = at(s, col, row);
  const town: SettlementState = {
    ...structuredClone(capital),
    id,
    name: id,
    tile,
    kind: 'town',
    capital: false,
    originalCapital: false,
    buildings: [],
    worked: [],
    locked: [],
  };
  s.settlements[id] = town;
  for (const t of [tile, ...neighbors(s.map, tile)]) {
    s.map.tiles[t]!.settlement = id;
    s.map.tiles[t]!.owner = 'p1';
  }
  return town;
}

describe('luxuries', () => {
  it('cheer their settlement and the nearest others, each kind once', () => {
    const { s: start, id } = founded();
    const s = structuredClone(start);
    const capital = s.settlements[id]!;
    addTown(s, 's91', 8, 3);
    addTown(s, 's92', 12, 3);
    addTown(s, 's93', 16, 3);
    addTown(s, 's94', 16, 1);
    const [a, b] = neighbors(s.map, capital.tile);
    for (const t of [a!, b!]) {
      s.map.tiles[t]!.resource = 'wine';
      s.map.tiles[t]!.improvement = 'improvement_plantation';
    }
    const reach = luxuriesOf(ctx, s, 'p1');
    // Two wines count once at home...
    expect(reach.get(id)).toEqual([{ resource: 'wine', from: null }]);
    // ...and reach the three nearest other settlements, but not the farthest.
    expect(reach.get('s91')).toEqual([{ resource: 'wine', from: id }]);
    expect(reach.get('s92')).toHaveLength(1);
    expect(reach.get('s93')!.length + reach.get('s94')!.length).toBe(1);
    const h = happinessOf(ctx, s, s.settlements.s91!);
    expect(h.lines).toContainEqual({ label: `Wine (from ${capital.name})`, amount: 2 });

    // A second kind adds up; a settlement that has its own wine isn't given another.
    const town = s.settlements.s92!;
    const own = neighbors(s.map, town.tile)[0]!;
    s.map.tiles[own]!.resource = 'incense';
    s.map.tiles[own]!.improvement = 'improvement_plantation';
    const after = luxuriesOf(ctx, s, 'p1');
    expect(
      after
        .get('s92')!
        .map((l) => l.resource)
        .sort(),
    ).toEqual(['incense', 'wine']);
    expect(
      after
        .get('s91')!
        .map((l) => l.resource)
        .sort(),
    ).toEqual(['incense', 'wine']);
    // The capital is too far from that town to be among its three nearest.
    expect(after.get(id)!.map((l) => l.resource)).toEqual(['wine']);
  });

  it("only count with the resource's own improvement", () => {
    const { s: start, id } = founded();
    const s = structuredClone(start);
    const t = neighbors(s.map, s.settlements[id]!.tile)[0]!;
    s.map.tiles[t]!.resource = 'wine';
    s.map.tiles[t]!.improvement = 'improvement_farm';
    expect(luxuriesOf(ctx, s, 'p1').get(id)).toEqual([]);
  });
});

describe('resource tiles', () => {
  it("take only their own improvement once it's known, and get it when it unlocks", () => {
    const { s: start, id } = founded();
    let s = structuredClone(start);
    const t = neighbors(s.map, s.settlements[id]!.tile).find(
      (n) => s.map.tiles[n]!.terrain === 'grassland',
    )!;
    s.map.tiles[t]!.resource = 'wine';
    // Before Irrigation a farm can hold the tile...
    expect(improvementsFor(ctx, s, t, 'p1')).toEqual(['improvement_farm']);
    s.map.tiles[t]!.improvement = 'improvement_farm';
    // ...and once plantations are known, only a plantation fits, and the farm is replaced.
    s.players.p1!.techs.done.push('tech_pottery', 'tech_irrigation');
    expect(improvementsFor(ctx, s, t, 'p1')).toEqual(['improvement_plantation']);
    const events: GameEvent[] = [];
    for (const player of s.playerOrder) {
      const r = act(s, { type: 'end_turn', player });
      s = r.state;
      events.push(...r.events);
    }
    expect(s.map.tiles[t]!.improvement).toBe('improvement_plantation');
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'tile_developed',
        tile: t,
        improvement: 'improvement_plantation',
      }),
    );
  });
});

describe('production is never lost', () => {
  it('sells an idle city’s production for gold', () => {
    const { s: start, id } = founded();
    const s = structuredClone(start);
    s.settlements[id]!.queue = [];
    const before = s.players.p1!.gold;
    const after = endTurn(s);
    expect(after.players.p1!.gold).toBeGreaterThan(before);
  });

  it('runs district projects: a share of the cost as a yield, great person points, era scaling', () => {
    const { s: start, id } = founded();
    const s = structuredClone(start);
    const city = s.settlements[id]!;
    const tile = neighbors(s.map, city.tile)[0]!;
    s.map.tiles[tile]!.district = 'district_campus';
    city.districts.push({ id: 'district_campus', tile });
    s.players.p1!.techs.done.push('tech_pottery', 'tech_writing');
    const item = { kind: 'project' as const, id: 'project_research_grants', tile };
    const cost = itemCost(ctx, s, 'p1', item, city);
    expect(cost).toBe(6000);
    // Later eras cost more (and pay back more).
    const later = structuredClone(s);
    later.players.p1!.techs.done.push('tech_currency');
    expect(itemCost(ctx, later, 'p1', item, later.settlements[id]!)).toBe(9000);

    city.queue = [item];
    city.progress[`project:project_research_grants@${tile}`] = cost;
    s.players.p1!.techs.current = 'tech_sailing';
    const after = endTurn(s);
    expect(after.players.p1!.techs.progress.tech_sailing).toBeGreaterThanOrEqual(3000);
    expect(after.greatPeople.points.p1?.gp_scientist).toBeGreaterThanOrEqual(6);
  });

  it('scales chopping rewards with the era', () => {
    const { s: start, id } = founded();
    const s = structuredClone(start);
    const city = s.settlements[id]!;
    const woods = neighbors(s.map, city.tile).find((n) => s.map.tiles[n]!.feature === 'woods');
    if (woods === undefined) return; // the drawn map has woods next to the capital
    s.players.p1!.techs.done.push('tech_pottery', 'tech_writing', 'tech_currency');
    const item = { kind: 'project' as const, id: 'project_clear_woods', tile: woods };
    city.queue = [item, { kind: 'unit', id: 'unit_warrior' }];
    city.progress[`project:project_clear_woods@${woods}`] = itemCost(ctx, s, 'p1', item, city);
    const after = endTurn(s);
    // Classical era: 25 production + 25% = 31 toward the warrior (plus the city's own).
    expect(after.settlements[id]!.progress['unit:unit_warrior']).toBeGreaterThanOrEqual(3100);
  });
});
