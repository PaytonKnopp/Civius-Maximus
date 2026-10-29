import type { EngineContext } from '../context';
import type { GameState, PlayerId } from '../state';
import { manageCaptures, manageProduction, manageTowns, strikeFromSettlements } from './cities';
import { manageCityStates } from './citystates';
import { manageDiplomacy } from './diplomacy';
import { manageProgress, recruitGreatPeople, upgradeUnits } from './economy';
import { manageUnits } from './military';
import { useNukes } from './nukes';
import { manageReligion } from './religion';
import { bestSites } from './settle';
import { type Act, Turn } from './turn';
import { manageWar } from './war';

export { answerProposals, dealVerdict, type Verdict } from './diplomacy';
export { type Act, militaryStrength, personalityOf } from './turn';

/**
 * Plays one AI player's whole turn through `act` (which applies an action and returns the new
 * state, or undefined if the engine refused it), ending with End Turn. Returns the final state.
 *
 * The AI is a utility AI (docs/01-architecture.md, "AI"): each choice is scored with weights
 * from the leader's personality. It keeps no memory between turns, so a saved game plays on the
 * same, and it's deterministic: the same state always gets the same moves.
 */
export function playAiTurn(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  act: Act,
): GameState {
  const t = new Turn(ctx, state, player, act);
  const p = t.p;
  if (!p.alive || p.turnEnded || t.state.status !== 'playing') return t.state;
  manageCaptures(t);
  manageDiplomacy(t);
  manageCityStates(t);
  manageWar(t);
  manageProgress(t);
  manageReligion(t);
  strikeFromSettlements(t);
  useNukes(t);
  upgradeUnits(t);
  manageUnits(t);
  manageTowns(t);
  manageProduction(t);
  recruitGreatPeople(t);
  t.act({ type: 'end_turn', player });
  return t.state;
}

/** Where a player could settle next: the best sites they know of, scored as the AI would. */
export function settleSites(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  count = 12,
): { tile: number; score: number }[] {
  return bestSites(new Turn(ctx, state, player, () => undefined), count);
}
