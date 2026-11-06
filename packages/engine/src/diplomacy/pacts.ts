import type { Effect } from '@cx/content';
import { type EngineContext, warKey } from '../context';
import type { EffectSource } from '../effects/yields';
import type { GameState, PlayerId, ResourceTrade } from '../state';

/**
 * Open borders, research agreements and resource trades (D118; docs/04-advanced-systems.md,
 * "Diplomacy & deals"). This file only reads state, so the effects system can use it without
 * pulling in the rest of diplomacy.
 */

/** Open borders between two players still running this turn. */
export const haveOpenBorders = (state: GameState, a: PlayerId, b: PlayerId) =>
  (state.diplomacy?.openBorders?.[warKey(a, b)] ?? 0) >= state.turn;

/** A research agreement between two players still running this turn. */
export const haveResearchAgreement = (state: GameState, a: PlayerId, b: PlayerId) =>
  (state.diplomacy?.research?.[warKey(a, b)] ?? 0) >= state.turn;

/** The players `player` has a research agreement with, in seat order. */
export function researchPartners(state: GameState, player: PlayerId): PlayerId[] {
  const research = state.diplomacy?.research;
  if (!research) return [];
  // Most of the time nothing is running: skip asking about every pair.
  if (!Object.values(research).some((until) => until >= state.turn)) return [];
  return state.playerOrder.filter(
    (o) => o !== player && state.players[o]?.alive && haveResearchAgreement(state, player, o),
  );
}

/**
 * Each running research agreement: more science in every settlement (`researchPercent`), as an
 * effect source so it shows in the yields breakdown ("Research agreement with Rome").
 */
export function pactSources(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
): EffectSource[] {
  const percent = ctx.content.rules.diplomacy.researchPercent;
  if (percent === 0) return [];
  const effects: Effect[] = [
    {
      effect: 'modify_yield',
      params: { yield: 'science', percent },
      target: { scope: 'settlements' },
    },
  ];
  return researchPartners(state, player).map((o): EffectSource => ({
    id: `research:${o}`,
    label: `Research agreement with ${state.players[o]!.name}`,
    effects,
  }));
}

/** Resource trades still running (in the order they were signed). */
export function tradesOf(state: GameState): readonly ResourceTrade[] {
  return state.diplomacy?.trades ?? [];
}

/** What a player sends (`'from'`) or receives (`'to'`) through trades, per resource. */
export function tradedBy(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  side: 'from' | 'to',
  resourceClass?: 'luxury' | 'strategic',
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of tradesOf(state)) {
    if (t[side] !== player) continue;
    if (resourceClass && ctx.content.entities.resource[t.resource]?.class !== resourceClass)
      continue;
    out[t.resource] = (out[t.resource] ?? 0) + t.amount;
  }
  return out;
}
