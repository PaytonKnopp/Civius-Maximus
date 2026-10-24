import { current, type Draft, original } from 'immer';
import type { Action } from '../actions';
import {
  type ActionHandler,
  type EngineContext,
  type Emit,
  type RuleError,
  unitClassOf,
  unitIds,
} from '../context';
import { distance, tilesWithin } from '../map/hex';
import type { GameState, PlayerId, UnitState } from '../state';
import { canTraverse, fullMoves, hasRoom } from './movement';
import { findPath, type PathStep } from './pathfind';
import { exploreVisible, visibleTiles } from './vision';

type UnitAction<T extends Action['type']> = Extract<Action, { type: T }>;

export function ownedUnit(
  state: GameState,
  player: PlayerId,
  unitId: string,
): UnitState | RuleError {
  if (!state.players[player]?.alive)
    return { code: 'not_playing', message: `${player} is not playing` };
  const unit = state.units[unitId];
  if (!unit) return { code: 'no_such_unit', message: 'That unit no longer exists' };
  if (unit.owner !== player) return { code: 'not_your_unit', message: "That isn't your unit" };
  return unit;
}

const isError = (x: UnitState | RuleError): x is RuleError => 'code' in x;

function simple<T extends Action['type']>(
  check: (unit: UnitState, state: GameState, ctx: EngineContext) => RuleError | undefined,
  apply: (unit: Draft<UnitState>, draft: Draft<GameState>, emit: Emit) => void,
): ActionHandler<UnitAction<T>> {
  return {
    validate(state, action, ctx) {
      const a = action as unknown as { player: string; unit: string };
      const unit = ownedUnit(state, a.player, a.unit);
      return isError(unit) ? unit : check(unit, state, ctx);
    },
    apply(draft, action, _ctx, emit) {
      const a = action as unknown as { unit: string };
      apply(draft.units[a.unit]!, draft, emit);
    },
  };
}

/** The owner, plus every other player who can see any of `tiles` right now. */
export function watchers(
  ctx: EngineContext,
  state: GameState,
  owner: PlayerId,
  path: number[],
): PlayerId[] {
  const out = [owner];
  for (const p of state.playerOrder) {
    if (p === owner || !state.players[p]!.alive) continue;
    const vis = visibleTiles(ctx, state, p);
    if (path.some((t) => vis[t])) out.push(p);
  }
  return out;
}

/** Moves a unit along the part of a path it can cover this turn; queues the rest as orders. */
export function advanceAlongPath(
  draft: Draft<GameState>,
  ctx: EngineContext,
  unitId: string,
  path: PathStep[],
  target: number,
  emit: Emit,
) {
  const unit = draft.units[unitId]!;
  const start = unit.tile;
  const now = path.filter((s) => s.turn === 0);
  if (now.length > 0) {
    const last = now[now.length - 1]!;
    unit.tile = last.tile;
    unit.moves = last.moves;
  }
  unit.orders = now.length < path.length ? { kind: 'move', target } : null;
  if (now.length === 0) return;
  const snapshot = current(draft);
  draft.players[unit.owner]!.explored = exploreVisible(ctx, snapshot, unit.owner);
  const tiles = [start, ...now.map((s) => s.tile)];
  emit({
    type: 'unit_moved',
    unit: unitId,
    owner: unit.owner,
    path: tiles,
    visibleTo: watchers(ctx, snapshot, unit.owner, tiles),
  });
}

export const unitHandlers = {
  move_unit: {
    validate(state, action, ctx) {
      const unit = ownedUnit(state, action.player, action.unit);
      if (isError(unit)) return unit;
      if (action.to >= state.map.tiles.length) return { code: 'bad_tile', message: 'No such tile' };
      if (action.to === unit.tile)
        return { code: 'already_there', message: 'The unit is already there' };
      if (!findPath(ctx, state, unit, action.to)) {
        return { code: 'no_path', message: "The unit can't get there" };
      }
      return undefined;
    },
    apply(draft, action, ctx, emit) {
      const base = original(draft) as GameState;
      const path = findPath(ctx, base, base.units[action.unit]!, action.to)!;
      advanceAlongPath(draft, ctx, action.unit, path, action.to, emit);
    },
  } satisfies ActionHandler<UnitAction<'move_unit'>>,

  skip_unit: simple<'skip_unit'>(
    () => undefined,
    (unit, draft) => {
      unit.skippedTurn = draft.turn;
    },
  ),
  sleep_unit: simple<'sleep_unit'>(
    () => undefined,
    (unit) => {
      unit.orders = { kind: 'sleep' };
    },
  ),
  fortify_unit: simple<'fortify_unit'>(
    (unit, _state, ctx) =>
      unitClassOf(ctx, unit).combat
        ? undefined
        : { code: 'cannot_fortify', message: 'Only military units can fortify' },
    (unit) => {
      unit.orders = { kind: 'fortify', turns: 0 };
    },
  ),
  wake_unit: simple<'wake_unit'>(
    (unit) =>
      unit.orders ? undefined : { code: 'no_orders', message: 'The unit has no orders to cancel' },
    (unit) => {
      unit.orders = null;
    },
  ),
  disband_unit: simple<'disband_unit'>(
    () => undefined,
    (unit, draft, emit) => {
      const { id, owner, tile } = unit;
      delete draft.units[id];
      emit({ type: 'unit_disbanded', unit: id, owner, tile, visibleTo: [owner] });
    },
  ),
} satisfies {
  [
    T in 'move_unit' | 'skip_unit' | 'sleep_unit' | 'fortify_unit' | 'wake_unit' | 'disband_unit'
  ]: ActionHandler<UnitAction<T>>;
};

/** Units that still want orders this turn (drives the "Next action" button). */
export function unitsNeedingOrders(state: GameState, player: PlayerId): string[] {
  return unitIds(state).filter((id) => {
    const u = state.units[id]!;
    return u.owner === player && u.moves > 0 && u.orders === null && u.skippedTurn !== state.turn;
  });
}

/** Start of a turn: refresh movement, then continue queued journeys (in unit id order). */
export function startTurnForUnits(draft: Draft<GameState>, ctx: EngineContext, emit: Emit) {
  for (const id of unitIds(draft)) {
    const u = draft.units[id]!;
    u.moves = fullMoves(ctx, u);
    u.skippedTurn = null;
  }
  for (const id of unitIds(draft)) {
    const orders = draft.units[id]?.orders;
    if (orders?.kind !== 'move') continue;
    const snapshot = current(draft);
    const path = findPath(ctx, snapshot, snapshot.units[id]!, orders.target);
    if (!path) {
      draft.units[id]!.orders = null;
      emit({
        type: 'orders_cancelled',
        unit: id,
        reason: 'path_blocked',
        visibleTo: [draft.units[id]!.owner],
      });
      continue;
    }
    advanceAlongPath(draft, ctx, id, path, orders.target, emit);
  }
}

/** Puts each player's starting units on (or next to) their start tile. */
export function spawnStartingUnits(state: GameState, ctx: EngineContext) {
  for (const player of state.playerOrder) {
    const start = state.players[player]!.startTile;
    const near = tilesWithin(state.map, start, 3).sort(
      (a, b) => distance(state.map, start, a) - distance(state.map, start, b) || a - b,
    );
    for (const type of ctx.content.rules.units.startingUnits) {
      const id = `u${state.nextEntityId}`;
      const probe = { id, owner: player, type };
      const tile = near.find(
        (t) => canTraverse(ctx, state, probe, t) && hasRoom(ctx, state, probe, t),
      );
      if (tile === undefined) continue;
      state.units = {
        ...state.units,
        [id]: {
          ...probe,
          tile,
          moves: fullMoves(ctx, probe),
          health: ctx.content.rules.combat.maxHealth,
          xp: 0,
          orders: null,
          skippedTurn: null,
        },
      };
      state.nextEntityId++;
    }
    state.players[player]!.explored = exploreVisible(ctx, state, player);
  }
}
