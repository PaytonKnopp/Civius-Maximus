import { resolveText } from '@cx/content';
import type { EngineContext } from '../context';
import { distance, tilesWithin } from '../map/hex';
import { memoRead } from '../progress/sources';
import type { GameState, PlayerId, SettlementId } from '../state';

/**
 * Luxuries (docs/03-core-mechanics.md, "Resources"): an improved luxury cheers the settlement
 * that owns it and the nearest few of its owner's other settlements
 * (`rules.luxuryHappinessRadius`, nearest first, ties by id). A settlement counts each kind of
 * luxury once however many reach it, so variety pays and spare copies are for trading.
 */

/** One kind of luxury a settlement enjoys, and where it comes from (null: its own land). */
export interface LuxuryReach {
  resource: string;
  from: SettlementId | null;
}

/** The improved luxuries on a settlement's own tiles, one entry per kind. */
export function ownLuxuries(ctx: EngineContext, state: GameState, id: SettlementId): string[] {
  const s = state.settlements[id];
  if (!s) return [];
  const kinds = new Set<string>();
  for (const t of tilesWithin(state.map, s.tile, ctx.content.rules.settlements.ownRadius)) {
    const tile = state.map.tiles[t]!;
    if (tile.settlement !== id || tile.resource === null || tile.improvement === null) continue;
    const res = ctx.content.entities.resource[tile.resource]!;
    if (res.class !== 'luxury' || res.happiness <= 0) continue;
    const imp = ctx.content.entities.improvement[tile.improvement];
    if (imp?.resources.includes(res.id)) kinds.add(res.id);
  }
  return [...kinds].sort();
}

/** Every luxury kind each of a player's settlements enjoys (their own first, then shared). */
export function luxuriesOf(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
): Map<SettlementId, LuxuryReach[]> {
  return memoRead(state, `luxuries:${player}`, () => computeLuxuries(ctx, state, player));
}

function computeLuxuries(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
): Map<SettlementId, LuxuryReach[]> {
  const mine = Object.keys(state.settlements)
    .filter((id) => state.settlements[id]!.owner === player)
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)) || (a < b ? -1 : 1));
  const reach = ctx.content.rules.luxuryHappinessRadius;
  const out = new Map<SettlementId, LuxuryReach[]>(mine.map((id) => [id, []]));
  const has = (id: SettlementId, resource: string) =>
    out.get(id)!.some((l) => l.resource === resource);
  const own = new Map(mine.map((id) => [id, ownLuxuries(ctx, state, id)]));
  for (const id of mine)
    for (const r of own.get(id)!) out.get(id)!.push({ resource: r, from: null });
  for (const id of mine) {
    const kinds = own.get(id)!;
    if (kinds.length === 0 || reach <= 0) continue;
    const here = state.settlements[id]!.tile;
    const nearest = mine
      .filter((o) => o !== id)
      .map((o) => ({ o, d: distance(state.map, here, state.settlements[o]!.tile) }))
      .sort((a, b) => a.d - b.d || Number(a.o.slice(1)) - Number(b.o.slice(1)))
      .slice(0, reach);
    for (const { o } of nearest)
      for (const r of kinds) if (!has(o, r)) out.get(o)!.push({ resource: r, from: id });
  }
  return out;
}

/** Happiness lines for a settlement's luxuries, for its "why?" breakdown. */
export function luxuryLines(
  ctx: EngineContext,
  state: GameState,
  id: SettlementId,
): { label: string; amount: number }[] {
  const s = state.settlements[id];
  if (!s) return [];
  return (luxuriesOf(ctx, state, s.owner).get(id) ?? []).map((l) => {
    const res = ctx.content.entities.resource[l.resource]!;
    const name = resolveText(ctx.content, res.name);
    const from = l.from ? state.settlements[l.from]?.name : undefined;
    return { label: from ? `${name} (from ${from})` : name, amount: res.happiness };
  });
}
