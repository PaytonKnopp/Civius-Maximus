import type { Draft } from 'immer';
import type { Action } from '../actions';
import {
  type ActionHandler,
  type EngineContext,
  type Emit,
  type RuleError,
  unitDef,
} from '../context';
import { percentOf } from '../fixed';
import { view } from '../draft';
import { unitUpkeep } from '../settlements/rules';
import type { GameState, PlayerId, Track } from '../state';
import {
  availableGovernments,
  availableNodes,
  celebrationThreshold,
  empireFacts,
  goalMet,
  governmentChangeCost,
  nodeCost,
  pathTo,
  policyChangeCost,
  policyProblem,
  treeIds,
  treeNode,
  type TreeKind,
  trackOf,
} from './rules';
import { canEmbarkNow, playerEffects, policySlots, SLOT_KINDS } from './sources';

type A<T extends Action['type']> = Extract<Action, { type: T }>;

function playing(state: GameState, player: PlayerId): RuleError | undefined {
  return state.players[player]?.alive
    ? undefined
    : { code: 'not_playing', message: `${player} is not playing` };
}

const noGold = (cost: number): RuleError => ({
  code: 'not_enough_gold',
  message: `Not enough gold (needs ${Math.ceil(cost / 100)})`,
});

/** Keeps derived player fields in step after progress changes: slots that vanished, embarking. */
function refreshPlayer(draft: Draft<GameState>, ctx: EngineContext, player: PlayerId) {
  const p = draft.players[player]!;
  const slots = policySlots(ctx, view(draft), player);
  for (const kind of SLOT_KINDS) {
    if (p.policies[kind].length > slots[kind])
      p.policies[kind] = p.policies[kind].slice(0, slots[kind]);
  }
  p.canEmbark = canEmbarkNow(ctx, view(draft), player);
}

/** Starts working toward a node (and the path of prerequisites to it). */
function choose(
  draft: Draft<GameState>,
  ctx: EngineContext,
  player: PlayerId,
  kind: TreeKind,
  id: string,
) {
  const p = draft.players[player]!;
  const track = trackOf(p, kind);
  const path = pathTo(ctx, view(draft).players[player]!, kind, id);
  track.current = path[0] ?? null;
  track.queue = path.slice(1);
  if (track.current && track.stored > 0) {
    track.progress[track.current] = (track.progress[track.current] ?? 0) + track.stored;
    track.stored = 0;
  }
}

function chooseHandler(
  kind: TreeKind,
  idOf: (action: A<'set_research'> | A<'set_civic'>) => string,
): ActionHandler<A<'set_research'> | A<'set_civic'>> {
  return {
    validate(state, action, ctx) {
      const id = idOf(action);
      const problem = playing(state, action.player);
      if (problem) return problem;
      if (!treeNode(ctx, kind, id)) return { code: 'unknown', message: `Unknown ${kind} "${id}"` };
      if (trackOf(state.players[action.player]!, kind).done.includes(id))
        return { code: 'already_done', message: 'Already finished' };
      return undefined;
    },
    apply(draft, action, ctx) {
      choose(draft, ctx, action.player, kind, idOf(action));
    },
  };
}

export const progressHandlers = {
  set_research: chooseHandler('tech', (a) => ('tech' in a ? a.tech : '')),
  set_civic: chooseHandler('civic', (a) => ('civic' in a ? a.civic : '')),

  set_government: {
    validate(state, action, ctx) {
      const problem = playing(state, action.player);
      if (problem) return problem;
      const p = state.players[action.player]!;
      if (!ctx.content.entities.government[action.government])
        return { code: 'unknown', message: `Unknown government "${action.government}"` };
      if (!availableGovernments(ctx, p).includes(action.government))
        return { code: 'locked', message: "That government isn't available yet" };
      if (p.government === action.government)
        return { code: 'already', message: 'That is already your government' };
      const cost = governmentChangeCost(ctx, state, action.player);
      return p.gold < cost ? noGold(cost) : undefined;
    },
    apply(draft, action, ctx, emit) {
      const p = draft.players[action.player]!;
      p.gold -= governmentChangeCost(ctx, view(draft), action.player);
      p.government = action.government;
      refreshPlayer(draft, ctx, action.player);
      emit({
        type: 'government_changed',
        player: action.player,
        government: action.government,
        visibleTo: 'all',
      });
    },
  } satisfies ActionHandler<A<'set_government'>>,

  set_policies: {
    validate(state, action, ctx) {
      const problem =
        playing(state, action.player) ?? policyProblem(ctx, state, action.player, action.policies);
      if (problem) return problem;
      const cost = policyChangeCost(ctx, state, action.player, action.policies);
      return state.players[action.player]!.gold < cost ? noGold(cost) : undefined;
    },
    apply(draft, action, ctx) {
      const p = draft.players[action.player]!;
      p.gold -= policyChangeCost(ctx, view(draft), action.player, action.policies);
      p.policies = {
        military: [...action.policies.military],
        economic: [...action.policies.economic],
        diplomatic: [...action.policies.diplomatic],
        wildcard: [...action.policies.wildcard],
      };
      refreshPlayer(draft, ctx, action.player);
    },
  } satisfies ActionHandler<A<'set_policies'>>,
} satisfies {
  [T in 'set_research' | 'set_civic' | 'set_government' | 'set_policies']: ActionHandler<A<T>>;
};

// --- Boosts ----------------------------------------------------------------------------------

/** Pays out every boost whose goal the player now meets (called after actions and each turn). */
export function checkBoosts(
  draft: Draft<GameState>,
  ctx: EngineContext,
  player: PlayerId,
  emit: Emit,
) {
  const snap = view(draft);
  if (!snap.players[player]?.alive) return;
  let facts: ReturnType<typeof empireFacts> | undefined;
  for (const kind of ['tech', 'civic'] as const) {
    const before = trackOf(snap.players[player]!, kind);
    for (const id of treeIds(ctx, kind)) {
      const node = treeNode(ctx, kind, id)!;
      if (!node.boost || before.done.includes(id) || before.boosted.includes(id)) continue;
      facts ??= empireFacts(ctx, snap, player);
      if (!goalMet(ctx, facts, node.boost.goal)) continue;
      const track = trackOf(draft.players[player]!, kind);
      track.boosted.push(id);
      const bonus = percentOf(nodeCost(ctx, kind, id), boostPercent(ctx, snap, player));
      track.progress[id] = (track.progress[id] ?? 0) + bonus;
      emit({ type: 'boost_earned', player, kind, id, visibleTo: [player] });
    }
  }
}

/** The share of a node's cost a boost gives this player (the rule, plus abilities). */
export function boostPercent(ctx: EngineContext, state: GameState, player: PlayerId): number {
  return (
    ctx.content.rules.progress.boostPercent +
    playerEffects(ctx, state, player, 'modify_boost').reduce(
      (sum, e) => sum + e.effect.params.percent,
      0,
    )
  );
}

/**
 * A free boost (from an ability): toward the cheapest tech or civic the player can work on now
 * that isn't boosted yet. Does nothing if there's none.
 */
export function grantBoost(
  draft: Draft<GameState>,
  ctx: EngineContext,
  player: PlayerId,
  emit: Emit,
) {
  const snap = view(draft);
  const p = snap.players[player]!;
  let best: { kind: TreeKind; id: string; cost: number } | undefined;
  for (const kind of ['tech', 'civic'] as const) {
    const track = trackOf(p, kind);
    for (const id of availableNodes(ctx, p, kind)) {
      if (track.boosted.includes(id)) continue;
      const cost = nodeCost(ctx, kind, id);
      if (!best || cost < best.cost || (cost === best.cost && id < best.id))
        best = { kind, id, cost };
    }
  }
  if (!best) return;
  const track = trackOf(draft.players[player]!, best.kind);
  track.boosted.push(best.id);
  track.progress[best.id] =
    (track.progress[best.id] ?? 0) + percentOf(best.cost, boostPercent(ctx, snap, player));
  emit({ type: 'boost_earned', player, kind: best.kind, id: best.id, visibleTo: [player] });
}

// --- The empire's turn -----------------------------------------------------------------------

/** Puts this turn's science or culture into a track; finishes at most one node. */
export function advance(
  draft: Draft<GameState>,
  ctx: EngineContext,
  player: PlayerId,
  kind: TreeKind,
  amount: number,
  emit: Emit,
): string | undefined {
  const track: Track = trackOf(draft.players[player]!, kind);
  // Drop anything already finished from the front (e.g. a boost finished it earlier).
  while (track.current && track.done.includes(track.current)) {
    track.current = track.queue.shift() ?? null;
  }
  if (!track.current) {
    track.stored += amount;
    return undefined;
  }
  const id = track.current;
  track.progress[id] = (track.progress[id] ?? 0) + amount;
  const cost = nodeCost(ctx, kind, id);
  if (track.progress[id]! < cost) return undefined;
  const overflow = track.progress[id]! - cost;
  delete track.progress[id];
  track.done.push(id);
  // One-off rewards for finishing it: envoys.
  const node = kind === 'tech' ? ctx.content.entities.tech[id] : ctx.content.entities.civic[id];
  for (const e of node?.effects ?? [])
    if (e.effect === 'grant_envoys') draft.players[player]!.envoys += e.params.amount;
  track.current = track.queue.shift() ?? null;
  if (track.current)
    track.progress[track.current] = (track.progress[track.current] ?? 0) + overflow;
  else track.stored += overflow;
  emit(
    kind === 'tech'
      ? { type: 'tech_researched', player, tech: id, visibleTo: [player] }
      : { type: 'civic_completed', player, civic: id, visibleTo: [player] },
  );
  return id;
}

/**
 * A player's empire-wide turn, after their settlements: unit upkeep, research and civics from
 * this turn's science and culture, celebrations from the happiness surplus, then boosts.
 */
export function empireTurn(
  draft: Draft<GameState>,
  ctx: EngineContext,
  player: PlayerId,
  totals: { science: number; culture: number; happiness: number },
  emit: Emit,
) {
  const p = draft.players[player]!;

  // Upkeep. An empty treasury disbands a unit (the costliest, newest first), one per turn.
  p.gold -= unitUpkeep(ctx, view(draft), player);
  if (p.gold < 0) {
    p.gold = 0;
    const victim = Object.values(view(draft).units)
      .filter((u) => u.owner === player && unitDef(ctx, u).upkeep > 0)
      .sort(
        (a, b) =>
          unitDef(ctx, b).upkeep - unitDef(ctx, a).upkeep ||
          Number(b.id.slice(1)) - Number(a.id.slice(1)),
      )[0];
    if (victim) {
      delete draft.units[victim.id];
      emit({
        type: 'unit_disbanded',
        unit: victim.id,
        owner: player,
        tile: victim.tile,
        reason: 'no_gold',
        visibleTo: [player],
      });
    }
  }

  // The free window for policies closes; finishing a civic this turn opens a new one.
  p.policyWindow = false;
  advance(draft, ctx, player, 'tech', totals.science, emit);
  if (advance(draft, ctx, player, 'civic', totals.culture, emit)) p.policyWindow = true;

  // Celebrations: the happiness surplus builds toward one; while it lasts, its effects apply.
  const c = p.celebration;
  if (c.turnsLeft > 0) {
    c.turnsLeft--;
    if (c.turnsLeft === 0) emit({ type: 'celebration_ended', player, visibleTo: [player] });
  } else {
    c.store += Math.max(0, totals.happiness);
    const needed = celebrationThreshold(ctx, view(draft).players[player]!);
    if (c.store >= needed) {
      c.store -= needed;
      c.count++;
      c.turnsLeft = ctx.content.rules.progress.celebration.turns;
      emit({ type: 'celebration_started', player, turns: c.turnsLeft, visibleTo: [player] });
    }
  }

  refreshPlayer(draft, ctx, player);
  checkBoosts(draft, ctx, player, emit);
}
