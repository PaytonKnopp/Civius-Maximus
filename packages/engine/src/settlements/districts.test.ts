import { describe, expect, it } from 'vitest';
import { applyAction } from '../game';
import type { GameState } from '../state';
import { act, addUnit, at, ctx, endTurn, testState } from '../testing/world';
import { districtCost, districtLimit, placementTiles } from './districts';
import { foundSettlement } from './handlers';
import { assignCitizens, itemCost, itemProblem, settlementYields, tileYields } from './rules';
import { produce } from 'immer';

/** `.` grassland, `p` plains, `h` hills, `w` woods, `m` mountain, `d` desert, `~` coast. */
const MAP = [
  '~~~~~~~~~~~~~~',
  '~..p.h.w..p.~~',
  '~.p..m..p..h~~',
  '~..h..w...p.~~',
  '~.w..p..h..w~~',
  '~..d...m..p.~~',
  '~..dd.....h.~~',
  '~~~~~~~~~~~~~~',
];

/** p1's capital at (4, 3), next to a mountain at (5, 2). Mutable. */
function capital(): { s: GameState; id: string } {
  let s = testState(MAP);
  const settler = addUnit(s, 'p1', 'unit_settler', at(s, 4, 3));
  s = act(s, { type: 'found_settlement', player: 'p1', unit: settler.id }).state;
  s = structuredClone(s);
  s.players.p1!.gold = 100_000;
  return { s, id: s.players.p1!.capital! };
}

const err = (s: GameState, action: Parameters<typeof applyAction>[1]) => {
  const r = applyAction(s, action, ctx);
  return r.ok ? undefined : r.error.code;
};

const campus = (s: GameState) => ({
  kind: 'district' as const,
  id: 'district_campus',
  tile: at(s, 4, 2),
});

/** Queues an item and finishes it next turn. */
function build(
  s: GameState,
  id: string,
  item: ReturnType<typeof campus> | Record<string, unknown>,
) {
  const queued = act(s, {
    type: 'set_queue',
    player: 'p1',
    settlement: id,
    queue: [item as ReturnType<typeof campus>],
  }).state;
  const ready = structuredClone(queued);
  ready.settlements[id]!.progress[
    item.kind === 'project'
      ? `project:${item.id}@${item.tile}`
      : `${item.kind as string}:${item.id as string}`
  ] = 1_000_000;
  return endTurn(ready);
}

describe('districts', () => {
  it('need their tech, a fitting tile, and room under the district limit', () => {
    const { s, id } = capital();
    const city = s.settlements[id]!;
    expect(itemProblem(ctx, s, city, campus(s))).toMatchObject({ code: 'locked' });
    s.players.p1!.techs.done.push('tech_writing', 'tech_astrology', 'tech_bronze_working');
    expect(itemProblem(ctx, s, city, campus(s))).toBeUndefined();
    expect(districtLimit(ctx, city)).toBe(1);
    // An encampment can't touch the city center.
    expect(
      itemProblem(ctx, s, city, { kind: 'district', id: 'district_encampment', tile: at(s, 4, 2) }),
    ).toMatchObject({ code: 'bad_placement' });
    // One specialty district at size 1: a holy site after a campus is too many.
    const queue = [
      campus(s),
      { kind: 'district' as const, id: 'district_holy_site', tile: at(s, 5, 3) },
    ];
    expect(err(s, { type: 'set_queue', player: 'p1', settlement: id, queue })).toBe(
      'district_limit',
    );
    expect(err(s, { type: 'buy_item', player: 'p1', settlement: id, item: campus(s) })).toBe(
      'not_buyable',
    );
    expect(placementTiles(ctx, s, city, 'district', 'district_campus')).toContain(at(s, 4, 2));
  });

  it('cost more as you progress through the trees', () => {
    const { s } = capital();
    const base = districtCost(ctx, s, 'p1', 'district_campus');
    s.players.p1!.techs.done.push('tech_pottery', 'tech_mining');
    s.players.p1!.civics.done.push('civic_code_of_laws');
    expect(districtCost(ctx, s, 'p1', 'district_campus')).toBe(base + Math.trunc((base * 6) / 100));
    expect(itemCost(ctx, s, 'p1', campus(s))).toBe(districtCost(ctx, s, 'p1', 'district_campus'));
  });

  it('are built on their tile, yield by adjacency, and hold their buildings', () => {
    const start = capital();
    let s = start.s;
    const id = start.id;
    s.players.p1!.techs.done.push('tech_writing');
    expect(
      itemProblem(ctx, s, s.settlements[id]!, { kind: 'building', id: 'building_library' }),
    ).toMatchObject({ code: 'needs_district' });
    s = build(s, id, campus(s));
    expect(s.map.tiles[at(s, 4, 2)]).toMatchObject({ district: 'district_campus' });
    expect(s.settlements[id]!.districts).toEqual([{ id: 'district_campus', tile: at(s, 4, 2) }]);
    // Campus next to the mountain: +1 science.
    const lines = settlementYields(ctx, s, s.settlements[id]!).lines.science!;
    expect(lines).toContainEqual({ label: 'Campus: Mountains', amount: 100 });
    // The district tile isn't worked by citizens any more.
    expect(s.settlements[id]!.worked).not.toContain(at(s, 4, 2));
    expect(
      itemProblem(ctx, s, s.settlements[id]!, { kind: 'building', id: 'building_library' }),
    ).toBeUndefined();
  });

  it('give specialist slots for each building inside them', () => {
    const start = capital();
    let s = start.s;
    const id = start.id;
    s.players.p1!.techs.done.push('tech_writing');
    s = build(s, id, campus(s));
    s = structuredClone(s);
    s.settlements[id]!.buildings.push('building_library');
    s.settlements[id]!.focus = 'science';
    const a = assignCitizens(ctx, s, s.settlements[id]!);
    expect(a.specialists).toEqual({ district_campus: 1 });
    expect(a.worked).toEqual([]);
  });

  it('allow an aqueduct beyond the limit, next to the center and fresh water', () => {
    const start = capital();
    let s = start.s;
    const id = start.id;
    s.players.p1!.techs.done.push('tech_writing', 'tech_engineering');
    s = build(s, id, campus(s));
    const aqueduct = { kind: 'district' as const, id: 'district_aqueduct', tile: at(s, 5, 3) };
    expect(itemProblem(ctx, s, s.settlements[id]!, aqueduct)).toBeUndefined();
    s = build(s, id, aqueduct);
    expect(s.settlements[id]!.districts.map((d) => d.id)).toContain('district_aqueduct');
  });
});

describe('wonders', () => {
  it('need their terrain, give their bonus, and end everyone else’s race for them', () => {
    const start = capital();
    let s = start.s;
    const id = start.id;
    s.players.p1!.techs.done.push('tech_masonry');
    // p2 has a settlement that is also building the Pyramids.
    s = produce(s, (d) => {
      foundSettlement(d, ctx, 'p2', at(s, 10, 2), () => {});
    });
    s = structuredClone(s);
    const rival = s.players.p2!.capital!;
    s.settlements[rival]!.queue = [{ kind: 'wonder', id: 'wonder_pyramids', tile: at(s, 11, 2) }];
    s.settlements[rival]!.progress['wonder:wonder_pyramids'] = 5000;
    const grass = { kind: 'wonder' as const, id: 'wonder_pyramids', tile: at(s, 4, 2) };
    expect(itemProblem(ctx, s, s.settlements[id]!, grass)).toMatchObject({ code: 'bad_placement' });
    // Give p1 the desert tile at (3, 5), then build there.
    const desert = at(s, 3, 5);
    s.map.tiles[desert]!.settlement = id;
    s.map.tiles[desert]!.owner = 'p1';
    const gold = s.players.p2!.gold;
    s = build(s, id, { kind: 'wonder', id: 'wonder_pyramids', tile: desert });
    expect(s.map.tiles[desert]!.wonder).toBe('wonder_pyramids');
    expect(s.settlements[id]!.wonders).toEqual(['wonder_pyramids']);
    expect(settlementYields(ctx, s, s.settlements[id]!).lines.production).toContainEqual({
      label: 'Pyramids',
      amount: 200,
    });
    expect(s.settlements[rival]!.queue).toEqual([]);
    expect(s.players.p2!.gold).toBeGreaterThanOrEqual(gold + 5000);
    expect(
      itemProblem(ctx, s, s.settlements[rival]!, { kind: 'wonder', id: 'wonder_pyramids' }),
    ).toMatchObject({ code: 'wonder_built' });
  });
});

describe('projects and adjacency', () => {
  it('clears woods for a burst of production toward the next item', () => {
    const start = capital();
    let s = start.s;
    const id = start.id;
    const woods = at(s, 6, 3);
    s.map.tiles[woods]!.settlement = id;
    s.map.tiles[woods]!.owner = 'p1';
    const clear = { kind: 'project' as const, id: 'project_clear_woods', tile: woods };
    s = act(s, {
      type: 'set_queue',
      player: 'p1',
      settlement: id,
      queue: [clear, { kind: 'unit', id: 'unit_warrior' }],
    }).state;
    s = structuredClone(s);
    s.settlements[id]!.progress[`project:project_clear_woods@${woods}`] = 1500;
    s = endTurn(s);
    expect(s.map.tiles[woods]!.feature).toBeNull();
    expect(s.settlements[id]!.progress['unit:unit_warrior']).toBeGreaterThanOrEqual(2500);
  });

  it('gives farms a bonus for neighboring farms', () => {
    const s = testState(['.....', '.....', '.....']);
    for (const [c, r] of [
      [1, 1],
      [0, 1],
      [2, 1],
      [1, 0],
    ] as const)
      s.map.tiles[at(s, c, r)]!.improvement = 'improvement_farm';
    const lines = tileYields(ctx, s, at(s, 1, 1)).lines.food!;
    // Three neighboring farms: one bonus for every two.
    expect(lines).toContainEqual(
      expect.objectContaining({ label: 'Farm: Neighboring farms', amount: 100 }),
    );
  });
});

describe('town specializations', () => {
  it('start at the minimum size, cost gold to change, and send food to the nearest city', () => {
    const start = capital();
    let s = start.s;
    const capitalId = start.id;
    s = produce(s, (d) => {
      foundSettlement(d, ctx, 'p1', at(s, 10, 5), () => {});
    });
    s = structuredClone(s);
    const town = Object.values(s.settlements).find((x) => x.kind === 'town')!.id;
    const pick = (spec: string) =>
      err(s, { type: 'set_specialization', player: 'p1', settlement: town, specialization: spec });
    expect(pick('spec_farming_town')).toBe('too_small');
    s.settlements[town]!.population = 5;
    expect(pick('spec_farming_town')).toBeUndefined();
    expect(
      err(s, {
        type: 'set_specialization',
        player: 'p1',
        settlement: capitalId,
        specialization: 'spec_farming_town',
      }),
    ).toBe('not_town');
    s = act(s, {
      type: 'set_specialization',
      player: 'p1',
      settlement: town,
      specialization: 'spec_farming_town',
    }).state;
    expect(s.settlements[town]!.specialization).toBe('spec_farming_town');
    const before = s.players.p1!.gold;
    const changed = act(s, {
      type: 'set_specialization',
      player: 'p1',
      settlement: town,
      specialization: 'spec_mining_town',
    }).state;
    expect(changed.players.p1!.gold).toBe(before - 5000);

    const capitalFood = s.settlements[capitalId]!.food;
    const capitalOnly = structuredClone(s);
    capitalOnly.settlements[town]!.specialization = null;
    const without = endTurn(capitalOnly).settlements[capitalId]!.food;
    const withSend = endTurn(s).settlements[capitalId]!.food;
    expect(withSend).toBeGreaterThan(without);
    expect(capitalFood).toBeLessThanOrEqual(without);
  });
});
