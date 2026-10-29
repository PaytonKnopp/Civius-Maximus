import { castDraft, type Draft } from 'immer';
import type { Action } from '../actions';
import { damageFor } from '../combat/damage';
import type { ActionHandler, EngineContext, RuleError } from '../context';
import { view } from '../draft';
import { distance, tilesWithin } from '../map/hex';
import { nextRange } from '../rng';
import type { GameState, PlayerId, SettlementState, UnitState } from '../state';
import { ownedUnit } from '../units/handlers';

/**
 * Apostles, inquisitors and gurus (docs/04-advanced-systems.md, "Religion"), after Civ VI.
 * With the theological combat option (D9), religious units of different religions fight with
 * their religious strength, at peace or at war; the winner's religion gains ground in the
 * settlements around, and gurus heal the hurt. Inquisitors drive other religions out of your
 * settlements either way.
 */

const religiousOf = (ctx: EngineContext, u: Pick<UnitState, 'type'>) =>
  ctx.content.entities.unit[u.type]?.religious;

/** Theological combat is a setup option, off unless chosen (D9). */
export const theologyOn = (state: Pick<GameState, 'settings'>) =>
  state.settings.theologicalCombat === true;

/** Why `unit` can't fight `target` in theological combat now, or undefined. */
export function theologyProblem(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  unitId: string,
  targetId: string,
): RuleError | undefined {
  if (!theologyOn(state)) return { code: 'off', message: 'Theological combat is off in this game' };
  const u = ownedUnit(state, player, unitId);
  if ('code' in u) return u;
  const r = religiousOf(ctx, u);
  if (!u.religion || !r || r.strength <= 0)
    return { code: 'not_religious', message: "That unit can't fight for its faith" };
  if (u.moves <= 0) return { code: 'no_moves', message: 'No moves left this turn' };
  const t = state.units[targetId];
  if (!t || t.owner === player) return { code: 'no_target', message: 'No rival there' };
  if (!t.religion || !religiousOf(ctx, t))
    return { code: 'no_target', message: 'Only religious units can be fought this way' };
  if (t.religion === u.religion) return { code: 'same_faith', message: 'They share your religion' };
  if (distance(state.map, u.tile, t.tile) > 1)
    return { code: 'too_far', message: 'Stand next to it' };
  return undefined;
}

/** Rival religious units next to (or on the tile of) a unit, which it could fight. */
export function theologyTargets(ctx: EngineContext, state: GameState, unit: UnitState): string[] {
  if (!theologyOn(state)) return [];
  return Object.values(state.units)
    .filter((t) => !theologyProblem(ctx, state, unit.owner, unit.id, t.id))
    .map((t) => t.id)
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}

/** Why an inquisitor can't purge other religions from this settlement, or undefined. */
export function heresyProblem(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  unitId: string,
  settlementId: string,
): RuleError | undefined {
  const u = ownedUnit(state, player, unitId);
  if ('code' in u) return u;
  if (!u.religion || !religiousOf(ctx, u)?.removesHeresy || !u.charges)
    return { code: 'not_inquisitor', message: 'Only an inquisitor can do that' };
  const s = state.settlements[settlementId];
  if (!s || s.owner !== player)
    return { code: 'not_yours', message: 'Only in your own settlements' };
  if (distance(state.map, u.tile, s.tile) > 1)
    return { code: 'too_far', message: 'Stand on or next to the settlement' };
  const others = Object.entries(s.pressure).some(([r, n]) => r !== u.religion && n > 0);
  if (!others && (s.religion === null || s.religion === u.religion))
    return { code: 'nothing', message: 'No other religion has a hold there' };
  return undefined;
}

function roll(draft: Draft<GameState>, ctx: EngineContext): number {
  const r = ctx.content.rules.combat.randomPercent;
  const [n, next] = nextRange(draft.rng as GameState['rng'], 100 - r, 100 + r);
  draft.rng = castDraft(next);
  return n;
}

/** The winner's religion gains, and the loser's loses, around the fight. */
function sway(
  draft: Draft<GameState>,
  ctx: EngineContext,
  tile: number,
  winner: string,
  loser: string,
) {
  const r = ctx.content.rules.religion;
  const near = new Set(tilesWithin(draft.map, tile, r.combatRadius));
  for (const s of Object.values(draft.settlements) as SettlementState[]) {
    if (!near.has(s.tile)) continue;
    s.pressure[winner] = (s.pressure[winner] ?? 0) + r.combatPressure;
    if (s.pressure[loser]) s.pressure[loser] = Math.max(0, s.pressure[loser]! - r.combatPressure);
  }
}

type A<T extends Action['type']> = Extract<Action, { type: T }>;

export const theologyHandlers = {
  theological_combat: {
    validate(state, action, ctx) {
      return theologyProblem(ctx, state, action.player, action.unit, action.target);
    },
    apply(draft, action, ctx, emit) {
      const a = draft.units[action.unit]!;
      const d = draft.units[action.target]!;
      const sa = religiousOf(ctx, a)!.strength;
      const sd = religiousOf(ctx, d)!.strength;
      const dealt = damageFor(ctx, sa - sd, roll(draft, ctx));
      const taken = damageFor(ctx, sd - sa, roll(draft, ctx));
      d.health -= dealt;
      a.health -= taken;
      a.moves = 0;
      let lost: string | null = null;
      const tile = d.tile;
      const ar = a.religion!;
      const dr = d.religion!;
      const attackerOwner = a.owner;
      const defenderOwner = d.owner;
      if (d.health <= 0) {
        lost = d.id;
        delete draft.units[d.id];
        if (a.health <= 0) a.health = 1;
        sway(draft, ctx, tile, ar, dr);
      } else if (a.health <= 0) {
        lost = a.id;
        delete draft.units[a.id];
        sway(draft, ctx, tile, dr, ar);
      }
      emit({
        type: 'theological_combat',
        attacker: action.unit,
        defender: action.target,
        attackerOwner,
        defenderOwner,
        tile,
        dealt,
        taken,
        lost,
        visibleTo: [attackerOwner, defenderOwner],
      });
    },
  } satisfies ActionHandler<A<'theological_combat'>>,

  remove_heresy: {
    validate(state, action, ctx) {
      return heresyProblem(ctx, state, action.player, action.unit, action.settlement);
    },
    apply(draft, action, ctx, emit) {
      const u = draft.units[action.unit]!;
      const s = draft.settlements[action.settlement]!;
      const keep = 100 - ctx.content.rules.religion.heresyRemoved;
      for (const r of Object.keys(s.pressure).sort()) {
        if (r !== u.religion) s.pressure[r] = Math.trunc((s.pressure[r]! * keep) / 100);
      }
      // Followers of another religion lose their faith; the pressure decides what comes next.
      if (s.religion !== null && s.religion !== u.religion) s.religion = null;
      u.moves = 0;
      u.charges = (u.charges ?? 1) - 1;
      if (u.charges <= 0) delete draft.units[action.unit];
      emit({
        type: 'heresy_removed',
        player: action.player,
        settlement: s.id,
        visibleTo: [action.player],
      });
    },
  } satisfies ActionHandler<A<'remove_heresy'>>,
};

/** Turn step: gurus heal the religious units of their faith around them. */
export function gurusTurn(draft: Draft<GameState>, ctx: EngineContext) {
  const snap = view(draft);
  const max = ctx.content.rules.combat.maxHealth;
  for (const g of Object.values(snap.units)) {
    const heals = religiousOf(ctx, g)?.heals ?? 0;
    if (heals <= 0 || !g.religion) continue;
    for (const u of Object.values(draft.units)) {
      if (u.owner !== g.owner || u.religion !== g.religion || u.health >= max) continue;
      if (distance(snap.map, u.tile, g.tile) > 1) continue;
      u.health = Math.min(max, u.health + heals);
    }
  }
}
