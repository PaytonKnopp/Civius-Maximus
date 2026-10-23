import { nextInt, type RngState } from '../rng';

/**
 * A convenience wrapper over the pure RNG for long algorithms like map generation. It advances
 * a local copy; call `state()` at the end and store the result back in the game state.
 */
export interface Random {
  /** Integer in [0, n). */
  int(n: number): number;
  /** True `percent`% of the time. */
  chance(percent: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** Weighted pick; weights are non-negative integers with a positive total. */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T;
  shuffle<T>(items: T[]): T[];
  state(): RngState;
}

export function makeRandom(initial: RngState): Random {
  let s = initial;
  const int = (n: number) => {
    const [v, next] = nextInt(s, n);
    s = next;
    return v;
  };
  return {
    int,
    chance: (percent) => percent > 0 && (percent >= 100 || int(100) < percent),
    pick: (items) => {
      if (items.length === 0) throw new Error('pick from empty list');
      return items[int(items.length)]!;
    },
    weighted: (items, weight) => {
      const total = items.reduce((sum, it) => sum + weight(it), 0);
      if (total <= 0) throw new Error('weighted pick needs a positive total weight');
      let roll = int(total);
      for (const it of items) {
        roll -= weight(it);
        if (roll < 0) return it;
      }
      return items[items.length - 1]!;
    },
    shuffle: (items) => {
      for (let i = items.length - 1; i > 0; i--) {
        const j = int(i + 1);
        [items[i], items[j]] = [items[j]!, items[i]!];
      }
      return items;
    },
    state: () => s,
  };
}
