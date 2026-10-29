import type { EngineContext } from '../context';
import type { GameState } from '../state';
import { treeIds, treeNode } from './rules';
import { canEmbarkNow } from './sources';

/**
 * Starting in a later era (docs/02-multiplayer.md, "Game setup"): every tech and civic of the
 * earlier eras is done, and each player gets the era's starting gold (its units come with the
 * starting units). Called while the new game is built, before anyone moves.
 */
export function applyStartEra(state: GameState, ctx: EngineContext) {
  const id = state.settings.startEra;
  if (!id) return;
  const era = ctx.content.entities.era[id];
  if (!era) throw new Error(`Unknown era "${id}"`);
  const earlier = (e: string) => (ctx.content.entities.era[e]?.order ?? 0) < era.order;
  const techs = treeIds(ctx, 'tech').filter((t) => earlier(treeNode(ctx, 'tech', t)!.era));
  const civics = treeIds(ctx, 'civic').filter((c) => earlier(treeNode(ctx, 'civic', c)!.era));
  for (const pid of state.playerOrder) {
    const p = state.players[pid]!;
    p.techs = { ...p.techs, done: [...techs] };
    p.civics = { ...p.civics, done: [...civics] };
    p.gold += (era.start?.gold ?? 0) * 100;
    p.canEmbark = canEmbarkNow(ctx, state, pid);
  }
}

/** The extra units every player starts with in the chosen era. */
export function startEraUnits(state: GameState, ctx: EngineContext): string[] {
  const id = state.settings.startEra;
  return (id && ctx.content.entities.era[id]?.start?.units) || [];
}
