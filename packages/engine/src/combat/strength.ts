import { resolveText, type StrengthBonus } from '@cx/content';
import {
  atWar,
  type EngineContext,
  type RuleError,
  unitClassOf,
  unitDef,
  unitIds,
} from '../context';
import { directionTo, distance, hasRiverEdge, neighbors, tilesWithin } from '../map/hex';
import { isUnlocked } from '../settlements/rules';
import type { GameState, PlayerId, SettlementState, UnitState } from '../state';
import { canTraverse, isWater, riverBits, unitsOn } from '../units/movement';
import { playerEffects } from '../progress/sources';
import { uniqueProblem } from '../uniques';
import { commandersAround } from '../units/commanders';
import { tradePartners } from '../trade/rules';
import { promotionsOf, unitRange } from '../units/promotions';
import { lineOfSight, visibleTiles } from '../units/vision';
import { damageRange } from './damage';

/**
 * Who can attack what, and how strong each side is (docs/03-core-mechanics.md, section 5). Every
 * strength comes with its "why?" lines, so the combat preview can list each modifier.
 */

export interface StrengthLine {
  label: string;
  amount: number;
}

export interface Strength {
  total: number;
  lines: StrengthLine[];
}

/** What's on a tile from an attacker's point of view. */
export type Target =
  | { kind: 'unit'; unit: UnitState }
  | { kind: 'settlement'; settlement: SettlementState }
  /** Only civilians: taken by moving in. */
  | { kind: 'civilian'; units: UnitState[] };

export type AttackMode = 'melee' | 'ranged';

const unitName = (ctx: EngineContext, unit: Pick<UnitState, 'type'>) =>
  resolveText(ctx.content, unitDef(ctx, unit).name);

function strength(lines: StrengthLine[]): Strength {
  const kept = lines.filter((l, i) => i === 0 || l.amount !== 0);
  return {
    total: Math.max(
      0,
      kept.reduce((a, l) => a + l.amount, 0),
    ),
    lines: kept,
  };
}

/** The settlement whose center is this tile, if any. */
export function settlementAt(state: GameState, tile: number): SettlementState | undefined {
  const id = state.map.tiles[tile]?.settlement;
  const s = id ? state.settlements[id] : undefined;
  return s?.tile === tile ? s : undefined;
}

/** What `owner` would be attacking on `tile` (another player's settlement, unit or civilians). */
export function targetAt(
  ctx: EngineContext,
  state: GameState,
  owner: PlayerId,
  tile: number,
): Target | undefined {
  const s = settlementAt(state, tile);
  if (s && s.owner !== owner) return { kind: 'settlement', settlement: s };
  const foreign = unitsOn(state, tile).filter((u) => u.owner !== owner);
  const military = foreign.find((u) => {
    const cls = unitClassOf(ctx, u);
    return cls.combat && cls.layer === 'military';
  });
  if (military) return { kind: 'unit', unit: military };
  if (foreign.length > 0) return { kind: 'civilian', units: foreign };
  return undefined;
}

export function targetOwner(target: Target): PlayerId {
  return target.kind === 'unit'
    ? target.unit.owner
    : target.kind === 'settlement'
      ? target.settlement.owner
      : target.units[0]!.owner;
}

export function targetTile(target: Target): number {
  return target.kind === 'unit'
    ? target.unit.tile
    : target.kind === 'settlement'
      ? target.settlement.tile
      : target.units[0]!.tile;
}

/** How a unit attacks: ranged units shoot, other military units fight in melee. */
export function attackMode(ctx: EngineContext, unit: Pick<UnitState, 'type'>): AttackMode | null {
  if (!unitClassOf(ctx, unit).combat) return null;
  const def = unitDef(ctx, unit);
  if (def.rangedStrength > 0 && def.range > 0) return 'ranged';
  return def.strength > 0 ? 'melee' : null;
}

const isEmbarked = (ctx: EngineContext, state: GameState, unit: UnitState) =>
  unitClassOf(ctx, unit).domain === 'land' && isWater(ctx, state, unit.tile);

function wounded(ctx: EngineContext, unit: UnitState): StrengthLine {
  const { woundedPer10: per, maxHealth: max } = ctx.content.rules.combat;
  if (unitDef(ctx, unit).ignoresWounds) return { label: 'Wounded', amount: 0 };
  return { label: 'Wounded', amount: -Math.floor(Math.max(0, max - unit.health) / 10) * per };
}

/** Terrain defense on a tile: the terrain itself, hills, and a feature like woods. */
function terrainLines(ctx: EngineContext, state: GameState, tile: number): StrengthLine[] {
  const t = state.map.tiles[tile]!;
  const { content } = ctx;
  const out: StrengthLine[] = [];
  const terrain = content.entities.terrain[t.terrain]!;
  if (terrain.defense)
    out.push({ label: resolveText(content, terrain.name), amount: terrain.defense });
  if (t.elevation === 'hills')
    out.push({ label: 'Hills', amount: content.rules.elevation.hills.defense });
  const feature = t.feature === null ? undefined : content.entities.feature[t.feature];
  if (feature?.defense)
    out.push({ label: resolveText(content, feature.name), amount: feature.defense });
  const improvement =
    t.improvement === null ? undefined : content.entities.improvement[t.improvement];
  if (improvement?.defense)
    out.push({ label: resolveText(content, improvement.name), amount: improvement.defense });
  return out;
}

/** Friendly military units next to `tile`, other than `except`. */
function friendsAround(
  ctx: EngineContext,
  state: GameState,
  owner: PlayerId,
  tile: number,
  except: string | null,
): number {
  let n = 0;
  for (const t of neighbors(state.map, tile)) {
    for (const u of unitsOn(state, t)) {
      if (u.owner === owner && u.id !== except && unitClassOf(ctx, u).combat) n++;
    }
  }
  return n;
}

function classBonuses(
  ctx: EngineContext,
  unit: Pick<UnitState, 'type'>,
  vs: Pick<UnitState, 'type'> | null,
): StrengthLine[] {
  if (!vs) return [];
  const against = unitDef(ctx, vs).class;
  return unitClassOf(ctx, unit)
    .bonuses.filter((b) => b.vs.includes(against))
    .map((b) => ({
      label: b.label ? resolveText(ctx.content, b.label) : `Against ${unitName(ctx, vs)}`,
      amount: b.amount,
    }));
}

interface Against {
  unit: UnitState | null;
  settlement: boolean;
  ranged: boolean;
  /** Who owns what's being fought (null for a settlement's strike). */
  owner: PlayerId | null;
}

/** Whether a promotion's or ability's strength bonus applies in this fight, fought on `tile`. */
function bonusApplies(
  ctx: EngineContext,
  state: GameState,
  me: PlayerId,
  b: StrengthBonus,
  role: 'attack' | 'defend',
  against: Against,
  tile: number,
): boolean {
  const t = state.map.tiles[tile]!;
  const vsClass = against.unit ? unitDef(ctx, against.unit).class : null;
  if (b.when !== 'always' && b.when !== role) return false;
  if (b.vs?.classes && !(vsClass && b.vs.classes.includes(vsClass))) return false;
  if (b.vs?.settlement && !against.settlement) return false;
  if (b.vs?.ranged && !against.ranged) return false;
  if (b.vs?.wounded && !(against.unit && against.unit.health < ctx.content.rules.combat.maxHealth))
    return false;
  if (b.vs?.tradePartner && !(against.owner && tradePartners(state, me, against.owner)))
    return false;
  if (b.on?.features && !(t.feature && b.on.features.includes(t.feature))) return false;
  if (b.on?.elevations && !b.on.elevations.includes(t.elevation)) return false;
  return true;
}

/** Strength from promotions and from the owner's abilities that apply in this fight. */
function bonusLines(
  ctx: EngineContext,
  state: GameState,
  unit: UnitState,
  role: 'attack' | 'defend',
  against: Against,
  tile: number,
): StrengthLine[] {
  const out: StrengthLine[] = [];
  for (const p of promotionsOf(ctx, unit)) {
    for (const b of p.strength) {
      if (bonusApplies(ctx, state, unit.owner, b, role, against, tile))
        out.push({ label: resolveText(ctx.content, p.name), amount: b.amount });
    }
  }
  // The best commander whose radius covers the unit.
  let command = 0;
  for (const c of commandersAround(ctx, state, unit.owner, unit.tile)) {
    const extra = role === 'attack' ? c.command.attack : c.command.defense;
    command = Math.max(command, c.command.strength + extra);
  }
  if (command > 0) out.push({ label: 'Commander', amount: command });
  const owner = state.players[unit.owner];
  if (!owner) return out;
  const cls = unitDef(ctx, unit).class;
  for (const { source, effect } of playerEffects(ctx, state, unit.owner, 'modify_strength')) {
    const b = effect.params;
    if (b.unitClass && !(Array.isArray(b.unitClass) ? b.unitClass : [b.unitClass]).includes(cls))
      continue;
    if (
      b.afterDeclaringWar !== undefined &&
      (owner.declaredWarTurn === null || state.turn - owner.declaredWarTurn >= b.afterDeclaringWar)
    )
      continue;
    if (bonusApplies(ctx, state, unit.owner, b, role, against, tile))
      out.push({ label: source.label, amount: b.amount });
  }
  return out;
}

/** The strongest unit a player can train that takes settlements: the base of their defenses. */
export function bestUnitStrength(ctx: EngineContext, state: GameState, player: PlayerId): number {
  let best = 0;
  for (const id of ctx.content.ids.unit) {
    const def = ctx.content.entities.unit[id]!;
    if (def.cost <= 0 || !ctx.content.entities.unitClass[def.class]!.captures) continue;
    if (isUnlocked(state, player, def) && !uniqueProblem(ctx, state, player, 'unit', id))
      best = Math.max(best, def.strength);
  }
  return best;
}

export function settlementMaxHealth(ctx: EngineContext, kind: SettlementState['kind']): number {
  const s = ctx.content.rules.combat.settlement;
  return kind === 'city' ? s.cityHealth : s.townHealth;
}

/** Full outer defense: the walls of every building in the settlement. */
export function wallsMax(ctx: EngineContext, s: Pick<SettlementState, 'buildings'>): number {
  return s.buildings.reduce((a, b) => a + (ctx.content.entities.building[b]?.walls ?? 0), 0);
}

/** A settlement's strength, for defending and for its ranged strike. */
export function settlementStrength(
  ctx: EngineContext,
  state: GameState,
  s: SettlementState,
): Strength {
  const rules = ctx.content.rules.combat.settlement;
  const lines: StrengthLine[] = [];
  const base = bestUnitStrength(ctx, state, s.owner);
  const garrison = unitsOn(state, s.tile)
    .filter((u) => u.owner === s.owner && unitClassOf(ctx, u).combat)
    .map((u) => ({ u, strength: unitDef(ctx, u).strength }))
    .sort((a, b) => b.strength - a.strength)[0];
  if (garrison && garrison.strength > base)
    lines.push({ label: `Garrison: ${unitName(ctx, garrison.u)}`, amount: garrison.strength });
  else lines.push({ label: 'Defenders', amount: base });
  lines.push({
    label: s.kind === 'city' ? 'City' : 'Town',
    amount: s.kind === 'city' ? rules.cityStrengthBonus : rules.townStrengthBonus,
  });
  if (s.walls > 0) lines.push({ label: 'Walls', amount: rules.wallsStrength });
  lines.push(...terrainLines(ctx, state, s.tile));
  return strength(lines);
}

/** A unit's strength when it's attacked (by a unit, or by a settlement's strike if `by` is null). */
export function defenseStrength(
  ctx: EngineContext,
  state: GameState,
  unit: UnitState,
  by: UnitState | null,
): Strength {
  const combat = ctx.content.rules.combat;
  const def = unitDef(ctx, unit);
  const lines: StrengthLine[] = [{ label: unitName(ctx, unit), amount: def.strength }];
  if (isEmbarked(ctx, state, unit)) {
    lines.push({ label: 'Embarked', amount: Math.min(0, combat.embarkedStrength - def.strength) });
  } else {
    lines.push(...terrainLines(ctx, state, unit.tile));
  }
  if (unit.orders?.kind === 'fortify' && unit.orders.turns > 0) {
    const i = Math.min(unit.orders.turns, combat.fortify.length) - 1;
    lines.push({ label: 'Fortified', amount: combat.fortify[i]! });
  }
  const friends = friendsAround(ctx, state, unit.owner, unit.tile, unit.id);
  if (friends > 0) lines.push({ label: `Support (${friends})`, amount: friends * combat.support });
  lines.push(wounded(ctx, unit));
  lines.push(...classBonuses(ctx, unit, by));
  lines.push(
    ...bonusLines(
      ctx,
      state,
      unit,
      'defend',
      {
        unit: by,
        settlement: by === null,
        ranged: by === null || attackMode(ctx, by) === 'ranged',
        owner: by?.owner ?? null,
      },
      unit.tile,
    ),
  );
  return strength(lines);
}

/** A unit's strength attacking `target` from `from` (its own tile by default). */
export function attackStrength(
  ctx: EngineContext,
  state: GameState,
  unit: UnitState,
  target: Target,
  mode: AttackMode,
  from = unit.tile,
): Strength {
  const combat = ctx.content.rules.combat;
  const def = unitDef(ctx, unit);
  const tile = targetTile(target);
  const lines: StrengthLine[] = [
    { label: unitName(ctx, unit), amount: mode === 'ranged' ? def.rangedStrength : def.strength },
  ];
  lines.push(wounded(ctx, unit));
  if (target.kind === 'unit') lines.push(...classBonuses(ctx, unit, target.unit));
  if (target.kind === 'settlement') {
    const bonus = unitClassOf(ctx, unit).vsSettlement;
    if (bonus) lines.push({ label: 'Against settlements', amount: bonus });
  }
  lines.push(
    ...bonusLines(
      ctx,
      state,
      unit,
      'attack',
      {
        unit: target.kind === 'unit' ? target.unit : null,
        settlement: target.kind === 'settlement',
        ranged: false,
        owner: targetOwner(target),
      },
      tile,
    ),
  );
  if (mode === 'melee') {
    const friends = friendsAround(ctx, state, unit.owner, tile, unit.id);
    if (friends > 0)
      lines.push({ label: `Flanking (${friends})`, amount: friends * combat.flanking });
    const dir = directionTo(state.map, from, tile);
    if (dir !== undefined && hasRiverEdge(state.map, riverBits(state), from, dir))
      lines.push({
        label: 'Across a river',
        amount: -ctx.content.rules.rivers.attackAcrossPenalty,
      });
    if (
      unitClassOf(ctx, unit).domain === 'land' &&
      isWater(ctx, state, from) &&
      !isWater(ctx, state, tile)
    )
      lines.push({ label: 'From the water', amount: -combat.amphibiousPenalty });
  }
  return strength(lines);
}

/** Why `unit` can't attack `tile` now, or undefined. Moving onto lone civilians captures them. */
export function attackProblem(
  ctx: EngineContext,
  state: GameState,
  unit: UnitState,
  tile: number,
  /** The attacker's owner's visible tiles, when checking many tiles at once. */
  visible: Uint8Array = visibleTiles(ctx, state, unit.owner),
): RuleError | undefined {
  const mode = attackMode(ctx, unit);
  if (!mode) return { code: 'cannot_attack', message: `${unitName(ctx, unit)} can't attack` };
  if (unit.moves <= 0) return { code: 'no_moves', message: 'No moves left this turn' };
  if (tile < 0 || tile >= state.map.tiles.length)
    return { code: 'bad_tile', message: 'No such tile' };
  const target = targetAt(ctx, state, unit.owner, tile);
  if (!target) return { code: 'no_target', message: 'Nothing to attack there' };
  const owner = targetOwner(target);
  if (!atWar(state, unit.owner, owner)) {
    return {
      code: 'not_at_war',
      message: `You're not at war with ${state.players[owner]?.name ?? owner}`,
    };
  }
  if (!visible[tile]) return { code: 'not_visible', message: "You can't see that tile" };
  const d = distance(state.map, unit.tile, tile);
  if (target.kind === 'civilian' || mode === 'melee') {
    if (d !== 1) return { code: 'too_far', message: 'Melee attacks need to be next to the target' };
    if (!canTraverse(ctx, state, unit, tile))
      return { code: 'unreachable', message: `${unitName(ctx, unit)} can't go there` };
    return undefined;
  }
  const range = unitRange(ctx, unit);
  if (d > range) return { code: 'too_far', message: `Out of range (range ${range})` };
  if (!lineOfSight(ctx, state, unit.tile, tile))
    return { code: 'no_line_of_sight', message: 'Something blocks the line of sight' };
  return undefined;
}

/** Every tile `unit` could attack (or capture civilians on) right now. */
export function attackTargets(
  ctx: EngineContext,
  state: GameState,
  unit: UnitState,
  /** The owner's visible tiles, when asking for many units at once. */
  seen?: Uint8Array,
): number[] {
  const mode = attackMode(ctx, unit);
  if (!mode || unit.moves <= 0) return [];
  const reach = mode === 'ranged' ? unitRange(ctx, unit) : 1;
  const visible = seen ?? visibleTiles(ctx, state, unit.owner);
  return tilesWithin(state.map, unit.tile, reach)
    .filter((t) => t !== unit.tile && !attackProblem(ctx, state, unit, t, visible))
    .sort((a, b) => a - b);
}

/** Damage to a settlement: walls absorb the hit first (and let through only part of it). */
export function settlementHit(
  ctx: EngineContext,
  s: Pick<SettlementState, 'walls' | 'health'>,
  damage: number,
  attacker: Pick<UnitState, 'type'> | null,
): { walls: number; health: number } {
  if (s.walls <= 0) return { walls: 0, health: Math.min(s.health, damage) };
  const percent = attacker ? unitClassOf(ctx, attacker).wallsDamagePercent : 100;
  const through = Math.floor((damage * percent) / 100);
  const walls = Math.min(s.walls, through);
  return { walls, health: Math.min(s.health, through - walls) };
}

export interface CombatPreview {
  mode: AttackMode | 'capture';
  target: Target;
  attacker: Strength;
  defender: Strength;
  /** Damage the defender takes (a settlement's walls absorb part of it first). */
  toDefender: [number, number];
  /** Damage the attacker takes back (melee only). */
  toAttacker: [number, number];
  /** A melee attack that takes the settlement if its health reaches 0. */
  captures: boolean;
  /** Settlements: how the hit splits between walls and health (lowest and highest roll). */
  split: { walls: [number, number]; health: [number, number] } | null;
}

/** What attacking `tile` with `unit` would look like, or undefined if it can't. */
export function previewAttack(
  ctx: EngineContext,
  state: GameState,
  unit: UnitState,
  tile: number,
): CombatPreview | undefined {
  if (attackProblem(ctx, state, unit, tile)) return undefined;
  const target = targetAt(ctx, state, unit.owner, tile)!;
  const mode = attackMode(ctx, unit)!;
  if (target.kind === 'civilian') {
    const none = { total: 0, lines: [] };
    return {
      mode: 'capture',
      target,
      attacker: none,
      defender: none,
      toDefender: [0, 0],
      toAttacker: [0, 0],
      captures: true,
      split: null,
    };
  }
  const attacker = attackStrength(ctx, state, unit, target, mode);
  const defender =
    target.kind === 'unit'
      ? defenseStrength(ctx, state, target.unit, unit)
      : settlementStrength(ctx, state, target.settlement);
  const diff = attacker.total - defender.total;
  const toDefender = damageRange(ctx, diff);
  let split: CombatPreview['split'] = null;
  if (target.kind === 'settlement') {
    const lo = settlementHit(ctx, target.settlement, toDefender[0], unit);
    const hi = settlementHit(ctx, target.settlement, toDefender[1], unit);
    split = { walls: [lo.walls, hi.walls], health: [lo.health, hi.health] };
  }
  return {
    mode,
    target,
    attacker,
    defender,
    toDefender,
    toAttacker: mode === 'melee' ? damageRange(ctx, -diff) : [0, 0],
    captures: mode === 'melee' && target.kind === 'settlement' && unitClassOf(ctx, unit).captures,
    split,
  };
}

/** Why a settlement can't strike `tile` now, or undefined. */
export function strikeProblem(
  ctx: EngineContext,
  state: GameState,
  s: SettlementState,
  tile: number,
  visible: Uint8Array = visibleTiles(ctx, state, s.owner),
): RuleError | undefined {
  const range = ctx.content.rules.combat.settlement.strikeRange;
  if (range <= 0) return { code: 'cannot_strike', message: 'Settlements have no ranged strike' };
  if (s.struckTurn === state.turn)
    return { code: 'already_struck', message: `${s.name} already struck this turn` };
  if (s.captureChoice) return { code: 'just_captured', message: `${s.name} was just captured` };
  if (tile < 0 || tile >= state.map.tiles.length)
    return { code: 'bad_tile', message: 'No such tile' };
  const target = targetAt(ctx, state, s.owner, tile);
  if (target?.kind !== 'unit') return { code: 'no_target', message: 'No enemy unit there' };
  if (!atWar(state, s.owner, target.unit.owner))
    return { code: 'not_at_war', message: "You're not at war with them" };
  if (distance(state.map, s.tile, tile) > range)
    return { code: 'too_far', message: `Out of range (range ${range})` };
  if (!visible[tile]) return { code: 'not_visible', message: "You can't see that tile" };
  return undefined;
}

/** Tiles a settlement could strike now. */
export function strikeTargets(ctx: EngineContext, state: GameState, s: SettlementState): number[] {
  if (s.struckTurn === state.turn) return [];
  const range = ctx.content.rules.combat.settlement.strikeRange;
  const visible = visibleTiles(ctx, state, s.owner);
  return tilesWithin(state.map, s.tile, range)
    .filter((t) => !strikeProblem(ctx, state, s, t, visible))
    .sort((a, b) => a - b);
}

export function previewStrike(
  ctx: EngineContext,
  state: GameState,
  s: SettlementState,
  tile: number,
): CombatPreview | undefined {
  if (strikeProblem(ctx, state, s, tile)) return undefined;
  const target = targetAt(ctx, state, s.owner, tile) as Extract<Target, { kind: 'unit' }>;
  const attacker = settlementStrength(ctx, state, s);
  const defender = defenseStrength(ctx, state, target.unit, null);
  return {
    mode: 'ranged',
    target,
    attacker,
    defender,
    toDefender: damageRange(ctx, attacker.total - defender.total),
    toAttacker: [0, 0],
    captures: false,
    split: null,
  };
}

/** A soldier's fighting weight: its best strength, scaled by health. */
export function unitPower(ctx: EngineContext, unit: UnitState): number {
  const def = unitDef(ctx, unit);
  if (!unitClassOf(ctx, unit).combat) return 0;
  const best = Math.max(def.strength, def.rangedStrength);
  return Math.floor((best * unit.health) / ctx.content.rules.combat.maxHealth);
}

/**
 * A player's military strength: the sum of their soldiers' fighting weight. Public, like the army
 * size on a score screen, so the AI may use it and the player panel shows it.
 */
export function militaryStrength(ctx: EngineContext, state: GameState, player: PlayerId): number {
  let total = 0;
  for (const id of unitIds(state)) {
    const u = state.units[id]!;
    if (u.owner !== player) continue;
    total += unitPower(ctx, u);
    for (const packed of u.cargo ?? []) total += unitPower(ctx, packed);
  }
  return total;
}
