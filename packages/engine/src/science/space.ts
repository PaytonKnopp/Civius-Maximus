import { resolveText } from '@cx/content';
import type { Draft } from 'immer';
import type { EngineContext, Emit, RuleError } from '../context';
import type { GameState, PlayerId } from '../state';
import { endGame } from '../victory';

/**
 * Science victory (docs/04-advanced-systems.md, "Victory conditions"): the space projects in
 * `rules.science.projects`, each on a Spaceport and in order; the last one is a ship that
 * arrives `travelTurns` later, and its builder wins.
 */

/** Why a player can't do this space project yet (other projects: undefined). */
export function spaceProblem(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  project: string,
): RuleError | undefined {
  const chain = ctx.content.rules.science.projects;
  const i = chain.indexOf(project);
  if (i < 0) return undefined;
  if (state.settings.science === false)
    return { code: 'off', message: 'Science victories are off in this game' };
  const p = state.players[player]!;
  if (p.spaceProjects.includes(project)) return { code: 'already_done', message: 'Already done' };
  const before = chain[i - 1];
  if (before && !p.spaceProjects.includes(before)) {
    const name = resolveText(ctx.content, ctx.content.entities.project[before]?.name ?? before);
    return { code: 'locked', message: `Needs ${name} first` };
  }
  return undefined;
}

/** A space project is finished: one step further, and the last one launches the expedition. */
export function spaceStep(
  draft: Draft<GameState>,
  ctx: EngineContext,
  player: PlayerId,
  project: string,
  emit: Emit,
) {
  const chain = ctx.content.rules.science.projects;
  const i = chain.indexOf(project);
  const p = draft.players[player]!;
  if (i < 0 || p.spaceProjects.includes(project)) return;
  p.spaceProjects = [...p.spaceProjects, project];
  const last = i === chain.length - 1;
  if (last) p.expeditionArrives = draft.turn + ctx.content.rules.science.travelTurns;
  emit({
    type: 'space_project',
    player,
    project,
    arrives: last ? p.expeditionArrives : null,
    visibleTo: 'all',
  });
}

/** How far a player is: space projects done out of all of them, and the arrival turn. */
export function spaceProgress(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
): { done: number; total: number; arrives: number | null } {
  const p = state.players[player]!;
  return {
    done: p.spaceProjects.length,
    total: ctx.content.rules.science.projects.length,
    arrives: p.expeditionArrives,
  };
}

/** End of each turn: an expedition that has arrived wins. */
export function scienceTurn(draft: Draft<GameState>, _ctx: EngineContext, emit: Emit) {
  if (draft.status !== 'playing' || draft.settings.science === false) return;
  for (const id of draft.playerOrder) {
    const p = draft.players[id]!;
    if (p.alive && p.expeditionArrives !== null && draft.turn >= p.expeditionArrives) {
      endGame(draft, 'science', id, emit);
      return;
    }
  }
}
