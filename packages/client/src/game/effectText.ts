import { type CompiledContent, resolveText } from '@cx/content';

/**
 * Plain-language lines for content effects (`{ effect, params, target }`), so the Civilopedia can
 * say what a building, policy, belief or ability actually does. The common effects read as
 * sentences; any other (a mod's, or a new one) falls back to its name and values, so nothing is
 * ever left out.
 */

interface EffectLike {
  effect: string;
  params?: Record<string, unknown> | undefined;
  target?: { scope?: string; owner?: string } | undefined;
  condition?: Record<string, unknown> | undefined;
}

const names = new WeakMap<CompiledContent, Map<string, string>>();

/** Every content id's display name. */
function nameIndex(content: CompiledContent): Map<string, string> {
  let map = names.get(content);
  if (map) return map;
  map = new Map();
  for (const group of Object.values(content.entities)) {
    for (const [id, def] of Object.entries(group as Record<string, { name?: string }>)) {
      if (def && typeof def.name === 'string') map.set(id, resolveText(content, def.name));
    }
  }
  names.set(content, map);
  return map;
}

const humanize = (id: string) => {
  const s = id.replace(/^[a-z]+_(?=[a-z])/i, '').replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const plural = (n: number, word: string) => `${n} ${word}${Math.abs(n) === 1 ? '' : 's'}`;

export function effectLines(
  content: CompiledContent,
  effects: readonly EffectLike[] | undefined,
): string[] {
  if (!effects) return [];
  const idx = nameIndex(content);
  const nm = (v: unknown): string =>
    typeof v === 'string'
      ? (idx.get(v) ?? humanize(v))
      : v && typeof v === 'object' && typeof (v as { kind?: unknown }).kind === 'string'
        ? humanize((v as { kind: string }).kind) + 's'
        : String(v);
  const lower = (v: unknown) => nm(v).toLowerCase();
  return effects.map((e) => {
    const line = one(e);
    const cond = e.condition
      ? Object.entries(e.condition).map(([k, v]) => `${humanize(k).toLowerCase()} ${nm(v)}`)
      : [];
    return cond.length ? `${line} (needs: ${cond.join(', ')})` : line;
  });

  function one(e: EffectLike): string {
    const p = (e.params ?? {}) as Record<string, unknown>;
    const num = (k: string) => (typeof p[k] === 'number' ? (p[k] as number) : undefined);
    const scope = e.target?.scope;
    const where =
      scope === 'settlements'
        ? ' in each settlement'
        : scope === 'units'
          ? ' for your units'
          : scope === 'tiles'
            ? e.target?.owner === 'self'
              ? ' on your tiles'
              : ' on tiles'
            : '';
    const amount = num('amount');
    const percent = num('percent');
    switch (e.effect) {
      case 'modify_yield': {
        const y = lower(p.yield);
        if (amount !== undefined && percent !== undefined)
          return `${signed(amount)} and ${signed(percent)}% ${y}${where}`;
        return percent !== undefined
          ? `${signed(percent)}% ${y}${where}`
          : `${signed(amount ?? 0)} ${y}${where}`;
      }
      case 'modify_production':
        return `${signed(percent ?? 0)}% production toward ${lower(p.toward)}${where}`;
      case 'modify_item_cost':
        return `${signed(percent ?? 0)}% cost of ${lower(p.toward)}`;
      case 'modify_purchase_cost':
        return `${signed(percent ?? 0)}% cost to buy things with gold`;
      case 'modify_growth':
        return `${signed(percent ?? 0)}% growth${where}`;
      case 'modify_happiness':
        return `${signed(amount ?? 0)} happiness${where}`;
      case 'modify_loyalty':
        return `${signed(amount ?? 0)} loyalty${where}`;
      case 'modify_loyalty_pressure':
        return `${signed(percent ?? 0)}% loyalty pressure${where}`;
      case 'modify_border_growth':
        return `${signed(percent ?? 0)}% border growth${where}`;
      case 'modify_boost':
        return `${signed(percent ?? 0)}% from eurekas and inspirations`;
      case 'modify_settlement_limit':
        return `${signed(amount ?? 0)} settlement limit`;
      case 'modify_unit_upkeep':
        return `${signed(percent ?? 0)}% unit upkeep`;
      case 'modify_strength': {
        const who = p.unitClass
          ? ` for ${lower(p.unitClass)} units`
          : p.unit
            ? ` for ${lower(p.unit)}`
            : '';
        const bits = [
          p.vs ? `against ${lower(p.vs)}` : '',
          p.when ? `when ${String(p.when).replace(/_/g, ' ')}` : '',
          p.on ? `on ${String(p.on).replace(/_/g, ' ')}` : '',
          num('afterDeclaringWar')
            ? `for ${num('afterDeclaringWar')} turns after declaring war`
            : '',
        ].filter(Boolean);
        return `${signed(amount ?? 0)} strength${who}${bits.length ? ` ${bits.join(', ')}` : ''}`;
      }
      case 'great_person_points':
        return `${signed(amount ?? 0)} ${lower(p.class)} point${amount === 1 ? '' : 's'} per turn`;
      case 'great_person_points_percent':
        return `${signed(percent ?? 0)}% ${lower(p.class)} points`;
      case 'extra_policy_slot':
        return `${signed(amount ?? 1)} ${String(p.slot)} policy slot${amount === 1 ? '' : 's'}`;
      case 'extra_trade_route':
        return `${signed(amount ?? 1)} trade route${amount === 1 ? '' : 's'}`;
      case 'grant_envoys':
        return `${plural(amount ?? 1, 'envoy')}`;
      case 'grant_promotion':
        return `Units${p.unitClass ? ` of ${lower(p.unitClass)}` : p.domain ? ` at ${String(p.domain)}` : ''} start with ${nm(p.promotion)}`;
      case 'free_building':
        return `A free ${lower(p.building)} in new settlements`;
      case 'free_unit_on_district':
        return `A free ${lower(p.unitClass)} unit with a new ${lower(p.district)}`;
      case 'diplomatic_favor':
        return `${signed(amount ?? 0)} diplomatic favor per turn`;
      case 'diplomatic_points':
        return `${signed(amount ?? 0)} diplomatic victory points`;
      case 'influence_per_deal':
        return `${signed(amount ?? 0)} influence for every deal made`;
      case 'road_to_capital':
        return 'New settlements get a road to the capital';
      case 'yield_per_adjacent':
        return `${signed(amount ?? 0)} ${lower(p.yield)} per ${num('per') ?? 1} adjacent ${lower(p.of ?? 'tile')}${where}`;
      case 'yield_per_follower':
        return `${signed(amount ?? 0)} ${lower(p.yield)} per ${num('per') ?? 1} follower${(num('per') ?? 1) === 1 ? '' : 's'}`;
      case 'capture_on_kill':
        return `${percent ?? 0}% chance to capture defeated ${lower(p.unitClass)} units`;
      case 'on_capture': {
        const bits = [
          num('goldPerCitizen') ? `${num('goldPerCitizen')} gold per citizen` : '',
          num('healUnits') ? `heal units ${num('healUnits')}` : '',
          num('boostsPerDistrict') ? `${num('boostsPerDistrict')} boosts per district` : '',
        ].filter(Boolean);
        return `Capturing a settlement: ${bits.join(', ')}`;
      }
      case 'trade_reveals':
        return `Trade routes reveal tiles within ${num('radius') ?? 1}`;
      case 'commander_bonus':
        return `Commander bonus: ${[
          num('strength') ? `${signed(num('strength')!)} strength` : '',
          num('xpPercent') ? `${signed(num('xpPercent')!)}% experience` : '',
        ]
          .filter(Boolean)
          .join(', ')}`;
      default: {
        const rest = Object.entries(p)
          .map(
            ([k, v]) =>
              `${humanize(k).toLowerCase()} ${typeof v === 'object' ? JSON.stringify(v) : nm(v)}`,
          )
          .join(', ');
        return `${humanize(e.effect)}${rest ? `: ${rest}` : ''}${where}`;
      }
    }
  }
}
