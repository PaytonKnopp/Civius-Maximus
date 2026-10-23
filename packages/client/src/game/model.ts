import { type CompiledContent, resolveText } from '@cx/content';
import {
  type BuildItem,
  type EngineContext,
  goldPerTurn,
  growthPerTurn,
  growthThreshold,
  itemCost,
  itemDef,
  itemKey,
  type GameState,
  type MapTile,
  type PlayerId,
  percentOf,
  type SettlementState,
  type SettlementYields,
  settlementIds,
  settlementsOf,
  settlementYields,
  unitClassOf,
  unitDef,
  unitIds,
  unitsNeedingOrders,
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
  };
}

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
  const growth = growthPerTurn(ctx, yields);
  const foodNeeded = growthThreshold(ctx, s.population);
  const production = yields.total.production ?? 0;
  const headItem = s.kind === 'city' ? s.queue[0] : undefined;
  const head = headItem && {
    item: headItem,
    name: itemName(ctx.content, headItem),
    cost: itemCost(ctx, headItem),
    progress: s.progress[itemKey(headItem)] ?? 0,
    turns: turnsFor(itemCost(ctx, headItem), s.progress[itemKey(headItem)] ?? 0, production),
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
        status =
          s.pendingDevelop > 0
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
  | { kind: 'develop'; id: string; label: string }
  | { kind: 'production'; id: string; label: string }
  | { kind: 'end'; label: string }
  | { kind: 'waiting'; label: string };

/** What the Next Action button does now: units, then growth choices, then production, then End Turn. */
export function nextAction(state: GameState, player: PlayerId, after: string | null): NextAction {
  if (state.players[player]!.turnEnded) return { kind: 'waiting', label: 'Waiting for others' };
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
  return { kind: 'end', label: 'End turn' };
}

/** A fixed-point amount as whole units for display (rounded down), e.g. 1250 → "12". */
export const whole = (n: number) => String(Math.floor(n / 100));

/** A per-turn amount with a sign, e.g. +3 or -1.5. */
export function perTurn(n: number): string {
  const v = n / 100;
  const text = Number.isInteger(v) ? String(v) : v.toFixed(1);
  return n >= 0 ? `+${text}` : text;
}
