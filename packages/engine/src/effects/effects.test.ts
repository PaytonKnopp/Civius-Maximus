import type { Condition, Effect } from '@cx/content';
import { compileFromDirs } from '@cx/content/node';
import { describe, expect, it } from 'vitest';
import { formatFixed, percentOf, toFixed } from '../fixed';
import { evaluateCondition } from './conditions';
import type { TileContext, TileFacts } from './tile';
import { computeTileYields, type EffectSource, explainYields } from './yields';

const content = compileFromDirs().content!;

function tile(over: Partial<TileFacts> = {}): TileFacts {
  return {
    terrain: 'grassland',
    feature: null,
    elevation: 'flat',
    resource: null,
    river: false,
    ownerId: 'p1',
    ...over,
  };
}

function ctx(t: Partial<TileFacts> = {}, neighbors: Partial<TileFacts>[] = []): TileContext {
  return { content, tile: tile(t), neighbors: neighbors.map(tile), playerId: 'p1' };
}

const source = (effects: Effect[], label = 'Test Ability'): EffectSource => ({
  id: 'ability_test',
  label,
  effects,
});

const tiles = { scope: 'tiles', owner: 'self' } as const;

describe('fixed-point math', () => {
  it('converts and formats', () => {
    expect(toFixed(1.5)).toBe(150);
    expect(formatFixed(150)).toBe('1.5');
    expect(formatFixed(200)).toBe('2');
    expect(formatFixed(-25)).toBe('-0.25');
  });

  it('truncates percentages toward zero', () => {
    expect(percentOf(333, 10)).toBe(33);
    expect(percentOf(-333, 10)).toBe(-33);
  });
});

describe('conditions', () => {
  const check = (c: Condition, t: Partial<TileFacts> = {}, n: Partial<TileFacts>[] = []) =>
    evaluateCondition(ctx(t, n), c);

  it('matches terrain, feature, elevation and resources', () => {
    expect(check({ tile_terrain: 'grassland' })).toBe(true);
    expect(check({ tile_terrain: ['plains', 'desert'] })).toBe(false);
    expect(check({ tile_feature: 'woods' }, { feature: 'woods' })).toBe(true);
    expect(check({ tile_feature: null })).toBe(true);
    expect(check({ tile_elevation: 'hills' }, { elevation: 'hills' })).toBe(true);
    expect(check({ tile_has_resource: true }, { resource: 'wheat' })).toBe(true);
    expect(check({ tile_has_resource: true })).toBe(false);
    expect(check({ tile_resource_class: 'luxury' }, { resource: 'silk' })).toBe(true);
    expect(check({ tile_resource_class: 'luxury' }, { resource: 'wheat' })).toBe(false);
  });

  it('combines with all, any and not', () => {
    const woodsNoRiver: Condition = {
      all: [{ tile_feature: 'woods' }, { not: { tile_on_river: true } }],
    };
    expect(check(woodsNoRiver, { feature: 'woods' })).toBe(true);
    expect(check(woodsNoRiver, { feature: 'woods', river: true })).toBe(false);
    expect(
      check({ any: [{ tile_terrain: 'desert' }, { tile_on_river: true }] }, { river: true }),
    ).toBe(true);
  });

  it('knows coastal land and ownership', () => {
    expect(check({ tile_coastal: true }, {}, [{ terrain: 'coast' }])).toBe(true);
    expect(check({ tile_coastal: true }, {}, [{ terrain: 'plains' }])).toBe(false);
    expect(check({ tile_coastal: true }, { terrain: 'coast' }, [{ terrain: 'coast' }])).toBe(false);
    expect(check({ tile_owned_by_self: true }, { ownerId: 'p2' })).toBe(false);
  });

  it('counts adjacent tiles', () => {
    const twoMountains = { tile_adjacent_to: { elevation: 'mountain' as const, min: 2 } };
    expect(check(twoMountains, {}, [{ elevation: 'mountain' }])).toBe(false);
    expect(check(twoMountains, {}, [{ elevation: 'mountain' }, { elevation: 'mountain' }])).toBe(
      true,
    );
  });
});

describe('tile yields', () => {
  it('adds terrain, hills, feature and resource, with a breakdown', () => {
    const c = ctx({ terrain: 'plains', elevation: 'hills', feature: 'woods', resource: 'deer' });
    const result = computeTileYields(c);
    expect(result.total).toEqual({ food: 100, production: 400 });
    expect(explainYields(c, result)).toEqual([
      '🍞 Food 1 = Plains 1',
      '⚙️ Production 4 = Plains 1 + Hills 1 + Woods 1 + Deer 1',
    ]);
  });

  it('mountains yield only what the rules give them', () => {
    expect(computeTileYields(ctx({ elevation: 'mountain' })).total).toEqual({});
  });

  it('applies flat effects only where their condition holds', () => {
    const coastProduction = source([
      {
        effect: 'modify_yield',
        params: { yield: 'production', amount: 1 },
        target: tiles,
        condition: { tile_terrain: 'coast' },
      },
    ]);
    expect(computeTileYields(ctx({ terrain: 'coast' }), [coastProduction]).total.production).toBe(
      100,
    );
    expect(computeTileYields(ctx({ terrain: 'plains' }), [coastProduction]).total.production).toBe(
      100,
    );
    expect(
      computeTileYields(ctx({ terrain: 'grassland' }), [coastProduction]).total.production,
    ).toBeUndefined();
  });

  it("only touches the player's own tiles unless the target says any", () => {
    const flat = (owner: 'self' | 'any'): EffectSource =>
      source([
        {
          effect: 'modify_yield',
          params: { yield: 'gold', amount: 2 },
          target: { scope: 'tiles', owner },
        },
      ]);
    expect(computeTileYields(ctx({ ownerId: 'p2' }), [flat('self')]).total.gold).toBeUndefined();
    expect(computeTileYields(ctx({ ownerId: 'p2' }), [flat('any')]).total.gold).toBe(200);
  });

  it('gives adjacency yields per group of neighbors', () => {
    const campus = source(
      [
        {
          effect: 'yield_per_adjacent',
          params: { yield: 'science', amount: 1, per: { feature: 'rainforest' }, every: 2 },
          target: tiles,
        },
        {
          effect: 'yield_per_adjacent',
          params: { yield: 'science', amount: 0.5, per: { elevation: 'mountain' }, every: 1 },
          target: tiles,
        },
      ],
      'Campus adjacency',
    );
    const n = [
      { feature: 'rainforest' },
      { feature: 'rainforest' },
      { feature: 'rainforest' },
      { elevation: 'mountain' as const },
    ];
    const result = computeTileYields(ctx({}, n), [campus]);
    expect(result.total.science).toBe(150); // 3 rainforest → 1 group of 2 → +1, 1 mountain → +0.5
    expect(result.lines.science).toHaveLength(2);
  });

  it('adds percentages from the pre-percentage subtotal, without compounding', () => {
    const boosts = source([
      { effect: 'modify_yield', params: { yield: 'food', percent: 50 }, target: tiles },
      { effect: 'modify_yield', params: { yield: 'food', percent: 50 }, target: tiles },
    ]);
    const result = computeTileYields(ctx(), [boosts]);
    expect(result.total.food).toBe(400); // 2 + 50% of 2 + 50% of 2
    expect(result.lines.food!.map((l) => l.label)).toEqual([
      'Grassland',
      'Test Ability (+50%)',
      'Test Ability (+50%)',
    ]);
  });

  it('never goes below zero, and says so', () => {
    const famine = source([
      { effect: 'modify_yield', params: { yield: 'food', amount: -5 }, target: tiles },
    ]);
    const c = ctx();
    const result = computeTileYields(c, [famine]);
    expect(result.total.food).toBe(0);
    expect(explainYields(c, result)).toEqual([
      "🍞 Food 0 = Grassland 2 - Test Ability 5 + Can't go below 0 3",
    ]);
  });

  it('runs abilities defined in a mod', () => {
    const modded = compileFromDirs([
      new URL('../../../content/test-fixtures/good-mod', import.meta.url).pathname,
    ]).content!;
    const ability = modded.entities.ability.ability_sea_raiders!;
    const c: TileContext = {
      content: modded,
      tile: tile({ terrain: 'savanna', feature: 'woods' }),
      neighbors: [tile({ elevation: 'mountain' })],
      playerId: 'p1',
    };
    const result = computeTileYields(c, [
      { id: ability.id, label: ability.name, effects: ability.effects },
    ]);
    expect(explainYields(c, result)).toEqual([
      '🍞 Food 1 = Savanna 1',
      '⚙️ Production 2 = Savanna 1 + Woods 1',
      '💰 Gold 1 = Savanna 1',
      '🔬 Science 1 = Sea Raiders 1',
    ]);
  });
});
