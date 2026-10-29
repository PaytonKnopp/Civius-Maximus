import { current, type Draft } from 'immer';
import type { Action } from '../actions';
import { decodeBits, encodeBits, setBit } from '../bitset';
import { atWar, type ActionHandler, type EngineContext, type Emit } from '../context';
import { view } from '../draft';
import { tilesWithin } from '../map/hex';
import { playerEffects } from '../progress/sources';
import { spawnUnit } from '../settlements/handlers';
import type { GameState, PlayerId, TradeRoute } from '../state';
import { ownedUnit } from '../units/handlers';
import { isWater } from '../units/movement';
import { routePath, routeProblem, tradePath, traderOrigin } from './rules';

type A<T extends Action['type']> = Extract<Action, { type: T }>;

/** Puts a road on these tiles (land only). */
export function buildRoad(draft: Draft<GameState>, ctx: EngineContext, tiles: number[]) {
  const snap = view(draft);
  const bits = decodeBits(draft.roads, draft.map.tiles.length);
  for (const t of tiles) if (!isWater(ctx, snap, t)) setBit(bits, t);
  draft.roads = encodeBits(bits);
}

/** A road from a new settlement to its owner's capital (an ability), if there's a way over land. */
export function roadToCapital(
  draft: Draft<GameState>,
  ctx: EngineContext,
  player: PlayerId,
  tile: number,
) {
  const snap = current(draft);
  const p = snap.players[player]!;
  if (playerEffects(ctx, snap, player, 'road_to_capital').length === 0) return;
  const capital = p.capital ? snap.settlements[p.capital] : undefined;
  if (!capital || capital.tile === tile) return;
  const path = tradePath(ctx, snap, tile, capital.tile, 40);
  if (path) buildRoad(draft, ctx, path);
}

export const tradeHandlers = {
  start_trade_route: {
    validate(state, action, ctx) {
      const unit = ownedUnit(state, action.player, action.unit);
      if ('code' in unit) return unit;
      return routeProblem(ctx, state, unit, action.to);
    },
    apply(draft, action, ctx, emit) {
      const snap = current(draft);
      const unit = snap.units[action.unit]!;
      const from = traderOrigin(snap, unit)!;
      const to = snap.settlements[action.to]!;
      const path = routePath(ctx, snap, from, to)!;
      delete draft.units[action.unit];
      const route: TradeRoute = {
        id: `r${draft.nextEntityId++}`,
        owner: unit.owner,
        unit: unit.type,
        from: from.id,
        to: to.id,
        turnsLeft: ctx.content.rules.trade.routeTurns,
        path,
      };
      draft.routes.push(route);
      buildRoad(draft, ctx, path);
      // Some civs see the land around where their traders go.
      const reveal = playerEffects(ctx, snap, unit.owner, 'trade_reveals').reduce(
        (r, e) => Math.max(r, e.effect.params.radius),
        -1,
      );
      if (reveal >= 0) {
        const bits = decodeBits(draft.players[unit.owner]!.explored, draft.map.tiles.length);
        for (const t of tilesWithin(snap.map, to.tile, reveal)) setBit(bits, t);
        draft.players[unit.owner]!.explored = encodeBits(bits);
      }
      emit({
        type: 'trade_route_started',
        route: route.id,
        owner: unit.owner,
        from: from.id,
        to: to.id,
        visibleTo: [...new Set([unit.owner, to.owner])],
      });
    },
  } satisfies ActionHandler<A<'start_trade_route'>>,
} satisfies { [T in 'start_trade_route']: ActionHandler<A<T>> };

/**
 * Ends a route: its trader comes back at the settlement it started from (or the owner's capital
 * if that was lost; with neither, it's gone).
 */
export function endRoute(draft: Draft<GameState>, ctx: EngineContext, id: string, emit: Emit) {
  const route = draft.routes.find((r) => r.id === id);
  if (!route) return;
  const { owner, unit, from, to } = route;
  draft.routes = draft.routes.filter((r) => r.id !== id);
  const origin = draft.settlements[from];
  const home =
    origin && origin.owner === owner
      ? origin
      : draft.players[owner]?.capital
        ? draft.settlements[draft.players[owner]!.capital!]
        : undefined;
  if (home && draft.players[owner]?.alive) spawnUnit(draft, ctx, owner, unit, home.tile);
  emit({ type: 'trade_route_ended', route: id, owner, from, to, visibleTo: [owner] });
}

/** Ends the routes between two players (they went to war). */
export function endRoutesBetween(
  draft: Draft<GameState>,
  ctx: EngineContext,
  a: PlayerId,
  b: PlayerId,
  emit: Emit,
) {
  const ids = draft.routes
    .filter((r) => {
      const dest = draft.settlements[r.to]?.owner;
      return (r.owner === a && dest === b) || (r.owner === b && dest === a);
    })
    .map((r) => r.id);
  for (const id of ids) endRoute(draft, ctx, id, emit);
}

/** End of each turn: routes count down; finished ones (and ones that can't go on) end. */
export function tradeTurn(draft: Draft<GameState>, ctx: EngineContext, emit: Emit) {
  for (const id of draft.routes.map((r) => r.id)) {
    const r = draft.routes.find((x) => x.id === id)!;
    const from = draft.settlements[r.from];
    const to = draft.settlements[r.to];
    const broken =
      !from ||
      !to ||
      from.owner !== r.owner ||
      !draft.players[to.owner]?.alive ||
      (to.owner !== r.owner && atWar(draft, r.owner, to.owner));
    r.turnsLeft--;
    if (broken || r.turnsLeft <= 0) endRoute(draft, ctx, id, emit);
  }
}
