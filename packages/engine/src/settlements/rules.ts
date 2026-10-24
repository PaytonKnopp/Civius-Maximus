import { type BuildingDef, type ImprovementDef, resolveText, type UnitDef } from '@cx/content';
import { type EngineContext, type RuleError, unitDef } from '../context';
import { computeTileYields, type YieldBreakdown } from '../effects/yields';
import { type Fixed, percentOf, powFloor, toFixed } from '../fixed';
import { distance, neighbors, tilesWithin, tileTouchesRiver } from '../map/hex';
import type { MapState } from '../map/types';
import type { BuildItem, CitizenFocus, GameState, PlayerId, SettlementState } from '../state';
import {
  activeSources,
  playerEffects,
  playerFacts,
  playerPercent,
  settlementLimitOf,
} from '../progress/sources';
import { isWater } from '../units/movement';

/**
 * Settlement rules as pure functions of the game state (docs/03-core-mechanics.md, section 3).
 * Handlers and the turn step call these; the client calls them too, to show the same numbers.
 */

/** Settlement ids in founding order (`s2` before `s10`). */
export function settlementIds(state: Pick<GameState, 'settlements'>): string[] {
  return Object.keys(state.settlements).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}

export function settlementsOf(state: GameState, player: PlayerId): SettlementState[] {
  return settlementIds(state)
    .map((id) => state.settlements[id]!)
    .filter((s) => s.owner === player);
}

// --- Tiles -----------------------------------------------------------------------------------

/** Whether a tile has a river on any edge. */
export function tileOnRiver(map: MapState, tile: number): boolean {
  return tileTouchesRiver(map, map.tiles, tile);
}

/** A tile's yields as its owner (or `viewer`, if unowned) gets them, with the "why?" lines. */
export function tileYields(
  ctx: EngineContext,
  state: GameState,
  tile: number,
  viewer: PlayerId | null = null,
): YieldBreakdown {
  const facts = (i: number) => {
    const t = state.map.tiles[i]!;
    return { ...t, river: tileOnRiver(state.map, i), ownerId: t.owner };
  };
  const t = state.map.tiles[tile]!;
  const pid = t.owner ?? viewer;
  const p = pid === null ? undefined : state.players[pid];
  return computeTileYields(
    {
      content: ctx.content,
      tile: facts(tile),
      neighbors: neighbors(state.map, tile).map(facts),
      playerId: pid ?? '',
      ...(p ? { player: playerFacts(p) } : {}),
    },
    p ? activeSources(ctx, p) : [],
  );
}

/** Whether a player has what something requires (its tech and civic). */
export function isUnlocked(
  state: GameState,
  player: PlayerId,
  thing: { requiresTech?: string | undefined; requiresCivic?: string | undefined },
): boolean {
  const p = state.players[player]!;
  return (
    (thing.requiresTech === undefined || p.techs.done.includes(thing.requiresTech)) &&
    (thing.requiresCivic === undefined || p.civics.done.includes(thing.requiresCivic))
  );
}

/** "Needs Pottery" for something locked behind a tech or civic, or undefined if unlocked. */
export function lockedReason(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  thing: { requiresTech?: string | undefined; requiresCivic?: string | undefined },
): string | undefined {
  const p = state.players[player]!;
  const missing = [
    thing.requiresTech && !p.techs.done.includes(thing.requiresTech)
      ? ctx.content.entities.tech[thing.requiresTech]?.name
      : undefined,
    thing.requiresCivic && !p.civics.done.includes(thing.requiresCivic)
      ? ctx.content.entities.civic[thing.requiresCivic]?.name
      : undefined,
  ].filter((x): x is string => x !== undefined);
  return missing.length > 0
    ? `Needs ${missing.map((n) => resolveText(ctx.content, n)).join(' and ')}`
    : undefined;
}

export function isCoastal(ctx: EngineContext, state: GameState, tile: number): boolean {
  return (
    !isWater(ctx, state, tile) &&
    neighbors(state.map, tile).some(
      (n) =>
        isWater(ctx, state, n) &&
        state.map.tiles[n]!.terrain !== ctx.content.rules.mapgen.lakeTerrain,
    )
  );
}

/** Tiles a settlement's citizens may work: its own, within the work radius, center excluded. */
export function workableTiles(ctx: EngineContext, state: GameState, s: SettlementState): number[] {
  return tilesWithin(state.map, s.tile, ctx.content.rules.settlements.workRadius)
    .filter((t) => t !== s.tile && state.map.tiles[t]!.settlement === s.id)
    .sort((a, b) => a - b);
}

// --- Founding --------------------------------------------------------------------------------

/** Why `player` can't found a settlement on `tile`, or undefined if they can. */
export function foundingProblem(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  tile: number,
): RuleError | undefined {
  const t = state.map.tiles[tile]!;
  if (isWater(ctx, state, tile))
    return { code: 'bad_site', message: "Settlements can't be founded on water" };
  if (t.elevation === 'mountain')
    return { code: 'bad_site', message: "Settlements can't be founded on mountains" };
  const feature = t.feature === null ? undefined : ctx.content.entities.feature[t.feature];
  if (feature?.impassable)
    return {
      code: 'bad_site',
      message: `Settlements can't be founded on ${resolveText(ctx.content, feature.name)}`,
    };
  if (t.owner !== null && t.owner !== player)
    return {
      code: 'foreign_territory',
      message: "You can't found a settlement in someone else's territory",
    };
  const min = ctx.content.rules.settlements.minDistance;
  for (const id of settlementIds(state)) {
    const other = state.settlements[id]!;
    if (distance(state.map, other.tile, tile) <= min) {
      return {
        code: 'too_close',
        message: `Too close to ${other.name}: settlements need ${min} tiles between them`,
      };
    }
  }
  return undefined;
}

// --- Improvements ----------------------------------------------------------------------------

/**
 * Improvements that could go on a tile (ignoring ownership), best match first. With a player,
 * only the ones they've unlocked.
 */
export function improvementsFor(
  ctx: EngineContext,
  state: GameState,
  tile: number,
  player?: PlayerId,
): string[] {
  const t = state.map.tiles[tile]!;
  if (t.elevation === 'mountain') return [];
  const fits = (imp: ImprovementDef): 0 | 1 | 2 => {
    if (t.resource !== null && imp.resources.includes(t.resource)) return 2;
    const ok = imp.sites.some(
      (site) =>
        (site.terrains === undefined || site.terrains.includes(t.terrain)) &&
        site.elevations.includes(t.elevation) &&
        (t.feature === null ? !site.needsFeature : site.features.includes(t.feature)),
    );
    return ok ? 1 : 0;
  };
  return ctx.content.ids.improvement
    .filter(
      (id) =>
        player === undefined || isUnlocked(state, player, ctx.content.entities.improvement[id]!),
    )
    .map((id) => ({ id, fit: fits(ctx.content.entities.improvement[id]!) }))
    .filter((x) => x.fit > 0)
    .sort(
      (a, b) =>
        b.fit - a.fit ||
        ctx.content.entities.improvement[a.id]!.order -
          ctx.content.entities.improvement[b.id]!.order ||
        (a.id < b.id ? -1 : 1),
    )
    .map((x) => x.id);
}

/**
 * Tiles a growing settlement may develop: within the work radius, not the center, not improved,
 * and either its own or unclaimed but touching its territory (developing claims it, as in Civ 7).
 */
export function developCandidates(
  ctx: EngineContext,
  state: GameState,
  s: SettlementState,
): number[] {
  return tilesWithin(state.map, s.tile, ctx.content.rules.settlements.workRadius)
    .filter((t) => {
      const tile = state.map.tiles[t]!;
      return (
        t !== s.tile &&
        tile.improvement === null &&
        (tile.settlement === s.id ||
          (tile.owner === null &&
            neighbors(state.map, t).some((n) => state.map.tiles[n]!.settlement === s.id))) &&
        improvementsFor(ctx, state, t, s.owner).length > 0
      );
    })
    .sort((a, b) => a - b);
}

// --- Yields and happiness --------------------------------------------------------------------

export type Mood = 'thriving' | 'content' | 'unhappy' | 'unrest';

export interface Line {
  label: string;
  amount: Fixed;
}

export interface Happiness {
  balance: number;
  mood: Mood;
  lines: Line[];
  /** Percent applied to every yield (thriving bonus, unhappiness penalty). */
  yieldPercent: number;
}

/** How many settlements a player can have before every settlement loses happiness. */
export function settlementLimit(ctx: EngineContext, state: GameState, player: PlayerId): number {
  return settlementLimitOf(ctx, state, player);
}

function improvedLuxuries(ctx: EngineContext, state: GameState, s: SettlementState): Line[] {
  const out: Line[] = [];
  for (const t of tilesWithin(state.map, s.tile, ctx.content.rules.settlements.ownRadius)) {
    const tile = state.map.tiles[t]!;
    if (tile.settlement !== s.id || tile.resource === null || tile.improvement === null) continue;
    const res = ctx.content.entities.resource[tile.resource]!;
    const imp = ctx.content.entities.improvement[tile.improvement]!;
    if (res.class === 'luxury' && res.happiness > 0 && imp.resources.includes(res.id)) {
      out.push({ label: resolveText(ctx.content, res.name), amount: res.happiness });
    }
  }
  return out;
}

/** A settlement's happiness balance and what it does (docs/03, "Happiness"). Whole numbers. */
export function happinessOf(ctx: EngineContext, state: GameState, s: SettlementState): Happiness {
  const h = ctx.content.rules.settlements.happiness;
  const lines: Line[] = [{ label: 'Base', amount: h.base }];
  for (const b of s.buildings) {
    const def = ctx.content.entities.building[b]!;
    if (def.happiness !== 0)
      lines.push({ label: resolveText(ctx.content, def.name), amount: def.happiness });
  }
  lines.push(...improvedLuxuries(ctx, state, s));
  for (const { source, effect } of playerEffects(ctx, state, s.owner, 'modify_happiness', s)) {
    lines.push({ label: source.label, amount: effect.params.amount });
  }
  const citizens = Math.floor(s.population / h.citizensPerUnhappy);
  if (citizens > 0) lines.push({ label: 'Citizens', amount: -citizens });
  const maintained = s.buildings.filter(
    (b) => ctx.content.entities.building[b]!.maintenance > 0,
  ).length;
  if (maintained > 0 && h.perMaintainedBuilding > 0)
    lines.push({ label: 'Building upkeep', amount: -maintained * h.perMaintainedBuilding });
  const over = settlementsOf(state, s.owner).length - settlementLimit(ctx, state, s.owner);
  if (over > 0)
    lines.push({ label: 'Over the settlement limit', amount: -over * h.perSettlementOverLimit });
  const balance = lines.reduce((sum, l) => sum + l.amount, 0);
  const mood: Mood =
    balance >= h.thrivingAt
      ? 'thriving'
      : balance >= 0
        ? 'content'
        : balance > h.unrestAt
          ? 'unhappy'
          : 'unrest';
  const yieldPercent =
    mood === 'thriving'
      ? h.thrivingYieldPercent
      : mood === 'unhappy'
        ? -balance * h.unhappyYieldPercentPerPoint
        : mood === 'unrest'
          ? h.unrestYieldPercent
          : 0;
  return { balance, mood, lines, yieldPercent };
}

export interface SettlementYields {
  /** Per yield, in hundredths. */
  total: Record<string, Fixed>;
  lines: Record<string, Line[]>;
  happiness: Happiness;
  /** Food left after feeding citizens (before growth modifiers). */
  surplus: Fixed;
}

/** Everything a settlement makes in a turn, with a breakdown per yield. */
export function settlementYields(
  ctx: EngineContext,
  state: GameState,
  s: SettlementState,
): SettlementYields {
  const rules = ctx.content.rules.settlements;
  const lines: Record<string, Line[]> = {};
  const add = (y: string, label: string, amount: Fixed) => {
    if (amount !== 0) (lines[y] ??= []).push({ label, amount });
  };

  const center = tileYields(ctx, state, s.tile).total;
  for (const [y, min] of Object.entries(rules.centerMinimumYields)) {
    center[y] = Math.max(center[y] ?? 0, toFixed(min));
  }
  for (const y of Object.keys(center).sort()) add(y, 'Settlement center', center[y]!);

  const worked: Record<string, Fixed> = {};
  for (const t of s.worked) {
    const yields = tileYields(ctx, state, t).total;
    for (const [y, v] of Object.entries(yields)) worked[y] = (worked[y] ?? 0) + v;
  }
  for (const y of Object.keys(worked).sort())
    add(y, `Worked tiles (${s.worked.length})`, worked[y]!);

  for (const [y, v] of Object.entries(rules.citizenYields).sort())
    add(y, `Citizens (${s.population})`, toFixed(v * s.population));

  for (const b of s.buildings) {
    const def = ctx.content.entities.building[b]!;
    for (const y of Object.keys(def.yields).sort())
      add(y, resolveText(ctx.content, def.name), toFixed(def.yields[y]!));
  }

  // Settlement-wide effects (government, policies...): flat amounts now, percentages after.
  const percents: { y: string; label: string; percent: number }[] = [];
  for (const { source, effect } of playerEffects(ctx, state, s.owner, 'modify_yield', s)) {
    if (effect.target.scope !== 'settlements') continue;
    const params = effect.params;
    if ('amount' in params) add(params.yield, source.label, toFixed(params.amount));
    else percents.push({ y: params.yield, label: source.label, percent: params.percent });
  }

  const happiness = happinessOf(ctx, state, s);
  const total: Record<string, Fixed> = {};
  for (const y of Object.keys(lines)) total[y] = lines[y]!.reduce((sum, l) => sum + l.amount, 0);
  // Percentages apply to the subtotal before any percentage, so they add up instead of compounding.
  const before = { ...total };
  const applyPercent = (y: string, label: string, percent: number) => {
    const delta = percentOf(before[y] ?? 0, percent);
    add(y, `${label} (${percent > 0 ? '+' : ''}${percent}%)`, delta);
    total[y] = (total[y] ?? 0) + delta;
  };
  if (happiness.yieldPercent !== 0) {
    const label =
      happiness.mood === 'thriving'
        ? 'Thriving'
        : happiness.mood === 'unrest'
          ? 'Unrest'
          : 'Unhappy';
    for (const y of Object.keys(before).sort()) {
      if (y !== 'happiness') applyPercent(y, label, happiness.yieldPercent);
    }
  }
  for (const p of percents) applyPercent(p.y, p.label, p.percent);
  const eaten = toFixed(rules.foodPerCitizen * s.population);
  return { total, lines, happiness, surplus: (total.food ?? 0) - eaten };
}

/** Food needed for the next citizen: `base + perPop × (pop − 1) + (pop − 1)^exponent`. */
export function growthThreshold(ctx: EngineContext, population: number): Fixed {
  const g = ctx.content.rules.settlements.growth;
  const n = population - 1;
  return toFixed(g.base + g.perPop * n) + toFixed(powFloor(n, g.exponent));
}

/** Food added to the store this turn: the surplus, adjusted by mood and effects when growing. */
export function growthPerTurn(
  ctx: EngineContext,
  state: GameState,
  s: SettlementState,
  y: SettlementYields,
): Fixed {
  if (y.surplus <= 0) return y.surplus;
  const h = ctx.content.rules.settlements.happiness;
  if (y.happiness.mood === 'unrest') return 0;
  if (y.happiness.mood === 'unhappy') return Math.trunc(y.surplus / 2);
  let percent = y.happiness.mood === 'thriving' ? h.thrivingGrowthPercent : 0;
  for (const { effect } of playerEffects(ctx, state, s.owner, 'modify_growth', s))
    percent += effect.params.percent;
  return y.surplus + percentOf(y.surplus, percent);
}

/** Culture that goes toward the next border tile this turn (border growth effects applied). */
export function borderCulture(
  ctx: EngineContext,
  state: GameState,
  s: SettlementState,
  culture: Fixed,
): Fixed {
  let percent = 0;
  for (const { effect } of playerEffects(ctx, state, s.owner, 'modify_border_growth', s))
    percent += effect.params.percent;
  return Math.max(0, culture + percentOf(culture, percent));
}

/** Culture needed for the next border tile: `base + (perTile × acquired)^exponent`. */
export function borderThreshold(ctx: EngineContext, acquired: number): Fixed {
  const b = ctx.content.rules.settlements.borderGrowth;
  return toFixed(b.base) + toFixed(powFloor(Math.round(b.perTile * acquired), b.exponent));
}

// --- Citizens --------------------------------------------------------------------------------

/** How much auto-assign wants a tile: weighted yields (the focus yield counts triple). */
export function tileScore(
  ctx: EngineContext,
  yields: Record<string, Fixed>,
  focus: CitizenFocus,
): number {
  const weights = ctx.content.rules.settlements.citizenWeights;
  let score = 0;
  for (const [y, v] of Object.entries(yields)) {
    const w = weights[y] ?? 0;
    score += v * w * (focus === y ? 3 : 1);
  }
  return score;
}

/**
 * Picks the tiles a settlement's citizens work: locked tiles first, then the best by focus.
 * Deterministic: ties go to the lower tile index.
 */
export function assignCitizens(
  ctx: EngineContext,
  state: GameState,
  s: SettlementState,
): { worked: number[]; locked: number[] } {
  const workable = workableTiles(ctx, state, s);
  const locked = s.locked.filter((t) => workable.includes(t)).slice(0, s.population);
  const rest = workable
    .filter((t) => !locked.includes(t))
    .map((t) => ({ t, score: tileScore(ctx, tileYields(ctx, state, t).total, s.focus) }))
    .sort((a, b) => b.score - a.score || a.t - b.t)
    .slice(0, Math.max(0, s.population - locked.length))
    .map((x) => x.t);
  return { worked: [...locked, ...rest].sort((a, b) => a - b), locked };
}

/** The tile border growth claims next: the most valuable unclaimed tile touching the territory. */
export function nextBorderTile(
  ctx: EngineContext,
  state: GameState,
  s: SettlementState,
): number | undefined {
  const rules = ctx.content.rules.settlements;
  let best: { t: number; score: number } | undefined;
  for (const t of tilesWithin(state.map, s.tile, rules.ownRadius)) {
    const tile = state.map.tiles[t]!;
    if (tile.owner !== null) continue;
    if (!neighbors(state.map, t).some((n) => state.map.tiles[n]!.settlement === s.id)) continue;
    const dist = distance(state.map, s.tile, t);
    let score = tileScore(ctx, tileYields(ctx, state, t, s.owner).total, 'balanced');
    if (tile.resource !== null) {
      const cls = ctx.content.entities.resource[tile.resource]!.class;
      score += cls === 'luxury' ? 6000 : cls === 'strategic' ? 4000 : 2000;
    }
    if (dist > rules.workRadius) score -= 5000;
    score -= dist * 1000;
    if (!best || score > best.score || (score === best.score && t < best.t)) best = { t, score };
  }
  return best?.t;
}

export function tilePurchaseCost(
  ctx: EngineContext,
  state: GameState,
  s: SettlementState,
  tile: number,
): Fixed {
  const p = ctx.content.rules.settlements.purchase;
  const d = distance(state.map, s.tile, tile);
  return toFixed(p.tileBase + p.tilePerAcquired * s.tilesAcquired + p.tilePerDistance * d);
}

/** Tiles a settlement could buy: unclaimed, within the own radius, touching its territory. */
export function purchasableTiles(
  ctx: EngineContext,
  state: GameState,
  s: SettlementState,
): number[] {
  return tilesWithin(state.map, s.tile, ctx.content.rules.settlements.ownRadius)
    .filter(
      (t) =>
        state.map.tiles[t]!.owner === null &&
        neighbors(state.map, t).some((n) => state.map.tiles[n]!.settlement === s.id),
    )
    .sort((a, b) => a - b);
}

// --- Production ------------------------------------------------------------------------------

export const itemKey = (item: BuildItem) => `${item.kind}:${item.id}`;

export function itemDef(ctx: EngineContext, item: BuildItem): UnitDef | BuildingDef | undefined {
  return item.kind === 'unit'
    ? ctx.content.entities.unit[item.id]
    : ctx.content.entities.building[item.id];
}

export function itemCost(ctx: EngineContext, item: BuildItem): Fixed {
  return toFixed(itemDef(ctx, item)?.cost ?? 0);
}

/** Gold to buy an item outright (policies can make it cheaper). */
export function purchaseCost(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  item: BuildItem,
): Fixed {
  const base = itemCost(ctx, item) * ctx.content.rules.settlements.purchase.goldPerProduction;
  const percent = playerPercent(ctx, state, player, 'modify_purchase_cost');
  return Math.max(0, base + percentOf(base, percent));
}

/** Production that goes toward an item this turn: the settlement's, plus bonuses for that item. */
export function productionToward(
  ctx: EngineContext,
  state: GameState,
  s: SettlementState,
  item: BuildItem,
  production: Fixed,
): Fixed {
  const def = itemDef(ctx, item);
  if (!def) return production;
  const oneOf = (v: string, list: string | string[] | undefined) =>
    list === undefined || (Array.isArray(list) ? list.includes(v) : list === v);
  let percent = 0;
  for (const { effect } of playerEffects(ctx, state, s.owner, 'modify_production', s)) {
    const t = effect.params.toward;
    if (t.kind !== undefined && t.kind !== item.kind) continue;
    if (item.kind === 'unit') {
      if (t.building !== undefined) continue;
      if (!oneOf(item.id, t.unit) || !oneOf((def as UnitDef).class, t.unitClass)) continue;
    } else {
      if (t.unit !== undefined || t.unitClass !== undefined) continue;
      if (!oneOf(item.id, t.building)) continue;
    }
    percent += effect.params.percent;
  }
  return Math.max(0, production + percentOf(production, percent));
}

/** Why a settlement can't have this item at all (queue or purchase), or undefined. */
export function itemProblem(
  ctx: EngineContext,
  state: GameState,
  s: SettlementState,
  item: BuildItem,
): RuleError | undefined {
  const def = itemDef(ctx, item);
  if (!def) return { code: 'unknown_item', message: `Unknown ${item.kind} "${item.id}"` };
  if (def.cost <= 0)
    return {
      code: 'not_buildable',
      message: `${resolveText(ctx.content, def.name)} can't be built`,
    };
  const locked = lockedReason(ctx, state, s.owner, def);
  if (locked) return { code: 'locked', message: locked };
  if (item.kind === 'unit') {
    const u = def as UnitDef;
    const domain = ctx.content.entities.unitClass[u.class]!.domain;
    if (domain === 'sea' && !isCoastal(ctx, state, s.tile))
      return { code: 'needs_coast', message: 'Ships need a settlement on the coast' };
    return undefined;
  }
  const b = def as BuildingDef;
  if (s.buildings.includes(b.id))
    return {
      code: 'already_built',
      message: `${resolveText(ctx.content, b.name)} is already built`,
    };
  if (b.requiresRiver && !tileOnRiver(state.map, s.tile))
    return { code: 'needs_river', message: 'Needs a settlement next to a river' };
  if (b.requiresCoast && !isCoastal(ctx, state, s.tile))
    return { code: 'needs_coast', message: 'Needs a settlement on the coast' };
  if (b.cityOnly && s.kind === 'town')
    return { code: 'city_only', message: 'Only cities can have this' };
  if (b.requiresBuilding && !s.buildings.includes(b.requiresBuilding)) {
    const needed = ctx.content.entities.building[b.requiresBuilding];
    return {
      code: 'needs_building',
      message: `Needs a ${needed ? resolveText(ctx.content, needed.name) : b.requiresBuilding} first`,
    };
  }
  return undefined;
}

/** Everything a settlement could produce or buy right now, in content order. */
export function availableItems(
  ctx: EngineContext,
  state: GameState,
  s: SettlementState,
): BuildItem[] {
  const all: BuildItem[] = [
    ...ctx.content.ids.unit.map((id) => ({ kind: 'unit' as const, id })),
    ...ctx.content.ids.building.map((id) => ({ kind: 'building' as const, id })),
  ];
  return all.filter((item) => !itemProblem(ctx, state, s, item));
}

export function townUpgradeCost(ctx: EngineContext, state: GameState, player: PlayerId): Fixed {
  const u = ctx.content.rules.settlements.townUpgrade;
  const cities = settlementsOf(state, player).filter((s) => s.kind === 'city').length;
  return toFixed(u.base + u.perCity * cities);
}

/** Gold per turn to keep a player's units, after the free allowance (policies can lower it). */
export function unitUpkeep(ctx: EngineContext, state: GameState, player: PlayerId): Fixed {
  let total = 0;
  for (const u of Object.values(state.units)) {
    if (u.owner === player) total += toFixed(unitDef(ctx, u).upkeep);
  }
  total = Math.max(0, total - toFixed(ctx.content.rules.units.freeUpkeep));
  const percent = playerPercent(ctx, state, player, 'modify_unit_upkeep');
  return Math.max(0, total + percentOf(total, percent));
}

/** Gold a player makes per turn after building and unit upkeep. */
export function goldPerTurn(ctx: EngineContext, state: GameState, player: PlayerId): Fixed {
  let gold = -unitUpkeep(ctx, state, player);
  for (const s of settlementsOf(state, player)) {
    const y = settlementYields(ctx, state, s);
    gold += y.total.gold ?? 0;
    if (s.kind === 'town') {
      gold += percentOf(y.total.production ?? 0, ctx.content.rules.settlements.townGoldPercent);
    }
    for (const b of s.buildings) gold -= toFixed(ctx.content.entities.building[b]!.maintenance);
  }
  return gold;
}
