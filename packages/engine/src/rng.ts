/**
 * Deterministic pseudo-random number generator (sfc32).
 *
 * The RNG state is a plain tuple stored inside the game state, and every function here is pure:
 * it takes a state and returns the value plus the next state. Engine code must never use
 * Math.random(); see docs/01-architecture.md, "Determinism rules".
 */

export type RngState = readonly [number, number, number, number];

/** Hashes a seed string into four 32-bit words (cyrb128). */
function hashSeed(seed: string): RngState {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < seed.length; i++) {
    const k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** Creates an RNG state from a seed. The same seed always gives the same sequence. */
export function createRng(seed: string | number): RngState {
  let state = hashSeed(String(seed));
  // Discard the first outputs so similar seeds diverge quickly.
  for (let i = 0; i < 12; i++) state = nextU32(state)[1];
  return state;
}

/** Returns a uniformly distributed unsigned 32-bit integer and the next state. */
export function nextU32(state: RngState): [number, RngState] {
  let [a, b, c, d] = state;
  const t = (((a + b) | 0) + d) | 0;
  d = (d + 1) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) | 0;
  return [t >>> 0, [a >>> 0, b >>> 0, c >>> 0, d >>> 0]];
}

/** Returns an integer in [0, maxExclusive) without modulo bias, and the next state. */
export function nextInt(state: RngState, maxExclusive: number): [number, RngState] {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > 2 ** 32) {
    throw new RangeError(
      `nextInt: maxExclusive must be an integer in 1..2^32, got ${maxExclusive}`,
    );
  }
  const limit = 2 ** 32 - (2 ** 32 % maxExclusive);
  let current = state;
  for (;;) {
    const [value, next] = nextU32(current);
    current = next;
    if (value < limit) return [value % maxExclusive, current];
  }
}

/** Returns an integer in [min, max] (both inclusive), and the next state. */
export function nextRange(state: RngState, min: number, max: number): [number, RngState] {
  if (max < min) throw new RangeError(`nextRange: max (${max}) is below min (${min})`);
  const [offset, next] = nextInt(state, max - min + 1);
  return [min + offset, next];
}
