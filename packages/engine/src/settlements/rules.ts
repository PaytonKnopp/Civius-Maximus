import { type BuildingDef, type ImprovementDef, resolveText, type UnitDef } from '@cx/content';
import type { EngineContext, RuleError } from '../context';
import { computeTileYields, type YieldBreakdown } from '../effects/yields';
import { type Fixed, percentOf, powFloor, toFixed } from '../fixed';
import { distance, isOnRiver, neighbors, tilesWithin } from '../map/hex';
import type { MapState } from '../map/types';
import type { BuildItem, CitizenFocus, GameState, PlayerId, SettlementState } from '../state';
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

const riverCache = new WeakMap<object, Uint8Array>();
/** Whether a tile has a river on any edge (cached per map). */
export function tileOnRiver(map: MapState, tile: number): boolean {
  let flags = riverCache.get(map.tiles);
  if (!flags) {
    const rivers = map.tiles.map((t) => t.river);
    flags = new Uint8Array(map.tiles.length);
    for (let i = 0; i < flags.length; i++) flags[i] = isOnRiver(map, rivers, i) ? 1 : 0;
    riverCache.set(map.tiles, flags);
  }
  return flags[tile] === 1;
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
  return computeTileYields({
    content: ctx.content,
    tile: facts(tile),
    neighbors: neighbors(state.map, tile).map(facts),
    playerId: t.owner ?? viewer ?? '',
  });
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

/** Improvements that could go on a tile (ignoring ownership), best match first. */
export function improvementsFor(ctx: EngineContext, state: GameState, tile: number): string[] {
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
 * and either its own or unclaimed (developing an unclaimed tile claims it, as in Civ 7).
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
        (tile.settlement === s.id || tile.owner === null) &&
        improvementsFor(ctx, state, t).length > 0
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

export function settlementLimit(ctx: EngineContext): number {
  return ctx.content.rules.settlements.startingLimit;
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
  const citizens = Math.floor(s.population / h.citizensPerUnhappy);
  if (citizens > 0) lines.push({ label: 'Citizens', amount: -citizens });
  const maintained = s.buildings.filter(
    (b) => ctx.content.entities.building[b]!.maintenance > 0,
  ).length;
  if (maintained > 0 && h.perMaintainedBuilding > 0)
    lines.push({ label: 'Building upkeep', amount: -maintained * h.perMaintainedBuilding });
  const over = settlementsOf(state, s.owner).length - settlementLimit(ctx);
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

  for (const b of s.buildings) {
    const def = ctx.content.entities.building[b]!;
    for (const y of Object.keys(def.yields).sort())
      add(y, resolveText(ctx.content, def.name), toFixed(def.yields[y]!));
  }

  const happiness = happinessOf(ctx, state, s);
  const total: Record<string, Fixed> = {};
  for (const y of Object.keys(lines)) total[y] = lines[y]!.reduce((sum, l) => sum + l.amount, 0);
  if (happiness.yieldPercent !== 0) {
    const label =
      happiness.mood === 'thriving'
        ? `Thriving (+${happiness.yieldPercent}%)`
        : `${happiness.mood === 'unrest' ? 'Unrest' : 'Unhappy'} (${happiness.yieldPercent}%)`;
    for (const y of Object.keys(total).sort()) {
      if (y === 'happiness') continue;
      const delta = percentOf(total[y]!, happiness.yieldPercent);
      add(y, label, delta);
      total[y] = total[y]! + delta;
    }
  }
  const eaten = toFixed(rules.foodPerCitizen * s.population);
  return { total, lines, happiness, surplus: (total.food ?? 0) - eaten };
}

/** Food needed for the next citizen: `base + perPop × (pop − 1) + (pop − 1)^exponent`. */
export function growthThreshold(ctx: EngineContext, population: number): Fixed {
  const g = ctx.content.rules.settlements.growth;
  const n = population - 1;
  return toFixed(g.base + g.perPop * n) + toFixed(powFloor(n, g.exponent));
}

/** Food added to the store this turn: the surplus, adjusted by mood when growing. */
export function growthPerTurn(ctx: EngineContext, y: SettlementYields): Fixed {
  if (y.surplus <= 0) return y.surplus;
  const h = ctx.content.rules.settlements.happiness;
  switch (y.happiness.mood) {
    case 'thriving':
      return y.surplus + percentOf(y.surplus, h.thrivingGrowthPercent);
    case 'unhappy':
      return Math.trunc(y.surplus / 2);
    case 'unrest':
      return 0;
    default:
      return y.surplus;
  }
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

export function purchaseCost(ctx: EngineContext, item: BuildItem): Fixed {
  return itemCost(ctx, item) * ctx.content.rules.settlements.purchase.goldPerProduction;
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

/** Gold a player makes per turn after building upkeep. */
export function goldPerTurn(ctx: EngineContext, state: GameState, player: PlayerId): Fixed {
  let gold = 0;
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
