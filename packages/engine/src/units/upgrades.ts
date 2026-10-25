import { resolveText } from '@cx/content';
import type { Action } from '../actions';
import type { ActionHandler, EngineContext, RuleError } from '../context';
import { view } from '../draft';
import { type Fixed, toFixed } from '../fixed';
import { lockedReason } from '../settlements/rules';
import type { GameState, PlayerId } from '../state';
import { replacementFor, uniqueProblem } from '../uniques';
import { ownedUnit } from './handlers';

/**
 * Unit upgrades (docs/03-core-mechanics.md, "Units"): each unit names what it becomes
 * (`upgradesTo`; uniques follow the unit they replace). Once a player can build that unit, the
 * old one can't be built any more, and units already in the field can be upgraded for gold in
 * the player's territory, straight to the newest unit along the chain they can build.
 */

/** What a player's unit of this type upgrades to (their own unique version, if they have one). */
export function upgradeTarget(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  type: string,
): string | undefined {
  const e = ctx.content.entities.unit;
  const def = e[type];
  const next = def?.upgradesTo ?? (def?.replaces ? e[def.replaces]?.upgradesTo : undefined);
  if (!next) return undefined;
  const civ = state.players[player]?.civ ?? '';
  return replacementFor(ctx, 'unit', civ, next) ?? next;
}

/** Whether a player can build this unit now. */
const buildable = (ctx: EngineContext, state: GameState, player: PlayerId, type: string) =>
  !lockedReason(ctx, state, player, ctx.content.entities.unit[type]!) &&
  !uniqueProblem(ctx, state, player, 'unit', type);

/**
 * The newest unit this one has been replaced by, for a player who can build it now (following
 * the chain: a Warrior becomes Infantry if the player can build Infantry), if any.
 */
export function obsoletedBy(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  type: string,
): string | undefined {
  let best: string | undefined;
  const seen = new Set<string>([type]);
  for (let next = upgradeTarget(ctx, state, player, type); next && !seen.has(next);) {
    if (!buildable(ctx, state, player, next)) break;
    best = next;
    seen.add(next);
    next = upgradeTarget(ctx, state, player, next);
  }
  return best;
}

/** Gold to upgrade a unit now. */
export function upgradeCost(ctx: EngineContext, from: string, to: string): Fixed {
  const r = ctx.content.rules.units;
  const e = ctx.content.entities.unit;
  const gap = Math.max(0, (e[to]?.cost ?? 0) - (e[from]?.cost ?? 0));
  return toFixed(Math.max(r.upgradeMinGold, Math.ceil(gap * r.upgradeGoldPerProduction)));
}

/** Why a unit can't be upgraded now, or undefined. */
export function upgradeProblem(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  unitId: string,
): RuleError | undefined {
  const u = ownedUnit(state, player, unitId);
  if ('code' in u) return u;
  const first = upgradeTarget(ctx, state, player, u.type);
  if (!first) return { code: 'no_upgrade', message: "This unit doesn't upgrade" };
  const to = obsoletedBy(ctx, state, player, u.type);
  if (!to) {
    const name = resolveText(ctx.content, ctx.content.entities.unit[first]!.name);
    const locked = lockedReason(ctx, state, player, ctx.content.entities.unit[first]!);
    return { code: 'locked', message: `Upgrades to ${name}: ${locked ?? 'not available'}` };
  }
  if (state.map.tiles[u.tile]?.owner !== player)
    return { code: 'not_home', message: 'Upgrade it in your own territory' };
  if (u.moves <= 0) return { code: 'no_moves', message: 'No moves left this turn' };
  if ((u.cargo?.length ?? 0) > 0) return { code: 'packed', message: 'Unpack its units first' };
  const cost = upgradeCost(ctx, u.type, to);
  if (state.players[player]!.gold < cost)
    return { code: 'no_gold', message: `Needs ${Math.ceil(cost / 100)} gold` };
  return undefined;
}

type A<T extends Action['type']> = Extract<Action, { type: T }>;

export const upgradeHandlers = {
  upgrade_unit: {
    validate(state, action, ctx) {
      return upgradeProblem(ctx, state, action.player, action.unit);
    },
    apply(draft, action, ctx, emit) {
      const u = draft.units[action.unit]!;
      const from = u.type;
      const to = obsoletedBy(ctx, view(draft), action.player, from)!;
      draft.players[action.player]!.gold -= upgradeCost(ctx, from, to);
      u.type = to;
      u.moves = 0;
      u.orders = null;
      emit({
        type: 'unit_upgraded',
        unit: u.id,
        owner: action.player,
        from,
        to,
        visibleTo: [action.player],
      });
    },
  } satisfies ActionHandler<A<'upgrade_unit'>>,
} satisfies { [T in 'upgrade_unit']: ActionHandler<A<T>> };
