import type { EngineContext } from '../context';
import type { PlayerState } from '../state';

/**
 * A player's era order (1 = the first era): the latest era of any tech or civic they've finished,
 * as `playerEra` works it out. Kept here, with no other imports, so cost and reward rules can
 * scale with the era without importing the progress rules.
 */
export function eraOrderOf(ctx: EngineContext, p: PlayerState | undefined): number {
  let best = 1;
  if (!p) return best;
  const consider = (era: string | undefined) => {
    const order = era ? (ctx.content.entities.era[era]?.order ?? 1) : 1;
    if (order > best) best = order;
  };
  for (const id of p.techs.done) consider(ctx.content.entities.tech[id]?.era);
  for (const id of p.civics.done) consider(ctx.content.entities.civic[id]?.era);
  return best;
}

/** `amount` grown by `percent` of itself for each era past the first. */
export function perEra(amount: number, percent: number, era: number): number {
  return percent > 0 ? Math.floor((amount * (100 + percent * Math.max(0, era - 1))) / 100) : amount;
}

/**
 * How much more tourism a great work or wonder from era `era` (an order) draws for its owner now
 * (D115): `culture.agingPercent` per era they're past it, up to `culture.agingMaxPercent`.
 */
export function agingPercent(ctx: EngineContext, p: PlayerState | undefined, era: number): number {
  const r = ctx.content.rules.culture;
  return Math.min(r.agingMaxPercent, r.agingPercent * Math.max(0, eraOrderOf(ctx, p) - era));
}
