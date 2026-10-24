import { current, type Draft, isDraft } from 'immer';
import type { GameState } from './state';

/**
 * The draft as a read-only game state, for pure rule functions: no copy (`current()` copies the
 * whole map each time). Not for code that uses the unit-position index (spawning, room checks),
 * which is cached per units object and needs a real `current()` snapshot.
 */
export const view = (draft: Draft<GameState>) => draft as unknown as GameState;

/**
 * A snapshot for reading again and again while units move: units, players and camps are copied
 * fresh each time, everything else comes from `base` (one `current()` taken beforehand), so the
 * map isn't copied once per unit. Only for steps that don't change the map or settlements.
 */
export function unitSnapshot(draft: Draft<GameState>, base: GameState): GameState {
  const live = <T extends object>(x: T): T => (isDraft(x) ? (current(x as Draft<T>) as T) : x);
  return {
    ...base,
    units: live(draft.units) as GameState['units'],
    players: live(draft.players) as GameState['players'],
    camps: live(draft.camps) as GameState['camps'],
  };
}
