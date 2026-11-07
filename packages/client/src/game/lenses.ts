import { resolveText } from '@cx/content';
import {
  appealOf,
  appealWord,
  atWar,
  continentsOf,
  districtYields,
  type EngineContext,
  type GameState,
  loyaltyOf,
  loyaltyOn,
  neighbors,
  type PlayerId,
  placementFits,
  pressureAt,
  settleSites,
  tileYields,
  unitClassOf,
} from '@cx/engine';
import type { TileHighlight } from '../map/renderer';
import { playerColors } from './model';

/** Map lenses: overlays that answer one question about every tile at a glance. */
export type Lens =
  | 'none'
  | 'yields'
  | 'settler'
  | 'districts'
  | 'appeal'
  | 'resources'
  | 'empire'
  | 'continents'
  | 'military'
  | 'trade'
  | 'religion'
  | 'loyalty'
  | 'wonders';

export const LENSES: readonly Lens[] = [
  'none',
  'yields',
  'settler',
  'districts',
  'appeal',
  'resources',
  'empire',
  'continents',
  'military',
  'trade',
  'religion',
  'loyalty',
  'wonders',
];

export const LENS_NAMES: Record<Lens, string> = {
  none: 'No lens',
  yields: 'Yields',
  settler: 'Settling',
  districts: 'District adjacency',
  appeal: 'Appeal',
  resources: 'Resources',
  empire: 'Empires',
  continents: 'Continents',
  military: 'Military',
  trade: 'Trade routes',
  religion: 'Religion',
  loyalty: 'Loyalty',
  wonders: 'Natural wonders',
};

/** What each lens shows, in a line (the picker and its tooltip). */
export const LENS_ABOUT: Record<Lens, string> = {
  none: 'The map as it is.',
  yields: 'What each explored tile gives when worked (improvements included).',
  settler: 'The best places you know for a new settlement, ranked.',
  districts: 'The specialty district with the best adjacency on each free tile of yours.',
  appeal: 'How pleasant each tile is: national parks, resorts and Neighborhoods want it high.',
  resources: 'Every resource you know of, by kind.',
  empire: "Each civilization's land in its color, with its settlements.",
  continents: 'Each landmass you know in its own color.',
  military: "Enemies' zones of control, other civs' units and your soldiers.",
  trade: "Trade routes you know of, in their owner's color, with where they lead.",
  religion: 'Which religion each settlement follows.',
  loyalty: 'Whose people pull hardest on each tile, and each settlement’s loyalty.',
  wonders: 'Natural wonders you have found.',
};

export const LENS_ICONS: Record<Lens, string> = {
  none: 'lens',
  yields: 'food',
  settler: 'settler',
  districts: 'district_campus',
  appeal: 'improvement_national_park',
  resources: 'diamonds',
  empire: 'capital',
  continents: 'globe',
  military: 'war',
  trade: 'trade',
  religion: 'religion',
  loyalty: 'diplomacy',
  wonders: 'wonder',
};

const CATEGORICAL = [
  0x3987e5, 0xd95926, 0x199e70, 0xc98500, 0xd55181, 0x008300, 0x9085e9, 0xe66767,
];
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
/** A `#rrggbb` color as a number, for map highlights. */
const fromHex = (s: string) => parseInt(s.slice(1), 16);

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
    case 'districts':
      return [
        { label: 'Best adjacency', color: '#7fc4ff' },
        { label: 'Cp Campus · HS Holy Site · Th Theater', color: '#c9d0d4' },
        { label: 'CH Commercial Hub · Hb Harbor · IZ Industrial Zone', color: '#c9d0d4' },
      ];
    case 'appeal':
      return [
        { label: 'Breathtaking or charming', color: '#6fcf7a' },
        { label: 'Average', color: '#c8c8a0' },
        { label: 'Uninviting or disgusting', color: '#e0705a' },
      ];
    case 'resources':
      return [
        { label: 'Bonus', color: hex(RESOURCE_COLORS.bonus) },
        { label: 'Luxury (happiness; spares trade)', color: hex(RESOURCE_COLORS.luxury) },
        { label: 'Strategic (stockpiles for units)', color: hex(RESOURCE_COLORS.strategic) },
      ];
    case 'military':
      return [
        { label: "Enemies' zone of control", color: '#e0503c' },
        { label: 'Units of civs not at war with you', color: '#f0a040' },
        { label: 'Your soldiers', color: '#6fb0f0' },
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
    case 'wonders':
      return [{ label: 'Natural wonders you have found', color: '#f2c14e' }];
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
/** A religion's color on the map and in the Religion screen (founding order). */
export function religionColor(state: GameState, id: string): string {
  const i = Math.max(0, Object.keys(state.religions).indexOf(id));
  return `#${RELIGION_COLORS[i % RELIGION_COLORS.length]!.toString(16).padStart(6, '0')}`;
}
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
      // What each explored land or coast tile gives if worked.
      const out: TileHighlight[] = [];
      state.map.tiles.forEach((t, tile) => {
        if (fog[tile] === 0 || (t.owner !== null && t.owner !== viewer && fog[tile] !== 2)) return;
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
    case 'districts': {
      // On each free tile of the viewer's: the specialty district with the best adjacency.
      const out: TileHighlight[] = [];
      const ids = ctx.content.ids.district.filter((id) => {
        const d = ctx.content.entities.district[id]!;
        return d.specialty && d.adjacency.length > 0 && !d.civ;
      });
      state.map.tiles.forEach((t, tile) => {
        if (t.owner !== viewer || t.settlement === null) return;
        if (t.district !== null || t.wonder !== null) return;
        if (state.settlements[t.settlement]?.tile === tile) return;
        let best: { icon: string; amount: number } | undefined;
        for (const id of ids) {
          const def = ctx.content.entities.district[id]!;
          if (!placementFits(ctx, state, tile, def.placement)) continue;
          // Adjacency: everything the tile adds beyond the district's own flat yields.
          const total = districtYields(ctx, state, tile, id).total;
          const flat = Object.values(def.yields).reduce((n, v) => n + v * 100, 0);
          const amount = Object.values(total).reduce((n, v) => n + v, 0) - flat;
          if (!best || amount > best.amount) best = { icon: def.icon, amount };
        }
        if (best && best.amount >= 200)
          out.push({
            tile,
            tone: 'lens',
            color: best.amount >= 400 ? 0x3fa0ff : 0x7fc4ff,
            label: `${best.icon}+${Math.floor(best.amount / 100)}`,
          });
      });
      return out;
    }
    case 'appeal': {
      const out: TileHighlight[] = [];
      state.map.tiles.forEach((t, tile) => {
        if (fog[tile] === 0 || ctx.content.entities.terrain[t.terrain]?.water) return;
        const a = appealOf(ctx, state, tile);
        const r = ctx.content.rules.appeal;
        const color = a >= r.charming ? 0x6fcf7a : a <= r.uninviting ? 0xe0705a : 0xc8c8a0;
        out.push({
          tile,
          tone: 'lens',
          color,
          label: `${a > 0 ? '+' : ''}${a} ${appealWord(ctx, a)[0]}`,
        });
      });
      return out;
    }
    case 'empire': {
      const colors = playerColors(ctx.content, state);
      const out: TileHighlight[] = [];
      state.map.tiles.forEach((t, tile) => {
        if (fog[tile] === 0 || t.owner === null) return;
        const s = t.settlement !== null ? state.settlements[t.settlement] : undefined;
        out.push({
          tile,
          tone: 'lens',
          color: colors[t.owner]?.main ?? 0x9a9a9a,
          ...(s && s.tile === tile ? { label: s.name } : {}),
        });
      });
      return out;
    }
    case 'continents': {
      const ids = continentsOf(ctx, state.map);
      const out: TileHighlight[] = [];
      state.map.tiles.forEach((_t, tile) => {
        if (fog[tile] === 0 || ids[tile]! < 0) return;
        out.push({ tile, tone: 'lens', color: CATEGORICAL[ids[tile]! % CATEGORICAL.length]! });
      });
      return out;
    }
    case 'military': {
      // Zones of control of the enemies you can see, and who stands where.
      const out = new Map<number, TileHighlight>();
      for (const u of Object.values(state.units)) {
        if (fog[u.tile] !== 2 || !unitClassOf(ctx, u).combat) continue;
        if (u.owner === viewer) {
          out.set(u.tile, { tile: u.tile, tone: 'lens', color: 0x6fb0f0 });
          continue;
        }
        const enemy = atWar(state, viewer, u.owner) || u.owner === 'hostile';
        if (!enemy) {
          if (!out.has(u.tile)) out.set(u.tile, { tile: u.tile, tone: 'lens', color: 0xf0a040 });
          continue;
        }
        out.set(u.tile, { tile: u.tile, tone: 'lens', color: 0xe0503c, label: '⚔' });
        for (const n of neighbors(state.map, u.tile))
          if (fog[n] !== 0 && !out.has(n)) out.set(n, { tile: n, tone: 'lens', color: 0xe0503c });
      }
      return [...out.values()];
    }
    case 'trade': {
      const colors = playerColors(ctx.content, state);
      const out = new Map<number, TileHighlight>();
      for (const r of state.routes ?? []) {
        const color = colors[r.owner]?.main ?? 0x9a9a9a;
        for (const tile of r.path)
          if (fog[tile] !== 0) out.set(tile, { tile, tone: 'lens', color });
        const dest = state.settlements[r.to];
        if (dest && fog[dest.tile] !== 0)
          out.set(dest.tile, { tile: dest.tile, tone: 'lens', color, label: `→ ${dest.name}` });
      }
      return [...out.values()];
    }
    case 'wonders': {
      const out: TileHighlight[] = [];
      state.map.tiles.forEach((t, tile) => {
        const f = t.feature ? ctx.content.entities.feature[t.feature] : undefined;
        if (fog[tile] === 0 || !f?.naturalWonder) return;
        out.push({
          tile,
          tone: 'lens',
          color: fromHex('#f2c14e'),
          label: resolveText(ctx.content, f.name),
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
