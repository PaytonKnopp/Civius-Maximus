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
export type GameEvent = { visibleTo: 'all' | PlayerId[] } &
  // Diplomacy
  (
    | { type: 'deal_proposed'; deal: string; from: PlayerId; to: PlayerId }
    | {
        type: 'deal_accepted';
        deal: string;
        from: PlayerId;
        to: PlayerId;
        friendship: boolean;
        alliance: boolean;
        peace: boolean;
      }
    | { type: 'deal_declined'; deal: string; from: PlayerId; to: PlayerId }
    | { type: 'deal_expired'; deal: string; from: PlayerId; to: PlayerId }
    | { type: 'deal_broken'; by: PlayerId; to: PlayerId }
    | { type: 'pact_ended'; kind: 'friendship' | 'alliance'; players: [PlayerId, PlayerId] }
    | { type: 'denounced'; by: PlayerId; target: PlayerId }
    | {
        type: 'trade_route_started';
        route: string;
        owner: PlayerId;
        from: SettlementId;
        to: SettlementId;
      }
    | {
        type: 'trade_route_ended';
        route: string;
        owner: PlayerId;
        from: SettlementId;
        to: SettlementId;
      }
    | { type: 'unit_upgraded'; unit: UnitId; owner: PlayerId; from: string; to: string }
    /** A step of a science victory; `arrives` is set when the last one is launched. */
    | { type: 'space_project'; player: PlayerId; project: string; arrives: number | null }
    | { type: 'great_person_born'; person: string; player: PlayerId }
    | { type: 'great_person_activated'; person: string; player: PlayerId; settlement: SettlementId }
    | { type: 'pantheon_founded'; player: PlayerId; belief: string }
    /** A player found a city-state (and got `envoys` free envoys there for being first). */
    | { type: 'city_state_met'; cityState: PlayerId; player: PlayerId; envoys: number }
    | { type: 'envoy_sent'; player: PlayerId; cityState: PlayerId }
    | { type: 'suzerain_changed'; cityState: PlayerId; from: PlayerId | null; to: PlayerId | null }
    /** A player did what a city-state asked (`quest` is its text) and got envoys. */
    | { type: 'city_state_quest'; cityState: PlayerId; player: PlayerId; quest: string }
    | { type: 'religion_founded'; religion: string; player: PlayerId; settlement: SettlementId }
    /** A missionary preached in a settlement (it may convert too: `settlement_converted`). */
    | {
        type: 'religion_preached';
        unit: UnitId;
        owner: PlayerId;
        settlement: SettlementId;
        religion: string;
      }
    /** A settlement now follows `religion` (null: none). */
    | {
        type: 'settlement_converted';
        settlement: SettlementId;
        owner: PlayerId;
        religion: string | null;
        from: string | null;
      }
    /** A commander caught by enemies fell back to a settlement until turn `until`. */
    | {
        type: 'commander_retreated';
        unit: UnitId;
        owner: PlayerId;
        from: number;
        to: number;
        until: number;
      }
    | { type: 'turn_ended_by_player'; player: PlayerId }
    | { type: 'turn_unended_by_player'; player: PlayerId }
    | { type: 'turn_started'; turn: number }
    | {
        type: 'game_ended';
        reason: 'score' | 'conquest' | 'domination' | 'religion' | 'science' | 'culture';
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
    | {
        type: 'wonder_lost';
        settlement: SettlementId;
        owner: PlayerId;
        wonder: string;
        gold: number;
      }
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
    | {
        type: 'settlement_razed';
        settlement: SettlementId;
        name: string;
        by: PlayerId;
        tile: number;
      }
    | {
        type: 'settlement_razing';
        settlement: SettlementId;
        name: string;
        by: PlayerId;
        tile: number;
        /** Turns until it's gone. */
        turns: number;
      }
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
