import type { Action } from './actions';
import { applyAction, createGame, type EngineContext, type GameSetup } from './game';
import { stateHash } from './hash';
import type { GameState } from './state';

/** A whole game as its setup plus every accepted action: enough to rebuild any moment of it. */
export interface Replay {
  setup: GameSetup;
  actions: Action[];
}

/**
 * Replays a game from its setup. Throws if a recorded action is rejected, which means the rules
 * changed in a way that breaks old games (or the recording is corrupt).
 */
export function runReplay(replay: Replay, ctx: EngineContext): { state: GameState; hash: string } {
  let state = createGame(replay.setup, ctx);
  replay.actions.forEach((action, i) => {
    const result = applyAction(state, action, ctx);
    if (!result.ok) {
      throw new Error(`Replay diverged at action ${i} (${action.type}): ${result.error.message}`);
    }
    state = result.state;
  });
  return { state, hash: stateHash(state) };
}
