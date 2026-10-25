import type { Draft } from 'immer';
import type { EngineContext, Emit } from './context';
import { playerEra } from './progress/rules';
import type { GameState, PlayerId } from './state';

/**
 * Score and victories (docs/03-core-mechanics.md section 11, docs/04-advanced-systems.md
 * "Victory conditions"): domination (hold every rival's original capital), conquest (last one
 * standing) and score (highest at the turn limit). Teammates win together. The religious
 * victory is checked in `religion/handlers.ts`.
 */

export interface ScoreLine {
  label: string;
  amount: number;
}

export function scoreOf(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
): { total: number; lines: ScoreLine[] } {
  const r = ctx.content.rules.score;
  const p = state.players[player]!;
  const mine = Object.values(state.settlements).filter((s) => s.owner === player);
  const citizens = mine.reduce((a, s) => a + s.population, 0);
  const towns = mine.filter((s) => s.kind === 'town').length;
  const cities = mine.length - towns;
  const wonders = mine.reduce((a, s) => a + s.wonders.length, 0);
  const districts = mine.reduce((a, s) => a + s.districts.length, 0);
  const era = Math.max(0, (playerEra(ctx, p)?.order ?? 1) - 1);
  const lines: ScoreLine[] = [
    { label: 'Citizens', amount: citizens * r.perCitizen },
    { label: 'Cities', amount: cities * r.perCity },
    { label: 'Towns', amount: towns * r.perTown },
    { label: 'Technologies', amount: p.techs.done.length * r.perTech },
    { label: 'Civics', amount: p.civics.done.length * r.perCivic },
    { label: 'Wonders', amount: wonders * r.perWonder },
    { label: 'Districts', amount: districts * r.perDistrict },
    { label: 'Eras', amount: era * r.perEra },
    { label: 'Victories in battle', amount: p.kills * r.perKill },
  ].filter((l) => l.amount !== 0);
  return { total: lines.reduce((a, l) => a + l.amount, 0), lines };
}

/** A player and their teammates. */
export function teamOf(state: GameState, player: PlayerId): PlayerId[] {
  const team = state.players[player]!.team;
  if (team === null) return [player];
  return state.playerOrder.filter((id) => state.players[id]!.team === team);
}

/** Original capitals of other teams, and how many of them this player's team holds. */
export function dominationProgress(
  state: GameState,
  player: PlayerId,
): { held: number; needed: number } {
  const team = new Set(teamOf(state, player));
  let held = 0;
  let needed = 0;
  for (const s of Object.values(state.settlements)) {
    // City-states' capitals don't count: only civs'.
    if (!s.originalCapital || team.has(s.founder) || !state.playerOrder.includes(s.founder))
      continue;
    needed++;
    if (team.has(s.owner)) held++;
  }
  return { held, needed };
}

/** Ends the game (teammates of the winner win with them). */
export function endGame(
  draft: Draft<GameState>,
  reason: 'domination' | 'conquest' | 'score' | 'religion',
  winner: PlayerId | null,
  emit: Emit,
) {
  draft.status = 'ended';
  draft.result = { reason, winner };
  emit({ type: 'game_ended', reason, winner, visibleTo: 'all' });
}

/** After a capture or an elimination: has anyone conquered the world or its capitals? */
export function checkVictory(draft: Draft<GameState>, emit: Emit) {
  if (draft.status !== 'playing') return;
  const state = draft as GameState;
  const alive = state.playerOrder.filter((id) => state.players[id]!.alive);
  const teams = new Set(alive.map((id) => teamOf(state, id).join('+')));
  if (teams.size === 1 && state.playerOrder.length > 1 && alive.length > 0) {
    endGame(draft, 'conquest', alive[0]!, emit);
    return;
  }
  if (state.settings.domination === false) return;
  for (const id of alive) {
    const { held, needed } = dominationProgress(state, id);
    if (needed > 0 && held === needed) {
      endGame(draft, 'domination', id, emit);
      return;
    }
  }
}

/** At the turn limit: the highest score wins (ties go to the earlier player in turn order). */
export function scoreVictory(draft: Draft<GameState>, ctx: EngineContext, emit: Emit) {
  const state = draft as GameState;
  let best: { id: PlayerId; score: number } | null = null;
  for (const id of state.playerOrder) {
    if (!state.players[id]!.alive) continue;
    const score = scoreOf(ctx, state, id).total;
    if (!best || score > best.score) best = { id, score };
  }
  endGame(draft, 'score', best?.id ?? null, emit);
}
