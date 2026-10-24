import { type CompiledContent, resolveText } from '@cx/content';
import {
  availableNodes,
  availablePolicies,
  availablePromotions,
  type BuildItem,
  districtYields,
  type EngineContext,
  goldPerTurn,
  HOSTILE,
  growthPerTurn,
  growthThreshold,
  itemCost,
  itemDef,
  itemKey,
  type GameState,
  type MapTile,
  type PlayerId,
  percentOf,
  placementTiles,
  policySlots,
  productionToward,
  SLOT_KINDS,
  type SettlementState,
  type SettlementYields,
  settlementIds,
  settlementsOf,
  settlementMaxHealth,
  settlementYields,
  toFixed,
  unitClassOf,
  unitDef,
  unitIds,
  unitsNeedingOrders,
  wallsMax,
} from '@cx/engine';
import type { SettlementView, TerritoryView, UnitView } from '../map/renderer';

/**
 * What the game screen shows, derived from the game state for one viewer. Pure functions: the
 * React components stay thin and the numbers match the engine exactly.
 */

export interface Colors {
  main: number;
  accent: number;
}

const hex = (s: string) => Number.parseInt(s.slice(1), 16);

export function playerColors(content: CompiledContent, state: GameState): Record<PlayerId, Colors> {
  const out: Record<PlayerId, Colors> = {};
  for (const id of state.playerOrder) {
    const civ = content.entities.civ[state.players[id]!.civ];
    out[id] = civ
      ? { main: hex(civ.colors.primary), accent: hex(civ.colors.secondary) }
      : { main: 0x8d9db6, accent: 0x10161d };
  }
  // Raiders: soot and ember.
  out[HOSTILE] = { main: 0x2b2420, accent: 0xe0503c };
  return out;
}

export const cssColor = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

export function civName(content: CompiledContent, state: GameState, player: PlayerId): string {
  const civ = content.entities.civ[state.players[player]!.civ];
  return civ ? resolveText(content, civ.name) : state.players[player]!.name;
}

export function unitViews(
  ctx: EngineContext,
  state: GameState,
  viewer: PlayerId,
  fog: Uint8Array,
  colors: Record<PlayerId, Colors>,
): UnitView[] {
  const needing = new Set(unitsNeedingOrders(state, viewer));
  return unitIds(state)
    .map((id) => state.units[id]!)
    .filter((u) => u.owner === viewer || fog[u.tile] === 2)
    .map((u) => {
      const def = unitDef(ctx, u);
      return {
        id: u.id,
        owner: u.owner,
        color: colors[u.owner]!.main,
        accent: colors[u.owner]!.accent,
        name: resolveText(ctx.content, def.name),
        icon: def.icon,
        model: def.model,
        layer: unitClassOf(ctx, u).layer,
        tile: u.tile,
        mine: u.owner === viewer,
        needsOrders: needing.has(u.id),
        health: Math.round((u.health * 100) / ctx.content.rules.combat.maxHealth),
        promotable: u.owner === viewer && availablePromotions(ctx, u).length > 0,
      };
    });
}

/** Territory as the viewer knows it: only explored tiles. */
export function territoryView(
  ctx: EngineContext,
  state: GameState,
  fog: Uint8Array,
): TerritoryView {
  return {
    settlement: state.map.tiles.map((t, i) => (fog[i] === 0 ? null : t.settlement)),
    improvements: state.map.tiles.map((t, i) =>
      fog[i] === 0 || t.improvement === null
        ? null
        : (ctx.content.entities.improvement[t.improvement]?.model ?? 'generic'),
    ),
    districts: state.map.tiles.map((t, i) => {
      const def = fog[i] === 0 || t.district === null ? undefined : districtDef(ctx, t.district);
      return def ? { model: def.model, color: hex(def.color), icon: def.icon } : null;
    }),
    wonders: state.map.tiles.map((t, i) => {
      const def =
        fog[i] === 0 || t.wonder === null ? undefined : ctx.content.entities.wonder[t.wonder];
      return def ? { model: def.model, icon: def.icon } : null;
    }),
    features: state.map.tiles.map((t) => t.feature),
    camps: (() => {
      const out = state.map.tiles.map(() => false);
      for (const c of Object.values(state.camps)) if (fog[c.tile] !== 0) out[c.tile] = true;
      return out;
    })(),
  };
}

const districtDef = (ctx: EngineContext, id: string) => ctx.content.entities.district[id];

/** "Plains Hills · Woods", "Coast", "Mountain"... */
export function tileName(content: CompiledContent, t: MapTile): string {
  const name = (v: string) => resolveText(content, v);
  const terrain = content.entities.terrain[t.terrain]!;
  return [
    t.elevation === 'mountain'
      ? 'Mountain'
      : t.elevation === 'hills'
        ? `${name(terrain.name)} Hills`
        : name(terrain.name),
    t.feature ? name(content.entities.feature[t.feature]!.name) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function itemName(content: CompiledContent, item: BuildItem): string {
  const def = itemDef({ content }, item);
  return def ? resolveText(content, def.name) : item.id;
}

/** Yields as a short label: "+2🔬 +1💰" (fixed-point amounts, zeroes left out). */
export function yieldLabel(content: CompiledContent, yields: Record<string, number>): string {
  return Object.entries(yields)
    .filter(([, v]) => v !== 0)
    .map(
      ([y, v]) => `${v > 0 ? '+' : ''}${formatAmount(v)}${content.entities.yield[y]?.icon ?? ''}`,
    )
    .join(' ');
}

const formatAmount = (n: number) => {
  const v = n / 100;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
};

/**
 * Where a district, wonder or project could go, with what each tile would give: a district's
 * yields from adjacency, a project's reward, a wonder's name.
 */
export function placementChoices(
  ctx: EngineContext,
  state: GameState,
  s: SettlementState,
  item: BuildItem,
): { tile: number; label: string; score: number }[] {
  const kind = item.kind as 'district' | 'wonder' | 'project';
  const { content } = ctx;
  const sum = (y: Record<string, number>) => Object.values(y).reduce((a, b) => a + b, 0);
  return placementTiles(ctx, state, s, kind, item.id)
    .map((tile) => {
      if (kind === 'district') {
        const total = districtYields(ctx, state, tile, item.id).total;
        const def = content.entities.district[item.id]!;
        const main =
          def.adjacency[0]?.yield ??
          Object.keys(def.specialistYields)[0] ??
          Object.keys(def.yields)[0];
        const none = main
          ? `+0${content.entities.yield[main]?.icon ?? ''}`
          : itemName(content, item);
        return { tile, label: yieldLabel(content, total) || none, score: sum(total) };
      }
      if (kind === 'project') {
        const reward = content.entities.project[item.id]?.reward ?? {};
        const fixed = Object.fromEntries(Object.entries(reward).map(([y, v]) => [y, toFixed(v)]));
        return { tile, label: yieldLabel(content, fixed) || itemName(content, item), score: 0 };
      }
      return { tile, label: itemName(content, item), score: 0 };
    })
    .sort((a, b) => b.score - a.score || a.tile - b.tile);
}

/** Turns until an item is done at this production rate (Infinity if no production). */
export function turnsFor(cost: number, progress: number, perTurn: number): number {
  if (progress >= cost) return 1;
  return perTurn > 0 ? Math.ceil((cost - progress) / perTurn) : Number.POSITIVE_INFINITY;
}

export const showTurns = (n: number) => (Number.isFinite(n) ? String(n) : '—');

export interface SettlementSummary {
  yields: SettlementYields;
  /** Food added per turn after mood (hundredths). */
  growth: number;
  foodNeeded: number;
  /** Turns to the next citizen (Infinity if not growing; negative surplus = starving). */
  growthTurns: number;
  head?: { item: BuildItem; name: string; cost: number; progress: number; turns: number };
  /** Towns: gold made from production per turn (hundredths). */
  townGold: number;
}

export function settlementSummary(
  ctx: EngineContext,
  state: GameState,
  s: SettlementState,
): SettlementSummary {
  const yields = settlementYields(ctx, state, s);
  const growth = growthPerTurn(ctx, state, s, yields);
  const foodNeeded = growthThreshold(ctx, s.population);
  const production = yields.total.production ?? 0;
  const headItem = s.kind === 'city' ? s.queue[0] : undefined;
  const head = headItem && {
    item: headItem,
    name: itemName(ctx.content, headItem),
    cost: itemCost(ctx, state, s.owner, headItem, s),
    progress: s.progress[itemKey(headItem)] ?? 0,
    turns: turnsFor(
      itemCost(ctx, state, s.owner, headItem, s),
      s.progress[itemKey(headItem)] ?? 0,
      productionToward(ctx, state, s, headItem, production),
    ),
  };
  return {
    yields,
    growth,
    foodNeeded,
    growthTurns: growth > 0 ? Math.ceil((foodNeeded - s.food) / growth) : Number.POSITIVE_INFINITY,
    ...(head ? { head } : {}),
    townGold:
      s.kind === 'town' ? percentOf(production, ctx.content.rules.settlements.townGoldPercent) : 0,
  };
}

export function settlementViews(
  ctx: EngineContext,
  state: GameState,
  viewer: PlayerId,
  territory: TerritoryView,
  colors: Record<PlayerId, Colors>,
): SettlementView[] {
  const known = new Set(territory.settlement.filter((x): x is string => x !== null));
  return settlementIds(state)
    .map((id) => state.settlements[id]!)
    .filter((s) => known.has(s.id))
    .map((s) => {
      let status: string | undefined;
      if (s.owner === viewer) {
        const sum = settlementSummary(ctx, state, s);
        status = s.captureChoice
          ? 'Captured: decide its fate'
          : s.pendingDevelop > 0
            ? 'Choose a tile to develop'
            : s.kind === 'town'
              ? 'Town'
              : sum.head
                ? `${sum.head.name} · ${showTurns(sum.head.turns)}`
                : 'Choose production';
      }
      return {
        id: s.id,
        owner: s.owner,
        color: colors[s.owner]!.main,
        accent: colors[s.owner]!.accent,
        name: s.name,
        population: s.population,
        tile: s.tile,
        kind: s.kind,
        capital: s.capital,
        mine: s.owner === viewer,
        ...(status ? { status } : {}),
        health: s.health,
        maxHealth: settlementMaxHealth(ctx, s.kind),
        walls: s.walls,
        wallsMax: wallsMax(ctx, s),
      };
    });
}

export interface EmpireSummary {
  gold: number;
  goldPerTurn: number;
  science: number;
  culture: number;
  faith: number;
  faithPerTurn: number;
}

export function empireSummary(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
): EmpireSummary {
  const sum = { science: 0, culture: 0, faith: 0 };
  for (const s of settlementsOf(state, player)) {
    const y = settlementYields(ctx, state, s).total;
    sum.science += y.science ?? 0;
    sum.culture += y.culture ?? 0;
    sum.faith += y.faith ?? 0;
  }
  const p = state.players[player]!;
  return {
    gold: p.gold,
    goldPerTurn: goldPerTurn(ctx, state, player),
    science: sum.science,
    culture: sum.culture,
    faith: p.faith,
    faithPerTurn: sum.faith,
  };
}

export type NextAction =
  | { kind: 'unit'; id: string; label: string }
  | { kind: 'capture'; id: string; label: string }
  | { kind: 'develop'; id: string; label: string }
  | { kind: 'production'; id: string; label: string }
  | { kind: 'research'; label: string }
  | { kind: 'civic'; label: string }
  | { kind: 'policies'; label: string }
  | { kind: 'end'; label: string }
  | { kind: 'waiting'; label: string };

/**
 * What the Next Action button does now (docs/06-ui-ux.md, "End Turn"): units, growth choices,
 * production, research, civics, then empty policy slots right after a civic, then End Turn.
 * `policiesSeen` is the turn the player last opened the government screen (so empty slots they
 * chose to leave don't block the turn).
 */
export function nextAction(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  after: string | null,
  policiesSeen = 0,
): NextAction {
  const p = state.players[player]!;
  if (p.turnEnded) return { kind: 'waiting', label: 'Waiting for others' };
  const captured = settlementsOf(state, player).find((s) => s.captureChoice);
  if (captured)
    return { kind: 'capture', id: captured.id, label: `Decide ${captured.name}'s fate` };
  const units = unitsNeedingOrders(state, player);
  if (units.length > 0) {
    const id =
      (after?.startsWith('u') && units.find((u) => Number(u.slice(1)) > Number(after.slice(1)))) ||
      units[0]!;
    return {
      kind: 'unit',
      id,
      label: `${units.length} unit${units.length === 1 ? ' needs' : 's need'} orders`,
    };
  }
  const mine = settlementsOf(state, player);
  const growing = mine.find((s) => s.pendingDevelop > 0);
  if (growing) return { kind: 'develop', id: growing.id, label: 'Choose a tile to develop' };
  const idle = mine.find((s) => s.kind === 'city' && s.queue.length === 0);
  if (idle) return { kind: 'production', id: idle.id, label: 'Choose production' };
  if (mine.length > 0) {
    if (!p.techs.current && availableNodes(ctx, p, 'tech').length > 0)
      return { kind: 'research', label: 'Choose research' };
    if (!p.civics.current && availableNodes(ctx, p, 'civic').length > 0)
      return { kind: 'civic', label: 'Choose a civic' };
    if (p.policyWindow && policiesSeen !== state.turn && hasEmptySlotToFill(ctx, state, player))
      return { kind: 'policies', label: 'Choose policies' };
  }
  return { kind: 'end', label: 'End turn' };
}

/** An empty slot that one of the unslotted cards could fill. */
function hasEmptySlotToFill(ctx: EngineContext, state: GameState, player: PlayerId): boolean {
  const p = state.players[player]!;
  const slots = policySlots(ctx, state, player);
  const slotted = new Set(SLOT_KINDS.flatMap((k) => p.policies[k]));
  const free = availablePolicies(ctx, p).filter((id) => !slotted.has(id));
  return SLOT_KINDS.some(
    (k) =>
      p.policies[k].length < slots[k] &&
      free.some((id) => k === 'wildcard' || ctx.content.entities.policy[id]!.slot === k),
  );
}

/** A fixed-point amount as whole units for display (rounded down), e.g. 1250 → "12". */
export const whole = (n: number) => String(Math.floor(n / 100));

/** A per-turn amount with a sign, e.g. +3 or -1.5. */
export function perTurn(n: number): string {
  const v = n / 100;
  const text = Number.isInteger(v) ? String(v) : v.toFixed(1);
  return n >= 0 ? `+${text}` : text;
}
