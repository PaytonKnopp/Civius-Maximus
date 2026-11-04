import { compileFromDirs } from '@cx/content/node';
import { describe, expect, it } from 'vitest';
import { checkProfile, DEFAULT_BUDGET, type ProfileRow, runProfile } from './profile';

const content = compileFromDirs().content!;

const row = (over: Partial<ProfileRow>): ProfileRow => ({
  turn: 100,
  processMs: 500,
  aiMs: 200,
  stateKB: 900,
  gzipKB: 40,
  logKB: 300,
  heapMB: 150,
  settlements: 60,
  units: 200,
  ...over,
});

describe('checkProfile', () => {
  it('passes a healthy game', () => {
    expect(checkProfile([row({ turn: 25, processMs: 300 }), row({})], DEFAULT_BUDGET)).toEqual([]);
  });

  it('names each broken limit', () => {
    const slow = checkProfile(
      [row({ turn: 25, processMs: 100 }), row({ processMs: 3000, aiMs: 2000 })],
      DEFAULT_BUDGET,
    );
    expect(slow.join('\n')).toMatch(/turn processing averaged 3000 ms/);
    expect(slow.join('\n')).toMatch(/AIs averaged 2000 ms/);
    expect(slow.join('\n')).toMatch(/takes 30\.0x as long/);
    const big = checkProfile([row({ stateKB: 3000, gzipKB: 200, heapMB: 900 })], DEFAULT_BUDGET);
    expect(big).toHaveLength(3);
  });

  it('flags late turns that got much slower than early ones, even when both are fast', () => {
    const growth = checkProfile(
      [row({ turn: 25, processMs: 100 }), row({ processMs: 700 })],
      DEFAULT_BUDGET,
    );
    expect(growth).toEqual([expect.stringMatching(/7\.0x as long/)]);
  });

  it('reports a game that never got going', () => {
    expect(checkProfile([], DEFAULT_BUDGET)).toEqual(['no turns were played']);
  });
});

describe('runProfile', () => {
  it('plays a short game, reports rows, and ends on the same state every time', () => {
    const opts = { players: 3, turns: 6, seed: 'prof-test', size: 'tiny', every: 3 };
    const a = runProfile(content, opts);
    const b = runProfile(content, opts);
    expect(a.rows.map((r) => r.turn)).toEqual([3, 6]);
    expect(a.rows.every((r) => r.stateKB > 0 && r.gzipKB > 0 && r.settlements > 0)).toBe(true);
    expect(a.hash).toBe(b.hash);
  });

  it('carries a saved game on for more turns', () => {
    const first = runProfile(content, {
      players: 3,
      turns: 4,
      seed: 'prof-test',
      size: 'tiny',
      every: 4,
    });
    const more = runProfile(content, {
      players: 3,
      turns: 3,
      seed: 'prof-test',
      size: 'tiny',
      every: 3,
      from: JSON.parse(JSON.stringify(first.state)),
    });
    expect(more.state.turn).toBe(first.state.turn + 3);
  });
});
