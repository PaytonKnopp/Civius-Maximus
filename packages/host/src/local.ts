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
  turnOrder,
  validateAction,
  visibleTiles,
} from '@cx/engine';
import type { GameHandle } from './handle';

export type GameListener = (state: GameState, events: GameEvent[]) => void;

/** The state after a turn's work, and what happened. */
export interface TurnWork {
  state: GameState;
  events: GameEvent[];
  /** Seats whose AI failed and passed its turn instead, in words (a bug to report). */
  problems?: string[];
}

/** An error's message, for a line the player can read and send on. */
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e)) || 'unknown error';

/**
 * How far a turn's slow part has got, for a progress line: first the world takes its turn (the
 * End Turn that closes the round), then the rival seats play one after another.
 */
export interface TurnProgress {
  phase: 'world' | 'rivals';
  /** Rival seats finished so far, of `total` (both 0 while the world takes its turn). */
  done: number;
  total: number;
}

/**
 * Runs the slow part of a turn somewhere else (a Web Worker in the browser): applies `action`
 * if given (End Turn, which may process the turn), then AI seats answer deals and play.
 * `onProgress` hears how it's going.
 */
export type AiRunner = (
  state: GameState,
  action: Action | null,
  onProgress?: (progress: TurnProgress) => void,
) => Promise<TurnWork>;

/**
 * Applies `action` (if any), then lets AI seats answer the deals offered to them and play their
 * turns. Deterministic: a worker and the page get the same result from the same state.
 */
export function runTurn(
  ctx: EngineContext,
  start: GameState,
  action: Action | null,
  onProgress?: (progress: TurnProgress) => void,
): TurnWork {
  let state = start;
  const events: GameEvent[] = [];
  const problems: string[] = [];
  const apply = (a: Action) => {
    const r = applyAction(state, a, ctx);
    if (!r.ok) return undefined;
    state = r.state;
    events.push(...r.events);
    return r.state;
  };
  if (action) {
    onProgress?.({ phase: 'world', done: 0, total: 0 });
    apply(action);
  }
  /**
   * One AI seat's part. If its code fails (a bug), the game must not stop with it: what it had
   * done so far stands (every action is applied whole), it passes the rest of its turn, and the
   * player is told so they can report it. Deterministic like the rest: the same state fails the
   * same way on the page, in the worker and on a host.
   */
  const seat = (player: PlayerId, what: string, play: () => GameState) => {
    try {
      state = play();
    } catch (e) {
      const name = state.players[player]?.name ?? player;
      problems.push(`${name} couldn't ${what} (${errorText(e)})`);
      return false;
    }
    return true;
  };
  // AI seats answer deals offered to them right away (the same verdict the deal screen shows).
  const waiting = [
    ...new Set(
      state.diplomacy.proposals.map((p) => p.to).filter((to) => state.players[to]?.kind === 'ai'),
    ),
  ].sort();
  for (const ai of waiting) seat(ai, 'answer a deal', () => answerProposals(ctx, state, ai, apply));
  // AI seats play as soon as their turn starts (more than once if a turn ends meanwhile).
  const failed = new Set<PlayerId>();
  for (let guard = 0; guard < 4 && state.status === 'playing'; guard++) {
    // Seats act in the turn's rotating order, so no AI always gets first pick.
    const ais = turnOrder(state).filter((id) => {
      const p = state.players[id]!;
      return p.alive && p.kind === 'ai' && !p.turnEnded && !failed.has(id);
    });
    if (ais.length === 0) break;
    for (const [i, player] of ais.entries()) {
      onProgress?.({ phase: 'rivals', done: i, total: ais.length });
      if (seat(player, 'play its turn', () => playAiTurn(ctx, state, player, apply))) continue;
      // It passes. If even that fails or is refused, it's left alone for the rest of this call.
      const passed = seat(player, 'end its turn', () => {
        if (!state.players[player]?.turnEnded) apply({ type: 'end_turn', player });
        return state;
      });
      if (!passed || !state.players[player]?.turnEnded) failed.add(player);
    }
  }
  return problems.length > 0 ? { state, events, problems } : { state, events };
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
export class LocalGame implements GameHandle {
  state: GameState;
  readonly saves = true;
  /** Rivals are moving (in the runner): actions are refused until they're done. */
  busy = false;
  /** While `busy`: how far along the turn's work is (null until the runner says). */
  progress: TurnProgress | null = null;
  /** Something inside the game failed (a bug): what, until `takeProblem` reads it. */
  private problem: string | null = null;
  private listeners = new Set<GameListener>();
  /**
   * Undo for moves (D118): the states before the last few moves that taught the player nothing
   * new, in a game with one human. Any other action clears it.
   */
  private undoStack: GameState[] = [];

  /** A new game from a setup, or a saved game from its state. */
  constructor(
    start: GameSetup | GameState,
    readonly ctx: EngineContext,
    private readonly runner?: AiRunner,
  ) {
    // A loaded save is frozen like every engine state, so Immer can share its untouched parts.
    this.state = 'stateVersion' in start ? deepFreeze(start) : createGame(start, ctx);
    if (runner && aiWaiting(this.state)) this.work(null);
    else this.finish(runTurn(ctx, this.state, null));
  }

  /**
   * What went wrong inside the game since this was last asked, if anything: a turn that
   * couldn't be played, or an AI seat that failed and passed. The game is still there and can
   * be saved; the game screen shows this and offers the save to send with a bug report.
   */
  takeProblem(): string | null {
    const problem = this.problem;
    this.problem = null;
    return problem;
  }

  /** Takes a turn's work as the game's new state. */
  private finish(work: TurnWork) {
    this.state = work.state;
    if (work.problems?.length) this.problem = summarize(work.problems);
  }

  /** A failure inside the rules: the game stays as it was, and the player hears of it. */
  private failed(what: string, e: unknown): ActionResult {
    this.problem = `${what} (${errorText(e)})`;
    this.tell([]);
    return { ok: false, error: { code: 'game_error', message: 'The game hit a problem' } };
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
    this.undoStack = [];
    this.tell([]);
  }

  /** Whether the last move can be taken back. */
  canUndo(): boolean {
    return !this.busy && this.undoStack.length > 0;
  }

  /** Takes back the last move (only moves that revealed nothing; one human only). */
  undo(): boolean {
    const before = this.canUndo() ? this.undoStack.pop() : undefined;
    if (!before) return false;
    this.state = before;
    this.tell([]);
    return true;
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
    const before = this.state;
    let events: GameEvent[];
    try {
      const result = applyAction(this.state, action, this.ctx);
      if (!result.ok) return result;
      const work = runTurn(this.ctx, result.state, null);
      this.finish(work);
      events = [...result.events, ...work.events];
    } catch (e) {
      // A bug in the rules must not take the game (or an online host) down with it.
      this.state = before;
      return this.failed("That couldn't be done", e);
    }
    if (
      action.type === 'move_unit' &&
      this.humans().length === 1 &&
      undoableMove(this.ctx, before, this.state, action.player, events)
    )
      this.undoStack = [...this.undoStack.slice(-(UNDO_DEPTH - 1)), before];
    else this.undoStack = [];
    this.tell(events);
    return { ok: true, state: this.state, events };
  }

  /** Hands the turn's work to the runner (falling back to this page if it fails). */
  private work(action: Action | null) {
    this.undoStack = [];
    this.busy = true;
    this.progress = null;
    this.tell([]);
    const from = this.state;
    const onProgress = (progress: TurnProgress) => {
      this.progress = progress;
      this.tell([]);
    };
    void this.runner!(from, action, onProgress)
      .catch(() => runTurn(this.ctx, from, action, onProgress))
      .then(
        (done) => {
          this.finish({ ...done, state: deepFreeze(done.state) });
          this.busy = false;
          this.progress = null;
          this.tell(done.events);
        },
        (e: unknown) => {
          // The turn failed on the page too (a bug in the rules). Never leave the game waiting
          // for rivals that will not come: it goes back to where it was, playable and savable.
          this.state = from;
          this.busy = false;
          this.progress = null;
          this.failed("This turn couldn't be played", e);
        },
      );
  }

  private tell(events: GameEvent[]) {
    for (const fn of this.listeners) fn(this.state, events);
  }
}

/**
 * Several seats failing the same way (one bug meets every rival) read as one line: "AI 2, AI 3
 * and AI 4 couldn't play their turn (…)" rather than the same reason three times over.
 */
export function summarize(problems: string[]): string {
  const groups = new Map<string, string[]>();
  const other: string[] = [];
  for (const p of problems) {
    const m = /^(.+?) couldn't (.+)$/s.exec(p);
    if (!m) other.push(p);
    else groups.set(m[2]!, [...(groups.get(m[2]!) ?? []), m[1]!]);
  }
  const lines = [...groups].map(([what, who]) => {
    if (who.length === 1) return `${who[0]} couldn't ${what}`;
    const names = `${who.slice(0, -1).join(', ')} and ${who.at(-1)}`;
    return `${names} couldn't ${what.replace(/^(play|end) its turn/, '$1 their turn')}`;
  });
  return [...lines, ...other].join('. ');
}

/** How many moves can be taken back in a row. */
const UNDO_DEPTH = 10;

/**
 * Whether a move can be taken back without leaking hidden information: it only moved (no
 * village, capture or anything else happened), explored no new tiles and brought no other
 * player's unit or settlement into view.
 */
export function undoableMove(
  ctx: EngineContext,
  before: GameState,
  after: GameState,
  player: PlayerId,
  events: readonly GameEvent[],
): boolean {
  if (events.some((e) => e.type !== 'unit_moved')) return false;
  if (before.turn !== after.turn) return false;
  if (before.players[player]?.explored !== after.players[player]?.explored) return false;
  const was = visibleTiles(ctx, before, player);
  const now = visibleTiles(ctx, after, player);
  const foreign = new Set<number>();
  for (const u of Object.values(after.units)) if (u.owner !== player) foreign.add(u.tile);
  for (const x of Object.values(after.settlements)) if (x.owner !== player) foreign.add(x.tile);
  for (const t of foreign) if (now[t] && !was[t]) return false;
  return true;
}

/** Freezes a state (from a save or a worker) like every engine state. */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}
