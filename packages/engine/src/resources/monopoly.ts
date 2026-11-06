import { resolveText } from '@cx/content';
import type { EngineContext } from '../context';
import type { EffectSource } from '../effects/yields';
import type { MapTile } from '../map/types';
import { memoRead } from '../progress/sources';
import type { GameState, PlayerId } from '../state';

/**
 * Monopolies (D118, light; docs/03-core-mechanics.md, "Resources"): a player whose land holds
 * more than `rules.monopoly.sharePercent` of the map's tiles of a luxury, with at least
 * `minCopies` of them improved, gets that luxury's `monopoly` effects across the empire. Only
 * improved tiles in their land count toward the share.
 */

/** Per content, per (frozen) tile array: every player's monopolies. */
const cache = new WeakMap<object, WeakMap<readonly MapTile[], Map<PlayerId, string[]>>>();

/** Every player's monopolies (luxury ids, sorted). */
export function monopolies(ctx: EngineContext, state: GameState): Map<PlayerId, string[]> {
  const tiles = state.map.tiles;
  if (Object.isFrozen(tiles)) {
    let byTiles = cache.get(ctx.content);
    if (!byTiles) cache.set(ctx.content, (byTiles = new WeakMap()));
    const known = byTiles.get(tiles);
    if (known) return known;
    const out = computeMonopolies(ctx, state);
    byTiles.set(tiles, out);
    return out;
  }
  return memoRead(state, 'monopolies', () => computeMonopolies(ctx, state));
}

function computeMonopolies(ctx: EngineContext, state: GameState): Map<PlayerId, string[]> {
  const { sharePercent, minCopies } = ctx.content.rules.monopoly;
  const total: Record<string, number> = {};
  const held: Record<string, Record<PlayerId, number>> = {};
  for (const tile of state.map.tiles) {
    if (tile.resource === null) continue;
    const res = ctx.content.entities.resource[tile.resource];
    if (!res || res.class !== 'luxury' || res.monopoly.length === 0) continue;
    total[res.id] = (total[res.id] ?? 0) + 1;
    if (tile.owner === null || tile.improvement === null) continue;
    if (!ctx.content.entities.improvement[tile.improvement]?.resources.includes(res.id)) continue;
    const row = (held[res.id] ??= {});
    row[tile.owner] = (row[tile.owner] ?? 0) + 1;
  }
  const out = new Map<PlayerId, string[]>();
  for (const r of Object.keys(held).sort()) {
    for (const [player, n] of Object.entries(held[r]!)) {
      if (n < minCopies || n * 100 <= total[r]! * sharePercent) continue;
      out.set(player, [...(out.get(player) ?? []), r]);
    }
  }
  return out;
}

/** A player's monopolies as effect sources ("Silk monopoly"). */
export function monopolySources(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
): EffectSource[] {
  return (monopolies(ctx, state).get(player) ?? []).map((r) => {
    const res = ctx.content.entities.resource[r]!;
    return {
      id: `monopoly:${r}`,
      label: `${resolveText(ctx.content, res.name)} monopoly`,
      effects: res.monopoly,
    };
  });
}

/** How many of a luxury's tiles a player holds improved, of all on the map. */
export function monopolyShare(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  resource: string,
): { held: number; total: number } {
  let held = 0;
  let total = 0;
  for (const tile of state.map.tiles) {
    if (tile.resource !== resource) continue;
    total++;
    if (tile.owner !== player || tile.improvement === null) continue;
    if (ctx.content.entities.improvement[tile.improvement]?.resources.includes(resource)) held++;
  }
  return { held, total };
}
