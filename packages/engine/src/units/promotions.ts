import type { PromotionDef } from '@cx/content';
import { type EngineContext, unitClassOf, unitDef } from '../context';
import type { UnitState } from '../state';

/**
 * Promotions (docs/03-core-mechanics.md, "Experience and promotions"): what a unit has taken,
 * what it can take next, and the movement, sight and range they add. Strength bonuses are read
 * by the combat code.
 */

type Promoted = Pick<UnitState, 'type'> & { promotions?: string[] | undefined };

export function promotionsOf(ctx: EngineContext, unit: Promoted): PromotionDef[] {
  return (unit.promotions ?? []).flatMap((id) => {
    const def = ctx.content.entities.promotion[id];
    return def ? [def] : [];
  });
}

const sum = (ctx: EngineContext, unit: Promoted, key: 'movement' | 'sight' | 'range') =>
  promotionsOf(ctx, unit).reduce((a, p) => a + p[key], 0);

export const extraMovement = (ctx: EngineContext, unit: Promoted) => sum(ctx, unit, 'movement');
export const extraSight = (ctx: EngineContext, unit: Promoted) => sum(ctx, unit, 'sight');

/** Attack range, with promotions. */
export function unitRange(ctx: EngineContext, unit: Promoted): number {
  return unitDef(ctx, unit).range + sum(ctx, unit, 'range');
}

export function ignoresTerrainCost(ctx: EngineContext, unit: Promoted): boolean {
  return (
    unitDef(ctx, unit).ignoresTerrainCost ||
    promotionsOf(ctx, unit).some((p) => p.ignoresTerrainCost)
  );
}

/** XP the unit needs for its next promotion. */
export function nextPromotionXp(ctx: EngineContext, unit: Pick<UnitState, 'promotions'>): number {
  const steps = ctx.content.rules.combat.promotionXp;
  // Promotions given by buildings and abilities don't count toward the next one.
  const earned = unit.promotions.filter((id) => !ctx.content.entities.promotion[id]?.granted);
  return steps[Math.min(earned.length, steps.length - 1)]!;
}

/** Promotions this unit could take now (it has the XP, its class qualifies, prerequisites met). */
export function availablePromotions(ctx: EngineContext, unit: UnitState): string[] {
  if (unit.xp < nextPromotionXp(ctx, unit)) return [];
  return promotionChoices(ctx, unit);
}

/** Promotions the unit's class could take next, XP aside (for showing the tree). */
export function promotionChoices(ctx: EngineContext, unit: UnitState): string[] {
  const cls = unitDef(ctx, unit).class;
  const taken = new Set(unit.promotions);
  return ctx.content.ids.promotion.filter((id) => {
    const p = ctx.content.entities.promotion[id]!;
    return (
      !p.granted &&
      p.classes.includes(cls) &&
      !taken.has(id) &&
      (p.requires.length === 0 || p.requires.some((r) => taken.has(r)))
    );
  });
}

/** Every promotion in a unit's class tree, by tier. */
export function promotionTree(ctx: EngineContext, unit: Pick<UnitState, 'type'>): PromotionDef[] {
  const cls = unitClassOf(ctx, unit).id;
  return ctx.content.ids.promotion
    .map((id) => ctx.content.entities.promotion[id]!)
    .filter((p) => !p.granted && p.classes.includes(cls))
    .sort((a, b) => a.tier - b.tier);
}
