import { describe, expect, it } from 'vitest';
import { strikeTargets } from '../combat/strength';
import { newAgeState } from '../eras/ages';
import { distance, neighbors } from '../map/hex';
import { availableNodes, availablePolicies } from '../progress/rules';
import { endTurn as endAll } from '../testing/world';
import type { GameState, SettlementState } from '../state';
import { act, addUnit, at, ctx, testState } from '../testing/world';
import { districtYields } from './districts';
import { happinessOf, itemCost, settlementYields } from './rules';

/** `.` grassland, `p` plains, `h` hills, `w` woods, `m` mountain, `~` coast. */
const MAP = [
  '~~~~~~~~~~~~~~~~~~',
  '~..p.h.w..p.....p~',
  '~.p..m..p..h..p..~',
  '~..h..w...p......~',
  '~.w..p..h..w..p..~',
  '~..p...m..p......~',
  '~~~~~~~~~~~~~~~~~~',
];

/** p1's capital at (4, 3), next to a mountain at (5, 2). Mutable. */
function capital(): { s: GameState; id: string } {
  let s = testState(MAP);
  const settler = addUnit(s, 'p1', 'unit_settler', at(s, 4, 3));
  s = act(s, { type: 'found_settlement', player: 'p1', unit: settler.id }).state;
  s = structuredClone(s);
  return { s, id: s.players.p1!.capital! };
}

/** Puts a district on a tile of a settlement (test shortcut). */
function place(s: GameState, city: SettlementState, id: string, tile: number) {
  s.map.tiles[tile]!.district = id;
  s.map.tiles[tile]!.settlement = city.id;
  s.map.tiles[tile]!.owner = city.owner;
  city.districts.push({ id, tile });
}

describe('great people', () => {
  it('builders put a share of the current wonder in, envoys come at once', () => {
    const { s, id } = capital();
    const city = s.settlements[id]!;
    const tile = neighbors(s.map, city.tile).find((t) => s.map.tiles[t]!.elevation === 'flat')!;
    s.players.p1!.techs.done.push('tech_mining', 'tech_masonry', 'tech_pottery', 'tech_irrigation');
    const wonder = { kind: 'wonder' as const, id: 'wonder_hanging_gardens', tile };
    city.queue = [wonder];
    const person = addUnit(s, 'p1', 'unit_great_person', city.tile);
    s.units[person.id]!.person = 'gp_brunelleschi';
    const after = act(s, { type: 'activate_great_person', player: 'p1', unit: person.id }).state;
    const cost = itemCost(ctx, s, 'p1', wonder, city);
    expect(after.settlements[id]!.progress[`wonder:wonder_hanging_gardens`]).toBe(cost / 2);

    const s2 = structuredClone(after);
    const merchant = addUnit(s2, 'p1', 'unit_great_person', city.tile);
    s2.units[merchant.id]!.person = 'gp_medici';
    const envoys = s2.players.p1!.envoys;
    const done = act(s2, { type: 'activate_great_person', player: 'p1', unit: merchant.id }).state;
    expect(done.players.p1!.envoys).toBe(envoys + 2);
  });
});

describe('repeatable nodes', () => {
  it('Future Tech can be researched again and again', () => {
    const { s } = capital();
    const all = ctx.content.ids.tech.filter((t) => t !== 'tech_future_tech');
    s.players.p1!.techs.done = [...all];
    expect(availableNodes(ctx, s.players.p1!, 'tech')).toEqual(['tech_future_tech']);
    let next = act(s, { type: 'set_research', player: 'p1', tech: 'tech_future_tech' }).state;
    next = structuredClone(next);
    next.players.p1!.techs.progress.tech_future_tech = 1_000_000;
    next = endAll(next);
    expect(next.players.p1!.techs.done).toContain('tech_future_tech');
    // Still open, and choosing it again works; finishing it again counts a repeat.
    expect(availableNodes(ctx, next.players.p1!, 'tech')).toEqual(['tech_future_tech']);
    next = structuredClone(
      act(next, { type: 'set_research', player: 'p1', tech: 'tech_future_tech' }).state,
    );
    next.players.p1!.techs.progress.tech_future_tech = 1_000_000;
    next = endAll(next);
    expect(next.players.p1!.techs.repeats).toEqual({ tech_future_tech: 1 });
  });
});

describe('districts and city planning', () => {
  it('adjacency cards double a district adjacency; each building adds a third of it', () => {
    const { s, id } = capital();
    const city = s.settlements[id]!;
    const tile = at(s, 4, 2); // next to the mountain at (5, 2)
    place(s, city, 'district_campus', tile);
    const base = districtYields(ctx, s, tile, 'district_campus').total.science ?? 0;
    expect(base).toBeGreaterThanOrEqual(100);
    // A policy that doubles Campus adjacency.
    s.players.p1!.civics.done.push(
      'civic_code_of_laws',
      'civic_political_philosophy',
      'civic_recorded_history',
    );
    s.players.p1!.policies.economic = ['policy_scribes_stipend'];
    const doubled = districtYields(ctx, s, tile, 'district_campus').total.science ?? 0;
    expect(doubled).toBe(base * 2);
    // Buildings inside add a third of the (whole-point) adjacency each.
    s.players.p1!.policies.economic = [];
    city.buildings.push('building_library');
    const withLibrary = districtYields(ctx, s, tile, 'district_campus');
    const share = Math.floor(base / 3 / 100) * 100;
    expect(withLibrary.total.science).toBe(base + share);
  });

  it('Holy Sites love natural wonders', () => {
    const { s, id } = capital();
    const city = s.settlements[id]!;
    const tile = at(s, 3, 3);
    const nw = neighbors(s.map, tile).find(
      (t) => t !== city.tile && s.map.tiles[t]!.elevation === 'flat',
    )!;
    s.map.tiles[nw]!.feature = 'nw_yosemite';
    place(s, city, 'district_holy_site', tile);
    const y = districtYields(ctx, s, tile, 'district_holy_site');
    expect(y.lines.faith).toContainEqual({ label: 'Holy Site: Natural wonders', amount: 200 });
  });

  it('regional buildings reach other settlements nearby, once, and not those with their own', () => {
    const { s, id } = capital();
    const settler = addUnit(s, 'p1', 'unit_settler', at(s, 9, 3));
    const two = structuredClone(
      act(s, { type: 'found_settlement', player: 'p1', unit: settler.id }).state,
    );
    const other = Object.keys(two.settlements).find((x) => x !== id)!;
    const before = settlementYields(ctx, two, two.settlements[other]!).total.production ?? 0;
    two.settlements[id]!.buildings.push('building_factory');
    const after = settlementYields(ctx, two, two.settlements[other]!);
    expect((after.total.production ?? 0) - before).toBe(300);
    expect(after.lines.production!.some((l) => /Factory in /.test(l.label))).toBe(true);
    // With its own Factory it gets its own, not the neighbor's.
    two.settlements[other]!.buildings.push('building_factory');
    const own = settlementYields(ctx, two, two.settlements[other]!);
    expect(own.lines.production!.some((l) => /Factory in /.test(l.label))).toBe(false);
  });

  it('the Encampment lets its settlement strike from the district too', () => {
    const { s, id } = capital();
    const city = s.settlements[id]!;
    const camp = at(s, 2, 3);
    place(s, city, 'district_encampment', camp);
    s.wars = ['p1|p2'];
    // An enemy three tiles from the center but two from the Encampment (a scout of ours sees it).
    const far = [...Array(s.map.tiles.length).keys()].find(
      (t) =>
        distance(s.map, t, city.tile) === 3 &&
        distance(s.map, t, camp) <= 2 &&
        s.map.tiles[t]!.terrain !== 'coast',
    )!;
    const enemy = addUnit(s, 'p2', 'unit_warrior', far);
    addUnit(
      s,
      'p1',
      'unit_scout',
      neighbors(s.map, far).find((t) => t !== camp && s.map.tiles[t]!.terrain !== 'coast')!,
    );
    expect(strikeTargets(ctx, s, city)).toContain(far);
    city.districts = [];
    s.map.tiles[camp]!.district = null;
    expect(strikeTargets(ctx, s, city)).not.toContain(enemy.tile);
  });
});

describe('policy cards', () => {
  it('dark-age cards are there only in a dark age, and obsolete cards leave their slots', () => {
    const { s } = capital();
    const p = s.players.p1!;
    p.civics.done.push('civic_code_of_laws');
    expect(availablePolicies(ctx, p)).not.toContain('policy_martial_law');
    p.ages = { ...newAgeState(ctx, p), age: 'age_dark' };
    expect(availablePolicies(ctx, p)).toContain('policy_martial_law');
    // Militia Drills goes out of date with Nationalism and comes out of its slot.
    p.policies.military = ['policy_militia_drills'];
    p.civics.done.push('civic_nationalism');
    const next = endAll(s);
    expect(next.players.p1!.policies.military).toEqual([]);
    expect(happinessOf(ctx, next, next.settlements[next.players.p1!.capital!]!)).toBeDefined();
  });
});
