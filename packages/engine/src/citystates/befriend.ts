import { castDraft, current, type Draft } from 'immer';
import type { Action } from '../actions';
import { getBit } from '../bitset';
import {
  type ActionHandler,
  atWar,
  type EngineContext,
  type Emit,
  HOSTILE,
  type RuleError,
  unitClassOf,
  unitIds,
} from '../context';
import { view } from '../draft';
import { toFixed } from '../fixed';
import { nextRange } from '../rng';
import { distance, tilesWithin } from '../map/hex';
import { foundingProblem, settlementIds } from '../settlements/rules';
import { scaleCost } from '../speed';
import type { GameState, PlayerId, UnitState } from '../state';
import { canTraverse, hasForeignUnit, hasRoom } from '../units/movement';
import { exploredBits } from '../units/vision';
import { addEnvoys, createCityState } from './handlers';
import { isCityState } from './rules';

/**
 * Befriending camps and levying soldiers (docs/04-advanced-systems.md, "Independent powers").
 * After Civ VII, a civ can spend influence over a few turns to befriend a hostile camp; the
 * first to finish turns it into a new city-state with its envoys there. After Civ VI, a
 * city-state's suzerain can pay gold to command its soldiers for a while.
 */

/** City-state kinds not yet on the map, in content order. */
function freeCityStateDefs(ctx: EngineContext, state: GameState): string[] {
  const used = new Set(Object.values(state.cityStates).map((c) => c.def));
  return ctx.content.ids.cityState.filter((id) => !used.has(id));
}

/** Why this player can't spend a turn befriending that camp now, or undefined. */
export function befriendProblem(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  campId: string,
): RuleError | undefined {
  if (state.settings.cityStates === false)
    return { code: 'off', message: 'City-states are off in this game' };
  const p = state.players[player];
  if (!p?.alive || !state.playerOrder.includes(player))
    return { code: 'not_playing', message: `${player} is not playing` };
  const camp = state.camps[campId];
  if (!camp) return { code: 'no_camp', message: 'That camp is gone' };
  if (!getBit(exploredBits(state, player), camp.tile))
    return { code: 'unknown', message: "You haven't found that camp" };
  if (freeCityStateDefs(ctx, state).length === 0)
    return { code: 'no_room', message: 'There are no more city-states to found' };
  // The camp itself makes way for the city-state, so the site is judged without it: not in
  // anyone's territory, and not too close to a settlement. (Asking with the camp still there
  // stopped at "clear the camp first" and never reached those two rules.)
  const camps = Object.fromEntries(Object.entries(state.camps).filter(([id]) => id !== campId));
  if (foundingProblem(ctx, { ...state, camps }, '', camp.tile))
    return { code: 'no_site', message: "A city-state couldn't grow there" };
  if (camp.befriend?.[player]?.last === state.turn)
    return { code: 'done_this_turn', message: 'Already befriended this turn' };
  const cost = ctx.content.rules.cityStates.befriendInfluence;
  if (p.influence < toFixed(cost))
    return { code: 'no_influence', message: `Needs ${cost} influence` };
  return undefined;
}

/** Soldiers a city-state could lend now (its own, not already levied). */
export function levySoldiers(ctx: EngineContext, state: GameState, cityState: PlayerId): string[] {
  return unitIds(state).filter((id) => {
    const u = state.units[id]!;
    return u.owner === cityState && !u.levied && unitClassOf(ctx, u).combat;
  });
}

/** Gold to levy a city-state's soldiers now (hundredths). */
export function levyCost(ctx: EngineContext, state: GameState, cityState: PlayerId) {
  const n = levySoldiers(ctx, state, cityState).length;
  return scaleCost(ctx, state, toFixed(ctx.content.rules.cityStates.levyGoldPerUnit * n));
}

/** Why this player can't levy that city-state's soldiers now, or undefined. */
export function levyProblem(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  cityState: PlayerId,
): RuleError | undefined {
  if (!state.players[player]?.alive)
    return { code: 'not_playing', message: `${player} is not playing` };
  const cs = state.cityStates[cityState];
  if (!cs || !isCityState(state, cityState))
    return { code: 'not_city_state', message: "That isn't a city-state" };
  if (cs.suzerain !== player)
    return { code: 'not_suzerain', message: 'Only its suzerain can levy its soldiers' };
  if (Object.values(state.units).some((u) => u.levied?.from === cityState))
    return { code: 'levied', message: 'Its soldiers are already levied' };
  if (levySoldiers(ctx, state, cityState).length === 0)
    return { code: 'no_soldiers', message: 'It has no soldiers to lend' };
  const cost = levyCost(ctx, state, cityState);
  if (state.players[player]!.gold < cost)
    return { code: 'no_gold', message: `Needs ${Math.ceil(cost / 100)} gold` };
  return undefined;
}

/** The camp becomes a new city-state, with its befriender's envoys there; its raiders go home. */
function becomeCityState(
  draft: Draft<GameState>,
  ctx: EngineContext,
  campId: string,
  player: PlayerId,
  emit: Emit,
) {
  const camp = draft.camps[campId]!;
  const tile = camp.tile;
  // Its raiders disband; a unit that has since changed sides is no raider of this camp.
  for (const u of camp.units) if (draft.units[u]?.owner === HOSTILE) delete draft.units[u];
  delete draft.camps[campId];
  const free = freeCityStateDefs(ctx, view(draft));
  const [i, rng] = nextRange(draft.rng as GameState['rng'], 0, free.length - 1);
  draft.rng = castDraft(rng);
  const taken = new Set(Object.keys(draft.cityStates));
  let n = taken.size + 1;
  while (taken.has(`cs${n}`) || draft.players[`cs${n}`]) n++;
  const id = `cs${n}`;
  createCityState(draft, ctx, id, free[i]!, tile);
  draft.cityStates[id]!.met.push(player);
  emit({ type: 'camp_befriended', player, cityState: id, tile, visibleTo: 'all' });
  addEnvoys(draft, ctx, id, player, ctx.content.rules.cityStates.befriendEnvoys, emit);
}

type A<T extends Action['type']> = Extract<Action, { type: T }>;

export const befriendHandlers = {
  befriend_camp: {
    validate(state, action, ctx) {
      return befriendProblem(ctx, state, action.player, action.camp);
    },
    apply(draft, action, ctx, emit) {
      const r = ctx.content.rules.cityStates;
      draft.players[action.player]!.influence -= toFixed(r.befriendInfluence);
      const camp = draft.camps[action.camp]!;
      const progress = ((camp.befriend ??= {})[action.player] ??= { turns: 0, last: -1 });
      progress.turns++;
      progress.last = draft.turn;
      emit({
        type: 'camp_befriending',
        player: action.player,
        camp: action.camp,
        turns: progress.turns,
        of: r.befriendTurns,
        visibleTo: [action.player],
      });
      if (progress.turns >= r.befriendTurns)
        becomeCityState(draft, ctx, action.camp, action.player, emit);
    },
  } satisfies ActionHandler<A<'befriend_camp'>>,

  levy_military: {
    validate(state, action, ctx) {
      return levyProblem(ctx, state, action.player, action.cityState);
    },
    apply(draft, action, ctx, emit) {
      const snap = view(draft);
      const cost = levyCost(ctx, snap, action.cityState);
      const ids = levySoldiers(ctx, snap, action.cityState);
      const until = draft.turn + ctx.content.rules.cityStates.levyTurns;
      draft.players[action.player]!.gold -= cost;
      for (const id of ids) {
        const u = draft.units[id]!;
        u.owner = action.player;
        u.levied = { from: action.cityState, until };
        u.orders = null;
        u.moves = 0;
      }
      emit({
        type: 'levied',
        player: action.player,
        cityState: action.cityState,
        units: ids.length,
        until,
        visibleTo: 'all',
      });
    },
  } satisfies ActionHandler<A<'levy_military'>>,
};

/**
 * Where a soldier going back to its city-state appears: the city-state's settlement, or the
 * nearest tile to it that the unit may stand on with room and no one else's units.
 */
function homeTile(ctx: EngineContext, state: GameState, unit: UnitState): number | undefined {
  const town = settlementIds(state)
    .map((id) => state.settlements[id]!)
    .filter((x) => x.owner === unit.owner)
    .sort(
      (a, b) =>
        distance(state.map, unit.tile, a.tile) - distance(state.map, unit.tile, b.tile) ||
        Number(a.id.slice(1)) - Number(b.id.slice(1)),
    )[0];
  if (!town) return undefined;
  return tilesWithin(state.map, town.tile, 4).find(
    (t) =>
      canTraverse(ctx, state, unit, t) &&
      hasRoom(ctx, state, unit, t) &&
      !hasForeignUnit(state, unit, t),
  );
}

/**
 * Turn step (with the city-states): levied soldiers go back to their city-state when the levy
 * runs out, when their commander is no longer its suzerain, or goes to war with it. They go
 * home: back at their city-state's settlement (or beside it), not left standing among the
 * units and inside the settlements of the civ that had hired them.
 */
export function leviesTurn(draft: Draft<GameState>, ctx: EngineContext, emit: Emit) {
  const next = draft.turn + 1;
  const ended = new Set<string>();
  /** Whether this levied soldier's time is up; with its city-state gone it simply stays. */
  const over = (u: UnitState, holder: PlayerId): boolean => {
    const from = u.levied!.from;
    const cs = draft.cityStates[from];
    if (!cs || !draft.players[from]?.alive) {
      delete u.levied;
      return false;
    }
    return !(u.levied!.until > next && cs.suzerain === holder && !atWar(draft, holder, from));
  };
  const returning: string[] = [];
  for (const id of unitIds(draft)) {
    const u = draft.units[id]!;
    // Soldiers packed in a commander step out of it to go home.
    if (u.cargo?.some((c) => c.levied)) {
      const kept = [];
      for (const c of u.cargo) {
        if (!c.levied || !over(c, u.owner)) {
          kept.push(c);
          continue;
        }
        ended.add(`${u.owner}|${c.levied.from}`);
        draft.units[c.id] = { ...current(c), tile: u.tile };
        returning.push(c.id);
      }
      if (kept.length > 0) u.cargo = kept;
      else delete u.cargo;
    }
    if (!u.levied || !over(u, u.owner)) continue;
    ended.add(`${u.owner}|${u.levied.from}`);
    returning.push(id);
  }
  for (const id of returning) {
    const u = draft.units[id]!;
    u.owner = u.levied!.from;
    u.orders = null;
    delete u.levied;
    const snap = current(draft);
    const to = homeTile(ctx, snap, snap.units[id]!);
    if (to !== undefined) {
      u.tile = to;
      u.moves = 0;
    } else if (hasForeignUnit(snap, snap.units[id]!, u.tile)) {
      // Nowhere to go and no room where it stands: it disbands.
      delete draft.units[id];
    }
  }
  for (const key of [...ended].sort()) {
    const [player, cityState] = key.split('|') as [string, string];
    emit({ type: 'levy_ended', player, cityState, visibleTo: [player] });
  }
}
