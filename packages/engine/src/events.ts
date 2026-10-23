import type { PlayerId } from './state';

/**
 * Something that happened, for animations, notifications, logs and replays. `visibleTo` lets
 * the host send each player only the events they're allowed to see.
 */
export type GameEvent = { visibleTo: 'all' | PlayerId[] } & (
  | { type: 'turn_ended_by_player'; player: PlayerId }
  | { type: 'turn_unended_by_player'; player: PlayerId }
  | { type: 'turn_started'; turn: number }
  | { type: 'game_ended'; reason: 'turn_limit' }
);
