import { castDraft, current, type Draft, original } from 'immer';
import type { Action } from '../actions';
import {
  type ActionHandler,
  atWar,
  HOSTILE,
  type EngineContext,
  type Emit,
  type RuleError,
  unitClassOf,
  unitDef,
  unitIds,
  warKey,
} from '../context';
import { view } from '../draft';
import { forgetPlayer } from '../diplomacy/handlers';
import { isSurpriseWar, warBlock } from '../diplomacy/rules';
import { toFixed } from '../fixed';
import { grantBoost } from '../progress/handlers';
import { playerEffects } from '../progress/sources';
import type { Combatant } from '../events';
import { refreshCitizens, refreshExplored } from '../settlements/handlers';
import { settlementIds } from '../settlements/rules';
import { nextRange } from '../rng';
import type { GameState, PlayerId, SettlementState, UnitState } from '../state';
import { ownedUnit, watchers } from '../units/handlers';
import { availablePromotions, nextPromotionXp } from '../units/promotions';
import { canTraverse, fullMoves, hasRoom, MP, unitsOn } from '../units/movement';
import { checkVictory } from '../victory';
import { clearCampsOn } from './camps';
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

/** Shifts war support between two players at war (raiders don't count). */
function addWarSupport(
  draft: Draft<GameState>,
  ctx: EngineContext,
  gainer: PlayerId,
  other: PlayerId,
  amount: number,
) {
  if (gainer === HOSTILE || other === HOSTILE || amount === 0) return;
  const key = warKey(gainer, other);
  if (!draft.wars.includes(key)) return;
  const support = (draft.warSupport[key] ??= { [gainer]: 0, [other]: 0 });
  support[gainer] = Math.min(
    ctx.content.rules.combat.warSupport.max,
    (support[gainer] ?? 0) + amount,
  );
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
  if (by !== owner && draft.players[by] && by !== HOSTILE) draft.players[by]!.kills++;
  addWarSupport(draft, ctx, by, owner, ctx.content.rules.combat.warSupport.kill);
}

/** Yields a unit's owner earns when it destroys an enemy (its `killYields`). */
function rewardKill(draft: Draft<GameState>, ctx: EngineContext, killer: UnitState) {
  const p = draft.players[killer.owner];
  if (!p) return;
  const y = unitDef(ctx, killer).killYields;
  if (y.gold) p.gold += toFixed(y.gold);
  if (y.faith) p.faith += toFixed(y.faith);
}

/**
 * Abilities that take a beaten unit instead of destroying it (`capture_on_kill`): a roll of the
 * game's random numbers decides. Returns true if the unit changed hands.
 */
function takeOver(
  draft: Draft<GameState>,
  ctx: EngineContext,
  killer: UnitState,
  id: string,
  emit: Emit,
): boolean {
  if (killer.owner === HOSTILE) return false;
  const d = draft.units[id]!;
  const cls = unitDef(ctx, d).class;
  const snap = view(draft);
  const chance = playerEffects(ctx, snap, killer.owner, 'capture_on_kill')
    .filter(({ effect }) => {
      const c = effect.params.unitClass;
      return Array.isArray(c) ? c.includes(cls) : c === cls;
    })
    .reduce((best, { effect }) => Math.max(best, effect.params.percent), 0);
  if (chance === 0) return false;
  const [roll, next] = nextRange(draft.rng as GameState['rng'], 1, 100);
  draft.rng = castDraft(next);
  if (roll > chance) return false;
  const from = d.owner;
  d.owner = killer.owner;
  d.health = Math.floor(ctx.content.rules.combat.maxHealth / 2);
  d.moves = 0;
  d.orders = null;
  d.xp = 0;
  if (from !== HOSTILE && draft.players[killer.owner]) draft.players[killer.owner]!.kills++;
  emit({
    type: 'civilian_captured',
    unit: id,
    unitType: d.type,
    from,
    by: killer.owner,
    tile: d.tile,
    visibleTo: seenBy(watchers(ctx, current(draft), killer.owner, [d.tile]), from),
  });
  return true;
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
    // Raiders carry civilians off.
    if (by === HOSTILE) {
      killUnit(draft, ctx, u.id, by, emit);
      continue;
    }
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
  if (u.owner !== HOSTILE) refreshExplored(draft, ctx, u.owner);
  emit({
    type: 'unit_moved',
    unit: id,
    owner: u.owner,
    path: [from, to],
    visibleTo: watchers(ctx, current(draft), u.owner, [from, to]),
  });
  if (unitClassOf(ctx, u).combat) clearCampsOn(draft, ctx, u.owner, [to], emit);
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
  for (const k of Object.keys(draft.warSupport)) {
    if (k.split('|').includes(player)) delete draft.warSupport[k];
  }
  forgetPlayer(draft, player);
  emit({ type: 'player_defeated', player, by, visibleTo: 'all' });
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
  addWarSupport(draft, ctx, captor, from, ctx.content.rules.combat.warSupport.capture);
  captureRewards(draft, ctx, captor, id, emit);
  if (wasCapital) relocateCapital(draft, ctx, from, emit);
  checkDefeat(draft, from, captor, emit);
  checkVictory(draft, emit);
}

/** Abilities that pay out when the captor takes a settlement (`on_capture`). */
function captureRewards(
  draft: Draft<GameState>,
  ctx: EngineContext,
  captor: PlayerId,
  id: string,
  emit: Emit,
) {
  const p = draft.players[captor]!;
  const s = draft.settlements[id]!;
  for (const { effect } of playerEffects(ctx, view(draft), captor, 'on_capture')) {
    const r = effect.params;
    if (r.goldPerCitizen > 0) p.gold += toFixed(r.goldPerCitizen * s.population);
    if (r.healUnits) {
      for (const u of Object.values(draft.units)) {
        if (u.owner === captor) u.health = ctx.content.rules.combat.maxHealth;
      }
    }
    for (let i = 0; i < r.boostsPerDistrict * s.districts.length; i++)
      grantBoost(draft, ctx, captor, emit);
  }
}

function raze(draft: Draft<GameState>, id: string, emit: Emit) {
  const s = draft.settlements[id]!;
  if (s.capturedFrom && s.capturedFrom !== HOSTILE)
    draft.diplomacy.incidents.push({
      kind: 'razed',
      by: s.owner,
      against: s.capturedFrom,
      turn: draft.turn,
    });
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
  if (!t?.alive || target === player || !state.playerOrder.includes(target))
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

/** Ends a war, with a peace treaty that blocks a new one for a while. */
export function endWar(draft: Draft<GameState>, ctx: EngineContext, a: PlayerId, b: PlayerId) {
  const key = warKey(a, b);
  draft.diplomacy.peaceUntil[key] = draft.turn + ctx.content.rules.diplomacy.peaceTreatyTurns;
  draft.diplomacy.lastWar[key] = draft.turn;
  draft.wars = draft.wars.filter((k) => k !== key);
  delete draft.warStarted[key];
  delete draft.warSupport[key];
  draft.peaceOffers = draft.peaceOffers.filter((o) => o !== `${a}>${b}` && o !== `${b}>${a}`);
}

/**
 * A unit attacks a tile (already checked with `attackProblem`). Shared by players' attacks and
 * hostile raiders (mid-turn, so the numbers come from a snapshot of the state as it is now).
 */
export function performAttack(
  draft: Draft<GameState>,
  ctx: EngineContext,
  unitId: string,
  tile: number,
  emit: Emit,
) {
  const base = current(draft);
  const unit = base.units[unitId]!;
  const target = targetAt(ctx, base, unit.owner, tile)!;
  const a = draft.units[unit.id]!;
  // Some units (horse archers) keep moving after they attack.
  a.moves = unitDef(ctx, unit).movesAfterAttack ? Math.max(0, unit.moves - MP) : 0;
  a.orders = null;
  if (target.kind === 'civilian') {
    captureCivilians(draft, ctx, tile, unit.owner, emit);
    advance(draft, ctx, unit.id, tile, emit);
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
      tile: tile,
      dealt,
      taken,
      visibleTo: seenBy(watchers(ctx, current(draft), unit.owner, [unit.tile, tile]), d.owner),
    });
    const won = d.health <= 0;
    if (won) {
      rewardKill(draft, ctx, unit);
      if (!takeOver(draft, ctx, unit, d.id, emit)) killUnit(draft, ctx, d.id, unit.owner, emit);
    }
    if (a.health <= 0) {
      killUnit(draft, ctx, a.id, d.owner, emit);
      return;
    }
    // A melee winner moves into the tile it cleared, if it can stand there.
    if (won && mode === 'melee') {
      const snap = current(draft);
      if (canTraverse(ctx, snap, unit, tile)) {
        captureCivilians(draft, ctx, tile, unit.owner, emit);
        if (hasRoom(ctx, current(draft), unit, tile)) advance(draft, ctx, unit.id, tile, emit);
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
    tile: tile,
    dealt: hit.walls + hit.health,
    taken,
    visibleTo: seenBy(watchers(ctx, current(draft), unit.owner, [unit.tile, tile]), s.owner),
  });
  if (a.health <= 0) {
    killUnit(draft, ctx, a.id, s.owner, emit);
    return;
  }
  if (
    mode === 'melee' &&
    s.health <= 0 &&
    unitClassOf(ctx, unit).captures &&
    unit.owner !== HOSTILE
  ) {
    captureSettlement(draft, ctx, s.id, unit.owner, unit.id, emit);
  }
}

export const combatHandlers = {
  attack: {
    validate(state, action, ctx) {
      const unit = ownedUnit(state, action.player, action.unit);
      if (isError(unit)) return unit;
      return attackProblem(ctx, state, unit, action.tile);
    },
    apply(draft, action, ctx, emit) {
      performAttack(draft, ctx, action.unit, action.tile, emit);
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

  promote_unit: {
    validate(state, action, ctx) {
      const unit = ownedUnit(state, action.player, action.unit);
      if (isError(unit)) return unit;
      if (unit.xp < nextPromotionXp(ctx, unit))
        return {
          code: 'not_enough_xp',
          message: `Needs ${nextPromotionXp(ctx, unit)} XP (has ${unit.xp})`,
        };
      if (!availablePromotions(ctx, unit).includes(action.promotion))
        return { code: 'not_available', message: "This unit can't take that promotion now" };
      return undefined;
    },
    apply(draft, action, ctx, emit) {
      const u = draft.units[action.unit]!;
      u.xp -= nextPromotionXp(ctx, u);
      u.promotions.push(action.promotion);
      // Promoting heals fully but uses up the turn (Civ VI's rule).
      u.health = ctx.content.rules.combat.maxHealth;
      u.moves = 0;
      u.orders = null;
      emit({
        type: 'unit_promoted',
        unit: u.id,
        owner: u.owner,
        promotion: action.promotion,
        visibleTo: [u.owner],
      });
    },
  } satisfies ActionHandler<A<'promote_unit'>>,

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
      return warBlock(state, action.player, action.target);
    },
    apply(draft, action, ctx, emit) {
      const key = warKey(action.player, action.target);
      const surprise = isSurpriseWar(ctx, view(draft), action.player, action.target);
      draft.wars = [...draft.wars, key].sort();
      draft.warStarted[key] = draft.turn;
      draft.diplomacy.lastWar[key] = draft.turn;
      draft.players[action.player]!.declaredWarTurn = draft.turn;
      // A surprise war (no denouncement first) rallies the side that was declared on, and
      // everyone remembers it.
      draft.warSupport[key] = {
        [action.player]: 0,
        [action.target]: surprise ? ctx.content.rules.combat.warSupport.surprise : 0,
      };
      if (surprise)
        draft.diplomacy.incidents.push({
          kind: 'surprise_war',
          by: action.player,
          against: action.target,
          turn: draft.turn,
        });
      // Deals between them stop.
      const d = draft.diplomacy;
      const between = (a: string, b: string) =>
        (a === action.player && b === action.target) ||
        (a === action.target && b === action.player);
      d.payments = d.payments.filter((p) => !between(p.from, p.to));
      d.proposals = d.proposals.filter((p) => !between(p.from, p.to));
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
    apply(draft, action, ctx, emit) {
      // If they already offered peace, offering back makes it.
      if (draft.peaceOffers.includes(`${action.target}>${action.player}`)) {
        endWar(draft, ctx, action.player, action.target);
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
    apply(draft, action, ctx, emit) {
      endWar(draft, ctx, action.player, action.from);
      emit({ type: 'peace_made', players: [action.from, action.player], visibleTo: 'all' });
    },
  } satisfies ActionHandler<A<'accept_peace'>>,
} satisfies {
  [
    T in
      | 'attack'
      | 'strike'
      | 'promote_unit'
      | 'capture_choice'
      | 'declare_war'
      | 'offer_peace'
      | 'accept_peace'
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
