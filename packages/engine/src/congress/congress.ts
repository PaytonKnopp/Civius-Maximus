import { resolveText } from '@cx/content';
import { castDraft, type Draft } from 'immer';
import type { Action } from '../actions';
import type { ActionHandler, Emit, EngineContext, RuleError } from '../context';
import { areAllies, areFriends } from '../diplomacy/rules';
import { view } from '../draft';
import type { EffectSource } from '../effects/yields';
import { makeRandom } from '../map/random';
import { playerEffects } from '../progress/sources';
import { playerEra } from '../progress/rules';
import { scaleCost } from '../speed';
import type { Ballot, GameState, PlayerId, PlayerState } from '../state';
import { endGame } from '../victory';

/**
 * The World Congress (docs/04-advanced-systems.md, "World Congress"), after Civ VI. It forms
 * when the first civ reaches `rules.congress.foundingEra`; from then every civ earns diplomatic
 * favor each turn. Every few turns a session meets: each civ has one free vote on each
 * resolution and can buy more with favor. What passes holds until the next session. Diplomatic
 * victory points come from being named world leader, from carrying resolutions, and from some
 * wonders; enough of them wins the game.
 */

export const congressOn = (state: Pick<GameState, 'settings'>) => state.settings.congress !== false;
export const diplomaticOn = (state: Pick<GameState, 'settings'>) =>
  congressOn(state) && state.settings.diplomatic !== false;

/** Favor for casting `votes` votes on one resolution (the first is free). */
export function voteCost(ctx: EngineContext, votes: number): number {
  const costs = ctx.content.rules.congress.voteCosts;
  let total = 0;
  for (let i = 1; i < votes; i++) total += costs[Math.min(i - 1, costs.length - 1)] ?? 0;
  return total;
}

export function ballotCost(ctx: EngineContext, ballots: readonly Pick<Ballot, 'votes'>[]): number {
  return ballots.reduce((n, b) => n + voteCost(ctx, b.votes), 0);
}

/** Favor a player earns each turn, and why. */
export function favorPerTurn(ctx: EngineContext, state: GameState, player: PlayerId) {
  const f = ctx.content.rules.congress.favor;
  const lines: { label: string; amount: number }[] = [];
  if (!state.congress || !congressOn(state)) return { total: 0, lines };
  lines.push({ label: 'Standing in the world', amount: f.base });
  const suzerain = Object.values(state.cityStates).filter((c) => c.suzerain === player).length;
  if (suzerain > 0 && f.perSuzerain)
    lines.push({
      label: `Suzerain of ${suzerain} city-state${suzerain === 1 ? '' : 's'}`,
      amount: suzerain * f.perSuzerain,
    });
  const others = state.playerOrder.filter((o) => o !== player && state.players[o]!.alive);
  const allies = others.filter((o) => areAllies(state, player, o)).length;
  const friends = others.filter(
    (o) => !areAllies(state, player, o) && areFriends(state, player, o),
  ).length;
  if (allies > 0 && f.perAlliance)
    lines.push({ label: 'Alliances', amount: allies * f.perAlliance });
  if (friends > 0 && f.perFriendship)
    lines.push({ label: 'Friendships', amount: friends * f.perFriendship });
  for (const { source, effect } of playerEffects(ctx, state, player, 'diplomatic_favor'))
    lines.push({ label: source.label, amount: effect.params.amount });
  return { total: lines.reduce((n, l) => n + l.amount, 0), lines };
}

/** A player's diplomatic victory points: earned in sessions, plus lasting ones (wonders). */
export function diplomaticPoints(ctx: EngineContext, state: GameState, player: PlayerId): number {
  const p = state.players[player];
  if (!p) return 0;
  const lasting = playerEffects(ctx, state, player, 'diplomatic_points').reduce(
    (n, { effect }) => n + effect.params.amount,
    0,
  );
  return (p.diploPoints ?? 0) + lasting;
}

/** Effect sources of the resolutions in force for a player (for `activeSources`). */
export function congressSources(ctx: EngineContext, p: PlayerState): EffectSource[] {
  const out: EffectSource[] = [];
  for (const r of p.resolutions ?? []) {
    const def = ctx.content.entities.resolution[r.resolution];
    const option = def?.options.find((o) => o.id === r.option);
    if (!def || !option || option.effects.length === 0) continue;
    out.push({
      id: `${def.id}:${option.id}`,
      label: `${resolveText(ctx.content, def.name)}: ${resolveText(ctx.content, option.name)}`,
      effects: option.effects,
    });
  }
  return out;
}

/** Why these ballots can't be cast now, or undefined. */
export function votingProblem(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  ballots: readonly Ballot[],
): RuleError | undefined {
  const c = state.congress;
  if (!c?.session || c.session.turn !== state.turn)
    return { code: 'no_session', message: 'The World Congress is not meeting this turn' };
  const p = state.players[player];
  if (!p?.alive || !state.playerOrder.includes(player))
    return { code: 'not_playing', message: `${player} is not playing` };
  const seen = new Set<string>();
  for (const b of ballots) {
    if (!c.session.agenda.includes(b.resolution))
      return { code: 'not_on_agenda', message: 'That resolution is not on the agenda' };
    if (seen.has(b.resolution)) return { code: 'twice', message: 'One ballot per resolution' };
    seen.add(b.resolution);
    const def = ctx.content.entities.resolution[b.resolution]!;
    if (!def.options.some((o) => o.id === b.option))
      return { code: 'bad_option', message: 'No such choice' };
    if (def.target === 'player') {
      if (!b.target || !state.playerOrder.includes(b.target) || !state.players[b.target]?.alive)
        return { code: 'bad_target', message: 'Choose a civ for it' };
    } else if (b.target !== null) return { code: 'bad_target', message: 'It has no target' };
  }
  const cost = ballotCost(ctx, ballots);
  if (cost > (p.favor ?? 0))
    return {
      code: 'no_favor',
      message: `Those votes cost ${cost} favor (you have ${p.favor ?? 0})`,
    };
  return undefined;
}

/** Picks the agenda: those always on it, then some others, not the ones just decided. */
function drawAgenda(draft: Draft<GameState>, ctx: EngineContext): string[] {
  const r = ctx.content.rules.congress;
  const ids = ctx.content.ids.resolution;
  const always = ids.filter((id) => ctx.content.entities.resolution[id]!.always);
  const last = new Set(draft.congress?.passed.map((p) => p.resolution) ?? []);
  let pool = ids.filter((id) => !always.includes(id) && !last.has(id));
  if (pool.length < r.resolutionsPerSession) pool = ids.filter((id) => !always.includes(id));
  const random = makeRandom(draft.rng as GameState['rng']);
  const drawn = random.shuffle([...pool]).slice(0, r.resolutionsPerSession);
  draft.rng = castDraft(random.state());
  return [...always, ...drawn.sort((a, b) => ids.indexOf(a) - ids.indexOf(b))];
}

function award(
  draft: Draft<GameState>,
  player: PlayerId,
  amount: number,
  reason: string,
  emit: Emit,
) {
  if (amount <= 0) return;
  const p = draft.players[player]!;
  p.diploPoints = (p.diploPoints ?? 0) + amount;
  emit({
    type: 'diplomatic_points',
    player,
    amount,
    total: p.diploPoints,
    reason,
    visibleTo: 'all',
  });
}

/** The session that met this turn: count the votes, and put what passed in force. */
function closeSession(draft: Draft<GameState>, ctx: EngineContext, emit: Emit) {
  const c = draft.congress!;
  const agenda = c.session!.agenda;
  const civs = draft.playerOrder.filter((id) => draft.players[id]!.alive);
  const random = makeRandom(draft.rng as GameState['rng']);
  const passed: { resolution: string; option: string; target: PlayerId | null }[] = [];
  const winners: Record<string, PlayerId[]> = {};
  for (const res of agenda) {
    const def = ctx.content.entities.resolution[res]!;
    const tally: Record<string, number> = Object.fromEntries(def.options.map((o) => [o.id, 0]));
    const targets: Record<string, Record<PlayerId, number>> = {};
    for (const id of civs) {
      const b = c.votes[id]?.find((x) => x.resolution === res);
      if (!b) continue;
      tally[b.option] = (tally[b.option] ?? 0) + b.votes;
      if (b.target) {
        const t = (targets[b.option] ??= {});
        t[b.target] = (t[b.target] ?? 0) + b.votes;
      }
    }
    const top = Math.max(...Object.values(tally));
    const tied = def.options.map((o) => o.id).filter((o) => tally[o] === top);
    const option = tied.length === 1 ? tied[0]! : random.pick(tied);
    let target: PlayerId | null = null;
    if (def.target === 'player') {
      const t = targets[option] ?? {};
      const best = Math.max(0, ...Object.values(t));
      const candidates = civs.filter((id) => best > 0 && t[id] === best);
      target =
        candidates.length > 0
          ? candidates.length === 1
            ? candidates[0]!
            : random.pick(candidates)
          : random.pick(civs);
    }
    passed.push({ resolution: res, option, target });
    // Whoever alone put the most votes behind what passed set the agenda (a tie: nobody did).
    const backers = civs
      .map((id) => ({ id, b: c.votes[id]?.find((x) => x.resolution === res) }))
      .filter((x) => !!x.b && x.b.option === option && x.b.target === target);
    const most = Math.max(0, ...backers.map((x) => x.b!.votes));
    const leaders = backers.filter((x) => x.b!.votes === most);
    winners[res] = leaders.length === 1 ? [leaders[0]!.id] : [];
    emit({ type: 'resolution_passed', resolution: res, option, target, tally, visibleTo: 'all' });
  }
  draft.rng = castDraft(random.state());

  // Favor spent on extra votes.
  for (const id of civs) {
    const p = draft.players[id]!;
    p.favor = Math.max(0, (p.favor ?? 0) - ballotCost(ctx, c.votes[id] ?? []));
    p.resolutions = [];
  }
  // What passed holds until the next session; points for the world leader and the agenda setters.
  const r = ctx.content.rules.congress;
  for (const pass of passed) {
    const def = ctx.content.entities.resolution[pass.resolution]!;
    const option = def.options.find((o) => o.id === pass.option)!;
    const name = resolveText(ctx.content, def.name);
    const holders = def.target === 'player' ? (pass.target ? [pass.target] : []) : civs;
    for (const id of holders)
      draft.players[id]!.resolutions!.push({ resolution: def.id, option: option.id });
    if (option.points > 0 && pass.target) award(draft, pass.target, option.points, name, emit);
    else
      for (const id of winners[pass.resolution] ?? [])
        award(draft, id, r.agendaPoints, `${name} (you set the agenda)`, emit);
  }
  c.passed = passed;
  c.votes = {};
  c.session = null;
  c.nextSession = draft.turn + Math.max(1, scaleCost(ctx, draft, r.sessionEvery));
}

/** Turn step: the congress forms, favor comes in, sessions meet and close; diplomatic victory. */
export function congressTurn(draft: Draft<GameState>, ctx: EngineContext, emit: Emit) {
  if (!congressOn(draft) || draft.status !== 'playing') return;
  const r = ctx.content.rules.congress;
  if (!draft.congress) {
    const need = ctx.content.entities.era[r.foundingEra]?.order ?? 0;
    const by = draft.playerOrder.find((id) => {
      const p = draft.players[id]!;
      return p.alive && (playerEra(ctx, p)?.order ?? 0) >= need;
    });
    if (!by) return;
    // The first session meets halfway to the usual interval, so there's favor to vote with.
    const first = Math.max(1, Math.ceil(scaleCost(ctx, draft, r.sessionEvery) / 2));
    draft.congress = { nextSession: draft.turn + first, session: null, votes: {}, passed: [] };
    emit({ type: 'congress_founded', by, visibleTo: 'all' });
  }
  const snap = view(draft);
  for (const id of draft.playerOrder) {
    const p = draft.players[id]!;
    if (!p.alive) continue;
    p.favor = (p.favor ?? 0) + Math.max(0, favorPerTurn(ctx, snap, id).total);
  }
  const c = draft.congress;
  if (c.session && c.session.turn <= draft.turn) closeSession(draft, ctx, emit);
  else if (!c.session && draft.turn + 1 >= c.nextSession) {
    c.session = { turn: draft.turn + 1, agenda: drawAgenda(draft, ctx) };
    c.votes = {};
    emit({
      type: 'congress_session',
      turn: c.session.turn,
      agenda: c.session.agenda,
      visibleTo: 'all',
    });
  }
  if (!diplomaticOn(draft)) return;
  const after = view(draft);
  const winner = after.playerOrder.find(
    (id) => after.players[id]!.alive && diplomaticPoints(ctx, after, id) >= r.victoryPoints,
  );
  if (winner) endGame(draft, 'diplomatic', winner, emit);
}

type CastVotes = Extract<Action, { type: 'cast_votes' }>;

export const congressHandlers = {
  cast_votes: {
    validate(state, action, ctx) {
      return votingProblem(ctx, state, action.player, action.ballots);
    },
    apply(draft, action) {
      draft.congress!.votes[action.player] = action.ballots.map((b) => ({ ...b }));
    },
  } satisfies ActionHandler<CastVotes>,
};
