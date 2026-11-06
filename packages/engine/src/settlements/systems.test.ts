import { describe, expect, it } from 'vitest';
import { settlementStrength } from '../combat/strength';
import { turnOrder } from '../context';
import { appealOf, continentOf } from '../map/appeal';
import { neighbors } from '../map/hex';
import { civsWith, nodeCost, nodeCostFor } from '../progress/rules';
import type { GameState } from '../state';
import { act, addUnit, at, ctx, endTurn, kitCtx, testState } from '../testing/world';
import { routeYields } from '../trade/rules';
import { scoreOf } from '../victory';
import { foundSettlement } from './handlers';
import { happinessOf, improvementsFor, settlementYields, unitUpkeep, upkeepOf } from './rules';
import { produce } from 'immer';

/** `.` grassland, `w` woods, `m` mountain, `~` coast. Two landmasses split by the sea. */
const MAP = [
  '~~~~~~~~~~~~~~~~~~',
  '~..w.m..~~..w....~',
  '~.w....w~~.......~',
  '~..m.w..~~..w..m.~',
  '~...w...~~.......~',
  '~~~~~~~~~~~~~~~~~~',
];

function capital(): { s: GameState; id: string } {
  let s = testState(MAP);
  const settler = addUnit(s, 'p1', 'unit_settler', at(s, 4, 2));
  s = structuredClone(act(s, { type: 'found_settlement', player: 'p1', unit: settler.id }).state);
  return { s, id: s.players.p1!.capital! };
}

describe('appeal', () => {
  it('adds up the neighbors: mountains, woods and the coast are lovely, mines are not', () => {
    const { s } = capital();
    const tile = at(s, 4, 1);
    const before = appealOf(ctx, s, tile);
    expect(before).toBeGreaterThan(0);
    const n = neighbors(s.map, tile).find((t) => s.map.tiles[t]!.elevation === 'flat')!;
    s.map.tiles[n]!.improvement = 'improvement_mine';
    expect(appealOf(ctx, s, tile)).toBe(before - 1);
  });

  it('opens national parks on breathtaking land, paid by appeal', () => {
    const { s } = capital();
    const t = at(s, 6, 2);
    s.map.tiles[t]!.owner = 'p1';
    // Mountains, woods and the coast around: give it more until it's breathtaking.
    for (const n of neighbors(s.map, t))
      if (s.map.tiles[n]!.terrain === 'grassland' && s.map.tiles[n]!.elevation === 'flat')
        s.map.tiles[n]!.feature = 'woods';
    expect(appealOf(ctx, s, t)).toBeGreaterThanOrEqual(4);
    expect(improvementsFor(ctx, s, t, 'p1')).not.toContain('improvement_national_park');
    s.players.p1!.civics.done.push('civic_conservation');
    expect(improvementsFor(ctx, s, t, 'p1')).toContain('improvement_national_park');
  });
});

describe('continents', () => {
  it('number each landmass, and home-continent abilities read them', () => {
    const { s, id } = capital();
    expect(continentOf(ctx, s.map, at(s, 1, 1))).toBe(continentOf(ctx, s.map, at(s, 6, 4)));
    expect(continentOf(ctx, s.map, at(s, 12, 2))).not.toBe(continentOf(ctx, s.map, at(s, 1, 1)));
    expect(continentOf(ctx, s.map, at(s, 8, 2))).toBeNull();
    // Lincoln: +2 happiness on the home continent (abilities live in the kit content).
    const usa = produce(s, (d) => {
      d.players.p1!.leader = 'leader_lincoln';
      d.players.p1!.civ = 'civ_america';
      foundSettlement(d, kitCtx, 'p1', at(s, 13, 2), () => {});
    });
    const far = Object.values(usa.settlements).find((x) => x.tile === at(s, 13, 2))!;
    const home = usa.settlements[id]!;
    const lincoln = (x: typeof home) =>
      happinessOf(kitCtx, usa, x).lines.some(
        (l) => /House United|Lincoln/i.test(l.label) && l.amount === 2,
      );
    expect(lincoln(home)).toBe(true);
    expect(lincoln(far)).toBe(false);
  });
});

describe('upkeep, era starts and towns', () => {
  it('units cost at least their era’s upkeep', () => {
    expect(upkeepOf(ctx, 'unit_warrior')).toBe(1);
    expect(upkeepOf(ctx, 'unit_musketman')).toBe(2);
    expect(upkeepOf(ctx, 'unit_infantry')).toBe(3);
    expect(upkeepOf(ctx, 'unit_settler')).toBe(0);
    const { s } = capital();
    for (let i = 0; i < 4; i++) addUnit(s, 'p1', 'unit_tank', at(s, 1 + i, 4));
    // Four Modern tanks at 3 gold each, less the 3 free.
    expect(unitUpkeep(ctx, s, 'p1')).toBe((4 * 3 - 3) * 100);
  });

  it('later-era starts found bigger settlements with the era’s basics', () => {
    let s = testState(MAP);
    s.settings.startEra = 'era_medieval';
    const settler = addUnit(s, 'p1', 'unit_settler', at(s, 4, 2));
    s = act(s, { type: 'found_settlement', player: 'p1', unit: settler.id }).state;
    const c = s.settlements[s.players.p1!.capital!]!;
    expect(c.population).toBe(2);
    expect(c.pendingDevelop).toBe(1);
    expect(c.buildings).toEqual(expect.arrayContaining(['building_monument', 'building_granary']));
  });

  it('fort towns defend themselves better', () => {
    const { s, id } = capital();
    const c = s.settlements[id]!;
    const before = settlementStrength(ctx, s, c).total;
    c.specialization = 'spec_fort_town';
    expect(settlementStrength(ctx, s, c).total).toBe(before + 6);
  });
});

describe('trade, score and catch-up research', () => {
  it('routes grow with the destination’s districts and the era', () => {
    const { s, id } = capital();
    const other = produce(s, (d) => {
      foundSettlement(d, ctx, 'p1', at(s, 13, 2), () => {});
      foundSettlement(d, ctx, 'p2', at(s, 13, 4), () => {});
    });
    const [home, mine, theirs] = [id, ...Object.keys(other.settlements).filter((x) => x !== id)];
    const domestic = routeYields(
      ctx,
      other,
      'p1',
      other.settlements[home]!,
      other.settlements[mine!]!,
    );
    const withDistricts = structuredClone(other);
    withDistricts.settlements[mine!]!.districts.push(
      { id: 'district_campus', tile: 0 },
      { id: 'district_harbor', tile: 1 },
    );
    const more = routeYields(
      ctx,
      withDistricts,
      'p1',
      withDistricts.settlements[home]!,
      withDistricts.settlements[mine!]!,
    );
    expect(more.origin.food).toBe((domestic.origin.food ?? 0) + 100);
    // International: +1 gold per era past the first.
    const intl = routeYields(
      ctx,
      other,
      'p1',
      other.settlements[home]!,
      other.settlements[theirs!]!,
    );
    const later = structuredClone(other);
    later.players.p1!.techs.done.push('tech_pottery', 'tech_writing', 'tech_currency');
    const intlLater = routeYields(
      ctx,
      later,
      'p1',
      later.settlements[home]!,
      later.settlements[theirs!]!,
    );
    expect(intlLater.origin.gold).toBe((intl.origin.gold ?? 0) + 100);
  });

  it('score counts great people, religion and future techs', () => {
    const { s } = capital();
    const base = scoreOf(ctx, s, 'p1').total;
    s.players.p1!.greatPeople = ['gp_euclid', 'gp_homer'];
    s.players.p1!.techs.repeats = { tech_future_tech: 2 };
    const after = scoreOf(ctx, s, 'p1');
    expect(after.total).toBe(base + 2 * 5 + 2 * 5);
    expect(after.lines.map((l) => l.label)).toContain('Future techs and civics');
  });

  it('techs cost less for each known civ that has them, up to a cap', () => {
    const { s } = capital();
    const p2 = produce(s, (d) => {
      foundSettlement(d, ctx, 'p2', at(s, 13, 2), () => {});
      d.players.p2!.techs.done.push('tech_pottery');
    });
    // p1 hasn't seen p2's land yet.
    const unseen = produce(p2, (d) => {
      d.players.p1!.explored = '';
    });
    expect(civsWith(ctx, unseen, 'p1', 'tech', 'tech_pottery')).toBe(0);
    expect(nodeCostFor(ctx, unseen, 'p1', 'tech', 'tech_pottery')).toBe(
      nodeCost(ctx, s, 'tech', 'tech_pottery'),
    );
    // testState explores everything by default: p1 knows p2.
    expect(civsWith(ctx, p2, 'p1', 'tech', 'tech_pottery')).toBe(1);
    const full = nodeCost(ctx, s, 'tech', 'tech_pottery');
    expect(nodeCostFor(ctx, p2, 'p1', 'tech', 'tech_pottery')).toBe(full - full / 20);
    expect(settlementYields(ctx, p2, p2.settlements[p2.players.p1!.capital!]!)).toBeDefined();
    void endTurn;
  });
});

describe('turn order', () => {
  it('rotates by one seat each turn, so no seat always goes first', () => {
    const order = ['p1', 'p2', 'p3'];
    expect(turnOrder({ playerOrder: order, turn: 1 })).toEqual(['p1', 'p2', 'p3']);
    expect(turnOrder({ playerOrder: order, turn: 2 })).toEqual(['p2', 'p3', 'p1']);
    expect(turnOrder({ playerOrder: order, turn: 4 })).toEqual(['p1', 'p2', 'p3']);
    expect(turnOrder({ playerOrder: [], turn: 7 })).toEqual([]);
  });
});
