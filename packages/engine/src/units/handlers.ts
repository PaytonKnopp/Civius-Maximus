import { current, type Draft, original } from 'immer';
import type { Action } from '../actions';
import {
  type ActionHandler,
  atWar,
  type EngineContext,
  type Emit,
  HOSTILE,
  type RuleError,
  unitClassOf,
  unitDef,
  unitIds,
} from '../context';
import { getBit } from '../bitset';
import { distance, neighbors, tilesWithin } from '../map/hex';
import type { GameState, PlayerId, UnitState } from '../state';
import { clearCampsOn } from '../combat/camps';
import { takeHuts } from '../huts/huts';
import { canTraverse, fullMoves, hasRoom } from './movement';
import { findPath, type PathStep } from './pathfind';
import { exploredBits, exploreVisible, lineOfSight, sightOf, visibleTiles } from './vision';
import { unitSnapshot } from '../draft';
import { startEraUnits } from '../progress/startEra';

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

/**
 * The owner, plus every other player who can see any of `path` right now (by the same rules as
 * `visibleTiles`, but checking only what's near those tiles: this runs for every move).
 */
export function watchers(
  ctx: EngineContext,
  state: GameState,
  owner: PlayerId,
  path: number[],
): PlayerId[] {
  const seeing = new Set<PlayerId>();
  const radius = ctx.content.rules.settlements.ownRadius;
  // Territory, plus one tile beyond it.
  for (const t of path) {
    for (const n of [t, ...neighbors(state.map, t)]) {
      const tile = state.map.tiles[n]!;
      const s = tile.settlement ? state.settlements[tile.settlement] : undefined;
      if (tile.owner && s && s.owner === tile.owner && distance(state.map, s.tile, n) <= radius)
        seeing.add(tile.owner);
    }
  }
  // Units, within their sight and line of sight.
  for (const u of Object.values(state.units)) {
    if (u.owner === owner || seeing.has(u.owner)) continue;
    const sight = sightOf(ctx, state, u);
    if (
      path.some(
        (t) => distance(state.map, u.tile, t) <= sight && lineOfSight(ctx, state, u.tile, t),
      )
    )
      seeing.add(u.owner);
  }
  return [
    owner,
    ...state.playerOrder.filter((p) => p !== owner && seeing.has(p) && state.players[p]!.alive),
  ];
}

/** Moves a unit along the part of a path it can cover this turn; queues the rest as orders. */
export function advanceAlongPath(
  draft: Draft<GameState>,
  ctx: EngineContext,
  unitId: string,
  path: PathStep[],
  target: number,
  emit: Emit,
  /** A `current()` copy to read the map from (see `unitSnapshot`), when moving many units. */
  base?: GameState,
  /** With `base`: an up-to-date plain copy of the units, if the caller keeps one. */
  units?: GameState['units'],
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
  // The snapshot must show this unit where it is now (it has just moved), so refresh its entry
  // in the caller's copy of the units.
  const snapshot = base
    ? unitSnapshot(
        draft,
        base,
        units && { ...units, [unitId]: current(unit) as GameState['units'][string] },
      )
    : current(draft);
  // Raiders already know the whole map.
  if (unit.owner !== HOSTILE)
    draft.players[unit.owner]!.explored = exploreVisible(ctx, snapshot, unit.owner);
  const tiles = [start, ...now.map((s) => s.tile)];
  emit({
    type: 'unit_moved',
    unit: unitId,
    owner: unit.owner,
    path: tiles,
    visibleTo: watchers(ctx, snapshot, unit.owner, tiles),
  });
  if (unitClassOf(ctx, unit).combat) clearCampsOn(draft, ctx, unit.owner, tiles.slice(1), emit);
  takeHuts(draft, ctx, unitId, tiles.slice(1), emit);
}

export const unitHandlers = {
  move_unit: {
    validate(state, action, ctx) {
      const unit = ownedUnit(state, action.player, action.unit);
      if (isError(unit)) return unit;
      if ((unit.recovering ?? 0) > state.turn)
        return { code: 'recovering', message: `Recovering until turn ${unit.recovering}` };
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
  alert_unit: simple<'alert_unit'>(
    (unit, _state, ctx) =>
      unitClassOf(ctx, unit).combat
        ? undefined
        : { code: 'cannot_alert', message: 'Only military units stand on alert' },
    (unit) => {
      unit.orders = { kind: 'alert' };
    },
  ),
  explore_unit: simple<'explore_unit'>(
    (unit, state, ctx) =>
      exploreTarget(ctx, state, unit) === undefined
        ? { code: 'nothing_to_explore', message: 'There is nothing left it can reach to explore' }
        : undefined,
    (unit) => {
      unit.orders = { kind: 'explore' };
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
    T in
      | 'move_unit'
      | 'skip_unit'
      | 'sleep_unit'
      | 'fortify_unit'
      | 'alert_unit'
      | 'explore_unit'
      | 'wake_unit'
      | 'disband_unit'
  ]: ActionHandler<UnitAction<T>>;
};

/**
 * Where an exploring unit heads next: the nearest tile it can reach at the edge of what its
 * owner has explored (ties: the lower tile index), or undefined when there's none.
 */
export function exploreTarget(
  ctx: EngineContext,
  state: GameState,
  unit: UnitState,
): number | undefined {
  const known = exploredBits(state, unit.owner);
  const frontier: number[] = [];
  for (let t = 0; t < state.map.tiles.length; t++) {
    if (t === unit.tile || !getBit(known, t)) continue;
    if (!neighbors(state.map, t).some((n) => !getBit(known, n))) continue;
    if (!canTraverse(ctx, state, unit, t) || !hasRoom(ctx, state, unit, t)) continue;
    frontier.push(t);
  }
  frontier.sort(
    (a, b) => distance(state.map, unit.tile, a) - distance(state.map, unit.tile, b) || a - b,
  );
  // The nearest few by distance; the first with a path wins.
  for (const t of frontier.slice(0, 8)) if (findPath(ctx, state, unit, t, 12)) return t;
  return undefined;
}

/** Units on alert wake when an enemy soldier stands within their sight and their owner sees it. */
function wakeAlerted(ctx: EngineContext, draft: Draft<GameState>, base: GameState, emit: Emit) {
  const seen = new Map<PlayerId, Uint8Array>();
  for (const id of unitIds(draft)) {
    const u = draft.units[id]!;
    if (u.orders?.kind !== 'alert') continue;
    if (!seen.has(u.owner)) seen.set(u.owner, visibleTiles(ctx, base, u.owner));
    const vis = seen.get(u.owner)!;
    const sight = unitDef(ctx, u).sight;
    const enemy = Object.values(base.units).find(
      (o) =>
        o.owner !== u.owner &&
        (o.owner === HOSTILE || atWar(base, u.owner, o.owner)) &&
        unitClassOf(ctx, o).combat &&
        vis[o.tile] === 1 &&
        distance(base.map, u.tile, o.tile) <= sight,
    );
    if (!enemy) continue;
    u.orders = null;
    emit({
      type: 'unit_alerted',
      unit: id,
      owner: u.owner,
      tile: u.tile,
      enemy: enemy.tile,
      visibleTo: [u.owner],
    });
  }
}

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
    // A commander recovering from a retreat stays put.
    u.moves = (u.recovering ?? 0) > draft.turn ? 0 : fullMoves(ctx, u);
    u.skippedTurn = null;
  }
  const base = current(draft);
  // Keep our own plain copy of the units, so each journey doesn't copy all of them again. Only
  // the unit that just moved changes, unless someone was added or removed (a village's reward
  // can add a unit), in which case copy them all afresh.
  let units = base.units;
  let count = Object.keys(units).length;
  let nextId = draft.nextEntityId;
  const refreshUnits = (moved: string) => {
    const now = draft.units[moved];
    if (!now || draft.nextEntityId !== nextId || Object.keys(draft.units).length !== count) {
      units = current(draft.units) as GameState['units'];
      count = Object.keys(units).length;
      nextId = draft.nextEntityId;
    } else {
      units = { ...units, [moved]: current(now) as GameState['units'][string] };
    }
  };
  wakeAlerted(ctx, draft, base, emit);
  for (const id of unitIds(draft)) {
    const orders = draft.units[id]?.orders;
    if (orders?.kind === 'explore') {
      const snapshot = unitSnapshot(draft, base, units);
      const target = exploreTarget(ctx, snapshot, snapshot.units[id]!);
      const path =
        target === undefined ? null : findPath(ctx, snapshot, snapshot.units[id]!, target);
      if (!path || target === undefined) {
        draft.units[id]!.orders = null;
        emit({
          type: 'orders_cancelled',
          unit: id,
          reason: 'explored',
          visibleTo: [draft.units[id]!.owner],
        });
      } else {
        advanceAlongPath(draft, ctx, id, path, target, emit, base, units);
        // Still exploring next turn (unless the journey ended it).
        if (draft.units[id]) draft.units[id]!.orders = { kind: 'explore' };
      }
      refreshUnits(id);
      continue;
    }
    if (orders?.kind !== 'move') continue;
    const snapshot = unitSnapshot(draft, base, units);
    const path = findPath(ctx, snapshot, snapshot.units[id]!, orders.target);
    if (!path) {
      draft.units[id]!.orders = null;
      emit({
        type: 'orders_cancelled',
        unit: id,
        reason: 'path_blocked',
        visibleTo: [draft.units[id]!.owner],
      });
      refreshUnits(id);
      continue;
    }
    advanceAlongPath(draft, ctx, id, path, orders.target, emit, base, units);
    refreshUnits(id);
  }
}

/** Puts each player's starting units on (or next to) their start tile. */
export function spawnStartingUnits(state: GameState, ctx: EngineContext) {
  for (const player of state.playerOrder) {
    const start = state.players[player]!.startTile;
    const near = tilesWithin(state.map, start, 3).sort(
      (a, b) => distance(state.map, start, a) - distance(state.map, start, b) || a - b,
    );
    const handicap = state.players[player]!.handicap;
    const extra = handicap ? (ctx.content.entities.difficulty?.[handicap]?.aiStartUnits ?? []) : [];
    const era = startEraUnits(state, ctx);
    for (const type of [...ctx.content.rules.units.startingUnits, ...era, ...extra]) {
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
          promotions: [],
        },
      };
      state.nextEntityId++;
    }
    state.players[player]!.explored = exploreVisible(ctx, state, player);
  }
}
