import type { Draft } from 'immer';
import { current } from 'immer';
import type { Action } from '../actions';
import {
  type ActionHandler,
  type EngineContext,
  type Emit,
  type RuleError,
  unitClassOf,
  unitDef,
} from '../context';
import { distance, neighbors } from '../map/hex';
import type { GameState, PlayerId, UnitState } from '../state';
import { playerEffects } from '../progress/sources';
import { ownedUnit, watchers } from './handlers';
import { canTraverse, fullMoves, hasForeignUnit, hasRoom } from './movement';
import { promotionsOf } from './promotions';

/**
 * Commanders (docs/03-core-mechanics.md, "Commanders"): they pack nearby soldiers to move them
 * as one, give units in their radius extra strength (and healing, with promotions), earn XP when
 * those units fight, and retreat to a settlement instead of being captured.
 */

export interface Command {
  capacity: number;
  radius: number;
  /** Strength for units in the radius, always, when attacking, when defending. */
  strength: number;
  attack: number;
  defense: number;
  heal: number;
  retreatTurns: number;
}

/** A unit's command stats with its promotions, or undefined if it isn't a commander. */
export function commandOf(
  ctx: EngineContext,
  unit: Pick<UnitState, 'type' | 'promotions'>,
): Command | undefined {
  const base = unitDef(ctx, unit).commander;
  if (!base) return undefined;
  const c: Command = { ...base, attack: 0, defense: 0, heal: 0 };
  for (const p of promotionsOf(ctx, unit)) {
    if (!p.command) continue;
    c.capacity += p.command.capacity;
    c.radius += p.command.radius;
    c.attack += p.command.attack;
    c.defense += p.command.defense;
    c.heal += p.command.heal;
  }
  return c;
}

export const isRecovering = (state: GameState, u: Pick<UnitState, 'recovering'>) =>
  (u.recovering ?? 0) > state.turn;

/** The owner's commanders (not recovering) whose radius covers `tile`. */
export function commandersAround(
  ctx: EngineContext,
  state: GameState,
  owner: PlayerId,
  tile: number,
): { unit: UnitState; command: Command }[] {
  const out: { unit: UnitState; command: Command }[] = [];
  for (const u of Object.values(state.units)) {
    if (u.owner !== owner || isRecovering(state, u)) continue;
    const command = commandOf(ctx, u);
    if (command && distance(state.map, u.tile, tile) <= command.radius)
      out.push({ unit: u, command });
  }
  return out.sort((a, b) => Number(a.unit.id.slice(1)) - Number(b.unit.id.slice(1)));
}

/** Units a commander could pack now: its owner's soldiers on or next to it, with moves left. */
export function packableUnits(
  ctx: EngineContext,
  state: GameState,
  commander: UnitState,
): string[] {
  return Object.values(state.units)
    .filter((u) => !packProblem(ctx, state, commander, u, 0))
    .map((u) => u.id)
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}

function packProblem(
  ctx: EngineContext,
  state: GameState,
  commander: UnitState,
  u: UnitState,
  /** Units already being packed in the same action. */
  adding: number,
): RuleError | undefined {
  const command = commandOf(ctx, commander);
  if (!command) return { code: 'not_commander', message: 'Only commanders can pack units' };
  if (isRecovering(state, commander))
    return { code: 'recovering', message: 'The commander is recovering' };
  if (u.owner !== commander.owner || u.id === commander.id)
    return { code: 'not_yours', message: "That isn't your unit" };
  const cls = unitClassOf(ctx, u);
  if (!cls.combat || cls.domain !== unitClassOf(ctx, commander).domain || commandOf(ctx, u))
    return { code: 'cannot_pack', message: 'Only soldiers can be packed' };
  if (distance(state.map, u.tile, commander.tile) > 1)
    return { code: 'too_far', message: 'The unit must be next to the commander' };
  if (u.moves <= 0) return { code: 'no_moves', message: 'The unit has no moves left' };
  if ((commander.cargo?.length ?? 0) + adding >= command.capacity)
    return { code: 'full', message: `The commander can carry ${command.capacity} units` };
  return undefined;
}

/** Free tiles to unpack onto: the commander's tile first, then the ring around it. */
function unpackSpot(
  ctx: EngineContext,
  state: GameState,
  at: number,
  u: UnitState,
): number | undefined {
  return [at, ...neighbors(state.map, at).sort((a, b) => a - b)].find(
    (t) =>
      canTraverse(ctx, state, u, t) && hasRoom(ctx, state, u, t) && !hasForeignUnit(state, u, t),
  );
}

/**
 * Puts a commander's packed units back on the map around it. They can act this turn if the
 * commander still has moves. Units with no room stay packed (or, if `lose`, are lost).
 */
function unpack(
  draft: Draft<GameState>,
  ctx: EngineContext,
  id: string,
  emit: Emit,
  lose: boolean,
): void {
  const c = draft.units[id]!;
  const cargo = [...(c.cargo ?? [])].map((u) => ({ ...u, promotions: [...u.promotions] }));
  const ready = c.moves > 0 && !lose;
  const kept: UnitState[] = [];
  for (const u of cargo) {
    const snap = current(draft);
    const tile = unpackSpot(ctx, snap, c.tile, u);
    if (tile === undefined) {
      if (!lose) kept.push(u);
      continue;
    }
    draft.units[u.id] = { ...u, tile, moves: ready ? fullMoves(ctx, u) : 0, orders: null };
    emit({
      type: 'unit_moved',
      unit: u.id,
      owner: u.owner,
      path: [c.tile, tile],
      visibleTo: watchers(ctx, current(draft), u.owner, [c.tile, tile]),
    });
  }
  if (kept.length > 0) draft.units[id]!.cargo = kept;
  else delete draft.units[id]!.cargo;
}

/**
 * A commander caught by enemies: its units unpack around it (any with no room are lost), and it
 * retreats to its owner's nearest settlement, out of action for a few turns. With no settlement
 * to go to, it's lost.
 */
export function retreatCommander(
  draft: Draft<GameState>,
  ctx: EngineContext,
  id: string,
  by: PlayerId,
  emit: Emit,
) {
  unpack(draft, ctx, id, emit, true);
  const snap = current(draft);
  const c = snap.units[id]!;
  const command = commandOf(ctx, c)!;
  const home = Object.values(snap.settlements)
    .filter((s) => s.owner === c.owner && s.tile !== c.tile && hasRoom(ctx, snap, c, s.tile))
    .sort(
      (a, b) =>
        distance(snap.map, c.tile, a.tile) - distance(snap.map, c.tile, b.tile) ||
        Number(a.id.slice(1)) - Number(b.id.slice(1)),
    )[0];
  if (!home) {
    delete draft.units[id];
    emit({
      type: 'unit_killed',
      unit: id,
      owner: c.owner,
      unitType: c.type,
      tile: c.tile,
      by,
      visibleTo: watchers(ctx, snap, c.owner, [c.tile]),
    });
    return;
  }
  const d = draft.units[id]!;
  d.tile = home.tile;
  d.moves = 0;
  d.orders = null;
  d.recovering = draft.turn + command.retreatTurns;
  emit({
    type: 'commander_retreated',
    unit: id,
    owner: c.owner,
    from: c.tile,
    to: home.tile,
    until: d.recovering,
    visibleTo: watchers(ctx, snap, c.owner, [c.tile]),
  });
}

/** XP for commanders of `owner` whose radius covers a fight at `tile`. */
export function commanderXp(
  draft: Draft<GameState>,
  ctx: EngineContext,
  owner: PlayerId,
  tile: number,
) {
  const snap = current(draft);
  let percent = 100;
  for (const { effect } of playerEffects(ctx, snap, owner, 'commander_bonus'))
    percent += effect.params.xpPercent;
  const xp = Math.floor((ctx.content.rules.combat.xp.commander * Math.max(0, percent)) / 100);
  for (const { unit } of commandersAround(ctx, snap, owner, tile)) draft.units[unit.id]!.xp += xp;
}

type A<T extends Action['type']> = Extract<Action, { type: T }>;

export const commanderHandlers = {
  pack_units: {
    validate(state, action, ctx) {
      const c = ownedUnit(state, action.player, action.commander);
      if ('code' in c) return c;
      if (action.units.length === 0) return { code: 'nothing', message: 'Pick units to pack' };
      let i = 0;
      for (const id of action.units) {
        const u = state.units[id];
        if (!u) return { code: 'no_unit', message: 'No such unit' };
        const err = packProblem(ctx, state, c, u, i++);
        if (err) return err;
      }
      return undefined;
    },
    apply(draft, action) {
      const c = draft.units[action.commander]!;
      const cargo = [...(c.cargo ?? [])];
      for (const id of action.units) {
        const u = draft.units[id]!;
        cargo.push({ ...current(u), moves: 0, orders: null, tile: c.tile });
        delete draft.units[id];
      }
      draft.units[action.commander]!.cargo = cargo;
    },
  } satisfies ActionHandler<A<'pack_units'>>,

  unpack_units: {
    validate(state, action) {
      const c = ownedUnit(state, action.player, action.commander);
      if ('code' in c) return c;
      if (!c.cargo || c.cargo.length === 0)
        return { code: 'empty', message: 'The commander has no units packed' };
      if (isRecovering(state, c))
        return { code: 'recovering', message: 'The commander is recovering' };
      return undefined;
    },
    apply(draft, action, ctx, emit) {
      unpack(draft, ctx, action.commander, emit, false);
    },
  } satisfies ActionHandler<A<'unpack_units'>>,
} satisfies { [T in 'pack_units' | 'unpack_units']: ActionHandler<A<T>> };

/** Every unit a player has, packed ones included (for upkeep and army strength). */
export function allUnitsOf(state: GameState, player: PlayerId): UnitState[] {
  const out: UnitState[] = [];
  for (const u of Object.values(state.units)) {
    if (u.owner !== player) continue;
    out.push(u);
    if (u.cargo) out.push(...u.cargo);
  }
  return out;
}
