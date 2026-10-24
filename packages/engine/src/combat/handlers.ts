import { castDraft, current, type Draft, original } from 'immer';
import type { Action } from '../actions';
import {
  type ActionHandler,
  atWar,
  type EngineContext,
  type Emit,
  type RuleError,
  unitClassOf,
  unitIds,
  warKey,
} from '../context';
import type { Combatant } from '../events';
import { refreshCitizens, refreshExplored } from '../settlements/handlers';
import { settlementIds } from '../settlements/rules';
import { nextRange } from '../rng';
import type { GameState, PlayerId, SettlementState, UnitState } from '../state';
import { ownedUnit, watchers } from '../units/handlers';
import { canTraverse, fullMoves, hasRoom, unitsOn } from '../units/movement';
import { damageFor } from './damage';
import {
  attackMode,
  attackProblem,
  attackStrength,
  defenseStrength,
  settlementHit,
  settlementMaxHealth,
  settlementStrength,
  strikeProblem,
  targetAt,
  wallsMax,
} from './strength';

/**
 * Fighting, taking settlements, and war and peace (docs/03-core-mechanics.md, sections 3 and 5).
 * All numbers are computed from the state before the action (`original`), then applied.
 */

type A<T extends Action['type']> = Extract<Action, { type: T }>;

const isError = <T extends object>(x: T | RuleError): x is RuleError => 'code' in x;

function playing(state: GameState, player: PlayerId): RuleError | undefined {
  return state.players[player]?.alive
    ? undefined
    : { code: 'not_playing', message: `${player} is not playing` };
}

function rollDamage(draft: Draft<GameState>, ctx: EngineContext, difference: number): number {
  const r = ctx.content.rules.combat.randomPercent;
  const [roll, next] = nextRange(draft.rng as GameState['rng'], 100 - r, 100 + r);
  draft.rng = castDraft(next);
  return damageFor(ctx, difference, roll);
}

/** Who sees a fight: everyone watching its tiles, plus the defender's owner. */
const seenBy = (list: PlayerId[], also: PlayerId) => (list.includes(also) ? list : [...list, also]);

function unitSide(u: Pick<UnitState, 'id' | 'owner' | 'type' | 'health'>): Combatant {
  return { kind: 'unit', unit: u.id, owner: u.owner, unitType: u.type, health: u.health };
}

function settlementSide(s: Pick<SettlementState, 'id' | 'owner' | 'health' | 'walls'>): Combatant {
  return { kind: 'settlement', settlement: s.id, owner: s.owner, health: s.health, walls: s.walls };
}

export function killUnit(
  draft: Draft<GameState>,
  ctx: EngineContext,
  id: string,
  by: PlayerId,
  emit: Emit,
) {
  const u = draft.units[id]!;
  const { owner, type, tile } = u;
  const visibleTo = watchers(ctx, current(draft), owner, [tile]);
  delete draft.units[id];
  emit({ type: 'unit_killed', unit: id, owner, unitType: type, tile, by, visibleTo });
}

/** Other players' civilians on `tile` change hands. */
function captureCivilians(
  draft: Draft<GameState>,
  ctx: EngineContext,
  tile: number,
  by: PlayerId,
  emit: Emit,
) {
  for (const u of unitsOn(current(draft), tile)) {
    if (u.owner === by || unitClassOf(ctx, u).combat) continue;
    const d = draft.units[u.id]!;
    const from = d.owner;
    d.owner = by;
    d.moves = 0;
    d.orders = null;
    emit({
      type: 'civilian_captured',
      unit: u.id,
      unitType: u.type,
      from,
      by,
      tile,
      visibleTo: seenBy(watchers(ctx, current(draft), by, [tile]), from),
    });
  }
}

/** Moves a unit one tile (after winning a fight or taking civilians). */
function advance(draft: Draft<GameState>, ctx: EngineContext, id: string, to: number, emit: Emit) {
  const u = draft.units[id]!;
  const from = u.tile;
  u.tile = to;
  refreshExplored(draft, ctx, u.owner);
  emit({
    type: 'unit_moved',
    unit: id,
    owner: u.owner,
    path: [from, to],
    visibleTo: watchers(ctx, current(draft), u.owner, [from, to]),
  });
}

/** The biggest remaining settlement becomes the capital (and gets the capital's building). */
function relocateCapital(
  draft: Draft<GameState>,
  ctx: EngineContext,
  player: PlayerId,
  emit: Emit,
) {
  const p = draft.players[player]!;
  const mine = settlementIds(draft)
    .map((id) => draft.settlements[id]!)
    .filter((s) => s.owner === player && !s.captureChoice)
    .sort((a, b) => b.population - a.population);
  const next = mine[0];
  p.capital = next?.id ?? null;
  if (!next) return;
  next.capital = true;
  const palace = ctx.content.rules.settlements.capitalBuilding;
  if (!next.buildings.includes(palace)) next.buildings.push(palace);
  refreshCitizens(draft, ctx, next.id);
  emit({ type: 'capital_moved', player, settlement: next.id, visibleTo: 'all' });
}

/** A player with no settlements left (after founding one) is out of the game. */
function checkDefeat(draft: Draft<GameState>, player: PlayerId, by: PlayerId | null, emit: Emit) {
  const p = draft.players[player]!;
  if (!p.alive || p.settlementsFounded === 0) return;
  if (Object.values(draft.settlements).some((s) => s.owner === player)) return;
  p.alive = false;
  p.capital = null;
  for (const id of unitIds(draft)) if (draft.units[id]!.owner === player) delete draft.units[id];
  draft.wars = draft.wars.filter((k) => !k.split('|').includes(player));
  for (const k of Object.keys(draft.warStarted)) {
    if (k.split('|').includes(player)) delete draft.warStarted[k];
  }
  draft.peaceOffers = draft.peaceOffers.filter((o) => !o.split('>').includes(player));
  emit({ type: 'player_defeated', player, by, visibleTo: 'all' });
  const alive = draft.playerOrder.filter((id) => draft.players[id]!.alive);
  if (alive.length === 1 && draft.playerOrder.length > 1) {
    draft.status = 'ended';
    emit({ type: 'game_ended', reason: 'conquest', winner: alive[0]!, visibleTo: 'all' });
  }
}

/** `captor` takes a settlement with unit `unitId` (whose health brought it to 0). */
export function captureSettlement(
  draft: Draft<GameState>,
  ctx: EngineContext,
  id: string,
  captor: PlayerId,
  unitId: string,
  emit: Emit,
) {
  const s = draft.settlements[id]!;
  const from = s.owner;
  // Soldiers in the settlement fall with it; civilians are taken.
  for (const u of unitsOn(current(draft), s.tile)) {
    if (u.owner !== captor && unitClassOf(ctx, u).combat) killUnit(draft, ctx, u.id, captor, emit);
  }
  captureCivilians(draft, ctx, s.tile, captor, emit);
  advance(draft, ctx, unitId, s.tile, emit);

  const loss = ctx.content.rules.combat.settlement.capturePopulationLoss;
  s.owner = captor;
  for (const t of draft.map.tiles) if (t.settlement === id) t.owner = captor;
  s.population = Math.max(1, s.population - Math.ceil((s.population * loss) / 100));
  s.health = Math.floor(settlementMaxHealth(ctx, s.kind) / 4);
  s.walls = 0;
  s.queue = [];
  s.progress = {};
  s.locked = [];
  s.focus = 'balanced';
  s.pendingDevelop = 0;
  s.capturedFrom = from;
  s.captureChoice = true;
  s.struckTurn = draft.turn;
  const wasCapital = s.capital;
  if (wasCapital) {
    s.capital = false;
    const palace = ctx.content.rules.settlements.capitalBuilding;
    s.buildings = s.buildings.filter((b) => b !== palace);
  }
  refreshCitizens(draft, ctx, id);
  refreshExplored(draft, ctx, captor);
  emit({
    type: 'settlement_captured',
    settlement: id,
    name: s.name,
    from,
    by: captor,
    tile: s.tile,
    visibleTo: 'all',
  });
  if (wasCapital) relocateCapital(draft, ctx, from, emit);
  checkDefeat(draft, from, captor, emit);
}

function raze(draft: Draft<GameState>, id: string, emit: Emit) {
  const s = draft.settlements[id]!;
  for (const t of draft.map.tiles) {
    if (t.settlement !== id) continue;
    t.settlement = null;
    t.owner = null;
    t.district = null;
  }
  delete draft.settlements[id];
  emit({
    type: 'settlement_razed',
    settlement: id,
    name: s.name,
    by: s.owner,
    tile: s.tile,
    visibleTo: 'all',
  });
}

function liberate(draft: Draft<GameState>, ctx: EngineContext, id: string, emit: Emit) {
  const s = draft.settlements[id]!;
  const by = s.owner;
  const to = s.founder;
  s.owner = to;
  s.capturedFrom = null;
  s.captureChoice = false;
  for (const t of draft.map.tiles) if (t.settlement === id) t.owner = to;
  if (draft.players[to]!.capital === null) relocateCapital(draft, ctx, to, emit);
  refreshCitizens(draft, ctx, id);
  refreshExplored(draft, ctx, to);
  emit({ type: 'settlement_liberated', settlement: id, name: s.name, by, to, visibleTo: 'all' });
}

/** Why a just-captured settlement can't be razed, or undefined. */
export function razeProblem(s: SettlementState): RuleError | undefined {
  if (s.originalCapital)
    return { code: 'original_capital', message: "An original capital can't be razed" };
  if (s.wonders.length > 0)
    return { code: 'has_wonder', message: "A settlement with a wonder can't be razed" };
  return undefined;
}

/** Why a just-captured settlement can't be given back to its founder, or undefined. */
export function liberateProblem(state: GameState, s: SettlementState): RuleError | undefined {
  if (s.founder === s.owner) return { code: 'own_founder', message: 'You founded it' };
  if (s.founder === s.capturedFrom)
    return { code: 'founder_is_enemy', message: 'It was taken from its founder' };
  if (!state.players[s.founder]?.alive)
    return { code: 'founder_gone', message: 'Its founder is no longer in the game' };
  return undefined;
}

/** Whether two players may be at war (never with yourself or a teammate). */
function warProblem(state: GameState, player: PlayerId, target: PlayerId): RuleError | undefined {
  const p = state.players[player]!;
  const t = state.players[target];
  if (!t?.alive || target === player)
    return { code: 'bad_target', message: 'No such player in the game' };
  if (p.team !== null && p.team === t.team)
    return { code: 'teammate', message: `${t.name} is on your team` };
  return undefined;
}

export function peaceProblem(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  target: PlayerId,
): RuleError | undefined {
  const key = warKey(player, target);
  if (!state.wars.includes(key)) return { code: 'not_at_war', message: "You're not at war" };
  const left = (state.warStarted[key] ?? 0) + ctx.content.rules.combat.minWarTurns - state.turn;
  if (left > 0)
    return {
      code: 'too_soon',
      message: `Peace can be offered in ${left} turn${left === 1 ? '' : 's'}`,
    };
  if (state.peaceOffers.includes(`${player}>${target}`))
    return { code: 'already_offered', message: 'You already offered peace' };
  return undefined;
}

function endWar(draft: Draft<GameState>, a: PlayerId, b: PlayerId) {
  const key = warKey(a, b);
  draft.wars = draft.wars.filter((k) => k !== key);
  delete draft.warStarted[key];
  draft.peaceOffers = draft.peaceOffers.filter((o) => o !== `${a}>${b}` && o !== `${b}>${a}`);
}

export const combatHandlers = {
  attack: {
    validate(state, action, ctx) {
      const unit = ownedUnit(state, action.player, action.unit);
      if (isError(unit)) return unit;
      return attackProblem(ctx, state, unit, action.tile);
    },
    apply(draft, action, ctx, emit) {
      const base = original(draft) as GameState;
      const unit = base.units[action.unit]!;
      const target = targetAt(ctx, base, unit.owner, action.tile)!;
      const a = draft.units[unit.id]!;
      a.moves = 0;
      a.orders = null;
      if (target.kind === 'civilian') {
        captureCivilians(draft, ctx, action.tile, unit.owner, emit);
        advance(draft, ctx, unit.id, action.tile, emit);
        return;
      }
      const combat = ctx.content.rules.combat;
      const mode = attackMode(ctx, unit)!;
      const attack = attackStrength(ctx, base, unit, target, mode);
      if (target.kind === 'unit') {
        const defense = defenseStrength(ctx, base, target.unit, unit);
        const diff = attack.total - defense.total;
        const dealt = rollDamage(draft, ctx, diff);
        const taken = mode === 'melee' ? rollDamage(draft, ctx, -diff) : 0;
        const d = draft.units[target.unit.id]!;
        d.health = Math.max(0, d.health - dealt);
        a.health = Math.max(0, a.health - taken);
        a.xp += combat.xp.attack;
        d.xp += combat.xp.defend;
        emit({
          type: 'combat',
          mode,
          attacker: unitSide(a),
          defender: unitSide(d),
          from: unit.tile,
          tile: action.tile,
          dealt,
          taken,
          visibleTo: seenBy(
            watchers(ctx, current(draft), unit.owner, [unit.tile, action.tile]),
            d.owner,
          ),
        });
        const won = d.health <= 0;
        if (won) killUnit(draft, ctx, d.id, unit.owner, emit);
        if (a.health <= 0) {
          killUnit(draft, ctx, a.id, d.owner, emit);
          return;
        }
        // A melee winner moves into the tile it cleared, if it can stand there.
        if (won && mode === 'melee') {
          const snap = current(draft);
          if (canTraverse(ctx, snap, unit, action.tile)) {
            captureCivilians(draft, ctx, action.tile, unit.owner, emit);
            if (hasRoom(ctx, current(draft), unit, action.tile))
              advance(draft, ctx, unit.id, action.tile, emit);
          }
        }
        return;
      }

      const s = draft.settlements[target.settlement.id]!;
      const defense = settlementStrength(ctx, base, target.settlement);
      const diff = attack.total - defense.total;
      const hit = settlementHit(ctx, s, rollDamage(draft, ctx, diff), unit);
      s.walls -= hit.walls;
      s.health -= hit.health;
      s.attackedTurn = draft.turn;
      const taken = mode === 'melee' ? rollDamage(draft, ctx, -diff) : 0;
      a.health = Math.max(0, a.health - taken);
      a.xp += combat.xp.attack;
      emit({
        type: 'combat',
        mode,
        attacker: unitSide(a),
        defender: settlementSide(s),
        from: unit.tile,
        tile: action.tile,
        dealt: hit.walls + hit.health,
        taken,
        visibleTo: seenBy(
          watchers(ctx, current(draft), unit.owner, [unit.tile, action.tile]),
          s.owner,
        ),
      });
      if (a.health <= 0) {
        killUnit(draft, ctx, a.id, s.owner, emit);
        return;
      }
      if (mode === 'melee' && s.health <= 0 && unitClassOf(ctx, unit).captures) {
        captureSettlement(draft, ctx, s.id, unit.owner, unit.id, emit);
      }
    },
  } satisfies ActionHandler<A<'attack'>>,

  strike: {
    validate(state, action, ctx) {
      const err = playing(state, action.player);
      if (err) return err;
      const s = state.settlements[action.settlement];
      if (!s) return { code: 'no_such_settlement', message: 'That settlement no longer exists' };
      if (s.owner !== action.player)
        return { code: 'not_yours', message: "That isn't your settlement" };
      return strikeProblem(ctx, state, s, action.tile);
    },
    apply(draft, action, ctx, emit) {
      const base = original(draft) as GameState;
      const s = base.settlements[action.settlement]!;
      const target = targetAt(ctx, base, s.owner, action.tile) as { kind: 'unit'; unit: UnitState };
      const attack = settlementStrength(ctx, base, s);
      const defense = defenseStrength(ctx, base, target.unit, null);
      const dealt = rollDamage(draft, ctx, attack.total - defense.total);
      const d = draft.units[target.unit.id]!;
      d.health = Math.max(0, d.health - dealt);
      d.xp += ctx.content.rules.combat.xp.defend;
      const ds = draft.settlements[s.id]!;
      ds.struckTurn = draft.turn;
      emit({
        type: 'combat',
        mode: 'ranged',
        attacker: settlementSide(ds),
        defender: unitSide(d),
        from: s.tile,
        tile: action.tile,
        dealt,
        taken: 0,
        visibleTo: seenBy(watchers(ctx, current(draft), s.owner, [s.tile, action.tile]), d.owner),
      });
      if (d.health <= 0) killUnit(draft, ctx, d.id, s.owner, emit);
    },
  } satisfies ActionHandler<A<'strike'>>,

  capture_choice: {
    validate(state, action) {
      const err = playing(state, action.player);
      if (err) return err;
      const s = state.settlements[action.settlement];
      if (!s || s.owner !== action.player)
        return { code: 'not_yours', message: "That isn't your settlement" };
      if (!s.captureChoice)
        return { code: 'no_choice', message: 'Only right after capturing a settlement' };
      if (action.choice === 'raze') return razeProblem(s);
      if (action.choice === 'liberate') return liberateProblem(state, s);
      return undefined;
    },
    apply(draft, action, ctx, emit) {
      const s = draft.settlements[action.settlement]!;
      if (action.choice === 'keep') s.captureChoice = false;
      else if (action.choice === 'raze') raze(draft, action.settlement, emit);
      else liberate(draft, ctx, action.settlement, emit);
    },
  } satisfies ActionHandler<A<'capture_choice'>>,

  declare_war: {
    validate(state, action) {
      const err = playing(state, action.player) ?? warProblem(state, action.player, action.target);
      if (err) return err;
      if (atWar(state, action.player, action.target))
        return { code: 'already_at_war', message: 'Already at war' };
      return undefined;
    },
    apply(draft, action, _ctx, emit) {
      const key = warKey(action.player, action.target);
      draft.wars = [...draft.wars, key].sort();
      draft.warStarted[key] = draft.turn;
      emit({ type: 'war_declared', by: action.player, target: action.target, visibleTo: 'all' });
    },
  } satisfies ActionHandler<A<'declare_war'>>,

  offer_peace: {
    validate(state, action, ctx) {
      return (
        playing(state, action.player) ??
        warProblem(state, action.player, action.target) ??
        peaceProblem(ctx, state, action.player, action.target)
      );
    },
    apply(draft, action, _ctx, emit) {
      // If they already offered peace, offering back makes it.
      if (draft.peaceOffers.includes(`${action.target}>${action.player}`)) {
        endWar(draft, action.player, action.target);
        emit({ type: 'peace_made', players: [action.player, action.target], visibleTo: 'all' });
        return;
      }
      draft.peaceOffers.push(`${action.player}>${action.target}`);
      emit({
        type: 'peace_offered',
        from: action.player,
        to: action.target,
        visibleTo: [action.player, action.target],
      });
    },
  } satisfies ActionHandler<A<'offer_peace'>>,

  accept_peace: {
    validate(state, action) {
      const err = playing(state, action.player);
      if (err) return err;
      if (!state.peaceOffers.includes(`${action.from}>${action.player}`))
        return { code: 'no_offer', message: 'They have not offered peace' };
      return undefined;
    },
    apply(draft, action, _ctx, emit) {
      endWar(draft, action.player, action.from);
      emit({ type: 'peace_made', players: [action.from, action.player], visibleTo: 'all' });
    },
  } satisfies ActionHandler<A<'accept_peace'>>,
} satisfies {
  [
    T in 'attack' | 'strike' | 'capture_choice' | 'declare_war' | 'offer_peace' | 'accept_peace'
  ]: ActionHandler<A<T>>;
};

/**
 * Start of a turn, before units refresh: units that didn't act last turn heal (more at home),
 * fortified units dig in further.
 */
export function healUnits(draft: Draft<GameState>, ctx: EngineContext) {
  const { heal, maxHealth } = ctx.content.rules.combat;
  for (const id of unitIds(draft)) {
    const u = draft.units[id]!;
    if (u.orders?.kind === 'fortify') u.orders.turns = Math.min(u.orders.turns + 1, 99);
    if (u.health >= maxHealth || u.moves < fullMoves(ctx, u)) continue;
    const t = draft.map.tiles[u.tile]!;
    const home = t.settlement ? draft.settlements[t.settlement] : undefined;
    const amount =
      home && home.tile === u.tile && home.owner === u.owner
        ? heal.settlement
        : t.owner === u.owner
          ? heal.own
          : t.owner !== null && atWar(draft, u.owner, t.owner)
            ? heal.enemy
            : heal.neutral;
    u.health = Math.min(maxHealth, u.health + amount);
  }
}

/** End of a turn: settlements not attacked this turn heal and repair walls; captures are kept. */
export function combatTurn(draft: Draft<GameState>, ctx: EngineContext) {
  const rules = ctx.content.rules.combat.settlement;
  for (const id of settlementIds(draft)) {
    const s = draft.settlements[id]!;
    s.captureChoice = false;
    if (s.attackedTurn === draft.turn) continue;
    s.health = Math.min(settlementMaxHealth(ctx, s.kind), s.health + rules.heal);
    s.walls = Math.min(wallsMax(ctx, s), s.walls + rules.wallsRepair);
  }
}
