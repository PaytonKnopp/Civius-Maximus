/**
 * Deterministic value noise in integer math (no floating point), so every browser generates the
 * same map from the same seed. Values are 0..1023. Wraps horizontally with the map.
 */

const FX = 256; // fixed-point fraction bits: 8

function hash(seed: number, x: number, y: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ Math.imul(x, 0x27d4eb2f), 0xc2b2ae35);
  h = Math.imul(h ^ Math.imul(y, 0x165667b1), 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) & 1023;
}

/** Smoothstep on a fixed-point fraction 0..256. */
const fade = (t: number) => Math.floor((t * t * (3 * FX - 2 * t)) / (FX * FX));
const lerp = (a: number, b: number, t: number) => a + Math.trunc(((b - a) * t) / FX);

/** One octave at a fixed-point position; the lattice repeats every `periodX` cells if given. */
function octave(seed: number, xfx: number, yfx: number, periodX: number | null): number {
  const xi = Math.floor(xfx / FX);
  const yi = Math.floor(yfx / FX);
  const tx = fade(xfx - xi * FX);
  const ty = fade(yfx - yi * FX);
  const wrap = (x: number) => (periodX === null ? x : ((x % periodX) + periodX) % periodX);
  const v00 = hash(seed, wrap(xi), yi);
  const v10 = hash(seed, wrap(xi + 1), yi);
  const v01 = hash(seed, wrap(xi), yi + 1);
  const v11 = hash(seed, wrap(xi + 1), yi + 1);
  return lerp(lerp(v00, v10, tx), lerp(v01, v11, tx), ty);
}

export interface NoiseField {
  /** Noise value 0..1023 for a tile. */
  at(col: number, row: number): number;
}

/**
 * Fractal noise sized to a map: `cells` lattice cells across the width for the first octave,
 * doubling each octave. Rows are spaced at ~0.866 of a tile, like real hexes.
 */
export function noiseField(
  seed: number,
  map: { width: number; height: number; wrapX: boolean },
  cells: number,
  octaves = 4,
): NoiseField {
  return {
    at(col, row) {
      // Half-tile units horizontally, so odd rows sit between even ones.
      const x2 = col * 2 + (row & 1);
      let sum = 0;
      let weight = 0;
      let amplitude = 8;
      let c = cells;
      for (let o = 0; o < octaves; o++) {
        const xfx = Math.floor((x2 * c * FX) / (2 * map.width));
        const yfx = Math.floor((row * c * FX * 7) / (8 * map.width));
        sum += octave(seed + o * 1013, xfx, yfx, map.wrapX ? c : null) * amplitude;
        weight += amplitude;
        amplitude = Math.max(1, amplitude >> 1);
        c *= 2;
      }
      return Math.floor(sum / weight);
    },
  };
}
