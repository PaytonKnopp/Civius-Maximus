import { type Effect, resolveText, type YieldMap } from '@cx/content';
import { type Fixed, formatFixed, percentOf, toFixed } from '../fixed';
import { countAdjacent, evaluateCondition } from './conditions';
import type { TileContext } from './tile';

/** Something that carries effects: a leader ability, a policy, a wonder, a belief... */
export interface EffectSource {
  id: string;
  /** Shown in breakdowns, e.g. "Sea Raiders (Vikings)". */
  label: string;
  effects: readonly Effect[];
}

/** One contributor to a yield, e.g. `{ label: "Hills", amount: 100 }`. */
export interface YieldLine {
  source: string;
  label: string;
  amount: Fixed;
}

/** Totals per yield plus every line that went into them (the "why?" tooltip). */
export interface YieldBreakdown {
  total: Record<string, Fixed>;
  lines: Record<string, YieldLine[]>;
}

function appliesTo(ctx: TileContext, effect: Effect): boolean {
  if (effect.target.owner === 'self' && ctx.tile.ownerId !== ctx.playerId) return false;
  return effect.condition === undefined || evaluateCondition(ctx, effect.condition);
}

/**
 * Computes a tile's yields and explains them. Order: terrain (or mountain), hills, feature,
 * resource, flat effects, then percentage effects (each on the subtotal before percentages,
 * so they add up instead of compounding). Totals never go below zero.
 */
export function computeTileYields(
  ctx: TileContext,
  sources: readonly EffectSource[] = [],
): YieldBreakdown {
  const { content, tile } = ctx;
  const lines: Record<string, YieldLine[]> = {};
  const add = (yieldId: string, line: YieldLine) => {
    if (line.amount !== 0) (lines[yieldId] ??= []).push(line);
  };
  const addMap = (map: YieldMap, source: string, label: string) => {
    for (const id of Object.keys(map).sort()) add(id, { source, label, amount: toFixed(map[id]!) });
  };

  const terrain = content.entities.terrain[tile.terrain];
  if (!terrain) throw new Error(`Unknown terrain "${tile.terrain}"`);
  const elevation = content.rules.elevation;

  if (tile.elevation === 'mountain') {
    addMap(elevation.mountain.yields, 'mountain', 'Mountain');
  } else {
    addMap(terrain.yields, terrain.id, resolveText(content, terrain.name));
    if (tile.elevation === 'hills') addMap(elevation.hills.yields, 'hills', 'Hills');
  }
  if (tile.feature !== null) {
    const feature = content.entities.feature[tile.feature];
    if (!feature) throw new Error(`Unknown feature "${tile.feature}"`);
    addMap(feature.yields, feature.id, resolveText(content, feature.name));
  }
  if (tile.resource !== null) {
    const resource = content.entities.resource[tile.resource];
    if (!resource) throw new Error(`Unknown resource "${tile.resource}"`);
    addMap(resource.yields, resource.id, resolveText(content, resource.name));
  }

  const percents: { yieldId: string; percent: number; source: EffectSource }[] = [];
  for (const source of sources) {
    for (const effect of source.effects) {
      if (!appliesTo(ctx, effect)) continue;
      if (effect.effect === 'modify_yield') {
        if ('percent' in effect.params) {
          percents.push({ yieldId: effect.params.yield, percent: effect.params.percent, source });
        } else {
          add(effect.params.yield, {
            source: source.id,
            label: source.label,
            amount: toFixed(effect.params.amount),
          });
        }
      } else if (effect.effect === 'yield_per_adjacent') {
        const groups = Math.floor(countAdjacent(ctx, effect.params.per) / effect.params.every);
        add(effect.params.yield, {
          source: source.id,
          label: source.label,
          amount: groups * toFixed(effect.params.amount),
        });
      } else {
        const unhandled: never = effect;
        throw new Error(`Unhandled effect: ${JSON.stringify(unhandled)}`);
      }
    }
  }

  const subtotal = (yieldId: string) =>
    (lines[yieldId] ?? []).reduce((sum, l) => sum + l.amount, 0);
  const before = Object.fromEntries(Object.keys(lines).map((id) => [id, subtotal(id)]));
  for (const { yieldId, percent, source } of percents) {
    add(yieldId, {
      source: source.id,
      label: `${source.label} (${percent > 0 ? '+' : ''}${percent}%)`,
      amount: percentOf(before[yieldId] ?? 0, percent),
    });
  }

  // Present yields in the content's display order.
  const order = [...content.ids.yield].sort(
    (a, b) =>
      (content.entities.yield[a]?.order ?? 0) - (content.entities.yield[b]?.order ?? 0) ||
      (a < b ? -1 : 1),
  );
  const total: Record<string, Fixed> = {};
  const sortedLines: Record<string, YieldLine[]> = {};
  for (const id of order) {
    const ls = lines[id];
    if (!ls) continue;
    const sum = subtotal(id);
    if (sum < 0) ls.push({ source: 'minimum', label: "Can't go below 0", amount: -sum });
    total[id] = Math.max(0, sum);
    sortedLines[id] = ls;
  }
  return { total, lines: sortedLines };
}

/** One line per yield: `🍞 Food 3 = Grassland 2 + Wheat 1`. */
export function explainYields(ctx: TileContext, breakdown: YieldBreakdown): string[] {
  return Object.keys(breakdown.total).map((id) => {
    const y = ctx.content.entities.yield[id];
    const parts = breakdown.lines[id]!.map(
      (l, i) =>
        `${i === 0 ? '' : l.amount < 0 ? '- ' : '+ '}${l.label} ${formatFixed(i === 0 ? l.amount : Math.abs(l.amount))}`,
    );
    const name = y ? resolveText(ctx.content, y.name) : id;
    return `${y?.icon ?? ''} ${name} ${formatFixed(breakdown.total[id]!)} = ${parts.join(' ')}`.trim();
  });
}
