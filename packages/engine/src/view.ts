import { decodeBits, emptyBits, encodeBits, getBit, setBit } from './bitset';
import type { EngineContext } from './context';
import type { GameEvent } from './events';
import type { MapTile } from './map/types';
import type { GameState, PlayerId, SettlementState, UnitState } from './state';
import { fogOfWar } from './units/vision';

/**
 * What one player may know of a game (docs/01-architecture.md, "Multiplayer data flow"): the
 * state with what they can't see taken out, in the same shape, so a client runs on it as on a
 * full state. An online host sends each remote player only this.
 *
 * Hidden: unexplored tiles (they read as empty ocean), other players' units out of sight (and
 * the orders of those in sight), settlements whose land they've never seen, other players'
 * build queues and exploration, deals between others, and the seed and dice.
 */
export function playerView(ctx: EngineContext, state: GameState, player: PlayerId): GameState {
  const fog = fogOfWar(ctx, state, player);
  const known = (tile: number) => fog[tile] !== 0;
  const hidden = hiddenTile(ctx);
  const tiles = state.map.tiles.map((t, i) => (known(i) ? t : hidden));

  // Foreign settlements: those with any land the player knows (their name shows on the border).
  const seenSettlements = new Set<string>();
  for (const t of tiles) if (t.settlement !== null) seenSettlements.add(t.settlement);
  const settlements: Record<string, SettlementState> = {};
  for (const [id, s] of Object.entries(state.settlements)) {
    if (s.owner === player) settlements[id] = s;
    else if (seenSettlements.has(id)) settlements[id] = { ...s, queue: [], progress: {} };
  }

  const units: Record<string, UnitState> = {};
  for (const [id, u] of Object.entries(state.units)) {
    if (u.owner === player) units[id] = u;
    else if (fog[u.tile] === 2) units[id] = { ...u, orders: null };
  }

  const allRoads = decodeBits(state.roads, tiles.length);
  const roads = emptyBits(tiles.length);
  for (let i = 0; i < tiles.length; i++) if (known(i) && getBit(allRoads, i)) setBit(roads, i);

  const involves = (from: PlayerId, to: PlayerId) => from === player || to === player;
  return {
    ...state,
    settings: { ...state.settings, seed: '' },
    rng: [0, 0, 0, 0],
    players: Object.fromEntries(
      Object.entries(state.players).map(([id, p]) => [
        id,
        id === player ? p : { ...p, explored: '' },
      ]),
    ),
    map: { ...state.map, tiles },
    units,
    settlements,
    camps: Object.fromEntries(Object.entries(state.camps).filter(([, c]) => known(c.tile))),
    roads: encodeBits(roads),
    routes: state.routes.filter((r) => settlements[r.from] && settlements[r.to]),
    peaceOffers: state.peaceOffers.filter((o) => {
      const [from, to] = o.split('>') as [string, string];
      return involves(from, to);
    }),
    ...(state.espionage
      ? {
          espionage: {
            ...state.espionage,
            spies: Object.fromEntries(
              Object.entries(state.espionage.spies).filter(([, s]) => s.owner === player),
            ),
          },
        }
      : {}),
    diplomacy: {
      ...state.diplomacy,
      proposals: state.diplomacy.proposals.filter((p) => involves(p.from, p.to)),
      payments: state.diplomacy.payments.filter((p) => involves(p.from, p.to)),
    },
  };
}

/** The events a player may see (each event says who that is). */
export function eventsFor(events: readonly GameEvent[], player: PlayerId): GameEvent[] {
  return events.filter((e) => e.visibleTo === 'all' || e.visibleTo.includes(player));
}

/** What an unexplored tile looks like from outside: open water, nothing on it. */
const hiddenTiles = new WeakMap<object, MapTile>();
function hiddenTile(ctx: EngineContext): MapTile {
  const cached = hiddenTiles.get(ctx.content);
  if (cached) return cached;
  const water = Object.values(ctx.content.entities.terrain).find((t) => t.water);
  const tile: MapTile = {
    terrain: water?.id ?? '',
    feature: null,
    elevation: 'flat',
    resource: null,
    river: 0,
    owner: null,
    settlement: null,
    improvement: null,
    district: null,
    wonder: null,
  };
  hiddenTiles.set(ctx.content, Object.freeze(tile));
  return tile;
}
