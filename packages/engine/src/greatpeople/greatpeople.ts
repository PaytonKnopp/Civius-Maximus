import type { GreatPersonDef } from '@cx/content';
import { current, type Draft } from 'immer';
import type { Action } from '../actions';
import {
  type ActionHandler,
  type EngineContext,
  type Emit,
  type RuleError,
  unitClassOf,
} from '../context';
import { view } from '../draft';
import { type Fixed, toFixed } from '../fixed';
import { distance } from '../map/hex';
import { advance, grantBoost } from '../progress/handlers';
import { playerEffects } from '../progress/sources';
import { maxReligions } from '../religion/rules';
import { settlementAt } from '../combat/strength';
import { itemKey } from '../settlements/rules';
import { spawnUnit } from '../settlements/handlers';
import type { GameState, PlayerId } from '../state';
import { ownedUnit } from '../units/handlers';

/**
 * Great people (docs/04-advanced-systems.md, "Great people"): districts and buildings earn
 * points toward each class; the first player to reach the next great person's cost earns
 * them (or buys them with gold). A great person walks to one of your settlements and is
 * activated there: a one-off reward, and for some, a lasting effect.
 */

/** Great people of a class in the order they come: by era, then content order. */
function lineup(ctx: EngineContext, cls: string): GreatPersonDef[] {
  const e = ctx.content.entities;
  return ctx.content.ids.greatPerson
    .map((id) => e.greatPerson[id]!)
    .filter((p) => p.class === cls)
    .map((p, i) => ({ p, i, order: e.era[p.era]?.order ?? 0 }))
    .sort((a, b) => a.order - b.order || a.i - b.i)
    .map((x) => x.p);
}

/**
 * The great person of a class anyone can earn next, if any are left. Prophets stop coming once
 * every religion the game can have has been founded.
 */
export function nextGreatPerson(
  ctx: EngineContext,
  state: GameState,
  cls: string,
): GreatPersonDef | undefined {
  if (
    ctx.content.entities.greatPersonClass[cls]?.foundsReligion &&
    Object.keys(state.religions).length >= maxReligions(ctx, state)
  )
    return undefined;
  return lineup(ctx, cls).find((p) => !state.greatPeople.claimed[p.id]);
}

/** Whether a player is still racing for a class: whoever founded a religion is out of the prophets'. */
export function inRace(ctx: EngineContext, state: GameState, player: PlayerId, cls: string) {
  return !(
    ctx.content.entities.greatPersonClass[cls]?.foundsReligion &&
    state.players[player]!.religion !== null
  );
}

/** Points the next great person of a class costs. */
export function greatPersonCost(ctx: EngineContext, state: GameState, cls: string): number {
  const def = ctx.content.entities.greatPersonClass[cls]!;
  const taken = lineup(ctx, cls).filter((p) => state.greatPeople.claimed[p.id]).length;
  return def.baseCost + def.costStep * taken;
}

/** Points a player earns each turn, per class. */
export function greatPersonRates(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const { effect } of playerEffects(ctx, state, player, 'great_person_points'))
    out[effect.params.class] = (out[effect.params.class] ?? 0) + effect.params.amount;
  for (const { effect } of playerEffects(ctx, state, player, 'great_person_points_percent')) {
    const c = effect.params.class;
    if (out[c]) out[c] = Math.floor((out[c] * (100 + effect.params.percent)) / 100);
  }
  return out;
}

export const pointsOf = (state: GameState, player: PlayerId, cls: string) =>
  state.greatPeople.points[player]?.[cls] ?? 0;

export type Currency = 'gold' | 'faith';

/** Whether a class can be recruited with this currency. */
export function canRecruitWith(ctx: EngineContext, cls: string, currency: Currency): boolean {
  if (currency === 'gold') return true;
  const def = ctx.content.entities.greatPersonClass[cls];
  return !!def?.faithRecruit && ctx.content.rules.greatPeople.faithPerPoint > 0;
}

/** Gold (or faith) to buy the next great person of a class now (for the points still missing). */
export function recruitCost(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  cls: string,
  currency: Currency = 'gold',
): Fixed {
  const missing = Math.max(0, greatPersonCost(ctx, state, cls) - pointsOf(state, player, cls));
  const rules = ctx.content.rules.greatPeople;
  return toFixed(missing * (currency === 'faith' ? rules.faithPerPoint : rules.goldPerPoint));
}

/** Gives the next great person of a class to a player: spent points, and a unit at the capital. */
function claim(
  draft: Draft<GameState>,
  ctx: EngineContext,
  player: PlayerId,
  cls: string,
  emit: Emit,
) {
  const snap = view(draft);
  const person = nextGreatPerson(ctx, snap, cls);
  if (!person) return;
  const cost = greatPersonCost(ctx, snap, cls);
  draft.greatPeople.claimed[person.id] = player;
  const points = (draft.greatPeople.points[player] ??= {});
  points[cls] = Math.max(0, (points[cls] ?? 0) - cost);
  const p = draft.players[player]!;
  const capital = p.capital ? draft.settlements[p.capital] : undefined;
  const unit = capital
    ? spawnUnit(draft, ctx, player, ctx.content.rules.greatPeople.unit, capital.tile)
    : undefined;
  if (unit) {
    draft.units[unit]!.person = person.id;
    draft.units[unit]!.moves = 0;
  }
  emit({ type: 'great_person_born', person: person.id, player, visibleTo: 'all' });
}

/** Why `unit` can't be activated where it stands, or undefined. */
export function activateProblem(
  state: GameState,
  unitId: string,
  player: PlayerId,
): RuleError | undefined {
  const u = ownedUnit(state, player, unitId);
  if ('code' in u) return u;
  if (!u.person) return { code: 'not_great_person', message: "That isn't a great person" };
  const s = settlementAt(state, u.tile);
  if (!s || s.owner !== player)
    return { code: 'not_in_settlement', message: 'Activate it in one of your settlements' };
  return undefined;
}

type A<T extends Action['type']> = Extract<Action, { type: T }>;

export const greatPeopleHandlers = {
  recruit_great_person: {
    validate(state, action, ctx) {
      if (!state.players[action.player]?.alive)
        return { code: 'not_playing', message: `${action.player} is not playing` };
      if (!ctx.content.entities.greatPersonClass[action.class])
        return { code: 'unknown', message: 'No such kind of great person' };
      if (!nextGreatPerson(ctx, state, action.class))
        return { code: 'none_left', message: 'None of those are left' };
      if (!inRace(ctx, state, action.player, action.class))
        return { code: 'out_of_race', message: 'You already founded a religion' };
      if (!canRecruitWith(ctx, action.class, action.currency))
        return { code: 'no_faith_recruit', message: "Those can't be recruited with faith" };
      const cost = recruitCost(ctx, state, action.player, action.class, action.currency);
      if (state.players[action.player]![action.currency] < cost)
        return {
          code: action.currency === 'gold' ? 'no_gold' : 'no_faith',
          message: `Needs ${Math.ceil(cost / 100)} ${action.currency}`,
        };
      return undefined;
    },
    apply(draft, action, ctx, emit) {
      const cost = recruitCost(ctx, view(draft), action.player, action.class, action.currency);
      draft.players[action.player]![action.currency] -= cost;
      const points = (draft.greatPeople.points[action.player] ??= {});
      points[action.class] = greatPersonCost(ctx, view(draft), action.class);
      claim(draft, ctx, action.player, action.class, emit);
    },
  } satisfies ActionHandler<A<'recruit_great_person'>>,

  activate_great_person: {
    validate(state, action) {
      return activateProblem(state, action.unit, action.player);
    },
    apply(draft, action, ctx, emit) {
      const snap = current(draft);
      const u = snap.units[action.unit]!;
      const person = ctx.content.entities.greatPerson[u.person!]!;
      const s = settlementAt(snap, u.tile)!;
      const p = draft.players[action.player]!;
      delete draft.units[action.unit];
      for (const a of person.activate) {
        if (a.kind === 'boosts') {
          for (let i = 0; i < a.count; i++) grantBoost(draft, ctx, action.player, emit);
        } else if (a.kind === 'promote') {
          for (const unit of Object.values(draft.units)) {
            if (unit.owner !== action.player || distance(snap.map, unit.tile, s.tile) > a.radius)
              continue;
            const promo = ctx.content.entities.promotion[a.promotion];
            if (!promo?.classes.includes(unitClassOf(ctx, unit).id)) continue;
            if (!unit.promotions.includes(a.promotion)) unit.promotions.push(a.promotion);
          }
        } else {
          for (const [y, v] of Object.entries(a.yields)) {
            const amount = toFixed(v);
            if (y === 'science') advance(draft, ctx, action.player, 'tech', amount, emit);
            else if (y === 'culture') advance(draft, ctx, action.player, 'civic', amount, emit);
            else if (y === 'gold') p.gold += amount;
            else if (y === 'faith') p.faith += amount;
            else if (y === 'influence') p.influence += amount;
            else if (y === 'food') draft.settlements[s.id]!.food += amount;
            else if (y === 'production') {
              const head = draft.settlements[s.id]!.queue[0];
              if (head) {
                const key = itemKey(head);
                draft.settlements[s.id]!.progress[key] =
                  (draft.settlements[s.id]!.progress[key] ?? 0) + amount;
              } else p.gold += amount;
            }
          }
        }
      }
      p.greatPeople = [...p.greatPeople, person.id];
      emit({
        type: 'great_person_activated',
        person: person.id,
        player: action.player,
        settlement: s.id,
        visibleTo: 'all',
      });
    },
  } satisfies ActionHandler<A<'activate_great_person'>>,
} satisfies { [T in 'recruit_great_person' | 'activate_great_person']: ActionHandler<A<T>> };

/** End of each turn: points come in, and whoever reaches a great person's cost first earns them. */
export function greatPeopleTurn(draft: Draft<GameState>, ctx: EngineContext, emit: Emit) {
  for (const id of draft.playerOrder) {
    if (!draft.players[id]!.alive) continue;
    const snap = view(draft);
    const rates = greatPersonRates(ctx, snap, id);
    const points = (draft.greatPeople.points[id] ??= {});
    for (const cls of Object.keys(rates).sort()) {
      if (inRace(ctx, snap, id, cls)) points[cls] = (points[cls] ?? 0) + rates[cls]!;
    }
  }
  for (const cls of ctx.content.ids.greatPersonClass) {
    const snap = view(draft);
    if (!nextGreatPerson(ctx, snap, cls)) continue;
    const cost = greatPersonCost(ctx, snap, cls);
    let winner: { id: PlayerId; points: number } | undefined;
    for (const id of snap.playerOrder) {
      if (!snap.players[id]!.alive || !inRace(ctx, snap, id, cls)) continue;
      const pts = pointsOf(snap, id, cls);
      if (pts >= cost && (!winner || pts > winner.points)) winner = { id, points: pts };
    }
    if (winner) claim(draft, ctx, winner.id, cls, emit);
  }
}
