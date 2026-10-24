import {
  type CivicDef,
  type EraDef,
  type Goal,
  resolveText,
  type SlotKind,
  type TechDef,
} from '@cx/content';
import { type EngineContext, type RuleError, unitDef } from '../context';
import { type Fixed, toFixed } from '../fixed';
import { tilesWithin } from '../map/hex';
import { isCoastal, settlementsOf } from '../settlements/rules';
import type { GameState, PlayerId, PlayerState, Track } from '../state';
import { policySlots, SLOT_KINDS } from './sources';

/**
 * The tech and civics trees, boosts, governments and policy cards
 * (docs/03-core-mechanics.md, section 6). Pure functions, shared by the engine and the client.
 */

export type TreeKind = 'tech' | 'civic';

export function treeNode(
  ctx: EngineContext,
  kind: TreeKind,
  id: string,
): TechDef | CivicDef | undefined {
  return kind === 'tech' ? ctx.content.entities.tech[id] : ctx.content.entities.civic[id];
}

export function trackOf(p: PlayerState, kind: TreeKind): Track {
  return kind === 'tech' ? p.techs : p.civics;
}

export function treeIds(ctx: EngineContext, kind: TreeKind): string[] {
  return kind === 'tech' ? ctx.content.ids.tech : ctx.content.ids.civic;
}

/** Science or culture to finish a node (hundredths). */
export function nodeCost(ctx: EngineContext, kind: TreeKind, id: string): Fixed {
  return toFixed(treeNode(ctx, kind, id)?.cost ?? 0);
}

/** Nodes that can be worked on now: not finished, every prerequisite finished. */
export function availableNodes(ctx: EngineContext, p: PlayerState, kind: TreeKind): string[] {
  const done = new Set(trackOf(p, kind).done);
  return treeIds(ctx, kind).filter(
    (id) => !done.has(id) && treeNode(ctx, kind, id)!.requires.every((r) => done.has(r)),
  );
}

/**
 * The order to work through the tree to reach `id`: every unfinished prerequisite first
 * (cheapest branch first), then `id` itself. Empty if it's already finished.
 */
export function pathTo(ctx: EngineContext, p: PlayerState, kind: TreeKind, id: string): string[] {
  const done = new Set(trackOf(p, kind).done);
  const out: string[] = [];
  const seen = new Set<string>();
  const visit = (node: string) => {
    if (done.has(node) || seen.has(node)) return;
    seen.add(node);
    const def = treeNode(ctx, kind, node);
    if (!def) return;
    const prereqs = [...def.requires].sort(
      (a, b) =>
        (treeNode(ctx, kind, a)?.cost ?? 0) - (treeNode(ctx, kind, b)?.cost ?? 0) ||
        (a < b ? -1 : 1),
    );
    for (const r of prereqs) visit(r);
    out.push(node);
  };
  visit(id);
  return out;
}

/** Column of each node in the tree: the length of its longest prerequisite chain. */
export function treeColumns(ctx: EngineContext, kind: TreeKind): Record<string, number> {
  const out: Record<string, number> = {};
  const depth = (id: string): number => {
    if (out[id] !== undefined) return out[id];
    const def = treeNode(ctx, kind, id);
    const d = def && def.requires.length > 0 ? 1 + Math.max(...def.requires.map(depth)) : 0;
    out[id] = d;
    return d;
  };
  for (const id of treeIds(ctx, kind)) depth(id);
  return out;
}

/** The player's era: the latest era among the techs and civics they've finished. */
export function playerEra(ctx: EngineContext, p: PlayerState): EraDef | undefined {
  const eras = ctx.content.ids.era
    .map((id) => ctx.content.entities.era[id]!)
    .sort((a, b) => a.order - b.order);
  let best = eras[0];
  const consider = (eraId: string | undefined) => {
    const era = eraId ? ctx.content.entities.era[eraId] : undefined;
    if (era && (!best || era.order > best.order)) best = era;
  };
  for (const id of p.techs.done) consider(ctx.content.entities.tech[id]?.era);
  for (const id of p.civics.done) consider(ctx.content.entities.civic[id]?.era);
  return best;
}

/** What a tech or civic unlocks, found by looking for content that requires it. */
export function unlocksOf(
  ctx: EngineContext,
  kind: TreeKind,
  id: string,
): {
  kind: 'unit' | 'building' | 'improvement' | 'government' | 'policy';
  id: string;
  name: string;
}[] {
  const { content } = ctx;
  const key = kind === 'tech' ? 'requiresTech' : 'requiresCivic';
  const out: ReturnType<typeof unlocksOf> = [];
  const scan = (
    type: 'unit' | 'building' | 'improvement' | 'government' | 'policy',
    entities: Record<
      string,
      { name: string; requiresTech?: string | undefined; requiresCivic?: string | undefined }
    >,
  ) => {
    for (const eid of Object.keys(entities).sort()) {
      const e = entities[eid]!;
      if ((e as Record<string, unknown>)[key] === id)
        out.push({ kind: type, id: eid, name: resolveText(content, e.name) });
    }
  };
  scan('unit', content.entities.unit);
  scan('building', content.entities.building);
  scan('improvement', content.entities.improvement);
  scan('government', content.entities.government);
  scan('policy', content.entities.policy);
  return out;
}

// --- Boosts ----------------------------------------------------------------------------------

/** Everything boost goals count, gathered in one pass. */
export interface EmpireFacts {
  settlements: number;
  cities: number;
  coastal: boolean;
  population: number;
  units: { type: string; class: string }[];
  improvements: Record<string, number>;
  buildings: Record<string, number>;
  tilesOwned: number;
  techs: number;
  civics: number;
  government: string;
  policies: number;
  gold: Fixed;
}

export function empireFacts(ctx: EngineContext, state: GameState, player: PlayerId): EmpireFacts {
  const p = state.players[player]!;
  const mine = settlementsOf(state, player);
  const improvements: Record<string, number> = {};
  let tilesOwned = 0;
  // Territory never reaches past the own radius, so scan around each settlement, not the map.
  for (const s of mine) {
    for (const i of tilesWithin(state.map, s.tile, ctx.content.rules.settlements.ownRadius)) {
      const t = state.map.tiles[i]!;
      if (t.settlement !== s.id) continue;
      tilesOwned++;
      if (t.improvement) improvements[t.improvement] = (improvements[t.improvement] ?? 0) + 1;
    }
  }
  const buildings: Record<string, number> = {};
  for (const s of mine) for (const b of s.buildings) buildings[b] = (buildings[b] ?? 0) + 1;
  return {
    settlements: mine.length,
    cities: mine.filter((s) => s.kind === 'city').length,
    coastal: mine.some((s) => isCoastal(ctx, state, s.tile)),
    population: mine.reduce((sum, s) => sum + s.population, 0),
    units: Object.values(state.units)
      .filter((u) => u.owner === player)
      .map((u) => ({ type: u.type, class: unitDef(ctx, u).class })),
    improvements,
    buildings,
    tilesOwned,
    techs: p.techs.done.length,
    civics: p.civics.done.length,
    government: p.government,
    policies: SLOT_KINDS.reduce((sum, k) => sum + p.policies[k].length, 0),
    gold: p.gold,
  };
}

const matches = (v: string, wanted: string | string[] | undefined) =>
  wanted === undefined || (Array.isArray(wanted) ? wanted.includes(v) : wanted === v);

const sumOf = (counts: Record<string, number>, wanted: string | string[] | undefined) =>
  Object.entries(counts).reduce((sum, [k, n]) => sum + (matches(k, wanted) ? n : 0), 0);

/** How far along a goal is: `have` of `need` (1/1 for yes-or-no goals). */
export function goalProgress(
  ctx: EngineContext,
  facts: EmpireFacts,
  goal: Goal,
): { have: number; need: number } {
  switch (goal.kind) {
    case 'settlements':
      return { have: facts.settlements, need: goal.count };
    case 'cities':
      return { have: facts.cities, need: goal.count };
    case 'coastal_settlement':
      return { have: facts.coastal ? 1 : 0, need: 1 };
    case 'population':
      return { have: facts.population, need: goal.count };
    case 'units':
      return {
        have: facts.units.filter(
          (u) => matches(u.type, goal.unit) && matches(u.class, goal.unitClass),
        ).length,
        need: goal.count,
      };
    case 'improvements':
      return { have: sumOf(facts.improvements, goal.improvement), need: goal.count };
    case 'buildings':
      return { have: sumOf(facts.buildings, goal.building), need: goal.count };
    case 'tiles_owned':
      return { have: facts.tilesOwned, need: goal.count };
    case 'techs':
      return { have: facts.techs, need: goal.count };
    case 'civics':
      return { have: facts.civics, need: goal.count };
    case 'government': {
      const adopted =
        facts.government !== ctx.content.rules.progress.startingGovernment &&
        matches(facts.government, goal.government);
      return { have: adopted ? 1 : 0, need: 1 };
    }
    case 'policies':
      return { have: facts.policies, need: goal.count };
    case 'gold':
      return { have: Math.floor(facts.gold / 100), need: goal.amount };
    default: {
      const unhandled: never = goal;
      throw new Error(`Unhandled boost goal: ${JSON.stringify(unhandled)}`);
    }
  }
}

export function goalMet(ctx: EngineContext, facts: EmpireFacts, goal: Goal): boolean {
  const { have, need } = goalProgress(ctx, facts, goal);
  return have >= need;
}

// --- Governments and policies ----------------------------------------------------------------

export function isPolicyAvailable(ctx: EngineContext, p: PlayerState, id: string): boolean {
  const pol = ctx.content.entities.policy[id];
  if (!pol) return false;
  if (pol.requiresCivic && !p.civics.done.includes(pol.requiresCivic)) return false;
  if (pol.obsoletedBy && p.civics.done.includes(pol.obsoletedBy)) return false;
  return true;
}

export function availablePolicies(ctx: EngineContext, p: PlayerState): string[] {
  return ctx.content.ids.policy.filter((id) => isPolicyAvailable(ctx, p, id));
}

export function availableGovernments(ctx: EngineContext, p: PlayerState): string[] {
  return ctx.content.ids.government
    .filter((id) => {
      const g = ctx.content.entities.government[id]!;
      return !g.requiresCivic || p.civics.done.includes(g.requiresCivic);
    })
    .sort(
      (a, b) =>
        ctx.content.entities.government[a]!.order - ctx.content.entities.government[b]!.order,
    );
}

/** Why a set of policy cards can't be slotted, or undefined if it can. */
export function policyProblem(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  policies: Record<SlotKind, string[]>,
): RuleError | undefined {
  const p = state.players[player]!;
  const slots = policySlots(ctx, state, player);
  const seen = new Set<string>();
  for (const kind of SLOT_KINDS) {
    const list = policies[kind];
    if (list.length > slots[kind]) {
      return {
        code: 'too_many_policies',
        message: `Only ${slots[kind]} ${kind} slot${slots[kind] === 1 ? '' : 's'}`,
      };
    }
    for (const id of list) {
      const pol = ctx.content.entities.policy[id];
      if (!pol) return { code: 'unknown_policy', message: `Unknown policy "${id}"` };
      if (!isPolicyAvailable(ctx, p, id))
        return {
          code: 'policy_locked',
          message: `${resolveText(ctx.content, pol.name)} isn't available`,
        };
      if (kind !== 'wildcard' && pol.slot !== kind && pol.slot !== 'wildcard') {
        return {
          code: 'wrong_slot',
          message: `${resolveText(ctx.content, pol.name)} goes in a ${pol.slot} or wildcard slot`,
        };
      }
      if (kind !== 'wildcard' && pol.slot === 'wildcard') {
        return {
          code: 'wrong_slot',
          message: `${resolveText(ctx.content, pol.name)} goes in a wildcard slot`,
        };
      }
      if (seen.has(id))
        return {
          code: 'duplicate',
          message: `${resolveText(ctx.content, pol.name)} is slotted twice`,
        };
      seen.add(id);
    }
  }
  return undefined;
}

/** Gold to change to these policies now: free right after a civic, otherwise per new card. */
export function policyChangeCost(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  policies: Record<SlotKind, string[]>,
): Fixed {
  const p = state.players[player]!;
  if (p.policyWindow) return 0;
  const before = new Set(SLOT_KINDS.flatMap((k) => p.policies[k]));
  const added = SLOT_KINDS.flatMap((k) => policies[k]).filter((id) => !before.has(id)).length;
  return toFixed(added * ctx.content.rules.progress.policySwapCost);
}

export function governmentChangeCost(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
): Fixed {
  return state.players[player]!.policyWindow
    ? 0
    : toFixed(ctx.content.rules.progress.governmentChangeCost);
}

/** Happiness surplus needed for the next celebration. */
export function celebrationThreshold(ctx: EngineContext, p: PlayerState): number {
  const c = ctx.content.rules.progress.celebration;
  return c.base + c.perCelebration * p.celebration.count;
}
