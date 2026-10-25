import type { Action, ActionResult, EngineContext, GameState, PlayerId } from '@cx/engine';
import type { SeatInfo } from '@cx/protocol';
import type { GameListener } from './local';

/**
 * A game as the game screen sees it, whoever runs it: this tab (single player, hotseat, or the
 * host of an online game) or a host somewhere else (an online client, which only ever holds
 * its own view of the game).
 */
export interface GameHandle {
  readonly ctx: EngineContext;
  readonly state: GameState;
  /** Rivals are moving: actions wait. */
  readonly busy: boolean;
  act(action: Action): ActionResult;
  subscribe(listener: GameListener): () => void;
  /** The humans who play on this device (more than one is hotseat). */
  humans(): PlayerId[];
  /** Of those, the one who plays next this turn. */
  nextHuman(): PlayerId | undefined;
  /** Replaces the whole game (debugging, tests). */
  load(state: GameState): void;
  /** Whether this tab holds the real game, so it can be saved (an online client can't). */
  readonly saves: boolean;
  /** Online games: who's in and who's connected. */
  readonly online?: OnlineSession;
}

export interface OnlineSession {
  /** The join code friends type in. */
  readonly code: string;
  seats(): SeatInfo[];
  /** Seats or connections changed. */
  onChange(fn: () => void): () => void;
  /** The host only: ends an absent player's turn so the others aren't stuck waiting. */
  endTurnFor?(player: PlayerId): void;
  /** Leaves the game (the host leaving ends it for everyone). */
  leave(): void;
}
