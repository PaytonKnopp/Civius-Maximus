import { resolveText } from '@cx/content';
import {
  type EngineContext,
  type GameState,
  type PlayerId,
  settleSites,
  tileYields,
} from '@cx/engine';
import type { TileHighlight } from '../map/renderer';

/** Map lenses: overlays that answer one question about every tile at a glance. */
export type Lens = 'none' | 'yields' | 'settler' | 'resources' | 'religion';

export const LENSES: readonly Lens[] = ['none', 'yields', 'settler', 'resources', 'religion'];

export const LENS_NAMES: Record<Lens, string> = {
  none: 'No lens',
  yields: 'Yields',
  settler: 'Settling',
  resources: 'Resources',
  religion: 'Religion',
};

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
