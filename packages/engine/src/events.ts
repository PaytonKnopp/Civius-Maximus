import type { BuildItem, PlayerId, SettlementId, UnitId } from './state';

/** One side of a fight, as it stands after the fight. */
export type Combatant =
  | { kind: 'unit'; unit: UnitId; owner: PlayerId; unitType: string; health: number }
  | {
      kind: 'settlement';
      settlement: SettlementId;
      owner: PlayerId;
      health: number;
      walls: number;
    };

/**
 * Something that happened, for animations, notifications, logs and replays. `visibleTo` lets
 * the host send each player only the events they're allowed to see.
 */
export type GameEvent = { visibleTo: 'all' | PlayerId[] } & (
  | { type: 'turn_ended_by_player'; player: PlayerId }
  | { type: 'turn_unended_by_player'; player: PlayerId }
  | { type: 'turn_started'; turn: number }
  | {
      type: 'game_ended';
      reason: 'score' | 'conquest' | 'domination';
      winner: PlayerId | null;
    }
  /** `path` starts at the tile the unit left. */
  | { type: 'unit_moved'; unit: UnitId; owner: PlayerId; path: number[] }
  | {
      type: 'unit_disbanded';
      unit: UnitId;
      owner: PlayerId;
      tile: number;
      /** Why, when it wasn't the player's choice. */
      reason?: 'no_gold';
    }
  | { type: 'orders_cancelled'; unit: UnitId; reason: 'path_blocked' }
  | {
      type: 'settlement_founded';
      settlement: SettlementId;
      owner: PlayerId;
      tile: number;
      name: string;
    }
  | { type: 'settlement_grew'; settlement: SettlementId; owner: PlayerId; population: number }
  | { type: 'settlement_starved'; settlement: SettlementId; owner: PlayerId; population: number }
  | { type: 'item_completed'; settlement: SettlementId; owner: PlayerId; item: BuildItem }
  | { type: 'item_bought'; settlement: SettlementId; owner: PlayerId; item: BuildItem }
  | { type: 'border_grew'; settlement: SettlementId; owner: PlayerId; tile: number }
  | {
      type: 'tile_developed';
      settlement: SettlementId;
      owner: PlayerId;
      tile: number;
      improvement: string;
    }
  | { type: 'town_upgraded'; settlement: SettlementId; owner: PlayerId }
  | {
      type: 'wonder_completed';
      settlement: SettlementId;
      owner: PlayerId;
      wonder: string;
      tile: number;
    }
  /** Someone else finished a wonder this player was building: its production became gold. */
  | { type: 'wonder_lost'; settlement: SettlementId; owner: PlayerId; wonder: string; gold: number }
  /** Production is waiting for a choice (the queue ran out). */
  | { type: 'production_idle'; settlement: SettlementId; owner: PlayerId }
  | { type: 'tech_researched'; player: PlayerId; tech: string }
  | { type: 'civic_completed'; player: PlayerId; civic: string }
  | { type: 'boost_earned'; player: PlayerId; kind: 'tech' | 'civic'; id: string }
  | { type: 'government_changed'; player: PlayerId; government: string }
  | { type: 'celebration_started'; player: PlayerId; turns: number }
  | { type: 'celebration_ended'; player: PlayerId }
  | { type: 'war_declared'; by: PlayerId; target: PlayerId }
  | { type: 'peace_offered'; from: PlayerId; to: PlayerId }
  | { type: 'peace_made'; players: [PlayerId, PlayerId] }
  /** An attack or strike: `dealt` to the defender, `taken` back by the attacker (melee). */
  | {
      type: 'combat';
      mode: 'melee' | 'ranged';
      attacker: Combatant;
      defender: Combatant;
      from: number;
      tile: number;
      dealt: number;
      taken: number;
    }
  | {
      type: 'unit_killed';
      unit: UnitId;
      owner: PlayerId;
      unitType: string;
      tile: number;
      by: PlayerId;
    }
  | {
      type: 'civilian_captured';
      unit: UnitId;
      unitType: string;
      from: PlayerId;
      by: PlayerId;
      tile: number;
    }
  | {
      type: 'settlement_captured';
      settlement: SettlementId;
      name: string;
      from: PlayerId;
      by: PlayerId;
      tile: number;
    }
  | { type: 'settlement_razed'; settlement: SettlementId; name: string; by: PlayerId; tile: number }
  | {
      type: 'settlement_liberated';
      settlement: SettlementId;
      name: string;
      by: PlayerId;
      to: PlayerId;
    }
  | { type: 'capital_moved'; player: PlayerId; settlement: SettlementId }
  | { type: 'player_defeated'; player: PlayerId; by: PlayerId | null }
  | { type: 'camp_cleared'; camp: string; tile: number; by: PlayerId; gold: number }
  | { type: 'unit_promoted'; unit: UnitId; owner: PlayerId; promotion: string }
);
