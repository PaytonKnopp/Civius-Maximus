import { type Effect, resolveText } from '@cx/content';
import type { Draft } from 'immer';
import type { Action } from '../actions';
import type { ActionHandler, Emit, EngineContext } from '../context';
import type { EffectSource } from '../effects/yields';
import type { GameState, GovernorState, PlayerState } from '../state';

/**
 * Governors (docs/04-advanced-systems.md, "Governors"), after Civ VI. Some civics each grant a
 * governor title (`rules.governors.titleCivics`). A title appoints a new governor or buys a
 * promotion for one already serving. A governor is assigned to one of your settlements and
 * takes a few turns to establish there; then its settlement-scope effects apply in that
 * settlement only, and its player-scope ones empire-wide.
 */

type A<T extends Action['type']> = Extract<Action, { type: T }>;

/** Titles earned so far: one per title civic finished. */
export function titlesEarned(ctx: EngineContext, p: Pick<PlayerState, 'civics'>): number {
  const titled = new Set(ctx.content.rules.governors.titleCivics);
  return p.civics.done.filter((c) => titled.has(c)).length;
}

/** Titles spent: each appointment and each promotion. */
export function titlesSpent(p: Pick<PlayerState, 'governors'>): number {
  return Object.values(p.governors ?? {}).reduce((n, g) => n + 1 + g.promotions.length, 0);
}

export function titlesAvailable(ctx: EngineContext, p: PlayerState): number {
  return Math.max(0, titlesEarned(ctx, p) - titlesSpent(p));
}

/** The governor established in a settlement, if any. */
export function governorOf(state: GameState, settlement: string): string | undefined {
  const s = state.settlements[settlement];
  const p = s ? state.players[s.owner] : undefined;
  for (const [id, g] of Object.entries(p?.governors ?? {}))
    if (g.settlement === settlement && g.established) return id;
  return undefined;
}

/** Wraps settlement-scope effects so they only apply where the governor serves. */
function local(effects: readonly Effect[], governor: string): Effect[] {
  return effects.map((e) => {
    if (e.target.scope !== 'settlements') return e;
    const here = { settlement_has_governor: governor };
    return { ...e, condition: e.condition ? { all: [e.condition, here] } : here } as Effect;
  });
}

/** Effect sources of a player's established governors (for `activeSources`). */
export function governorSources(ctx: EngineContext, p: PlayerState): EffectSource[] {
  const out: EffectSource[] = [];
  for (const [id, g] of Object.entries(p.governors ?? {})) {
    if (!g.established) continue;
    const def = ctx.content.entities.governor[id];
    if (!def) continue;
    const label = `${resolveText(ctx.content, def.name)} ${resolveText(ctx.content, def.title)}`;
    if (def.effects.length > 0) out.push({ id, label, effects: local(def.effects, id) });
    for (const promo of def.promotions) {
      if (!g.promotions.includes(promo.id) || promo.effects.length === 0) continue;
      out.push({
        id: `${id}:${promo.id}`,
        label: `${label}: ${resolveText(ctx.content, promo.name)}`,
        effects: local(promo.effects, id),
      });
    }
  }
  return out;
}

/** Turn step: governors that have served long enough become established. */
export function governorsTurn(draft: Draft<GameState>, _ctx: EngineContext, emit: Emit) {
  for (const id of draft.playerOrder) {
    const p = draft.players[id]!;
    for (const [gid, g] of Object.entries(p.governors ?? {})) {
      // A settlement lost (captured, razed) loses its governor.
      if (g.settlement !== null && draft.settlements[g.settlement]?.owner !== id) {
        g.settlement = null;
        g.established = false;
      }
      if (g.established || g.settlement === null || draft.turn + 1 < g.activeOn) continue;
      g.established = true;
      emit({
        type: 'governor_established',
        player: id,
        governor: gid,
        settlement: g.settlement,
        visibleTo: [id],
      });
    }
  }
}

function problem(code: string, message: string) {
  return { code, message };
}

export const governorHandlers = {
  appoint_governor: {
    validate(state, action, ctx) {
      const p = state.players[action.player];
      if (!p?.alive) return problem('not_playing', `${action.player} is not playing`);
      if (!ctx.content.entities.governor[action.governor])
        return problem('unknown', `Unknown governor "${action.governor}"`);
      if (p.governors?.[action.governor]) return problem('already', 'Already appointed');
      if (titlesAvailable(ctx, p) < 1)
        return problem('no_title', 'No governor title to spend (civics grant them)');
      return undefined;
    },
    apply(draft, action) {
      const p = draft.players[action.player]!;
      (p.governors ??= {})[action.governor] = {
        promotions: [],
        settlement: null,
        activeOn: 0,
        established: false,
      } satisfies GovernorState;
    },
  } satisfies ActionHandler<A<'appoint_governor'>>,

  promote_governor: {
    validate(state, action, ctx) {
      const p = state.players[action.player];
      if (!p?.alive) return problem('not_playing', `${action.player} is not playing`);
      const g = p.governors?.[action.governor];
      if (!g) return problem('not_appointed', 'Appoint this governor first');
      const def = ctx.content.entities.governor[action.governor]!;
      const promo = def.promotions.find((x) => x.id === action.promotion);
      if (!promo) return problem('unknown', `Unknown promotion "${action.promotion}"`);
      if (g.promotions.includes(promo.id)) return problem('already', 'Already promoted');
      if (promo.requires.some((r) => !g.promotions.includes(r)))
        return problem('locked', 'Take the promotion before it first');
      if (titlesAvailable(ctx, p) < 1) return problem('no_title', 'No governor title to spend');
      return undefined;
    },
    apply(draft, action) {
      draft.players[action.player]!.governors![action.governor]!.promotions.push(action.promotion);
    },
  } satisfies ActionHandler<A<'promote_governor'>>,

  assign_governor: {
    validate(state, action) {
      const p = state.players[action.player];
      if (!p?.alive) return problem('not_playing', `${action.player} is not playing`);
      const g = p.governors?.[action.governor];
      if (!g) return problem('not_appointed', 'Appoint this governor first');
      const s = state.settlements[action.settlement];
      if (!s || s.owner !== action.player)
        return problem('not_yours', 'Governors serve in your own settlements');
      if (g.settlement === action.settlement) return problem('already', 'Already serving there');
      return undefined;
    },
    apply(draft, action, ctx) {
      const govs = draft.players[action.player]!.governors!;
      // One governor per settlement: whoever was there steps down.
      for (const g of Object.values(govs)) {
        if (g.settlement === action.settlement) {
          g.settlement = null;
          g.established = false;
        }
      }
      const g = govs[action.governor]!;
      g.settlement = action.settlement;
      g.activeOn = draft.turn + ctx.content.rules.governors.establishTurns;
      g.established = ctx.content.rules.governors.establishTurns === 0;
    },
  } satisfies ActionHandler<A<'assign_governor'>>,
};
