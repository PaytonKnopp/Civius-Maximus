import {
  type Action,
  type ActionResult,
  applyAction,
  createGame,
  type EngineContext,
  type GameEvent,
  type GameSetup,
  type GameState,
  type PlayerId,
} from '@cx/engine';
import { placeholderAiActions } from './placeholder-ai';

export type GameListener = (state: GameState, events: GameEvent[]) => void;

/**
 * A game hosted in this browser tab: single player and hotseat use it directly, and the online
 * host (M13) wraps the same idea with a network transport. Until the AI exists (M11), AI seats
 * play a placeholder routine (found settlements, keep building) and end their turn at once.
 */
export class LocalGame {
  state: GameState;
  private listeners = new Set<GameListener>();

  /** A new game from a setup, or a saved game from its state. */
  constructor(
    start: GameSetup | GameState,
    readonly ctx: EngineContext,
  ) {
    // A loaded save is frozen like every engine state, so Immer can share its untouched parts.
    this.state = 'stateVersion' in start ? deepFreeze(start) : createGame(start, ctx);
    this.endAiTurns([]);
  }

  /** Human players still in the game, in turn order. */
  humans(): PlayerId[] {
    return this.state.playerOrder.filter((id) => {
      const p = this.state.players[id]!;
      return p.alive && p.kind === 'human';
    });
  }

  /** The human who plays next this turn (hotseat): the first who hasn't ended their turn. */
  nextHuman(): PlayerId | undefined {
    return this.humans().find((id) => !this.state.players[id]!.turnEnded);
  }

  subscribe(listener: GameListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Replaces the whole game (loading a save, or a test setting up a scene) and tells listeners. */
  load(state: GameState) {
    this.state = state;
    for (const fn of this.listeners) fn(this.state, []);
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
        const actions = [
          ...placeholderAiActions(this.ctx, this.state, player),
          { type: 'end_turn' as const, player },
        ];
        for (const action of actions) {
          const r = applyAction(this.state, action, this.ctx);
          if (r.ok) {
            this.state = r.state;
            events.push(...r.events);
          }
        }
      }
    }
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}
