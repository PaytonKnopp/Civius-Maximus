import { type AgeDef, type MomentDef, resolveText } from '@cx/content';
import type { Draft } from 'immer';
import { decodeBits, getBit } from '../bitset';
import type { ActionHandler, Emit, EngineContext } from '../context';
import type { GameEvent } from '../events';
import { playerEra } from '../progress/rules';
import type { Action } from '../actions';
import type { AgeState, GameState, PlayerId, PlayerState } from '../state';

/**
 * Eras and ages (docs/04-advanced-systems.md, "Eras and ages"), after Civ VI. Historic moments
 * (content: `moment`) earn era score during an era. When a civ enters its next era, that score
 * decides its age: dark below a threshold, golden well above it, heroic for a golden age right
 * after a dark one. The age's effects and the dedications its player picks apply for the era.
 */

function ageOfKind(ctx: EngineContext, kind: AgeDef['kind']): AgeDef | undefined {
  return Object.values(ctx.content.entities.age).find((a) => a.kind === kind);
}

function firstEra(ctx: EngineContext): string {
  return Object.values(ctx.content.entities.era).sort((a, b) => a.order - b.order)[0]?.id ?? '';
}

/** A player's age record, as a new game starts it. */
export function newAgeState(ctx: EngineContext, p: PlayerState, startEra?: string): AgeState {
  return {
    era: startEra ?? playerEra(ctx, p)?.id ?? firstEra(ctx),
    age: ageOfKind(ctx, 'normal')?.id ?? '',
    dedications: [],
    pending: 0,
    score: 0,
    counts: {},
    once: [],
    seen: [],
    timeline: [],
    history: {},
  };
}

/** Era score thresholds for the era with this order: below `dark` is a dark age. */
export function thresholds(ctx: EngineContext, eraOrder: number) {
  const r = ctx.content.rules.ages;
  const dark = r.darkBase + r.darkStep * Math.max(0, eraOrder - 1);
  return { dark, golden: dark + r.goldenGap };
}

/** The effect sources of a player's age and dedications (for `activeSources`). */
export function ageSources(ctx: EngineContext, p: PlayerState) {
  const a = p.ages;
  if (!a) return [];
  const out: { id: string; label: string; effects: AgeDef['effects'] }[] = [];
  const age = ctx.content.entities.age[a.age];
  if (age && age.effects.length > 0)
    out.push({ id: age.id, label: resolveText(ctx.content, age.name), effects: age.effects });
  for (const id of a.dedications) {
    const d = ctx.content.entities.dedication[id];
    if (d && d.effects.length > 0)
      out.push({ id: d.id, label: resolveText(ctx.content, d.name), effects: d.effects });
  }
  return out;
}

function award(
  draft: Draft<GameState>,
  ctx: EngineContext,
  player: PlayerId,
  trigger: MomentDef['trigger'],
  emit: Emit,
  key = '',
) {
  const p = draft.players[player];
  if (!p?.alive || !p.ages || (p.kind !== 'human' && p.kind !== 'ai')) return;
  const a = p.ages;
  for (const id of ctx.content.ids.moment) {
    const m = ctx.content.entities.moment[id]!;
    if (m.trigger !== trigger) continue;
    const onceKey = key ? `${id}:${key}` : id;
    if (m.once === 'player' && a.once.includes(onceKey)) continue;
    if (m.once === 'world') {
      const world = (draft.worldMoments ??= []);
      if (world.includes(onceKey)) continue;
      world.push(onceKey);
    }
    if (m.cap !== undefined && (a.counts[id] ?? 0) >= m.cap) continue;
    const bonus = a.dedications.filter((d) =>
      ctx.content.entities.dedication[d]?.bonusMoments.includes(id),
    ).length;
    const score = m.score + bonus;
    if (score <= 0) continue;
    if (m.once === 'player') a.once.push(onceKey);
    a.counts[id] = (a.counts[id] ?? 0) + 1;
    a.score += score;
    a.timeline.push({ turn: draft.turn, moment: id, score, era: a.era });
    emit({
      type: 'historic_moment',
      player,
      moment: id,
      score,
      total: a.score,
      visibleTo: [player],
    });
  }
}

/** Era score for what just happened (called after every action and every turn). */
export function awardMoments(
  draft: Draft<GameState>,
  ctx: EngineContext,
  events: readonly GameEvent[],
  emit: Emit,
) {
  for (const e of events) {
    switch (e.type) {
      case 'settlement_founded':
        award(draft, ctx, e.owner, 'settlement_founded', emit);
        break;
      case 'town_upgraded':
        award(draft, ctx, e.owner, 'town_upgraded', emit);
        break;
      case 'wonder_completed':
        award(draft, ctx, e.owner, 'wonder_completed', emit);
        break;
      case 'great_person_born':
        award(draft, ctx, e.player, 'great_person', emit);
        break;
      case 'pantheon_founded':
        award(draft, ctx, e.player, 'pantheon_founded', emit);
        break;
      case 'religion_founded':
        award(draft, ctx, e.player, 'religion_founded', emit);
        break;
      case 'government_changed':
        award(draft, ctx, e.player, 'government_changed', emit);
        break;
      case 'item_completed':
        if (e.item.kind === 'district') award(draft, ctx, e.owner, 'district_built', emit);
        break;
      case 'unit_killed':
        if (e.by !== e.owner) award(draft, ctx, e.by, 'enemy_killed', emit);
        break;
      case 'settlement_captured':
        award(draft, ctx, e.by, 'settlement_captured', emit);
        break;
      case 'suzerain_changed':
        if (e.to) award(draft, ctx, e.to, 'suzerain', emit);
        break;
      case 'trade_route_started':
        award(draft, ctx, e.owner, 'trade_route', emit);
        break;
      case 'space_project':
        award(draft, ctx, e.player, 'space_project', emit);
        break;
      case 'tech_researched':
        award(draft, ctx, e.player, 'tech_researched', emit);
        break;
      case 'civic_completed':
        award(draft, ctx, e.player, 'civic_completed', emit);
        break;
    }
  }
  discoverWonders(draft, ctx, emit);
}

/** Natural wonders a player has seen for the first time. */
function discoverWonders(draft: Draft<GameState>, ctx: EngineContext, emit: Emit) {
  const wonders: number[] = [];
  draft.map.tiles.forEach((t, i) => {
    if (t.feature && ctx.content.entities.feature[t.feature]?.naturalWonder) wonders.push(i);
  });
  if (wonders.length === 0) return;
  const n = draft.map.tiles.length;
  for (const id of draft.playerOrder) {
    const p = draft.players[id]!;
    if (!p.alive || !p.ages) continue;
    const fresh = wonders.filter((t) => !p.ages!.seen.includes(draft.map.tiles[t]!.feature!));
    if (fresh.length === 0) continue;
    const bits = decodeBits(p.explored, n);
    for (const t of fresh) {
      if (!getBit(bits, t)) continue;
      const feature = draft.map.tiles[t]!.feature!;
      p.ages.seen.push(feature);
      award(draft, ctx, id, 'natural_wonder', emit);
      emit({ type: 'natural_wonder_found', player: id, feature, tile: t, visibleTo: [id] });
    }
  }
}

/** Turn step: civs that entered a new era start their age for it. */
export function agesTurn(draft: Draft<GameState>, ctx: EngineContext, emit: Emit) {
  for (const id of draft.playerOrder) {
    const p = draft.players[id]!;
    if (!p.alive || !p.ages) continue;
    const now = playerEra(ctx, p)?.id;
    if (!now || now === p.ages.era) continue;
    const done = ctx.content.entities.era[p.ages.era];
    const next = ctx.content.entities.era[now];
    if (!done || !next || next.order <= done.order) continue;
    const { dark, golden } = thresholds(ctx, done.order);
    const before = ctx.content.entities.age[p.ages.age]?.kind;
    const score = p.ages.score;
    const kind: AgeDef['kind'] =
      score < dark
        ? 'dark'
        : score >= golden
          ? before === 'dark'
            ? 'heroic'
            : 'golden'
          : 'normal';
    const age = ageOfKind(ctx, kind) ?? ageOfKind(ctx, 'normal');
    p.ages.history[p.ages.era] = p.ages.age;
    p.ages.era = now;
    p.ages.age = age?.id ?? '';
    p.ages.dedications = [];
    p.ages.pending = age?.dedications ?? 0;
    p.ages.score = 0;
    p.ages.counts = {};
    emit({
      type: 'age_started',
      player: id,
      era: now,
      age: p.ages.age,
      score,
      dark,
      golden,
      visibleTo: 'all',
    });
    award(draft, ctx, id, 'era_first', emit, now);
  }
}

export function dedicationProblem(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  ids: readonly string[],
): { code: string; message: string } | undefined {
  const a = state.players[player]?.ages;
  if (!a || a.pending <= 0)
    return { code: 'no_dedication', message: 'There is no dedication to choose now' };
  if (ids.length === 0 || ids.length > a.pending)
    return { code: 'bad_dedication', message: `Choose up to ${a.pending} dedication(s)` };
  if (new Set(ids).size !== ids.length)
    return { code: 'bad_dedication', message: 'Each dedication can be chosen once' };
  for (const id of ids) {
    if (!ctx.content.entities.dedication[id])
      return { code: 'bad_dedication', message: `Unknown dedication "${id}"` };
    if (a.dedications.includes(id))
      return { code: 'bad_dedication', message: 'That dedication is already chosen' };
  }
  return undefined;
}

type ChooseDedications = Extract<Action, { type: 'choose_dedications' }>;

export const agesHandlers = {
  choose_dedications: {
    validate(state, action, ctx) {
      if (!state.players[action.player]?.alive)
        return { code: 'not_playing', message: `${action.player} is not playing` };
      return dedicationProblem(ctx, state, action.player, action.dedications);
    },
    apply(draft, action) {
      const a = draft.players[action.player]!.ages!;
      a.dedications.push(...action.dedications);
      a.pending -= action.dedications.length;
    },
  } satisfies ActionHandler<ChooseDedications>,
};
