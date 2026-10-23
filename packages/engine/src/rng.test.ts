import { describe, expect, it } from 'vitest';
import { createRng, nextInt, nextRange, nextU32, type RngState } from './rng';

function take(state: RngState, n: number): number[] {
  const out: number[] = [];
  let s = state;
  for (let i = 0; i < n; i++) {
    const [v, next] = nextU32(s);
    out.push(v);
    s = next;
  }
  return out;
}

describe('rng', () => {
  it('is deterministic for the same seed', () => {
    expect(take(createRng('pangaea-3'), 50)).toEqual(take(createRng('pangaea-3'), 50));
  });

  it('diverges for different seeds', () => {
    expect(take(createRng('seed-a'), 10)).not.toEqual(take(createRng('seed-b'), 10));
  });

  it('never mutates the input state', () => {
    const state = createRng(42);
    const copy = [...state];
    nextU32(state);
    nextInt(state, 6);
    expect([...state]).toEqual(copy);
  });

  it('keeps a stable sequence across releases (golden values)', () => {
    // If this fails, saved games and replays from older versions would break.
    expect(take(createRng('civius-maximus'), 3)).toMatchInlineSnapshot(`
      [
        3562278791,
        1728438172,
        916211436,
      ]
    `);
  });

  it('nextInt stays in range and covers it', () => {
    let s = createRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const [v, next] = nextInt(s, 6);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
      seen.add(v);
      s = next;
    }
    expect(seen.size).toBe(6);
  });

  it('nextRange is inclusive on both ends', () => {
    let s = createRng(9);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const [v, next] = nextRange(s, 80, 120);
      seen.add(v);
      s = next;
    }
    expect(Math.min(...seen)).toBe(80);
    expect(Math.max(...seen)).toBe(120);
  });

  it('rejects invalid bounds', () => {
    expect(() => nextInt(createRng(1), 0)).toThrow(RangeError);
    expect(() => nextRange(createRng(1), 5, 4)).toThrow(RangeError);
  });
});
