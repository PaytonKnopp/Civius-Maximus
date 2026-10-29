import { compileFromDirs } from '@cx/content/node';
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { createGame, type GameSetup } from './game';
import { greatPersonCost } from './greatpeople/greatpeople';
import { activeSources } from './progress/sources';
import { nodeCost } from './progress/rules';
import { growthThreshold, itemCost } from './settlements/rules';
import type { GameState } from './state';
import { ctx, testState } from './testing/world';

const FIELD = Array.from({ length: 5 }, () => '.'.repeat(10));

describe('game speed', () => {
  it('scales every cost by its percent', () => {
    const standard = testState(FIELD);
    const online = produce(standard, (d) => {
      d.settings.speed = 'speed_online';
    });
    const marathon = produce(standard, (d) => {
      d.settings.speed = 'speed_marathon';
    });
    const tech = (s: typeof standard) => nodeCost(ctx, s, 'tech', 'tech_pottery');
    expect(tech(online)).toBe(Math.floor(tech(standard) / 2));
    expect(tech(marathon)).toBe(tech(standard) * 3);
    const warrior = { kind: 'unit', id: 'unit_warrior' } as const;
    expect(itemCost(ctx, online, 'p1', warrior)).toBe(
      Math.floor(itemCost(ctx, standard, 'p1', warrior) / 2),
    );
    expect(growthThreshold(ctx, online, 3)).toBe(Math.floor(growthThreshold(ctx, standard, 3) / 2));
    expect(greatPersonCost(ctx, marathon, 'gp_scientist')).toBe(
      greatPersonCost(ctx, standard, 'gp_scientist') * 3,
    );
  });
});

describe('difficulty', () => {
  const full = { content: compileFromDirs().content! };
  const setup = (difficulty?: string): GameSetup => ({
    gameId: 'difficulty',
    settings: {
      seed: 'difficulty',
      turnLimit: null,
      ...(difficulty ? { difficulty } : {}),
      map: {
        script: 'continents',
        size: 'tiny',
        wrapX: true,
        resources: 'standard',
        startBalance: 'normal',
      },
    },
    players: [
      { id: 'p1', name: 'Human', kind: 'human' },
      { id: 'p2', name: 'AI', kind: 'ai' },
    ],
  });
  const unitsOf = (s: ReturnType<typeof createGame>, p: string) =>
    Object.values(s.units).filter((u) => u.owner === p).length;

  it('gives AI seats their bonuses and head start, and humans nothing', () => {
    const fair = createGame(setup(), full);
    const deity = createGame(setup('difficulty_deity'), full);
    expect(unitsOf(deity, 'p2')).toBe(unitsOf(fair, 'p2') + 5);
    expect(unitsOf(deity, 'p1')).toBe(unitsOf(fair, 'p1'));
    expect(deity.players.p2!.handicap).toBe('difficulty_deity');
    expect(deity.players.p1!.handicap).toBeUndefined();
    expect(activeSources(full, deity.players.p2!).map((x) => x.id)).toContain('difficulty_deity');
  });

  it('refuses a difficulty that does not exist', () => {
    expect(() => createGame(setup('difficulty_nope'), full)).toThrow(/Unknown difficulty/);
  });
});

describe('start era', () => {
  const full = { content: compileFromDirs().content! };
  const setupWith = (startEra?: string): GameSetup => ({
    gameId: 'start-era',
    settings: {
      seed: 'start-era',
      turnLimit: null,
      ...(startEra ? { startEra } : {}),
      map: {
        script: 'continents',
        size: 'tiny',
        wrapX: true,
        resources: 'standard',
        startBalance: 'normal',
      },
    },
    players: [
      { id: 'p1', name: 'Human', kind: 'human' },
      { id: 'p2', name: 'AI', kind: 'ai' },
    ],
  });

  it('finishes the earlier eras and gives the era gold and units', () => {
    const base = createGame(setupWith(), full);
    const later = createGame(setupWith('era_medieval'), full);
    const { entities, ids } = full.content;
    const p = later.players.p1!;
    const order = (e: string) => entities.era[e]!.order;
    const medieval = order('era_medieval');
    const techs = ids.tech.filter((t) => order(entities.tech[t]!.era) < medieval);
    expect([...p.techs.done].sort()).toEqual([...techs].sort());
    expect(p.civics.done.length).toBeGreaterThan(0);
    const start = entities.era.era_medieval!.start!;
    expect(p.gold).toBe(base.players.p1!.gold + start.gold * 100);
    const count = (s: GameState) => Object.values(s.units).filter((u) => u.owner === 'p1').length;
    expect(count(later)).toBe(count(base) + start.units.length);
  });

  it('rejects an unknown era', () => {
    expect(() => createGame(setupWith('era_space'), full)).toThrow(/Unknown era/);
  });
});
