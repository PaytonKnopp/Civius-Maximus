import { compileFromDirs } from '@cx/content/node';
import { describe, expect, it } from 'vitest';
import { runStats } from './stats';
import { statsPreset } from './statsPresets';
import { summarizeStats } from './statsReport';

const content = compileFromDirs().content!;

describe('cx stats', () => {
  it('measures a short game: samples, eras, builds and choices', { timeout: 60_000 }, () => {
    const g = runStats(content, {
      players: 2,
      turns: 30,
      seed: '3',
      size: 'duel',
      sampleEvery: 10,
    });
    expect(g.endTurn).toBe(30);
    expect(g.result?.reason).toBe('score');
    expect(g.players).toHaveLength(2);
    expect(g.samples.map((s) => s.turn)).toEqual([10, 20, 30]);
    const sample = Object.values(g.samples[2]!.players)[0]!;
    expect(sample.settlements).toBeGreaterThan(0);
    expect(sample.yields.food).toBeGreaterThan(0);
    expect(g.eraFirst[1]).toBe(1);
    expect(Object.values(g.built.unit).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    expect(g.hash).toMatch(/^[0-9a-f]+$/);
  });

  it('is deterministic: the same setup gives the same game', { timeout: 60_000 }, () => {
    const o = { players: 2, turns: 15, seed: '9', size: 'duel' };
    expect(runStats(content, o).hash).toBe(runStats(content, o).hash);
  });

  it(
    'summarizes games into tables, and every preset is a list of setups',
    { timeout: 60_000 },
    () => {
      const g = runStats(content, { players: 2, turns: 20, seed: '4', size: 'duel' });
      const text = summarizeStats([g, g], 'speed', content).join('\n');
      expect(text).toMatch(/2 games, grouped by speed/);
      expect(text).toMatch(/Median civ over time: standard/);
      for (const name of [
        'smoke',
        'speeds',
        'sizes',
        'scripts',
        'difficulty',
        'eras',
        'standard',
      ]) {
        expect(statsPreset(name).length).toBeGreaterThan(0);
      }
    },
  );
});
