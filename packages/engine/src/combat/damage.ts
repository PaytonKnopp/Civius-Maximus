import type { EngineContext } from '../context';

/**
 * The damage formula (docs/03-core-mechanics.md, "Damage formula"):
 * `damage = baseDamage × e^(strengthScale × difference) × random(1 ± randomPercent)`.
 * The exponential comes from a table built with integer math (a Taylor series on BigInts), so
 * every machine computes the same damage; no floating point touches the rules.
 */

/** Strength differences beyond this are treated as this (the table's half-width). */
export const MAX_DIFFERENCE = 100;

/** 10^18: the series runs in fixed point with 18 decimals. */
const SCALE = BigInt('1000000000000000000');

/** `e^(num / den) × SCALE` for `num ≥ 0`. */
function expScaled(num: bigint, den: bigint): bigint {
  let term = SCALE;
  let sum = SCALE;
  for (let n = BigInt(1); n < BigInt(1000) && term > BigInt(0); n++) {
    term = (term * num) / (den * n);
    sum += term;
  }
  return sum;
}

const tables = new WeakMap<object, number[]>();

/**
 * Damage in hundredths of HP before the random roll, for strength differences from
 * `-MAX_DIFFERENCE` to `MAX_DIFFERENCE` (index = difference + MAX_DIFFERENCE).
 */
export function damageTable(ctx: EngineContext): number[] {
  let table = tables.get(ctx.content);
  if (table) return table;
  const combat = ctx.content.rules.combat;
  // Content numbers are converted once, at the edge: the scale in millionths.
  const scale = BigInt(Math.round(combat.strengthScale * 1_000_000));
  const den = BigInt(1_000_000);
  const base = BigInt(combat.baseDamage * 100);
  table = [];
  for (let d = -MAX_DIFFERENCE; d <= MAX_DIFFERENCE; d++) {
    const e = expScaled(scale * BigInt(Math.abs(d)), den);
    // e^-x = 1 / e^x; round to the nearest hundredth of an HP.
    const value =
      d >= 0 ? (base * e + SCALE / BigInt(2)) / SCALE : (base * SCALE + e / BigInt(2)) / e;
    table.push(Number(value));
  }
  tables.set(ctx.content, table);
  return table;
}

/** Damage (whole HP, at least 1) for a strength difference and a roll in percent (e.g. 80-120). */
export function damageFor(ctx: EngineContext, difference: number, roll: number): number {
  const d = Math.max(-MAX_DIFFERENCE, Math.min(MAX_DIFFERENCE, difference));
  const hundredths = damageTable(ctx)[d + MAX_DIFFERENCE]!;
  return Math.max(1, Math.floor((hundredths * roll) / 10_000));
}

/** The lowest and highest damage a hit can do at this strength difference. */
export function damageRange(ctx: EngineContext, difference: number): [number, number] {
  const r = ctx.content.rules.combat.randomPercent;
  return [damageFor(ctx, difference, 100 - r), damageFor(ctx, difference, 100 + r)];
}
