import type { Action } from '../actions';
import {
  type ActionHandler,
  atWar,
  type EngineContext,
  type RuleError,
  unitClassOf,
} from '../context';
import { toFixed } from '../fixed';
import { playerEra } from '../progress/rules';
import { scaleCost } from '../speed';
import type { GameState, PlayerId, TradeRoute, UnitState } from '../state';
import { ownedUnit } from '../units/handlers';
import { MP } from '../units/movement';

/**
 * Pillaging and plundering (docs/04-advanced-systems.md, "Trade routes" and "War"), after Civ
 * VI: a soldier at war standing on an enemy's improvement wrecks it for a while, for gold and
 * some health; one standing on the way of an enemy's trade route ends it and takes its goods.
 */

/** 0 in the first era, 1 in the next... */
function eraNumber(ctx: EngineContext, state: GameState, player: PlayerId): number {
  const era = playerEra(ctx, state.players[player]!);
  return era
    ? ctx.content.ids.era
        .map((id) => ctx.content.entities.era[id]!)
        .filter((e) => e.order < era.order).length
    : 0;
}

function soldier(ctx: EngineContext, state: GameState, player: PlayerId, unitId: string) {
  const u = ownedUnit(state, player, unitId);
  if ('code' in u) return u;
  if (!unitClassOf(ctx, u).combat || u.levied)
    return { code: 'not_military', message: 'Only your own soldiers can do that' } as RuleError;
  if (u.moves <= 0) return { code: 'no_moves', message: 'No moves left this turn' } as RuleError;
  return u;
}

/** Gold for pillaging, at this game's speed (hundredths). */
export function pillageGold(ctx: EngineContext, state: GameState, player: PlayerId) {
  const r = ctx.content.rules.combat.pillage;
  return scaleCost(ctx, state, toFixed(r.gold + r.goldPerEra * eraNumber(ctx, state, player)));
}

/** Gold for plundering a route, at this game's speed (hundredths). */
export function plunderGold(ctx: EngineContext, state: GameState, player: PlayerId) {
  const r = ctx.content.rules.trade;
  return scaleCost(
    ctx,
    state,
    toFixed(r.plunderGold + r.plunderGoldPerEra * eraNumber(ctx, state, player)),
  );
}

/** Why this unit can't pillage where it stands now, or undefined. */
export function pillageProblem(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  unitId: string,
): RuleError | undefined {
  const u = soldier(ctx, state, player, unitId);
  if ('code' in u) return u;
  if (unitClassOf(ctx, u).domain !== 'land')
    return { code: 'not_land', message: 'Only land units pillage' };
  const t = state.map.tiles[u.tile]!;
  if (!t.improvement || (t.pillaged !== undefined && t.pillaged > state.turn))
    return { code: 'nothing', message: 'Nothing here to pillage' };
  if (t.settlement && state.settlements[t.settlement]?.tile === u.tile)
    return { code: 'nothing', message: 'Nothing here to pillage' };
  if (!t.owner || t.owner === player || !atWar(state, player, t.owner))
    return { code: 'not_enemy', message: "Only the land of someone you're at war with" };
  return undefined;
}

/** Enemy routes this unit could plunder where it stands, in id order. */
export function plunderableRoutes(
  ctx: EngineContext,
  state: GameState,
  unit: UnitState,
): TradeRoute[] {
  return state.routes
    .filter((r) => !plunderProblem(ctx, state, unit.owner, unit.id, r.id))
    .sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
}

/** Why this unit can't plunder that route now, or undefined. */
export function plunderProblem(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  unitId: string,
  routeId: string,
): RuleError | undefined {
  const u = soldier(ctx, state, player, unitId);
  if ('code' in u) return u;
  const r = state.routes.find((x) => x.id === routeId);
  if (!r) return { code: 'no_route', message: 'That trade route has ended' };
  if (r.owner === player || !atWar(state, player, r.owner))
    return { code: 'not_enemy', message: "Only the routes of someone you're at war with" };
  if (!r.path.includes(u.tile))
    return { code: 'not_on_route', message: 'Stand on the way the route runs' };
  return undefined;
}

type A<T extends Action['type']> = Extract<Action, { type: T }>;

export const pillageHandlers = {
  pillage: {
    validate(state, action, ctx) {
      return pillageProblem(ctx, state, action.player, action.unit);
    },
    apply(draft, action, ctx, emit) {
      const r = ctx.content.rules.combat.pillage;
      const u = draft.units[action.unit]!;
      const tile = draft.map.tiles[u.tile]!;
      const owner = tile.owner!;
      const gold = pillageGold(ctx, draft as GameState, action.player);
      tile.pillaged = draft.turn + 1 + r.turns;
      u.moves = Math.max(0, u.moves - r.moves * MP);
      u.health = Math.min(ctx.content.rules.combat.maxHealth, u.health + r.heal);
      draft.players[action.player]!.gold += gold;
      emit({
        type: 'pillaged',
        player: action.player,
        owner,
        tile: u.tile,
        gold: Math.floor(gold / 100),
        visibleTo: [action.player, owner],
      });
    },
  } satisfies ActionHandler<A<'pillage'>>,

  plunder_route: {
    validate(state, action, ctx) {
      return plunderProblem(ctx, state, action.player, action.unit, action.route);
    },
    apply(draft, action, ctx, emit) {
      const u = draft.units[action.unit]!;
      const route = draft.routes.find((x) => x.id === action.route)!;
      const gold = plunderGold(ctx, draft as GameState, action.player);
      // The trader and its goods are lost.
      draft.routes = draft.routes.filter((x) => x.id !== action.route);
      u.moves = 0;
      draft.players[action.player]!.gold += gold;
      emit({
        type: 'route_plundered',
        player: action.player,
        owner: route.owner,
        route: route.id,
        tile: u.tile,
        gold: Math.floor(gold / 100),
        visibleTo: [action.player, route.owner],
      });
    },
  } satisfies ActionHandler<A<'plunder_route'>>,
};
