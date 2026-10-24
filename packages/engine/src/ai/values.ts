import type { Effect, Personality } from '@cx/content';
import type { Fixed } from '../fixed';
import { happinessOf } from '../settlements/rules';
import type { SettlementState } from '../state';
import { maxReligions } from '../religion/rules';
import type { Turn } from './turn';

const religionRoom = (t: Turn) =>
  Object.keys(t.state.religions).length < maxReligions(t.ctx, t.state);

/**
 * How much the AI values things, in "points". A yield's weight comes from a base value scaled by
 * the leader's personality (a trait of 5 keeps the base, 10 makes it 1.5×, 0 halves it).
 */

const BASE: Record<string, { base: number; trait?: keyof Personality }> = {
  food: { base: 10, trait: 'expansion' },
  production: { base: 10 },
  gold: { base: 6, trait: 'gold' },
  science: { base: 8, trait: 'science' },
  culture: { base: 7, trait: 'culture' },
  faith: { base: 4, trait: 'faith' },
  influence: { base: 3, trait: 'diplomacy' },
  tourism: { base: 2, trait: 'culture' },
  happiness: { base: 8 },
};

export function yieldWeight(me: Personality, y: string): number {
  const b = BASE[y] ?? { base: 3 };
  if (!b.trait) return b.base;
  // Food matters to everyone, so expansion only nudges it.
  const trait = b.trait === 'expansion' ? 5 + Math.floor((me.expansion - 5) / 2) : me[b.trait];
  return Math.max(1, Math.floor((b.base * (5 + trait)) / 10));
}

/** Points for a set of whole-number yields. */
export function yieldsValue(me: Personality, yields: Record<string, number | undefined>): number {
  let total = 0;
  for (const [y, v] of Object.entries(yields)) total += (v ?? 0) * yieldWeight(me, y);
  return total;
}

/** The same for fixed-point (hundredths) yields. */
export function fixedYieldsValue(me: Personality, yields: Record<string, Fixed>): number {
  let total = 0;
  for (const [y, v] of Object.entries(yields)) total += v * yieldWeight(me, y);
  return Math.floor(total / 100);
}

/** How much one more point of happiness is worth in a settlement right now. */
export function happinessWeight(t: Turn, s: SettlementState): number {
  const h = t.memo(`happy:${s.id}`, () => happinessOf(t.ctx, t.state, s));
  if (h.mood === 'unrest' || h.mood === 'unhappy') return 24;
  if (h.balance < 2) return 14;
  if (h.mood === 'thriving') return 3;
  return 7;
}

/**
 * Points for an effect (government, policy, wonder...), roughly: what it's worth across the
 * empire per turn. Unknown kinds of effect get a small default, so modded effects aren't ignored.
 */
export function effectValue(t: Turn, effect: Effect): number {
  const me = t.me;
  const settlements = Math.max(1, t.mySettlements().length);
  switch (effect.effect) {
    case 'modify_yield': {
      const params = effect.params;
      const w = yieldWeight(me, params.yield);
      if ('amount' in params) {
        const per = effect.target.scope === 'settlements' ? settlements : 1;
        return params.amount * w * per;
      }
      // A percentage of roughly 6 of that yield per settlement.
      return Math.floor((params.percent * w * 6 * settlements) / 100);
    }
    case 'modify_production': {
      const kind = effect.params.toward.kind;
      const trait =
        kind === 'unit'
          ? me.aggression
          : kind === 'wonder'
            ? me.wonders
            : kind === 'district'
              ? me.districts
              : 5;
      return Math.floor((effect.params.percent * (trait + 2) * settlements) / 20);
    }
    case 'modify_happiness':
      return effect.params.amount * 8 * settlements;
    case 'modify_unit_upkeep':
      return Math.floor((-effect.params.percent * Math.max(1, t.myUnits().length)) / 20);
    case 'modify_settlement_limit':
      return effect.params.amount * (me.expansion + 5) * 3;
    case 'extra_policy_slot':
      return effect.params.amount * 25;
    case 'modify_growth':
      return Math.floor((effect.params.percent * yieldWeight(me, 'food') * settlements) / 10);
    case 'great_person_points': {
      // The way to a religion, while one can still be founded.
      const cls = t.ctx.content.entities.greatPersonClass[effect.params.class];
      if (cls?.foundsReligion && t.p.religion === null && religionRoom(t))
        return effect.params.amount * (20 + me.faith * 6);
      return effect.params.amount * 10;
    }
    case 'yield_per_follower':
      return Math.floor(
        (effect.params.amount * yieldWeight(me, effect.params.yield) * settlements * 2) /
          effect.params.per,
      );
    default:
      return 10;
  }
}
