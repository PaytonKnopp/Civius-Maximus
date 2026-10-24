import type { Personality, UnitClassDef, UnitDef } from '@cx/content';
import type { Action } from '../actions';
import { getBit } from '../bitset';
import { atWar, type EngineContext, HOSTILE, unitClassOf, unitDef, unitIds } from '../context';
import { distance } from '../map/hex';
import { settlementIds } from '../settlements/rules';
import type { GameState, PlayerId, SettlementState, UnitState } from '../state';
import { exploredBits, visibleTiles } from '../units/vision';
import { militaryStrength, unitPower } from '../combat/strength';

export { militaryStrength, unitPower };

/**
 * One AI player's turn in progress (docs/01-architecture.md, "AI"): the latest state, a way to
 * act on it, and what the player knows. The AI only reads what a human in its seat could see:
 * visible tiles, explored tiles, settlements it has found, and the public army sizes.
 *
 * Everything here is deterministic: no randomness, whole numbers only, stable order.
 */

/** Applies an action for the AI; the new state, or undefined if the engine refused it. */
export type Act = (action: Action) => GameState | undefined;

export const NEUTRAL: Personality = {
  aggression: 5,
  expansion: 5,
  science: 5,
  culture: 5,
  wonders: 5,
  faith: 5,
  gold: 5,
  naval: 5,
  diplomacy: 5,
  districts: 5,
};

export class Turn {
  state: GameState;
  readonly me: Personality;
  /** Facts that change whenever the state does (visible tiles...). */
  private now = new Map<string, unknown>();
  /** Facts worked out once a turn (who is strong...). */
  private once = new Map<string, unknown>();
  /** Actions the engine accepted this turn. */
  done = 0;

  constructor(
    readonly ctx: EngineContext,
    state: GameState,
    readonly player: PlayerId,
    private readonly apply: Act,
  ) {
    this.state = state;
    this.me = personalityOf(ctx, state, player);
  }

  act(action: Action): boolean {
    const next = this.apply(action);
    if (!next) return false;
    this.state = next;
    this.now.clear();
    this.done++;
    return true;
  }

  /** Remembered until the next action changes the state. */
  memo<T>(key: string, fn: () => T): T {
    if (!this.now.has(key)) this.now.set(key, fn());
    return this.now.get(key) as T;
  }

  /** Remembered for the whole turn (for slow-changing facts). */
  turnMemo<T>(key: string, fn: () => T): T {
    if (!this.once.has(key)) this.once.set(key, fn());
    return this.once.get(key) as T;
  }

  get p() {
    return this.state.players[this.player]!;
  }

  seen(): Uint8Array {
    return this.memo('seen', () => visibleTiles(this.ctx, this.state, this.player));
  }

  explored(): Uint8Array {
    return this.memo('explored', () => exploredBits(this.state, this.player));
  }

  isExplored(tile: number): boolean {
    return getBit(this.explored(), tile);
  }

  mySettlements(): SettlementState[] {
    return this.memo('mine', () =>
      settlementIds(this.state)
        .map((id) => this.state.settlements[id]!)
        .filter((s) => s.owner === this.player),
    );
  }

  /** Other players' settlements on tiles this player has explored. */
  knownSettlements(): SettlementState[] {
    return this.memo('known', () =>
      settlementIds(this.state)
        .map((id) => this.state.settlements[id]!)
        .filter((s) => s.owner !== this.player && this.isExplored(s.tile)),
    );
  }

  myUnits(): UnitState[] {
    return this.memo('units', () =>
      unitIds(this.state)
        .map((id) => this.state.units[id]!)
        .filter((u) => u.owner === this.player),
    );
  }

  /** Units of players we're at war with (raiders included) on tiles we can see. */
  visibleEnemies(): UnitState[] {
    return this.memo('enemies', () => {
      const seen = this.seen();
      return unitIds(this.state)
        .map((id) => this.state.units[id]!)
        .filter(
          (u) =>
            u.owner !== this.player &&
            seen[u.tile] &&
            atWar(this.state, this.player, u.owner) &&
            unitClassOf(this.ctx, u).combat,
        );
    });
  }

  /** Total strength of visible enemy soldiers within `radius` of a tile. */
  threatNear(tile: number, radius: number): number {
    let total = 0;
    for (const e of this.visibleEnemies()) {
      if (distance(this.state.map, e.tile, tile) <= radius) total += unitPower(this.ctx, e);
    }
    return total;
  }

  /** Rivals in the turn order this player has met (seen a settlement or unit of). */
  metRivals(): PlayerId[] {
    return this.memo('met', () => {
      const seen = this.seen();
      const met = new Set<PlayerId>();
      for (const s of this.knownSettlements()) met.add(s.owner);
      for (const u of Object.values(this.state.units)) {
        if (u.owner !== this.player && seen[u.tile]) met.add(u.owner);
      }
      return this.state.playerOrder.filter(
        (id) => id !== this.player && met.has(id) && this.state.players[id]!.alive,
      );
    });
  }

  /** At war with another civ (raiders don't count). */
  civWars(): PlayerId[] {
    return this.state.playerOrder.filter(
      (id) => id !== this.player && id !== HOSTILE && atWar(this.state, this.player, id),
    );
  }

  power(player: PlayerId): number {
    return this.turnMemo(`power:${player}`, () => militaryStrength(this.ctx, this.state, player));
  }
}

export function personalityOf(ctx: EngineContext, state: GameState, player: PlayerId): Personality {
  const leader = ctx.content.entities.leader[state.players[player]?.leader ?? ''];
  return leader?.personality ?? NEUTRAL;
}

/** What a unit is for, read from its stats (so modded units get used sensibly too). */
export type Role =
  | 'settler'
  | 'trader'
  | 'commander'
  | 'civilian'
  | 'explorer'
  | 'melee'
  | 'ranged'
  | 'siege'
  | 'naval';

export function roleOf(def: UnitDef, cls: UnitClassDef): Role {
  if (def.actions.includes('found_settlement')) return 'settler';
  if (def.actions.includes('trade_route')) return 'trader';
  if (def.commander) return 'commander';
  if (!cls.combat) return 'civilian';
  if (cls.domain !== 'land') return 'naval';
  if (def.rangedStrength > 0 && def.range > 0) return cls.vsSettlement > 0 ? 'siege' : 'ranged';
  if (cls.captures) return 'melee';
  return 'explorer';
}

export function unitRole(ctx: EngineContext, unit: Pick<UnitState, 'type'>): Role {
  return roleOf(unitDef(ctx, unit), unitClassOf(ctx, unit));
}

/** A small deterministic number for varying choices between players and turns (0–99). */
export function jitter(...parts: (string | number)[]): number {
  let h = 2166136261;
  for (const ch of parts.join('|')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h % 100;
}
