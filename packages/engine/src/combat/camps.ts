import { castDraft, current, type Draft } from 'immer';
import { type EngineContext, type Emit, HOSTILE, unitIds } from '../context';
import { toFixed } from '../fixed';
import { distance, neighbors, tilesWithin } from '../map/hex';
import { makeRandom, type Random } from '../map/random';
import { newProgress } from '../progress/sources';
import { playerEra } from '../progress/rules';
import type { CampState, GameState, PlayerId, PlayerState, UnitState } from '../state';
import { advanceAlongPath } from '../units/handlers';
import { canTraverse, fullMoves, hasRoom, isWater, landCost, unitsOn } from '../units/movement';
import { findPath } from '../units/pathfind';
import { visibleTiles } from '../units/vision';
import { emptyBits, encodeBits, setBit } from '../bitset';
import { performAttack } from './handlers';
import { attackProblem, previewAttack, settlementAt } from './strength';

/**
 * Hostile camps (docs/03-core-mechanics.md, "Independent powers", the classic barbarians):
 * camps in the wilds train raiders that belong to `HOSTILE`, attack anything in reach and chase
 * anything nearby. A player's military unit moving onto a camp clears it for gold.
 */

export const campIds = (state: Pick<GameState, 'camps'>) =>
  Object.keys(state.camps).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));

export function campAt(state: Pick<GameState, 'camps'>, tile: number): CampState | undefined {
  for (const id of campIds(state)) if (state.camps[id]!.tile === tile) return state.camps[id];
  return undefined;
}

/** The owner of the raiders: outside the turn order, sees and travels the whole map. */
export function hostilePlayer(ctx: EngineContext, state: GameState): PlayerState {
  const all = emptyBits(state.map.tiles.length);
  for (let i = 0; i < state.map.tiles.length; i++) setBit(all, i);
  return {
    id: HOSTILE,
    name: 'Raiders',
    kind: 'hostile',
    team: null,
    alive: true,
    turnEnded: true,
    startTile: 0,
    explored: encodeBits(all),
    canEmbark: false,
    civ: '',
    leader: '',
    gold: 0,
    influence: 0,
    greatPeople: [],
    beliefs: [],
    religion: null,
    envoys: 0,
    lifetimeCulture: 0,
    tourismRate: 0,
    spaceProjects: [],
    expeditionArrives: null,
    faith: 0,
    capital: null,
    settlementsFounded: 0,
    kills: 0,
    declaredWarTurn: null,
    ...newProgress(ctx),
  };
}

const maxCamps = (ctx: EngineContext, state: GameState) => {
  const per = ctx.content.rules.camps.landTilesPerCamp;
  if (per <= 0) return 0;
  const land = state.map.tiles.filter((t) => !ctx.content.entities.terrain[t.terrain]!.water);
  return Math.floor(land.length / per);
};

/** Tiles a camp could go on: open land, unowned, far from starts, settlements and camps. */
function campSites(ctx: EngineContext, state: GameState, avoid: number[]): number[] {
  const min = ctx.content.rules.camps.minDistance;
  const out: number[] = [];
  for (let t = 0; t < state.map.tiles.length; t++) {
    const tile = state.map.tiles[t]!;
    if (tile.owner !== null || isWater(ctx, state, t) || landCost(ctx, state, t) === null) continue;
    if (unitsOn(state, t).length > 0) continue;
    if (avoid.some((a) => distance(state.map, a, t) < min)) continue;
    out.push(t);
  }
  return out;
}

/** Raider types for the latest era any player has reached. */
function raiderTypes(ctx: EngineContext, state: GameState): string[] {
  const reached = Math.max(
    0,
    ...state.playerOrder.map((p) => playerEra(ctx, state.players[p]!)?.order ?? 0),
  );
  let best = ctx.content.rules.camps.units[0]!;
  for (const entry of ctx.content.rules.camps.units) {
    const era = ctx.content.entities.era[entry.era];
    if (era && era.order <= reached) best = entry;
  }
  return best.units;
}

function newUnit(ctx: EngineContext, id: string, type: string, tile: number): UnitState {
  const probe = { id, owner: HOSTILE, type, promotions: [] };
  return {
    ...probe,
    tile,
    moves: fullMoves(ctx, probe),
    health: ctx.content.rules.combat.maxHealth,
    xp: 0,
    orders: null,
    skippedTurn: null,
  };
}

/** A free spot for a new raider: the camp itself, or a tile next to it. */
function raiderSpot(ctx: EngineContext, state: GameState, camp: number, type: string) {
  const probe = { id: '', owner: HOSTILE, type };
  return [camp, ...neighbors(state.map, camp)].find(
    (t) =>
      canTraverse(ctx, state, probe, t) &&
      hasRoom(ctx, state, probe, t) &&
      !unitsOn(state, t).some((u) => u.owner !== HOSTILE),
  );
}

/** At game creation: the raiders' owner and the first camps, each with one raider. */
export function placeStartingCamps(state: GameState, ctx: EngineContext, random: Random) {
  if (state.settings.camps === false || maxCamps(ctx, state) === 0) return;
  state.players = { ...state.players, [HOSTILE]: hostilePlayer(ctx, state) };
  const starts = state.playerOrder.map((p) => state.players[p]!.startTile);
  const placed: number[] = [];
  for (const t of random.shuffle(campSites(ctx, state, starts))) {
    if (placed.length >= maxCamps(ctx, state)) break;
    if (placed.some((p) => distance(state.map, p, t) < ctx.content.rules.camps.minDistance))
      continue;
    placed.push(t);
  }
  const types = raiderTypes(ctx, state);
  for (const tile of placed.sort((a, b) => a - b)) {
    const id = `c${state.nextEntityId++}`;
    const camp: CampState = {
      id,
      tile,
      units: [],
      nextUnit: state.turn + ctx.content.rules.camps.unitEvery,
    };
    const unitId = `u${state.nextEntityId++}`;
    const type = random.pick(types);
    state.units = { ...state.units, [unitId]: newUnit(ctx, unitId, type, tile) };
    camp.units.push(unitId);
    state.camps = { ...state.camps, [id]: camp };
  }
}

/** A player's military unit stepped on camp tiles: those camps are cleared, for gold. */
export function clearCampsOn(
  draft: Draft<GameState>,
  ctx: EngineContext,
  owner: PlayerId,
  tiles: number[],
  emit: Emit,
) {
  if (owner === HOSTILE) return;
  for (const tile of tiles) {
    const camp = campAt(draft, tile);
    if (!camp) continue;
    delete draft.camps[camp.id];
    const gold = toFixed(ctx.content.rules.camps.reward);
    draft.players[owner]!.gold += gold;
    emit({ type: 'camp_cleared', camp: camp.id, tile, by: owner, gold, visibleTo: 'all' });
  }
}

/**
 * Start of each turn, after units refresh: maybe a new camp, camps train raiders, and every
 * raider attacks something in reach, closes in on something nearby, or wanders near home.
 */
export function raidersTurn(draft: Draft<GameState>, ctx: EngineContext, emit: Emit) {
  if (!draft.players[HOSTILE]) return;
  const rules = ctx.content.rules.camps;
  const random = makeRandom(draft.rng as GameState['rng']);

  if (
    draft.turn % rules.spawnEvery === 0 &&
    Object.keys(draft.camps).length < maxCamps(ctx, draft as GameState)
  ) {
    spawnCamp(draft, ctx, random);
  }

  const types = raiderTypes(ctx, draft as GameState);
  for (const id of campIds(draft)) {
    const camp = draft.camps[id]!;
    camp.units = camp.units.filter((u) => draft.units[u]);
    if (draft.turn < camp.nextUnit || camp.units.length >= rules.maxUnits) continue;
    camp.nextUnit = draft.turn + rules.unitEvery;
    const type = random.pick(types);
    const tile = raiderSpot(ctx, current(draft), camp.tile, type);
    if (tile === undefined) continue;
    const unitId = `u${draft.nextEntityId++}`;
    draft.units[unitId] = newUnit(ctx, unitId, type, tile);
    camp.units.push(unitId);
  }
  draft.rng = castDraft(random.state());

  for (const id of unitIds(current(draft))) {
    const u = draft.units[id];
    if (!u || u.owner !== HOSTILE || u.moves <= 0) continue;
    actRaider(draft, ctx, id, emit);
  }
}

function spawnCamp(draft: Draft<GameState>, ctx: EngineContext, random: Random) {
  const snap = current(draft);
  const seen = new Uint8Array(snap.map.tiles.length);
  for (const p of snap.playerOrder) {
    if (!snap.players[p]!.alive) continue;
    const vis = visibleTiles(ctx, snap, p);
    for (let i = 0; i < vis.length; i++) if (vis[i]) seen[i] = 1;
  }
  const avoid = [
    ...Object.values(snap.settlements).map((s) => s.tile),
    ...Object.values(snap.camps).map((c) => c.tile),
  ];
  const sites = campSites(ctx, snap, avoid).filter((t) => !seen[t]);
  if (sites.length === 0) return;
  const tile = random.pick(sites);
  const id = `c${draft.nextEntityId++}`;
  draft.camps[id] = { id, tile, units: [], nextUnit: draft.turn };
}

/** Which camp a raider came from, if it still stands. */
function homeOf(state: GameState, unitId: string): CampState | undefined {
  return Object.values(state.camps).find((c) => c.units.includes(unitId));
}

function actRaider(draft: Draft<GameState>, ctx: EngineContext, id: string, emit: Emit) {
  const snap = current(draft);
  if (attackBest(draft, ctx, id, emit, snap)) return;
  const u = snap.units[id]!;
  const rules = ctx.content.rules.camps;
  // Something of a player's nearby: close in on it.
  const prey = tilesWithin(snap.map, u.tile, rules.aggroRange)
    .filter((t) => {
      const s = settlementAt(snap, t);
      return (s && s.owner !== HOSTILE) || unitsOn(snap, t).some((o) => o.owner !== HOSTILE);
    })
    .sort((a, b) => distance(snap.map, u.tile, a) - distance(snap.map, u.tile, b) || a - b)[0];
  let goal: number | undefined;
  if (prey !== undefined) {
    goal = neighbors(snap.map, prey)
      .filter((t) => canTraverse(ctx, snap, u, t) && hasRoom(ctx, snap, u, t))
      .sort((a, b) => distance(snap.map, u.tile, a) - distance(snap.map, u.tile, b) || a - b)[0];
  } else {
    // Otherwise wander near home.
    const home = homeOf(snap, id)?.tile ?? u.tile;
    const random = makeRandom(draft.rng as GameState['rng']);
    const spots = tilesWithin(snap.map, home, 2).filter(
      (t) => t !== u.tile && canTraverse(ctx, snap, u, t) && hasRoom(ctx, snap, u, t),
    );
    goal = spots.length > 0 ? random.pick(spots) : undefined;
    draft.rng = castDraft(random.state());
  }
  if (goal === undefined || goal === u.tile) return;
  const path = findPath(ctx, snap, u, goal, 3);
  if (!path) return;
  advanceAlongPath(draft, ctx, id, path, goal, emit);
  const moved = draft.units[id];
  if (!moved) return;
  moved.orders = null;
  if (moved.moves > 0) attackBest(draft, ctx, id, emit);
}

/** Attacks the best target in reach (kills first, then the most damage); false if none. */
function attackBest(
  draft: Draft<GameState>,
  ctx: EngineContext,
  id: string,
  emit: Emit,
  snap: GameState = current(draft),
): boolean {
  const u = snap.units[id]!;
  const everything = new Uint8Array(snap.map.tiles.length).fill(1);
  let best: { tile: number; score: number } | undefined;
  for (const t of tilesWithin(snap.map, u.tile, 3)) {
    if (t === u.tile || attackProblem(ctx, snap, u, t, everything)) continue;
    const p = previewAttack(ctx, snap, u, t);
    if (!p) continue;
    const dealt = p.toDefender[0] + p.toDefender[1];
    const taken = p.toAttacker[0] + p.toAttacker[1];
    const left = p.target.kind === 'unit' ? p.target.unit.health : Number.POSITIVE_INFINITY;
    const score =
      p.mode === 'capture' ? 1000 : p.toDefender[0] >= left ? 500 : dealt - Math.floor(taken / 2);
    if (taken >= u.health * 2) continue;
    if (!best || score > best.score) best = { tile: t, score };
  }
  if (!best) return false;
  performAttack(draft, ctx, id, best.tile, emit);
  return true;
}
