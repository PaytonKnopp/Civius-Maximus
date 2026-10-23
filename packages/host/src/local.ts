import {
  type Action,
  type ActionResult,
  applyAction,
  createGame,
  type EngineContext,
  type GameEvent,
  type GameSetup,
  type GameState,
} from '@cx/engine';

export type GameListener = (state: GameState, events: GameEvent[]) => void;

/**
 * A game hosted in this browser tab: single player and hotseat use it directly, and the online
 * host (M13) wraps the same idea with a network transport. Until the AI exists (M11), AI seats
 * simply end their turn as soon as it starts.
 */
export class LocalGame {
  state: GameState;
  private listeners = new Set<GameListener>();

  constructor(
    setup: GameSetup,
    readonly ctx: EngineContext,
  ) {
    this.state = createGame(setup, ctx);
    this.endAiTurns([]);
  }

  subscribe(listener: GameListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Applies a player's action; on success, AI seats respond and listeners are told. */
  act(action: Action): ActionResult {
    const result = applyAction(this.state, action, this.ctx);
    if (!result.ok) return result;
    this.state = result.state;
    const events = [...result.events];
    this.endAiTurns(events);
    for (const fn of this.listeners) fn(this.state, events);
    return { ok: true, state: this.state, events };
  }

  private endAiTurns(events: GameEvent[]) {
    for (let guard = 0; guard < 4 && this.state.status === 'playing'; guard++) {
      const waiting = this.state.playerOrder.filter((id) => {
        const p = this.state.players[id]!;
        return p.alive && p.kind === 'ai' && !p.turnEnded;
      });
      if (waiting.length === 0) return;
      for (const player of waiting) {
        const r = applyAction(this.state, { type: 'end_turn', player }, this.ctx);
        if (r.ok) {
          this.state = r.state;
          events.push(...r.events);
        }
      }
    }
  }
}
