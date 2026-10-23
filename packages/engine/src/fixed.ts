/**
 * Fixed-point numbers for rules math: an integer count of hundredths (1.5 food = 150).
 * Yields and modifiers are added and multiplied as integers, so results never depend on
 * floating-point rounding. Convert only at the edges: content in, display out.
 */
export type Fixed = number;

export const FIXED_ONE: Fixed = 100;

/** Converts a content number (like 0.5 or 2) into fixed-point. */
export function toFixed(value: number): Fixed {
  return Math.round(value * FIXED_ONE);
}

/** `value × percent / 100`, truncated toward zero. */
export function percentOf(value: Fixed, percent: number): Fixed {
  return Math.trunc((value * percent) / 100);
}

/** Display text: 150 → "1.5", 200 → "2", -25 → "-0.25". */
export function formatFixed(value: Fixed): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const whole = Math.floor(abs / FIXED_ONE);
  const frac = abs % FIXED_ONE;
  if (frac === 0) return `${sign}${whole}`;
  return `${sign}${whole}.${String(frac).padStart(2, '0').replace(/0$/, '')}`;
}

/** Integer square root (floor), exact for any safe integer. */
export function isqrt(n: number): number {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new RangeError(`isqrt needs a non-negative integer, got ${n}`);
  if (n < 2) return n;
  let x = n;
  let y = Math.floor((x + 1) / 2);
  while (y < x) {
    x = y;
    y = Math.floor((x + Math.floor(n / x)) / 2);
  }
  return x;
}

function bigPow(base: bigint, exp: number): bigint {
  let result = BigInt(1);
  let b = base;
  for (let e = exp; e > 0; e = Math.floor(e / 2)) {
    if (e % 2 === 1) result *= b;
    b *= b;
  }
  return result;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * `floor(x ^ exponent)` for a whole `x ≥ 0` and an exponent with up to two decimals (like the 1.3
 * in border growth). Computed exactly with integers, so every machine gets the same answer.
 */
export function powFloor(x: number, exponent: number): number {
  if (!Number.isSafeInteger(x) || x < 0)
    throw new RangeError(`powFloor needs a non-negative integer, got ${x}`);
  let p = Math.round(exponent * 100);
  let q = 100;
  if (p < 0) throw new RangeError(`powFloor needs a non-negative exponent, got ${exponent}`);
  if (p === 0) return 1;
  if (x < 2) return x;
  const g = gcd(p, q);
  p /= g;
  q /= g;
  // The largest r with r^q <= x^p.
  const target = bigPow(BigInt(x), p);
  let lo = 0;
  let hi = 1;
  while (bigPow(BigInt(hi), q) <= target) hi *= 2;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (bigPow(BigInt(mid), q) <= target) lo = mid;
    else hi = mid;
  }
  return lo;
}
