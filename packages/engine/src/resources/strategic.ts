import { resolveText } from '@cx/content';
import type { Draft } from 'immer';
import type { Emit, EngineContext, RuleError } from '../context';
import { tilesWithin } from '../map/hex';
import { eraOrderOf } from '../progress/era';
import type { GameState, PlayerId, UnitState } from '../state';

/**
 * Strategic resources (docs/03-core-mechanics.md, "Resources"), after Civ VI: each improved
 * source adds its `stockpilePerTurn` to its owner's stockpile of that resource, up to a cap that
 * grows with the era. Units take resources to train (`resourceCost`), and later ones use some up
 * every turn (`resourceUpkeep`); when the stockpile can't cover that upkeep, those units fight
 * weaker (`rules.strategic.shortageStrength`). A resource is hidden until its owner knows the
 * tech that reveals it (`revealedBy`).
 */

/** Whether a player knows about a resource (strategic resources need their tech first). */
export function isRevealed(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId | null,
  resource: string,
): boolean {
  const tech = ctx.content.entities.resource[resource]?.revealedBy;
  if (!tech) return true;
  if (player === null) return false;
  return state.players[player]?.techs.done.includes(tech) ?? false;
}

/** What training (or buying, or upgrading into) a unit takes; uniques inherit their base's. */
export function resourceCostOf(ctx: EngineContext, type: string): Record<string, number> {
  const def = ctx.content.entities.unit[type];
  if (!def) return {};
  if (def.resourceCost) return def.resourceCost;
  const base = def.replaces ? ctx.content.entities.unit[def.replaces] : undefined;
  return base?.resourceCost ?? {};
}

/** What a unit uses up every turn; uniques inherit their base's. */
export function resourceUpkeepOf(ctx: EngineContext, type: string): Record<string, number> {
  const def = ctx.content.entities.unit[type];
  if (!def) return {};
  if (def.resourceUpkeep) return def.resourceUpkeep;
  const base = def.replaces ? ctx.content.entities.unit[def.replaces] : undefined;
  return base?.resourceUpkeep ?? {};
}

/** A player's stockpile (whole units). */
export function stockpileOf(state: GameState, player: PlayerId): Record<string, number> {
  return state.players[player]?.resources ?? {};
}

/** The most of each strategic resource a player can hold now. */
export function stockpileCap(ctx: EngineContext, state: GameState, player: PlayerId): number {
  const r = ctx.content.rules.strategic;
  return r.stockpileBase + r.stockpilePerEra * (eraOrderOf(ctx, state.players[player]) - 1);
}

/** What a player's improved, revealed sources add each turn, per resource. */
export function stockpileIncome(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
): Record<string, number> {
  const out: Record<string, number> = {};
  const radius = ctx.content.rules.settlements.ownRadius;
  for (const s of Object.values(state.settlements)) {
    if (s.owner !== player) continue;
    for (const t of tilesWithin(state.map, s.tile, radius)) {
      const tile = state.map.tiles[t]!;
      if (tile.settlement !== s.id || tile.resource === null || tile.improvement === null) continue;
      const res = ctx.content.entities.resource[tile.resource]!;
      if (res.class !== 'strategic' || res.stockpilePerTurn <= 0) continue;
      if (!ctx.content.entities.improvement[tile.improvement]?.resources.includes(res.id)) continue;
      if (!isRevealed(ctx, state, player, res.id)) continue;
      out[res.id] = (out[res.id] ?? 0) + res.stockpilePerTurn;
    }
  }
  return out;
}

/** Every unit of a player, packed ones included. */
function unitsOf(state: GameState, player: PlayerId): UnitState[] {
  const out: UnitState[] = [];
  for (const u of Object.values(state.units)) {
    if (u.owner !== player) continue;
    out.push(u);
    if (u.cargo) out.push(...u.cargo);
  }
  return out;
}

/** What a player's units use up each turn, per resource. */
export function stockpileUpkeep(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const u of unitsOf(state, player))
    for (const [r, n] of Object.entries(resourceUpkeepOf(ctx, u.type))) out[r] = (out[r] ?? 0) + n;
  return out;
}

/**
 * Why a player can't train or buy a unit for lack of resources, or undefined. `now` asks for
 * the full cost in the stockpile (finishing, buying, upgrading); otherwise a revealed source
 * that's improved is enough to start building toward it.
 */
export function resourceProblem(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  type: string,
  now: boolean,
): RuleError | undefined {
  const stock = stockpileOf(state, player);
  let income: Record<string, number> | undefined;
  for (const [r, need] of Object.entries(resourceCostOf(ctx, type)).sort()) {
    const have = stock[r] ?? 0;
    if (have >= need) continue;
    income ??= stockpileIncome(ctx, state, player);
    if (!now && (income[r] ?? 0) > 0) continue;
    const name = resolveText(ctx.content, ctx.content.entities.resource[r]?.name ?? r);
    const gain = income[r] ?? 0;
    return {
      code: 'needs_resource',
      message: `Needs ${need} ${name} (you have ${have}${gain > 0 ? `, +${gain} a turn` : ''})`,
    };
  }
  return undefined;
}

/** Takes a unit's resource cost out of its owner's stockpile. */
export function payResources(
  draft: Draft<GameState>,
  ctx: EngineContext,
  player: PlayerId,
  type: string,
) {
  const p = draft.players[player]!;
  for (const [r, n] of Object.entries(resourceCostOf(ctx, type))) {
    const stock = (p.resources ??= {});
    stock[r] = Math.max(0, (stock[r] ?? 0) - n);
  }
}

/** Resources whose upkeep this unit's owner couldn't cover last turn (it fights weaker). */
export function shortages(ctx: EngineContext, state: GameState, unit: UnitState): string[] {
  const short = state.players[unit.owner]?.resourcesShort;
  if (!short?.length) return [];
  return Object.keys(resourceUpkeepOf(ctx, unit.type)).filter((r) => short.includes(r));
}

/**
 * A player's resource turn: sources fill the stockpile (up to the cap), then units use up their
 * upkeep; what can't be covered leaves those units short until it can.
 */
export function strategicTurn(
  draft: Draft<GameState>,
  ctx: EngineContext,
  player: PlayerId,
  state: GameState,
  emit: Emit,
) {
  const p = draft.players[player]!;
  const income = stockpileIncome(ctx, state, player);
  const upkeep = stockpileUpkeep(ctx, state, player);
  const cap = stockpileCap(ctx, state, player);
  const stock = { ...(p.resources ?? {}) };
  const short: string[] = [];
  for (const r of [...new Set([...Object.keys(income), ...Object.keys(upkeep)])].sort()) {
    let have = Math.min(cap, (stock[r] ?? 0) + (income[r] ?? 0));
    const need = upkeep[r] ?? 0;
    if (have >= need) have -= need;
    else {
      have = 0;
      short.push(r);
    }
    stock[r] = have;
  }
  const before = p.resourcesShort ?? [];
  if (Object.keys(stock).length > 0 || p.resources) p.resources = stock;
  if (short.length > 0 || p.resourcesShort) p.resourcesShort = short;
  for (const r of short)
    if (!before.includes(r))
      emit({ type: 'resource_shortage', player, resource: r, visibleTo: [player] });
}
