import type { Action, GameState } from '@cx/engine';
import { deepFreeze, runTurn } from '@cx/host';
import { loadContent } from '../content';

/**
 * The background worker that plays the slow part of each turn (End Turn and the AI seats) off
 * the page, so the map keeps moving. Same engine, same content: the same result as on the page.
 */

const ctx = { content: loadContent() };
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<Request>) => void) | null;
  postMessage(data: unknown): void;
};

interface Request {
  id: number;
  state: GameState;
  action: Action | null;
}

scope.onmessage = (e) => {
  const { id, state, action } = e.data;
  try {
    const done = runTurn(ctx, deepFreeze(state), action);
    scope.postMessage({ id, state: done.state, events: done.events });
  } catch (err) {
    scope.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
