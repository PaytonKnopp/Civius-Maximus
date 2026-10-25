import {
  type Action,
  type ActionResult,
  answerProposals,
  applyAction,
  createGame,
  type EngineContext,
  type GameEvent,
  type GameSetup,
  type GameState,
  playAiTurn,
  type PlayerId,
  validateAction,
} from '@cx/engine';

export type GameListener = (state: GameState, events: GameEvent[]) => void;

/** The state after a turn's work, and what happened. */
export interface TurnWork {
  state: GameState;
  events: GameEvent[];
}

/**
 * Runs the slow part of a turn somewhere else (a Web Worker in the browser): applies `action`
 * if given (End Turn, which may process the turn), then AI seats answer deals and play.
 */
export type AiRunner = (state: GameState, action: Action | null) => Promise<TurnWork>;

/**
 * Applies `action` (if any), then lets AI seats answer the deals offered to them and play their
 * turns. Deterministic: a worker and the page get the same result from the same state.
 */
export function runTurn(ctx: EngineContext, start: GameState, action: Action | null): TurnWork {
  let state = start;
  const events: GameEvent[] = [];
  const apply = (a: Action) => {
    const r = applyAction(state, a, ctx);
    if (!r.ok) return undefined;
    state = r.state;
    events.push(...r.events);
    return r.state;
  };
  if (action) apply(action);
  // AI seats answer deals offered to them right away (the same verdict the deal screen shows).
  const waiting = [
    ...new Set(
      state.diplomacy.proposals.map((p) => p.to).filter((to) => state.players[to]?.kind === 'ai'),
    ),
  ].sort();
  for (const ai of waiting) state = answerProposals(ctx, state, ai, apply);
  // AI seats play as soon as their turn starts (more than once if a turn ends meanwhile).
  for (let guard = 0; guard < 4 && state.status === 'playing'; guard++) {
    const ais = state.playerOrder.filter((id) => {
      const p = state.players[id]!;
      return p.alive && p.kind === 'ai' && !p.turnEnded;
    });
    if (ais.length === 0) break;
    for (const player of ais) state = playAiTurn(ctx, state, player, apply);
  }
  return { state, events };
}

const aiWaiting = (state: GameState) =>
  state.status === 'playing' &&
  state.playerOrder.some((id) => {
    const p = state.players[id]!;
    return p.alive && p.kind === 'ai' && !p.turnEnded;
  });

/**
 * A game hosted in this browser tab: single player and hotseat use it directly, and the online
 * host (M13) wraps the same idea with a network transport. AI seats play their whole turn as soon
 * as it starts (the engine's AI, `playAiTurn`). With an `AiRunner`, End Turn and the AI turns run
 * off the page (`busy` meanwhile, and actions wait), so the page never freezes.
 */
export class LocalGame {
  state: GameState;
  /** Rivals are moving (in the runner): actions are refused until they're done. */
  busy = false;
  private listeners = new Set<GameListener>();

  /** A new game from a setup, or a saved game from its state. */
  constructor(
    start: GameSetup | GameState,
    readonly ctx: EngineContext,
    private readonly runner?: AiRunner,
  ) {
    // A loaded save is frozen like every engine state, so Immer can share its untouched parts.
    this.state = 'stateVersion' in start ? deepFreeze(start) : createGame(start, ctx);
    if (runner && aiWaiting(this.state)) this.work(null);
    else this.state = runTurn(ctx, this.state, null).state;
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
    this.tell([]);
  }

  /** Applies a player's action; on success, AI seats respond and listeners are told. */
  act(action: Action): ActionResult {
    if (this.busy)
      return { ok: false, error: { code: 'busy', message: 'Your rivals are still moving' } };
    // The End Turn that ends the round (the last human's) processes the turn: that, and the
    // AI turns after it, go to the runner. Anything else is quick.
    const last =
      action.type === 'end_turn' &&
      this.humans().every((id) => id === action.player || this.state.players[id]!.turnEnded);
    if (this.runner && last) {
      const error = validateAction(this.state, action, this.ctx);
      if (error) return { ok: false, error };
      this.work(action);
      return { ok: true, state: this.state, events: [] };
    }
    const result = applyAction(this.state, action, this.ctx);
    if (!result.ok) return result;
    const work = runTurn(this.ctx, result.state, null);
    this.state = work.state;
    const events = [...result.events, ...work.events];
    this.tell(events);
    return { ok: true, state: this.state, events };
  }

  /** Hands the turn's work to the runner (falling back to this page if it fails). */
  private work(action: Action | null) {
    this.busy = true;
    this.tell([]);
    const from = this.state;
    void this.runner!(from, action)
      .catch(() => runTurn(this.ctx, from, action))
      .then((done) => {
        this.state = deepFreeze(done.state);
        this.busy = false;
        this.tell(done.events);
      });
  }

  private tell(events: GameEvent[]) {
    for (const fn of this.listeners) fn(this.state, events);
  }
}

/** Freezes a state (from a save or a worker) like every engine state. */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}
