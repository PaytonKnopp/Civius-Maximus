import { contentHash } from '@cx/content';
import type { GameState } from './state';

/** A hash of the full game state. Equal hashes = identical games (used by replays and sync checks). */
export function stateHash(state: GameState): string {
  return contentHash(state);
}
