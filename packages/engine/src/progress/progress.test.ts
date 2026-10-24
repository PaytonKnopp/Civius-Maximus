import { describe, expect, it } from 'vitest';
import { applyAction } from '../game';
import { tileIndex } from '../map/hex';
import {
  improvementsFor,
  itemProblem,
  productionToward,
  settlementLimit,
  settlementYields,
  unitUpkeep,
} from '../settlements/rules';
import type { GameState } from '../state';
import { act, addUnit, at, ctx, endTurn, testState } from '../testing/world';
import {
  availableNodes,
  celebrationThreshold,
  pathTo,
  policyChangeCost,
  treeColumns,
  unlocksOf,
} from './rules';
import { policySlots } from './sources';

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

/** p1 with a capital at (4, 3); a fresh, mutable copy. */
function capital(): { s: GameState; id: string } {
  let s = testState(ISLAND);
  const settler = addUnit(s, 'p1', 'unit_settler', at(s, 4, 3));
  s = act(s, { type: 'found_settlement', player: 'p1', unit: settler.id }).state;
  return { s: structuredClone(s), id: s.players.p1!.capital! };
}

const err = (s: GameState, action: Parameters<typeof applyAction>[1]) => {
  const r = applyAction(s, action, ctx);
  return r.ok ? undefined : r.error.code;
};

const empty = {
  military: [] as string[],
  economic: [] as string[],
  diplomatic: [] as string[],
  wildcard: [] as string[],
};

describe('the trees', () => {
  it('lays out columns from prerequisites and finds what each node unlocks', () => {
    const cols = treeColumns(ctx, 'tech');
    expect(cols.tech_pottery).toBe(0);
    expect(cols.tech_writing).toBe(1);
    expect(cols.tech_currency).toBe(2);
    expect(unlocksOf(ctx, 'tech', 'tech_writing').map((u) => u.id)).toContain('building_library');
    expect(unlocksOf(ctx, 'civic', 'civic_political_philosophy').map((u) => u.id)).toEqual(
      expect.arrayContaining(['government_autocracy', 'policy_court_emissaries']),
    );
  });

  it('plans a path through missing prerequisites, cheapest branch first', () => {
    const { s } = capital();
    expect(pathTo(ctx, s.players.p1!, 'tech', 'tech_currency')).toEqual([
      'tech_pottery',
      'tech_writing',
      'tech_currency',
    ]);
    expect(availableNodes(ctx, s.players.p1!, 'tech')).not.toContain('tech_writing');
  });

  it('researches along the path, carrying extra science over', () => {
    let { s } = capital();
    s = act(s, { type: 'set_research', player: 'p1', tech: 'tech_writing' }).state;
    expect(s.players.p1!.techs).toMatchObject({
      current: 'tech_pottery',
      queue: ['tech_writing'],
    });
    for (let i = 0; i < 30 && !s.players.p1!.techs.done.includes('tech_pottery'); i++)
      s = endTurn(s);
    const t = s.players.p1!.techs;
    expect(t.done).toEqual(['tech_pottery']);
    expect(t.current).toBe('tech_writing');
    expect(t.progress.tech_writing ?? 0).toBeGreaterThanOrEqual(0);
    expect(err(s, { type: 'set_research', player: 'p1', tech: 'tech_pottery' })).toBe(
      'already_done',
    );
  });

  it('pays a boost the moment its goal is met', () => {
    // Founding on the coast boosts Sailing (40% of 50 science); inland doesn't.
    expect(capital().s.players.p1!.techs.boosted).not.toContain('tech_sailing');
    let s = testState(ISLAND);
    const settler = addUnit(s, 'p1', 'unit_settler', at(s, 1, 3));
    const r = act(s, { type: 'found_settlement', player: 'p1', unit: settler.id });
    s = r.state;
    expect(s.players.p1!.techs.boosted).toContain('tech_sailing');
    expect(s.players.p1!.techs.progress.tech_sailing).toBe(2000);
    expect(r.events).toContainEqual(
      expect.objectContaining({ type: 'boost_earned', kind: 'tech', id: 'tech_sailing' }),
    );
  });
});

describe('locked content', () => {
  it('hides buildings, units and improvements until their tech', () => {
    const { s, id } = capital();
    const city = s.settlements[id]!;
    expect(itemProblem(ctx, s, city, { kind: 'building', id: 'building_granary' })).toMatchObject({
      code: 'locked',
      message: 'Needs Pottery',
    });
    const pasture = s.map.tiles.findIndex((_, i) => i === tileIndex(s.map, 3, 4));
    s.map.tiles[pasture]!.resource = 'cattle';
    expect(improvementsFor(ctx, s, pasture, 'p1')).not.toContain('improvement_pasture');
    s.players.p1!.techs.done.push('tech_animal_husbandry');
    expect(improvementsFor(ctx, s, pasture, 'p1')[0]).toBe('improvement_pasture');
    s.players.p1!.techs.done.push('tech_pottery');
    expect(itemProblem(ctx, s, city, { kind: 'building', id: 'building_granary' })).toBeUndefined();
  });
});

describe('governments and policies', () => {
  it('slots cards for free right after a civic, and charges gold otherwise', () => {
    const { s } = capital();
    s.players.p1!.civics.done.push('civic_code_of_laws');
    const cards = {
      ...empty,
      military: ['policy_militia_drills'],
      economic: ['policy_civic_works'],
    };
    expect(policyChangeCost(ctx, s, 'p1', cards)).toBe(0); // the window is open at the start
    const after = act(s, { type: 'set_policies', player: 'p1', policies: cards }).state;
    expect(after.players.p1!.policies.economic).toEqual(['policy_civic_works']);

    const closed = structuredClone(after);
    closed.players.p1!.policyWindow = false;
    const swap = { ...cards, military: ['policy_frontier_patrols'] };
    expect(policyChangeCost(ctx, closed, 'p1', swap)).toBe(2500);
    expect(err(closed, { type: 'set_policies', player: 'p1', policies: swap })).toBe(
      'not_enough_gold',
    );
  });

  it('checks slots, kinds and unlocks', () => {
    const { s } = capital();
    s.players.p1!.civics.done.push('civic_code_of_laws');
    const set = (policies: typeof empty & Record<string, string[]>) =>
      err(s, { type: 'set_policies', player: 'p1', policies });
    expect(set({ ...empty, military: ['policy_civic_works'] })).toBe('wrong_slot');
    expect(set({ ...empty, economic: ['policy_market_rights'] })).toBe('policy_locked');
    expect(set({ ...empty, military: ['policy_militia_drills', 'policy_frontier_patrols'] })).toBe(
      'too_many_policies',
    );
  });

  it('applies policy effects to yields and production', () => {
    const { s, id } = capital();
    s.players.p1!.civics.done.push('civic_code_of_laws');
    const before = settlementYields(ctx, s, s.settlements[id]!).total.production!;
    const warrior = { kind: 'unit' as const, id: 'unit_warrior' };
    expect(productionToward(ctx, s, s.settlements[id]!, warrior, 400)).toBe(400);
    const after = act(s, {
      type: 'set_policies',
      player: 'p1',
      policies: { ...empty, military: ['policy_militia_drills'], economic: ['policy_civic_works'] },
    }).state;
    const y = settlementYields(ctx, after, after.settlements[id]!);
    expect(y.total.production).toBe(before + 100);
    expect(y.lines.production!.map((l) => l.label)).toContain('Civic Works');
    expect(productionToward(ctx, after, after.settlements[id]!, warrior, 400)).toBe(600);
  });

  it('changes government once a civic unlocks it, trimming cards that no longer fit', () => {
    const { s } = capital();
    expect(
      err(s, { type: 'set_government', player: 'p1', government: 'government_autocracy' }),
    ).toBe('locked');
    s.players.p1!.civics.done.push('civic_code_of_laws', 'civic_political_philosophy');
    s.players.p1!.policies.military = ['policy_militia_drills'];
    const after = act(s, {
      type: 'set_government',
      player: 'p1',
      government: 'government_classical_republic',
    }).state;
    expect(after.players.p1!.government).toBe('government_classical_republic');
    expect(policySlots(ctx, after, 'p1')).toEqual({
      military: 0,
      economic: 2,
      diplomatic: 1,
      wildcard: 1,
    });
    expect(after.players.p1!.policies.military).toEqual([]);
  });

  it('raises the settlement limit with civics', () => {
    const { s } = capital();
    expect(settlementLimit(ctx, s, 'p1')).toBe(4);
    s.players.p1!.civics.done.push('civic_early_empire');
    expect(settlementLimit(ctx, s, 'p1')).toBe(5);
  });

  it('lets land units embark after Shipbuilding', () => {
    let { s } = capital();
    s.players.p1!.techs.current = 'tech_shipbuilding';
    s.players.p1!.techs.progress.tech_shipbuilding = 1_000_000;
    s = endTurn(s);
    expect(s.players.p1!.techs.done).toContain('tech_shipbuilding');
    expect(s.players.p1!.canEmbark).toBe(true);
  });
});

describe('celebrations and upkeep', () => {
  it('celebrates when enough happiness piles up, with a bonus wildcard slot for a while', () => {
    let { s } = capital();
    s.players.p1!.celebration.store = celebrationThreshold(ctx, s.players.p1!) - 1;
    s = endTurn(s);
    const c = s.players.p1!.celebration;
    expect(c.count).toBe(1);
    expect(c.turnsLeft).toBe(10);
    expect(policySlots(ctx, s, 'p1').wildcard).toBe(1);
    for (let i = 0; i < 10; i++) s = endTurn(s);
    expect(s.players.p1!.celebration.turnsLeft).toBe(0);
    expect(policySlots(ctx, s, 'p1').wildcard).toBe(0);
  });

  it('gives some upkeep free, and disbands a unit when the treasury runs dry', () => {
    let { s } = capital();
    expect(unitUpkeep(ctx, s, 'p1')).toBe(0);
    for (let i = 0; i < 8; i++) addUnit(s, 'p1', 'unit_warrior', at(s, 4, 3));
    expect(unitUpkeep(ctx, s, 'p1')).toBe(500); // 8 warriors, 3 free
    s.players.p1!.gold = 0;
    const units = Object.keys(s.units).length;
    // The capital's gold (+5) covers most of it; the rest empties the treasury: one unit goes.
    s.settlements[s.players.p1!.capital!]!.buildings = [];
    s = endTurn(s);
    expect(Object.keys(s.units).length).toBe(units - 1);
    expect(s.players.p1!.gold).toBe(0);
  });
});
