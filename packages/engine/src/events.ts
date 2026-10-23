import type { PlayerId, UnitId } from './state';

/**
 * Something that happened, for animations, notifications, logs and replays. `visibleTo` lets
 * the host send each player only the events they're allowed to see.
 */
export type GameEvent = { visibleTo: 'all' | PlayerId[] } & (
  | { type: 'turn_ended_by_player'; player: PlayerId }
  | { type: 'turn_unended_by_player'; player: PlayerId }
  | { type: 'turn_started'; turn: number }
  | { type: 'game_ended'; reason: 'turn_limit' }
  /** `path` starts at the tile the unit left. */
  | { type: 'unit_moved'; unit: UnitId; owner: PlayerId; path: number[] }
  | { type: 'unit_disbanded'; unit: UnitId; owner: PlayerId; tile: number }
  | { type: 'orders_cancelled'; unit: UnitId; reason: 'path_blocked' }
);
