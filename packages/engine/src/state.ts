import type { MapSettings, MapState } from './map/types';
import type { RngState } from './rng';

export type PlayerId = string;

/** Everything about one game, as plain JSON. Nothing outside this object affects the rules. */
export interface GameState {
  /** Bumped when the state shape changes incompatibly, so old saves can be migrated. */
  stateVersion: 1;
  gameId: string;
  /** Hash of the compiled content (base + mods) this game was started with. */
  contentHash: string;
  settings: GameSettings;
  status: 'playing' | 'ended';
  /** Starts at 1. */
  turn: number;
  rng: RngState;
  players: Record<PlayerId, PlayerState>;
  /** Player IDs in processing order (sorted when the game is created, never reordered). */
  playerOrder: PlayerId[];
  /** Counter for IDs of things created during play (units, settlements...). */
  nextEntityId: number;
  map: MapState;
  /** Every unit on the map, by id (`u1`, `u2`...). Iterate with `unitIds()` for a stable order. */
  units: Record<UnitId, UnitState>;
  /** Pairs of players at war, as sorted `"a|b"` keys. Declaring war arrives with diplomacy (M15). */
  wars: string[];
}

export type UnitId = string;

export type UnitOrders =
  /** Keep moving toward `target`, continuing automatically on later turns. */
  | { kind: 'move'; target: number }
  /** Asleep until woken (or an enemy comes into view, later). */
  | { kind: 'sleep' }
  /** Dug in for a defense bonus (combat, M9). */
  | { kind: 'fortify' };

export interface UnitState {
  id: UnitId;
  owner: PlayerId;
  /** A `unit` content id. */
  type: string;
  tile: number;
  /** Movement points left this turn, in hundredths (200 = 2 MP). */
  moves: number;
  health: number;
  xp: number;
  orders: UnitOrders | null;
  /** Turn on which the player chose "skip" for this unit, so it stops asking for orders. */
  skippedTurn: number | null;
}

export interface GameSettings {
  seed: string;
  /** The game ends after this turn (score victory). `null` = no limit. */
  turnLimit: number | null;
  map: MapSettings;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  kind: 'human' | 'ai';
  /** Team number; players on the same team share victory. `null` = no team. */
  team: number | null;
  alive: boolean;
  /** Simultaneous turns: true once the player clicked End Turn this turn. */
  turnEnded: boolean;
  /** Tile index where the player starts (their first settler appears here). */
  startTile: number;
  /** Tiles this player has ever seen (base64 bitset, see bitset.ts). */
  explored: string;
  /** Land units may embark onto water (from rules now, from a tech in M7). */
  canEmbark: boolean;
}
