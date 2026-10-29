import { resolveText, type SpyMissionDef } from '@cx/content';
import { castDraft, current, type Draft } from 'immer';
import type { Action } from '../actions';
import { decodeBits, encodeBits, getBit, setBit } from '../bitset';
import { hostilePlayer, raiderTypes } from '../combat/camps';
import {
  type ActionHandler,
  type Emit,
  type EngineContext,
  FREE,
  HOSTILE,
  type RuleError,
} from '../context';
import { view } from '../draft';
import { toFixed } from '../fixed';
import { freeHolder } from '../greatworks/greatworks';
import { loyaltyNow, loyaltyOn } from '../loyalty/loyalty';
import { distance, tilesWithin } from '../map/hex';
import { grantBoost } from '../progress/handlers';
import { nextRange } from '../rng';
import { spawnUnit } from '../settlements/handlers';
import { settlementIds, settlementsOf } from '../settlements/rules';
import type { GameState, PlayerId, SettlementState, SpyState } from '../state';

/**
 * Espionage (docs/04-advanced-systems.md, "Espionage"). Spies are agents, not units on the map
 * (as in Civ V): some civics each give one. A spy travels to a settlement and runs a mission
 * there: guarding one of yours, or working against someone else's. Each mission shows its
 * chance; a counterspy where it's run makes it harder. A spy whose mission fails may be caught,
 * and one that's caught or seen sours the victim on whoever sent it.
 */

export const espionageOn = (state: Pick<GameState, 'settings'>) =>
  state.settings.espionage !== false;

/** Spies a player may have: one per capacity civic done. */
export function spyCapacity(ctx: EngineContext, state: GameState, player: PlayerId): number {
  const p = state.players[player];
  if (!p || !espionageOn(state)) return 0;
  const civics = new Set(ctx.content.rules.espionage.capacityCivics);
  return p.civics.done.filter((c) => civics.has(c)).length;
}

const spyOrder = (a: string, b: string) => Number(a.slice(3)) - Number(b.slice(3));

/** A player's spies, oldest first. */
export function spiesOf(state: GameState, player: PlayerId): [string, SpyState][] {
  return Object.entries(state.espionage?.spies ?? {})
    .filter(([, s]) => s.owner === player)
    .sort(([a], [b]) => spyOrder(a, b));
}

/** Turns for a player's spy to reach a settlement from the nearest of their own. */
export function travelTurns(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  settlement: SettlementState,
): number {
  const r = ctx.content.rules.espionage;
  const mine = settlementsOf(state, player);
  const d = Math.min(99, ...mine.map((s) => distance(state.map, s.tile, settlement.tile)));
  return r.travelBase + Math.floor(d / r.travelPerTiles);
}

/** A rival's counterspy in a settlement, if any. */
function counterspyIn(ctx: EngineContext, state: GameState, s: SettlementState) {
  return spiesOf(state, s.owner).find(
    ([, spy]) =>
      spy.at === s.id &&
      spy.arrives <= state.turn &&
      ctx.content.entities.spyMission[spy.mission?.id ?? '']?.kind === 'counterspy',
  )?.[1];
}

/** A mission's chance of working, percent: base, plus rank, less any counterspy there. */
export function missionChance(
  ctx: EngineContext,
  state: GameState,
  spy: SpyState,
  def: SpyMissionDef,
  s: SettlementState,
): number {
  const r = ctx.content.rules.espionage;
  if (def.kind === 'counterspy') return 100;
  const guard = counterspyIn(ctx, state, s);
  const defense = guard ? r.counterspy + r.counterspyPerRank * (guard.rank - 1) : 0;
  const chance = def.chance + r.rankChance * (spy.rank - 1) - defense;
  return Math.max(r.minChance, Math.min(r.maxChance, chance));
}

const isCiv = (state: GameState, id: PlayerId) => state.playerOrder.includes(id);

function knowsMore(state: GameState, them: PlayerId, us: PlayerId): boolean {
  const ours = new Set(state.players[us]!.techs.done);
  return state.players[them]!.techs.done.some((t) => !ours.has(t));
}

/** The great work a heist would take, and where it would go. */
function heistTarget(ctx: EngineContext, state: GameState, player: PlayerId, s: SettlementState) {
  const works = Object.entries(state.greatWorks ?? {})
    .filter(([, w]) => w.settlement === s.id)
    .sort(([a], [b]) => Number(a.slice(2)) - Number(b.slice(2)));
  for (const [id, w] of works) {
    for (const mine of settlementsOf(state, player)) {
      const holder = freeHolder(ctx, state, mine, w.kind);
      if (holder) return { id, to: mine.id, holder };
    }
  }
  return undefined;
}

/** Why a spy can't run this mission where it is now, or undefined. */
export function missionProblem(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  spyId: string,
  missionId: string,
): RuleError | undefined {
  const spy = state.espionage?.spies[spyId];
  if (!spy || spy.owner !== player) return { code: 'not_yours', message: "That isn't your spy" };
  const s = spy.at ? state.settlements[spy.at] : undefined;
  if (!s) return { code: 'not_there', message: 'Send the spy somewhere first' };
  if (spy.arrives > state.turn)
    return { code: 'travelling', message: `Still on the way (arrives turn ${spy.arrives})` };
  const def = ctx.content.entities.spyMission[missionId];
  if (!def) return { code: 'unknown', message: 'No such mission' };
  const p = state.players[player]!;
  if (def.requiresCivic && !p.civics.done.includes(def.requiresCivic))
    return {
      code: 'locked',
      message: `Needs ${resolveText(ctx.content, ctx.content.entities.civic[def.requiresCivic]?.name ?? def.requiresCivic)}`,
    };
  if (def.requiresTech && !p.techs.done.includes(def.requiresTech))
    return {
      code: 'locked',
      message: `Needs ${resolveText(ctx.content, ctx.content.entities.tech[def.requiresTech]?.name ?? def.requiresTech)}`,
    };
  const own = s.owner === player;
  if (def.target === 'own' && !own)
    return { code: 'not_own', message: 'Only in your own settlements' };
  if (def.target === 'foreign' && own)
    return { code: 'own', message: 'Only in someone else’s settlement' };
  if (spy.mission?.id === def.id) return { code: 'already', message: 'Already on it' };
  const them = state.players[s.owner];
  switch (def.kind) {
    case 'steal_boost':
      if (!them || !knowsMore(state, s.owner, player))
        return { code: 'nothing', message: "They don't know any tech you don't" };
      break;
    case 'siphon_funds':
      if (!them || them.gold <= 0) return { code: 'nothing', message: 'Their treasury is empty' };
      break;
    case 'sabotage':
      if (s.queue.length === 0) return { code: 'nothing', message: "It isn't building anything" };
      break;
    case 'unrest':
      if (!loyaltyOn(state)) return { code: 'off', message: 'Loyalty is off in this game' };
      if (s.capital || them?.kind === 'cityState')
        return { code: 'steadfast', message: 'Capitals and city-states stay loyal' };
      break;
    case 'heist':
      if (!heistTarget(ctx, state, player, s))
        return {
          code: 'nothing',
          message: 'No great work there that fits an empty slot of yours',
        };
      break;
  }
  return undefined;
}

/** What a mission does when it works. Returns the detail for the spy's owner. */
function carryOut(
  draft: Draft<GameState>,
  ctx: EngineContext,
  spy: SpyState,
  def: SpyMissionDef,
  sid: string,
  emit: Emit,
): string {
  const s = draft.settlements[sid]!;
  const owner = spy.owner;
  const them = draft.players[s.owner];
  const me = draft.players[owner]!;
  switch (def.kind) {
    case 'counterspy':
      return '';
    case 'gain_sources': {
      const n = draft.map.tiles.length;
      const bits = decodeBits(me.explored, n);
      for (const t of tilesWithin(draft.map, s.tile, def.params.radius ?? 3)) setBit(bits, t);
      me.explored = encodeBits(bits);
      const research = them?.techs.current;
      const tech = research ? ctx.content.entities.tech[research] : undefined;
      return tech
        ? `They're researching ${resolveText(ctx.content, tech.name)}`
        : 'You now know the land around it';
    }
    case 'siphon_funds': {
      if (!them) return '';
      const take = Math.min(
        Math.trunc((them.gold * (def.params.percent ?? 10)) / 100),
        toFixed(def.params.max ?? 100),
      );
      them.gold -= take;
      me.gold += take;
      return `${Math.floor(take / 100)} gold taken`;
    }
    case 'steal_boost':
      grantBoost(draft, ctx, owner, emit);
      return 'A boost toward your research';
    case 'sabotage': {
      const head = s.queue[0];
      if (!head) return '';
      const key = `${head.kind}:${head.id}`;
      const lost = Math.trunc(((s.progress[key] ?? 0) * (def.params.percent ?? 50)) / 100);
      s.progress[key] = (s.progress[key] ?? 0) - lost;
      return `${Math.floor(lost / 100)} production lost there`;
    }
    case 'partisans': {
      if (!draft.players[HOSTILE])
        draft.players[HOSTILE] = castDraft(hostilePlayer(ctx, current(draft)));
      const types = raiderTypes(ctx, view(draft));
      let raised = 0;
      for (let i = 0; i < (def.params.count ?? 1); i++) {
        const type = types[i % types.length];
        if (type && spawnUnit(draft, ctx, HOSTILE, type, s.tile)) raised++;
      }
      return `${raised} band${raised === 1 ? '' : 's'} of raiders rose`;
    }
    case 'unrest': {
      const before = loyaltyNow(ctx, s);
      s.loyalty = Math.max(0, before - (def.params.amount ?? 20));
      return `Loyalty there fell to ${s.loyalty}`;
    }
    case 'heist': {
      const h = heistTarget(ctx, view(draft), owner, s);
      if (!h) return 'Nothing could be taken';
      const w = draft.greatWorks![h.id]!;
      w.settlement = h.to;
      w.holder = h.holder;
      return `${resolveText(ctx.content, w.name)} is now in ${draft.settlements[h.to]!.name}`;
    }
  }
}

function roll(draft: Draft<GameState>): number {
  const [n, next] = nextRange(draft.rng as GameState['rng'], 1, 100);
  draft.rng = castDraft(next);
  return n;
}

/** A finished mission: did it work, and was the spy caught or seen? */
function resolve(draft: Draft<GameState>, ctx: EngineContext, id: string, emit: Emit) {
  const r = ctx.content.rules.espionage;
  const spy = draft.espionage!.spies[id]!;
  const def = ctx.content.entities.spyMission[spy.mission!.id]!;
  const s = draft.settlements[spy.at!]!;
  const target = s.owner;
  const snap = view(draft);
  const chance = missionChance(ctx, snap, spy, def, s);
  const guarded = !!counterspyIn(ctx, snap, s);
  const worked = roll(draft) <= chance;
  let outcome: 'success' | 'escaped' | 'caught';
  let detail = '';
  let seen: boolean;
  if (worked) {
    detail = carryOut(draft, ctx, spy, def, s.id, emit);
    spy.successes++;
    spy.rank = 1 + r.rankAt.filter((n) => spy.successes >= n).length;
    spy.mission = null;
    seen = roll(draft) <= r.seenChance;
    outcome = 'success';
  } else {
    const caught = roll(draft) <= Math.min(100, r.caughtChance + (guarded ? r.counterspy : 0));
    outcome = caught ? 'caught' : 'escaped';
    seen = caught;
  }
  emit({
    type: 'spy_mission',
    player: spy.owner,
    spy: id,
    name: spy.name,
    mission: def.id,
    settlement: s.id,
    target,
    outcome,
    detail,
    visibleTo: [spy.owner],
  });
  if (isCiv(snap, target) || snap.players[target]?.kind === 'cityState')
    emit({
      type: 'spy_noticed',
      player: target,
      by: seen ? spy.owner : null,
      mission: def.id,
      settlement: s.id,
      outcome,
      visibleTo: [target],
    });
  if (seen && isCiv(snap, target))
    draft.diplomacy.incidents.push({
      kind: 'spied',
      by: spy.owner,
      against: target,
      turn: draft.turn,
    });
  if (outcome === 'caught') delete draft.espionage!.spies[id];
  else if (outcome === 'escaped') {
    spy.at = null;
    spy.mission = null;
    spy.arrives = draft.turn + 1 + travelTurns(ctx, snap, spy.owner, s);
  }
}

/** Turn step: new spies, arrivals, and missions that finish. */
export function espionageTurn(draft: Draft<GameState>, ctx: EngineContext, emit: Emit) {
  if (!espionageOn(draft)) return;
  const r = ctx.content.rules.espionage;
  const next = draft.turn + 1;
  for (const player of draft.playerOrder) {
    if (!draft.players[player]!.alive) continue;
    const snap = view(draft);
    const want = spyCapacity(ctx, snap, player) - spiesOf(snap, player).length;
    for (let i = 0; i < want; i++) {
      const esp = (draft.espionage ??= { spies: {}, named: 0 });
      const id = `spy${draft.nextEntityId++}`;
      const base = resolveText(ctx.content, r.names[esp.named % r.names.length]!);
      const round = Math.floor(esp.named / r.names.length);
      const name = round > 0 ? `${base} ${round + 1}` : base;
      esp.named++;
      esp.spies[id] = {
        owner: player,
        name,
        rank: 1,
        successes: 0,
        at: null,
        arrives: next,
        mission: null,
      };
      emit({ type: 'spy_recruited', player, spy: id, name, visibleTo: [player] });
    }
  }
  const spies = draft.espionage?.spies;
  if (!spies) return;
  for (const id of Object.keys(spies).sort(spyOrder)) {
    const spy = spies[id]!;
    if (!draft.players[spy.owner]?.alive) {
      delete spies[id];
      continue;
    }
    if (spy.at === null) continue;
    const s = draft.settlements[spy.at];
    // Its settlement is gone, or a counterspy's settlement changed hands: home it comes.
    const gone =
      !s ||
      (spy.mission?.id &&
        ctx.content.entities.spyMission[spy.mission.id]?.target === 'own' &&
        s.owner !== spy.owner);
    if (gone || (s && (s.owner === FREE || s.owner === HOSTILE))) {
      spy.at = null;
      spy.mission = null;
      spy.arrives = next;
      continue;
    }
    if (spy.arrives === next)
      emit({
        type: 'spy_arrived',
        player: spy.owner,
        spy: id,
        name: spy.name,
        settlement: spy.at,
        visibleTo: [spy.owner],
      });
    if (spy.mission && spy.mission.done > 0 && spy.mission.done <= next)
      resolve(draft, ctx, id, emit);
  }
}

type A<T extends Action['type']> = Extract<Action, { type: T }>;

function ownSpy(state: GameState, player: PlayerId, id: string): SpyState | RuleError {
  const spy = state.espionage?.spies[id];
  if (!state.players[player]?.alive)
    return { code: 'not_playing', message: `${player} is not playing` };
  if (!spy || spy.owner !== player) return { code: 'not_yours', message: "That isn't your spy" };
  return spy;
}

export const espionageHandlers = {
  send_spy: {
    validate(state, action) {
      const spy = ownSpy(state, action.player, action.spy);
      if ('code' in spy) return spy;
      const s = state.settlements[action.settlement];
      const explored = decodeBits(state.players[action.player]!.explored, state.map.tiles.length);
      if (!s || !getBit(explored, s.tile))
        return { code: 'unknown', message: "You don't know that settlement" };
      if (s.owner === FREE || s.owner === HOSTILE)
        return { code: 'no_target', message: 'There is no one there to spy on' };
      if (spy.at === s.id) return { code: 'already', message: "It's already there" };
      return undefined;
    },
    apply(draft, action, ctx) {
      const snap = view(draft);
      const spy = draft.espionage!.spies[action.spy]!;
      const s = snap.settlements[action.settlement]!;
      spy.at = s.id;
      spy.mission = null;
      spy.arrives = draft.turn + travelTurns(ctx, snap, action.player, s);
    },
  } satisfies ActionHandler<A<'send_spy'>>,

  start_spy_mission: {
    validate(state, action, ctx) {
      return missionProblem(ctx, state, action.player, action.spy, action.mission);
    },
    apply(draft, action, ctx) {
      const def = ctx.content.entities.spyMission[action.mission]!;
      draft.espionage!.spies[action.spy]!.mission = {
        id: def.id,
        done: def.turns === 0 ? 0 : draft.turn + def.turns,
      };
    },
  } satisfies ActionHandler<A<'start_spy_mission'>>,

  recall_spy: {
    validate(state, action) {
      const spy = ownSpy(state, action.player, action.spy);
      if ('code' in spy) return spy;
      if (spy.at === null) return { code: 'home', message: "It's already home" };
      return undefined;
    },
    apply(draft, action) {
      const spy = draft.espionage!.spies[action.spy]!;
      spy.at = null;
      spy.mission = null;
      spy.arrives = draft.turn + 1;
    },
  } satisfies ActionHandler<A<'recall_spy'>>,
};

/** Settlements a player's spies could go to: their own and every known one of others. */
export function spyTargets(state: GameState, player: PlayerId): SettlementState[] {
  const explored = decodeBits(state.players[player]?.explored ?? '', state.map.tiles.length);
  return settlementIds(state)
    .map((id) => state.settlements[id]!)
    .filter(
      (s) =>
        s.owner !== FREE && s.owner !== HOSTILE && (s.owner === player || getBit(explored, s.tile)),
    );
}
