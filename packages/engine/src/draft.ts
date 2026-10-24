import type { Draft } from 'immer';
import type { GameState } from './state';

/**
 * The draft as a read-only game state, for pure rule functions: no copy (`current()` copies the
 * whole map each time). Not for code that uses the unit-position index (spawning, room checks),
 * which is cached per units object and needs a real `current()` snapshot.
 */
export const view = (draft: Draft<GameState>) => draft as unknown as GameState;
