import { resolveText } from '@cx/content';
import type { EngineContext } from '../context';
import { tradedBy } from '../diplomacy/pacts';
import { distance, tilesWithin } from '../map/hex';
import { memoRead } from '../progress/sources';
import type { GameState, PlayerId, SettlementId } from '../state';

/**
 * Luxuries (docs/03-core-mechanics.md, "Resources"): an improved luxury cheers the settlement
 * that owns it and the nearest few of its owner's other settlements
 * (`rules.luxuryHappinessRadius`, nearest first, ties by id). A settlement counts each kind of
 * luxury once however many reach it, so variety pays and spare copies are for trading: each
 * improved tile is one copy, a copy sent away in a deal (D118) stops counting at home (spares
 * go first, then the newest settlement's), and one that arrives reaches the capital and its
 * nearest few settlements.
 */

/** One kind of luxury a settlement enjoys, and where it comes from (null: its own land). */
export interface LuxuryReach {
  resource: string;
  from: SettlementId | null;
  /** A copy another player sends in a deal. */
  fromPlayer?: PlayerId;
}

/** Improved luxury tiles on a settlement's own land, per kind. */
function luxuryTiles(
  ctx: EngineContext,
  state: GameState,
  id: SettlementId,
): Record<string, number> {
  const s = state.settlements[id];
  const out: Record<string, number> = {};
  if (!s) return out;
  for (const t of tilesWithin(state.map, s.tile, ctx.content.rules.settlements.ownRadius)) {
    const tile = state.map.tiles[t]!;
    if (tile.settlement !== id || tile.resource === null || tile.improvement === null) continue;
    const res = ctx.content.entities.resource[tile.resource]!;
    if (res.class !== 'luxury' || res.happiness <= 0) continue;
    const imp = ctx.content.entities.improvement[tile.improvement];
    if (imp?.resources.includes(res.id)) out[res.id] = (out[res.id] ?? 0) + 1;
  }
  return out;
}

/** The improved luxuries on a settlement's own tiles, one entry per kind. */
export function ownLuxuries(ctx: EngineContext, state: GameState, id: SettlementId): string[] {
  return Object.keys(luxuryTiles(ctx, state, id)).sort();
}

/** A player's settlements, oldest first. */
function settlementsOf(state: GameState, player: PlayerId): SettlementId[] {
  return Object.keys(state.settlements)
    .filter((id) => state.settlements[id]!.owner === player)
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)) || (a < b ? -1 : 1));
}

/** Copies of each luxury a player has: one per improved tile, whether or not it's sent away. */
export function luxuryCopies(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of settlementsOf(state, player))
    for (const [r, n] of Object.entries(luxuryTiles(ctx, state, id))) out[r] = (out[r] ?? 0) + n;
  return out;
}

/** Copies of a luxury a player can still offer in a deal: all but one, less those already sent. */
export function spareLuxury(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  resource: string,
): number {
  const copies = luxuryCopies(ctx, state, player)[resource] ?? 0;
  const sent = tradedBy(ctx, state, player, 'from')[resource] ?? 0;
  return Math.max(0, copies - sent - 1);
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
  const mine = settlementsOf(state, player);
  const reach = ctx.content.rules.luxuryHappinessRadius;
  const out = new Map<SettlementId, LuxuryReach[]>(mine.map((id) => [id, []]));
  const has = (id: SettlementId, resource: string) =>
    out.get(id)!.some((l) => l.resource === resource);
  const tiles = new Map(mine.map((id) => [id, luxuryTiles(ctx, state, id)]));
  // Copies sent away: first a settlement's second copies, then whole kinds, newest first.
  const sent = tradedBy(ctx, state, player, 'from', 'luxury');
  for (const r of Object.keys(sent).sort()) {
    let left = sent[r]!;
    for (const pass of [2, 1])
      for (const id of [...mine].reverse()) {
        const counts = tiles.get(id)!;
        while (left > 0 && (counts[r] ?? 0) >= pass) {
          counts[r]! -= 1;
          left -= 1;
        }
      }
  }
  const own = new Map(
    mine.map((id) => [
      id,
      Object.keys(tiles.get(id)!)
        .filter((r) => tiles.get(id)![r]! > 0)
        .sort(),
    ]),
  );
  for (const id of mine)
    for (const r of own.get(id)!) out.get(id)!.push({ resource: r, from: null });
  const nearestTo = (id: SettlementId) => {
    const here = state.settlements[id]!.tile;
    return mine
      .filter((o) => o !== id)
      .map((o) => ({ o, d: distance(state.map, here, state.settlements[o]!.tile) }))
      .sort((a, b) => a.d - b.d || Number(a.o.slice(1)) - Number(b.o.slice(1)))
      .slice(0, Math.max(0, reach))
      .map((x) => x.o);
  };
  for (const id of mine) {
    const kinds = own.get(id)!;
    if (kinds.length === 0 || reach <= 0) continue;
    for (const o of nearestTo(id))
      for (const r of kinds) if (!has(o, r)) out.get(o)!.push({ resource: r, from: id });
  }
  // Copies that arrive in deals reach the capital (or the oldest settlement) and its nearest few.
  const received = tradesInto(ctx, state, player);
  if (received.length > 0 && mine.length > 0) {
    const capital = state.players[player]?.capital;
    const hub = capital && out.has(capital) ? capital : mine[0]!;
    const reached = [hub, ...nearestTo(hub)];
    for (const { resource, from } of received)
      for (const o of reached)
        if (!has(o, resource)) out.get(o)!.push({ resource, from: null, fromPlayer: from });
  }
  return out;
}

/** Luxury kinds a player receives in deals, one entry per kind (the first sender named). */
function tradesInto(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
): { resource: string; from: PlayerId }[] {
  const out: { resource: string; from: PlayerId }[] = [];
  for (const t of state.diplomacy?.trades ?? []) {
    if (t.to !== player || out.some((x) => x.resource === t.resource)) continue;
    const res = ctx.content.entities.resource[t.resource];
    if (res?.class === 'luxury' && res.happiness > 0)
      out.push({ resource: t.resource, from: t.from });
  }
  return out.sort((a, b) => (a.resource < b.resource ? -1 : a.resource > b.resource ? 1 : 0));
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
    const from = l.fromPlayer
      ? state.players[l.fromPlayer]?.name
      : l.from
        ? state.settlements[l.from]?.name
        : undefined;
    return { label: from ? `${name} (from ${from})` : name, amount: res.happiness };
  });
}
