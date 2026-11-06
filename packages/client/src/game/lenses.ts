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

/** What a lens's colors and labels mean, shown under the picker. */
export const LENS_LEGENDS: Record<Lens, { color?: string; text: string }[]> = {
  none: [],
  yields: [{ text: 'What each explored tile gives when worked (improvements included)' }],
  settler: [
    { color: '#f2c14e', text: 'The three best places you know for a settlement' },
    { text: '★n: further good sites, ranked' },
  ],
  districts: [
    {
      color: '#7fc4ff',
      text: 'The specialty district with the best adjacency on each free tile of yours',
    },
    {
      text: 'Cp Campus · HS Holy Site · Th Theater · CH Commercial Hub · Hb Harbor · IZ Industrial Zone',
    },
  ],
  appeal: [
    { color: '#6fcf7a', text: 'Breathtaking or charming (national parks, resorts, Neighborhoods)' },
    { color: '#c8c8a0', text: 'Average' },
    { color: '#e0705a', text: 'Uninviting or disgusting' },
  ],
  resources: [
    { color: '#e8dcb0', text: 'Bonus' },
    { color: '#d18cf0', text: 'Luxury (happiness; spares can be traded)' },
    { color: '#f07a5a', text: 'Strategic (stockpiles for units)' },
  ],
  empire: [{ text: "Each civilization's land in its color, with its settlements" }],
  continents: [
    { text: 'Each landmass you know in its own color (home-continent abilities read them)' },
  ],
  military: [
    { color: '#e0503c', text: "Enemies' zone of control (moving in ends your move)" },
    { color: '#f0a040', text: 'Units of civs you are not at war with' },
    { color: '#6fb0f0', text: 'Your soldiers' },
  ],
  trade: [{ text: "Trade routes you know of, in their owner's color, with where they lead" }],
  religion: [{ text: "Each settlement's land in the color of the religion it follows" }],
  loyalty: [
    { color: '#9fd36a', text: 'Settlement loyalty rising (◆: steadfast)' },
    { color: '#e0503c', text: 'Loyalty falling' },
    { text: 'Tiles: whose people pull hardest there' },
  ],
  wonders: [{ color: '#f2c14e', text: 'Natural wonders you have found' }],
};

const CATEGORICAL = [
  0x3987e5, 0xd95926, 0x199e70, 0xc98500, 0xd55181, 0x008300, 0x9085e9, 0xe66767,
];
const hex = (s: string) => parseInt(s.slice(1), 16);

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
        label: `★${i + 1}`,
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
          color: hex('#f2c14e'),
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
