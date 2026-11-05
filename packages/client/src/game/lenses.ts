import { resolveText } from '@cx/content';
import {
  type EngineContext,
  type GameState,
  loyaltyOf,
  loyaltyOn,
  type PlayerId,
  pressureAt,
  settleSites,
  tileYields,
} from '@cx/engine';
import type { TileHighlight } from '../map/renderer';
import { playerColors } from './model';

/** Map lenses: overlays that answer one question about every tile at a glance. */
export type Lens = 'none' | 'yields' | 'settler' | 'resources' | 'religion' | 'loyalty';

export const LENSES: readonly Lens[] = [
  'none',
  'yields',
  'settler',
  'resources',
  'religion',
  'loyalty',
];

export const LENS_NAMES: Record<Lens, string> = {
  none: 'No lens',
  yields: 'Yields',
  settler: 'Settling',
  resources: 'Resources',
  religion: 'Religion',
  loyalty: 'Loyalty',
};

/** What each lens shows, in a line (the picker and its tooltip). */
export const LENS_ABOUT: Record<Lens, string> = {
  none: 'The map as it is.',
  yields: 'What each of your tiles gives when worked.',
  settler: 'The best places you know for a new settlement, ranked.',
  resources: 'Every resource you know of, by kind.',
  religion: 'Which religion each settlement follows.',
  loyalty: 'Whose people pull hardest on each tile, and each settlement’s loyalty.',
};

export const LENS_ICONS: Record<Lens, string> = {
  none: 'lens',
  yields: 'food',
  settler: 'settler',
  resources: 'diamonds',
  religion: 'religion',
  loyalty: 'diplomacy',
};

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** The legend shown under the minimap while a lens is on. */
export function lensLegend(
  state: GameState,
  lens: Lens,
): { label: string; color: string; mark?: string }[] {
  switch (lens) {
    case 'settler':
      return [
        { label: 'Best three', color: hex(BEST_SITE), mark: '1' },
        { label: 'Good sites', color: '#c9d0d4', mark: '4' },
      ];
    case 'resources':
      return [
        { label: 'Bonus', color: hex(RESOURCE_COLORS.bonus) },
        { label: 'Luxury', color: hex(RESOURCE_COLORS.luxury) },
        { label: 'Strategic', color: hex(RESOURCE_COLORS.strategic) },
      ];
    case 'religion': {
      const order = Object.keys(state.religions);
      const known = order.map((id, i) => ({
        label: state.religions[id]!.name,
        color: hex(RELIGION_COLORS[i % RELIGION_COLORS.length]!),
      }));
      return known.length > 0 ? known : [{ label: 'No religion founded yet', color: '#5b6b7a' }];
    }
    case 'loyalty':
      return [
        { label: 'Gaining', color: '#9fd36a' },
        { label: 'Losing', color: '#e0503c' },
        { label: 'Steadfast', color: '#c9d0d4', mark: '◆' },
      ];
    case 'yields':
      return [{ label: 'Food, production, gold… per worked tile', color: '#5f9b33' }];
    default:
      return [];
  }
}

/** Loyalty lens: which side's people pull hardest on each tile, and each settlement's loyalty. */
function loyaltyLens(
  ctx: EngineContext,
  state: GameState,
  fog: Uint8Array,
  colors: Record<PlayerId, { main: number }>,
): TileHighlight[] {
  if (!loyaltyOn(state)) return [];
  const out: TileHighlight[] = [];
  const percents = new Map<PlayerId, number>();
  state.map.tiles.forEach((t, tile) => {
    if (fog[tile] === 0) return;
    const s = t.settlement !== null ? state.settlements[t.settlement] : undefined;
    if (s && s.tile === tile) {
      const r = loyaltyOf(ctx, state, s, percents);
      const label = r.steadfast
        ? '◆'
        : `${r.loyalty} ${r.change > 0 ? '+' : r.change < 0 ? '−' : '±'}${Math.abs(r.change)}`;
      out.push({ tile, tone: 'lens', label, color: r.change < 0 ? 0xe0503c : 0x9fd36a });
      return;
    }
    let best: { id: PlayerId; push: number } | null = null;
    for (const [id, push] of pressureAt(ctx, state, tile, percents))
      if (!best || push > best.push || (push === best.push && id < best.id)) best = { id, push };
    if (best && best.push > 0)
      out.push({ tile, tone: 'lens', color: colors[best.id]?.main ?? 0x9a9a9a });
  });
  return out;
}

/** Religions get the graphs' categorical colors, in founding order. */
const RELIGION_COLORS = [
  0x3987e5, 0xd95926, 0x199e70, 0xc98500, 0xd55181, 0x008300, 0x9085e9, 0xe66767,
];
const BEST_SITE = 0xf2c14e;
/** The same resource colors as the 2D map's resource dots. */
const RESOURCE_COLORS = { bonus: 0xe8dcb0, luxury: 0xd18cf0, strategic: 0xf07a5a } as const;

/** The tiles a lens marks, with labels (only what the viewer has explored). */
export function lensFor(
  ctx: EngineContext,
  state: GameState,
  viewer: PlayerId,
  fog: Uint8Array,
  lens: Lens,
): TileHighlight[] {
  switch (lens) {
    case 'none':
      return [];
    case 'loyalty':
      return loyaltyLens(ctx, state, fog, playerColors(ctx.content, state));
    case 'yields': {
      // What each of the viewer's tiles gives if worked.
      const out: TileHighlight[] = [];
      state.map.tiles.forEach((t, tile) => {
        if (t.owner !== viewer) return;
        const total = tileYields(ctx, state, tile, viewer).total;
        const label = Object.keys(total)
          .filter((y) => total[y]! > 0)
          .map((y) => `${Math.floor(total[y]! / 100)}${ctx.content.entities.yield[y]?.icon ?? ''}`)
          .join('');
        if (label) out.push({ tile, tone: 'lens', label });
      });
      return out;
    }
    case 'settler':
      // The best places the viewer knows of for a new settlement, ranked.
      return settleSites(ctx, state, viewer).map((s, i) => ({
        tile: s.tile,
        tone: 'lens',
        label: `${i + 1}`,
        ...(i < 3 ? { color: BEST_SITE } : {}),
      }));
    case 'resources': {
      // Every known resource by name, colored bonus / luxury / strategic.
      const out: TileHighlight[] = [];
      state.map.tiles.forEach((t, tile) => {
        const def =
          t.resource === null || fog[tile] === 0
            ? undefined
            : ctx.content.entities.resource[t.resource];
        if (def)
          out.push({
            tile,
            tone: 'lens',
            color: RESOURCE_COLORS[def.class],
            label: resolveText(ctx.content, def.name),
          });
      });
      return out;
    }
    case 'religion': {
      // Every known settlement's territory in the color of the religion it follows.
      const order = Object.keys(state.religions);
      const out: TileHighlight[] = [];
      state.map.tiles.forEach((t, tile) => {
        if (t.settlement === null || fog[tile] === 0) return;
        const s = state.settlements[t.settlement];
        const religion = s?.religion ? state.religions[s.religion] : undefined;
        if (!s || !religion) return;
        const color = RELIGION_COLORS[order.indexOf(religion.id) % RELIGION_COLORS.length]!;
        out.push({
          tile,
          tone: 'lens',
          color,
          ...(s.tile === tile ? { label: religion.name } : {}),
        });
      });
      return out;
    }
  }
}
