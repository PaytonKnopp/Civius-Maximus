import { resolveText } from '@cx/content';
import { castDraft, current, type Draft } from 'immer';
import type { Action } from '../actions';
import { emptyBits, encodeBits, getBit } from '../bitset';
import { attackProblem, previewAttack } from '../combat/strength';
import { performAttack } from '../combat/handlers';
import {
  type ActionHandler,
  atWar,
  type EngineContext,
  type Emit,
  unitClassOf,
  unitIds,
} from '../context';
import { view } from '../draft';
import { toFixed } from '../fixed';
import { distance, tilesWithin } from '../map/hex';
import type { Random } from '../map/random';
import { newProgress } from '../progress/sources';
import {
  foundSettlement,
  processSettlement,
  refreshCitizens,
  spawnUnit,
} from '../settlements/handlers';
import { foundingProblem, itemCost, itemProblem, settlementIds } from '../settlements/rules';
import type { GameState, PlayerId, PlayerState } from '../state';
import { isWater } from '../units/movement';
import { exploredBits } from '../units/vision';
import {
  cityStateIds,
  cityStateSettlement,
  envoyProblem,
  questMet,
  questsOf,
  suzerainFor,
} from './rules';

type A<T extends Action['type']> = Extract<Action, { type: T }>;

/** A city-state's player: outside the turn order, named after it, at peace with everyone. */
export function cityStatePlayer(
  ctx: EngineContext,
  state: GameState,
  id: PlayerId,
  name: string,
  tile: number,
): PlayerState {
  return {
    id,
    name,
    kind: 'cityState',
    team: null,
    alive: true,
    turnEnded: true,
    startTile: tile,
    explored: encodeBits(emptyBits(state.map.tiles.length)),
    canEmbark: false,
    civ: '',
    leader: '',
    gold: 0,
    influence: 0,
    greatPeople: [],
    beliefs: [],
    religion: null,
    envoys: 0,
    faith: 0,
    capital: null,
    settlementsFounded: 0,
    kills: 0,
    declaredWarTurn: null,
    ...newProgress(ctx),
  };
}

/** Gives a player envoys in a city-state, and updates who leads it. */
export function addEnvoys(
  draft: Draft<GameState>,
  ctx: EngineContext,
  target: PlayerId,
  player: PlayerId,
  amount: number,
  emit: Emit,
) {
  const cs = draft.cityStates[target]!;
  cs.envoys[player] = Math.max(0, (cs.envoys[player] ?? 0) + amount);
  if (cs.envoys[player] === 0) delete cs.envoys[player];
  updateSuzerain(draft, ctx, target, emit);
}

function updateSuzerain(draft: Draft<GameState>, ctx: EngineContext, target: PlayerId, emit: Emit) {
  const cs = draft.cityStates[target]!;
  const next = suzerainFor(ctx, cs);
  if (next === cs.suzerain) return;
  const from = cs.suzerain;
  cs.suzerain = next;
  emit({ type: 'suzerain_changed', cityState: target, from, to: next, visibleTo: 'all' });
}

export const cityStateHandlers = {
  send_envoy: {
    validate(state, action, ctx) {
      return envoyProblem(ctx, state, action.player, action.cityState);
    },
    apply(draft, action, ctx, emit) {
      const p = draft.players[action.player]!;
      if (p.envoys > 0) p.envoys--;
      else p.influence -= toFixed(ctx.content.rules.cityStates.envoyInfluence);
      emit({
        type: 'envoy_sent',
        player: action.player,
        cityState: action.cityState,
        visibleTo: 'all',
      });
      addEnvoys(draft, ctx, action.cityState, action.player, 1, emit);
    },
  } satisfies ActionHandler<A<'send_envoy'>>,
} satisfies { [T in 'send_envoy']: ActionHandler<A<T>> };

/**
 * At game creation (after the camps): the map size's city-states, each on open land at least
 * `minDistance` from every start and from each other, with a soldier.
 */
export function placeCityStates(draft: Draft<GameState>, ctx: EngineContext, random: Random) {
  if (draft.settings.cityStates === false) return;
  const rules = ctx.content.rules.cityStates;
  const size = ctx.content.entities.mapSize[draft.settings.map.size];
  const count = Math.min(size?.cityStates ?? 0, ctx.content.ids.cityState.length);
  if (count === 0) return;
  const snap = current(draft);
  const map = snap.map;
  const starts = snap.playerOrder.map((p) => snap.players[p]!.startTile);
  const camps = Object.values(snap.camps).map((c) => c.tile);
  const units = new Set(Object.values(snap.units).map((u) => u.tile));
  const sites: number[] = [];
  for (let t = 0; t < map.tiles.length; t++) {
    if (map.tiles[t]!.owner !== null || units.has(t)) continue;
    if (foundingProblem(ctx, snap, '', t)) continue;
    if (starts.some((s) => distance(map, s, t) < rules.minDistance)) continue;
    if (camps.some((c) => distance(map, c, t) < 3)) continue;
    // Room to grow: mostly land around it.
    const land = tilesWithin(map, t, 2).filter((n) => !isWater(ctx, snap, n)).length;
    if (land < 12) continue;
    sites.push(t);
  }
  const placed: number[] = [];
  for (const t of random.shuffle(sites)) {
    if (placed.length >= count) break;
    if (placed.some((p) => distance(map, p, t) < rules.minDistance)) continue;
    placed.push(t);
  }
  const defs = random.shuffle([...ctx.content.ids.cityState]);
  placed.forEach((tile, i) => {
    const id = `cs${i + 1}`;
    const def = ctx.content.entities.cityState[defs[i]!]!;
    const name = resolveText(ctx.content, def.name);
    draft.players[id] = castDraft(cityStatePlayer(ctx, snap, id, name, tile));
    draft.cityStates[id] = { def: def.id, envoys: {}, suzerain: null, met: [], quests: {} };
    const sid = foundSettlement(draft, ctx, id, tile, () => {});
    const s = draft.settlements[sid]!;
    s.name = name;
    s.population = rules.startingPopulation;
    refreshCitizens(draft, ctx, sid);
    const soldier = bestSoldier(ctx, view(draft), sid);
    if (soldier) spawnUnit(draft, ctx, id, soldier, tile);
  });
}

/** The strongest land soldier a city-state's settlement can train now (cheapest on ties). */
function bestSoldier(ctx: EngineContext, state: GameState, sid: string): string | undefined {
  const s = state.settlements[sid]!;
  let best: { id: string; strength: number; cost: number } | undefined;
  for (const id of ctx.content.ids.unit) {
    const def = ctx.content.entities.unit[id]!;
    const cls = ctx.content.entities.unitClass[def.class]!;
    if (!cls.combat || cls.domain !== 'land' || def.populationCost > 0) continue;
    const item = { kind: 'unit' as const, id };
    if (itemProblem(ctx, state, s, item)) continue;
    const strength = Math.max(def.strength, def.rangedStrength);
    const cost = itemCost(ctx, state, s.owner, item, s);
    if (!best || strength > best.strength || (strength === best.strength && cost < best.cost))
      best = { id, strength, cost };
  }
  return best?.id;
}

/**
 * End of each turn (after the civs' settlements): every city-state keeps up with the world's
 * techs and civics, builds (soldiers up to `maxUnits`, then buildings), meets the players who
 * have found it, pays out quests, settles its suzerain and defends itself.
 */
export function cityStatesTurn(draft: Draft<GameState>, ctx: EngineContext, emit: Emit) {
  const ids = cityStateIds(draft);
  if (ids.length === 0) return;
  keepUp(draft, ctx, ids);
  const explored = new Map<PlayerId, Uint8Array>();
  for (const p of draft.playerOrder)
    if (draft.players[p]!.alive) explored.set(p, exploredBits(view(draft), p));
  for (const id of ids) {
    if (!draft.players[id]?.alive) continue;
    for (const sid of settlementIds(draft)) {
      if (draft.settlements[sid]!.owner !== id) continue;
      chooseBuild(draft, ctx, sid);
      processSettlement(draft, ctx, sid, emit);
    }
    meet(draft, ctx, id, explored, emit);
    quests(draft, ctx, id, emit);
    updateSuzerain(draft, ctx, id, emit);
    defend(draft, ctx, id, emit);
  }
}

/** City-states know the techs and civics at least half the living players know. */
function keepUp(draft: Draft<GameState>, ctx: EngineContext, ids: PlayerId[]) {
  const alive = draft.playerOrder.filter((p) => draft.players[p]!.alive);
  for (const kind of ['techs', 'civics'] as const) {
    const all = kind === 'techs' ? ctx.content.ids.tech : ctx.content.ids.civic;
    const known = all.filter(
      (n) =>
        alive.filter((p) => draft.players[p]![kind].done.includes(n)).length * 2 >= alive.length,
    );
    for (const id of ids) {
      const p = draft.players[id];
      if (!p?.alive) continue;
      const done = p[kind].done;
      if (done.length !== known.length || done.some((n, i) => n !== known[i])) p[kind].done = known;
    }
  }
}

function chooseBuild(draft: Draft<GameState>, ctx: EngineContext, sid: string) {
  const s = draft.settlements[sid]!;
  if (s.queue.length > 0) return;
  const snap = view(draft);
  const soldiers = Object.values(snap.units).filter(
    (u) => u.owner === s.owner && unitClassOf(ctx, u).combat,
  ).length;
  if (soldiers < ctx.content.rules.cityStates.maxUnits) {
    const unit = bestSoldier(ctx, snap, sid);
    if (unit) {
      s.queue = [{ kind: 'unit', id: unit }];
      return;
    }
  }
  const here = snap.settlements[sid]!;
  const building = ctx.content.ids.building
    .map((id) => ({ kind: 'building' as const, id }))
    .filter((i) => !itemProblem(ctx, snap, here, i))
    .map((i) => ({ i, cost: itemCost(ctx, snap, s.owner, i, here) }))
    .sort((a, b) => a.cost - b.cost || (a.i.id < b.i.id ? -1 : 1))[0];
  if (building) s.queue = [building.i];
}

/** Players who have explored its settlement meet it; the first to do so get free envoys. */
function meet(
  draft: Draft<GameState>,
  ctx: EngineContext,
  id: PlayerId,
  explored: Map<PlayerId, Uint8Array>,
  emit: Emit,
) {
  const home = cityStateSettlement(view(draft), id);
  const cs = draft.cityStates[id]!;
  if (!home) return;
  const first = cs.met.length === 0;
  const fresh = draft.playerOrder.filter(
    (p) => !cs.met.includes(p) && explored.has(p) && getBit(explored.get(p)!, home.tile),
  );
  for (const p of fresh) {
    cs.met.push(p);
    const envoys = first ? ctx.content.rules.cityStates.firstMeetEnvoys : 0;
    emit({ type: 'city_state_met', cityState: id, player: p, envoys, visibleTo: [p] });
    if (envoys > 0) addEnvoys(draft, ctx, id, p, envoys, emit);
  }
}

function quests(draft: Draft<GameState>, ctx: EngineContext, id: PlayerId, emit: Emit) {
  const cs = draft.cityStates[id]!;
  const reward = ctx.content.rules.cityStates.questEnvoys;
  for (const p of [...cs.met]) {
    if (!draft.players[p]?.alive) continue;
    for (const q of questsOf(ctx, view(draft), id)) {
      if ((cs.quests[p] ?? []).includes(q.id) || !questMet(ctx, view(draft), id, p, q.id)) continue;
      cs.quests[p] = [...(cs.quests[p] ?? []), q.id];
      emit({ type: 'city_state_quest', cityState: id, player: p, quest: q.text, visibleTo: [p] });
      if (reward > 0) addEnvoys(draft, ctx, id, p, reward, emit);
    }
  }
}

/** Its soldiers hit enemies next to them when the odds are good, and otherwise hold. */
function defend(draft: Draft<GameState>, ctx: EngineContext, id: PlayerId, emit: Emit) {
  const live = view(draft);
  const home = cityStateSettlement(live, id);
  const enemies = Object.values(live.units)
    .filter((o) => atWar(live, id, o.owner))
    .map((o) => o.tile);
  // One snapshot for all its units, taken only if there's a fight and renewed after each attack.
  let snap: GameState | undefined;
  for (const uid of unitIds(live)) {
    const u = draft.units[uid];
    if (!u || u.owner !== id || u.moves <= 0) continue;
    // Nothing to fight nearby (the usual case): just hold.
    if (!enemies.some((t) => distance(live.map, t, u.tile) <= 2)) {
      if (u.orders?.kind !== 'fortify') u.orders = { kind: 'fortify', turns: 0 };
      continue;
    }
    snap ??= current(draft);
    const unit = snap.units[uid]!;
    const everything = new Uint8Array(snap.map.tiles.length).fill(1);
    let best: { tile: number; score: number } | undefined;
    for (const t of tilesWithin(snap.map, unit.tile, 2)) {
      if (t === unit.tile || attackProblem(ctx, snap, unit, t, everything)) continue;
      // Only near home, and never taking settlements.
      if (home && distance(snap.map, home.tile, t) > 3) continue;
      const p = previewAttack(ctx, snap, unit, t);
      if (!p || p.mode === 'capture') continue;
      const dealt = p.toDefender[0] + p.toDefender[1];
      const taken = p.toAttacker[0] + p.toAttacker[1];
      if (taken * 2 >= unit.health || dealt <= taken) continue;
      const score = dealt - taken;
      if (!best || score > best.score) best = { tile: t, score };
    }
    if (best) {
      performAttack(draft, ctx, uid, best.tile, emit);
      snap = undefined;
      continue;
    }
    if (u.orders?.kind !== 'fortify') u.orders = { kind: 'fortify', turns: 0 };
  }
}
