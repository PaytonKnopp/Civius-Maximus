import { resolveText } from '@cx/content';
import { current, type Draft } from 'immer';
import type { Action } from '../actions';
import { settlementMaxHealth } from '../combat/strength';
import {
  type ActionHandler,
  type EngineContext,
  type Emit,
  type RuleError,
  turnOrder,
  unitClassOf,
  unitDef,
} from '../context';
import { percentOf, toFixed } from '../fixed';
import { eraOrderOf, perEra } from '../progress/era';
import { scaleCost } from '../speed';
import { placementTiles } from './districts';
import { payResources, resourceProblem, strategicTurn } from '../resources/strategic';
import { distance, tilesWithin } from '../map/hex';
import type { BuildItem, GameState, PlayerId, SettlementState } from '../state';
import { view } from '../draft';
import { empireTurn } from '../progress/handlers';
import { playerEffects, withSourceMemo } from '../progress/sources';
import { roadToCapital } from '../trade/handlers';
import { countsAs } from '../uniques';
import { ownedUnit, watchers } from '../units/handlers';
import { canTraverse, hasForeignUnit, hasRoom } from '../units/movement';
import { obsoletedBy } from '../units/upgrades';
import { spaceStep } from '../science/space';
import { exploreVisible } from '../units/vision';
import {
  annexCost,
  assignCitizens,
  availableItems,
  borderCulture,
  borderThreshold,
  developCandidates,
  foundingProblem,
  growthPerTurn,
  growthThreshold,
  improvementsFor,
  canBuyWithFaith,
  isBuyable,
  itemCost,
  itemKey,
  itemProblem,
  lockedReason,
  nextBorderTile,
  productionToward,
  purchasableTiles,
  purchaseCost,
  puppetProblem,
  settlementIds,
  settlementYields,
  tilePurchaseCost,
  tileScore,
  tileYields,
  type YieldScope,
  townUpgradeCost,
  workableTiles,
} from './rules';

type A<T extends Action['type']> = Extract<Action, { type: T }>;

function ownedSettlement(
  state: GameState,
  player: PlayerId,
  id: string,
): SettlementState | RuleError {
  if (!state.players[player]?.alive)
    return { code: 'not_playing', message: `${player} is not playing` };
  const s = state.settlements[id];
  if (!s) return { code: 'no_such_settlement', message: 'That settlement no longer exists' };
  if (s.owner !== player) return { code: 'not_yours', message: "That isn't your settlement" };
  return s;
}

const isError = <T extends object>(x: T | RuleError): x is RuleError => 'code' in x;

const noGold = (cost: number): RuleError => ({
  code: 'not_enough_gold',
  message: `Not enough gold (needs ${Math.ceil(cost / 100)})`,
});

// --- Changes to the game state ---------------------------------------------------------------

function claim(draft: Draft<GameState>, tile: number, s: { id: string; owner: PlayerId }) {
  const t = draft.map.tiles[tile]!;
  t.settlement = s.id;
  t.owner = s.owner;
}

/** Re-picks the tiles a settlement's citizens work. */
export function refreshCitizens(draft: Draft<GameState>, ctx: EngineContext, id: string) {
  const snap = view(draft);
  const { worked, locked, specialists } = assignCitizens(ctx, snap, snap.settlements[id]!);
  const s = draft.settlements[id]!;
  s.worked = worked;
  s.locked = locked;
  s.specialists = specialists;
}

export function refreshExplored(draft: Draft<GameState>, ctx: EngineContext, player: PlayerId) {
  draft.players[player]!.explored = exploreVisible(ctx, view(draft), player);
}

/** Puts a new unit on (or as near as possible to) a tile. Returns its id, or undefined if no room. */
export function spawnUnit(
  draft: Draft<GameState>,
  ctx: EngineContext,
  owner: PlayerId,
  type: string,
  near: number,
): string | undefined {
  const snap = current(draft);
  const id = `u${snap.nextEntityId}`;
  const probe = { id, owner, type };
  const tile = tilesWithin(snap.map, near, 2).find(
    (t) =>
      canTraverse(ctx, snap, probe, t) &&
      hasRoom(ctx, snap, probe, t) &&
      !hasForeignUnit(snap, probe, t),
  );
  if (tile === undefined) return undefined;
  draft.units[id] = {
    ...probe,
    tile,
    moves: 0,
    health: ctx.content.rules.combat.maxHealth,
    xp: 0,
    orders: null,
    skippedTurn: null,
    promotions: [],
  };
  draft.nextEntityId++;
  return id;
}

/** Abilities that give a free unit when a district is finished (`free_unit_on_district`). */
function districtRewards(
  draft: Draft<GameState>,
  ctx: EngineContext,
  id: string,
  district: string,
) {
  const s = draft.settlements[id]!;
  const snap = view(draft);
  for (const { effect } of playerEffects(ctx, snap, s.owner, 'free_unit_on_district')) {
    const wanted = effect.params.district;
    const list = Array.isArray(wanted) ? wanted : [wanted];
    if (!list.some((d) => countsAs(ctx, 'district', district, d))) continue;
    const classes = effect.params.unitClass;
    const best = ctx.content.ids.unit
      .map((u) => ctx.content.entities.unit[u]!)
      .filter(
        (u) =>
          (Array.isArray(classes) ? classes.includes(u.class) : u.class === classes) &&
          !itemProblem(ctx, snap, snap.settlements[id]!, { kind: 'unit', id: u.id }),
      )
      .sort((a, b) => b.strength - a.strength || (a.id < b.id ? -1 : 1))[0];
    if (!best) continue;
    const unit = spawnUnit(draft, ctx, s.owner, best.id, s.tile);
    if (unit) trainedHere(draft, ctx, id, unit);
  }
}

/** A unit just trained in a settlement: count soldiers, and give promotions its effects grant. */
function trainedHere(draft: Draft<GameState>, ctx: EngineContext, id: string, unitId: string) {
  const s = draft.settlements[id]!;
  const u = draft.units[unitId]!;
  const cls = unitClassOf(ctx, u);
  const snap = view(draft);
  for (const { effect } of playerEffects(
    ctx,
    snap,
    s.owner,
    'grant_promotion',
    snap.settlements[id],
  )) {
    const p = effect.params;
    if (p.unitClass && !(Array.isArray(p.unitClass) ? p.unitClass : [p.unitClass]).includes(cls.id))
      continue;
    if (p.domain && cls.domain !== p.domain) continue;
    if (!u.promotions.includes(p.promotion)) u.promotions.push(p.promotion);
  }
  if (cls.combat) s.unitsTrained++;
}

/** Whether finishing (or buying) this item now would work: room for the unit, citizens to spare. */
/** Why a unit couldn't be finished (or bought) now: resources, citizens, room. */
export function completionProblem(
  ctx: EngineContext,
  state: GameState,
  s: SettlementState,
  item: BuildItem,
): RuleError | undefined {
  if (item.kind !== 'unit') return undefined;
  const def = ctx.content.entities.unit[item.id]!;
  // Its strategic resources must be in the stockpile when it's finished (it waits until they are).
  const short = resourceProblem(ctx, state, s.owner, item.id, true);
  if (short) return short;
  if (s.population - def.populationCost < 1) {
    return {
      code: 'needs_population',
      message: `${s.name} needs ${def.populationCost + 1} citizens to finish a ${resolveText(ctx.content, def.name)}`,
    };
  }
  const probe = { id: 'u0', owner: s.owner, type: item.id };
  const room = tilesWithin(state.map, s.tile, 2).some(
    (t) =>
      canTraverse(ctx, state, probe, t) &&
      hasRoom(ctx, state, probe, t) &&
      !hasForeignUnit(state, probe, t),
  );
  return room ? undefined : { code: 'no_room', message: `No room for the unit near ${s.name}` };
}

/** Clears a tile for a district or wonder: no improvement, and woods, rainforest, marsh go. */
function clearForBuilding(draft: Draft<GameState>, ctx: EngineContext, tile: number) {
  const t = draft.map.tiles[tile]!;
  t.improvement = null;
  if (t.feature !== null && ctx.content.entities.feature[t.feature]?.removable) t.feature = null;
}

/**
 * Someone finished a wonder: everyone else building it stops, and what they'd put into it comes
 * back as gold (docs/03, "World wonders").
 */
function wonderRace(draft: Draft<GameState>, winner: string, wonder: string, emit: Emit) {
  for (const id of settlementIds(draft)) {
    const s = draft.settlements[id]!;
    if (id === winner || !s.queue.some((q) => q.kind === 'wonder' && q.id === wonder)) continue;
    const key = itemKey({ kind: 'wonder', id: wonder });
    const gold = s.progress[key] ?? 0;
    delete s.progress[key];
    s.queue = s.queue.filter((q) => !(q.kind === 'wonder' && q.id === wonder));
    draft.players[s.owner]!.gold += gold;
    emit({
      type: 'wonder_lost',
      settlement: id,
      owner: s.owner,
      wonder,
      gold,
      visibleTo: [s.owner],
    });
  }
}

/** A finished project: the feature goes, and its reward lands where each yield belongs. */
function projectReward(
  draft: Draft<GameState>,
  ctx: EngineContext,
  id: string,
  item: BuildItem,
  emit: Emit,
): void {
  const s = draft.settlements[id]!;
  const def = ctx.content.entities.project[item.id]!;
  if (def.clears) {
    const t = draft.map.tiles[item.tile!]!;
    if (t.feature === null || !def.clears.includes(t.feature)) return;
    t.feature = null;
  }
  spaceStep(draft, ctx, s.owner, item.id, emit);
  const p = draft.players[s.owner]!;
  // Rewards keep pace with the game: scaled by speed like every cost, and by era where the
  // project says so (chopping). A share of the cost comes back as yields (district projects).
  const era = eraOrderOf(ctx, view(draft).players[s.owner]);
  const reward: Record<string, number> = {};
  for (const [y, v] of Object.entries(def.reward))
    reward[y] = perEra(scaleCost(ctx, draft, toFixed(v)), def.perEraPercent, era);
  const cost = itemCost(ctx, view(draft), s.owner, item);
  for (const [y, percent] of Object.entries(def.costShare))
    reward[y] = (reward[y] ?? 0) + percentOf(cost, percent);
  for (const [y, amount] of Object.entries(reward).sort()) {
    if (y === 'food') s.food += amount;
    else if (y === 'gold') p.gold += amount;
    else if (y === 'faith') p.faith += amount;
    else if (y === 'influence') p.influence += amount;
    // Happiness from festivals goes toward the next celebration.
    else if (y === 'happiness') p.celebration.store += Math.floor(amount / 100);
    else if (y === 'production') {
      // Toward whatever comes next; with nothing queued it's sold for gold.
      const next = s.queue[0];
      if (next) s.progress[itemKey(next)] = (s.progress[itemKey(next)] ?? 0) + amount;
      else p.gold += amount;
    } else if (y === 'science' || y === 'culture') {
      const track = y === 'science' ? p.techs : p.civics;
      if (track.current)
        track.progress[track.current] = (track.progress[track.current] ?? 0) + amount;
      else track.stored += amount;
    }
  }
  // Great person points, for a race the player is still in (a religion's founder is out of the
  // prophet race).
  const gp = def.greatPersonPoints;
  const out = gp && ctx.content.entities.greatPersonClass[gp.class]?.foundsReligion && p.religion;
  if (gp && !out) {
    const points = (draft.greatPeople.points[s.owner] ??= {});
    points[gp.class] = (points[gp.class] ?? 0) + Math.floor(percentOf(cost, gp.percent) / 100);
  }
}

/** Finishes an item: the head of the queue (`fromQueue`) or a purchase. */
function complete(
  draft: Draft<GameState>,
  ctx: EngineContext,
  id: string,
  item: BuildItem,
  fromQueue: boolean,
  emit: Emit,
) {
  const s = draft.settlements[id]!;
  if (fromQueue) s.queue.shift();
  switch (item.kind) {
    case 'unit': {
      const unit = spawnUnit(draft, ctx, s.owner, item.id, s.tile);
      payResources(draft, ctx, s.owner, item.id);
      s.population -= ctx.content.entities.unit[item.id]!.populationCost;
      if (unit) trainedHere(draft, ctx, id, unit);
      break;
    }
    case 'building':
      s.buildings.push(item.id);
      s.walls += ctx.content.entities.building[item.id]?.walls ?? 0;
      // A building can only be had once: drop it from the rest of the queue.
      s.queue = s.queue.filter((q) => itemKey(q) !== itemKey(item));
      delete s.progress[itemKey(item)];
      break;
    case 'district':
      clearForBuilding(draft, ctx, item.tile!);
      draft.map.tiles[item.tile!]!.district = item.id;
      s.districts.push({ id: item.id, tile: item.tile! });
      s.locked = s.locked.filter((t) => t !== item.tile);
      districtRewards(draft, ctx, id, item.id);
      break;
    case 'wonder':
      clearForBuilding(draft, ctx, item.tile!);
      draft.map.tiles[item.tile!]!.wonder = item.id;
      s.wonders.push(item.id);
      s.locked = s.locked.filter((t) => t !== item.tile);
      wonderRace(draft, id, item.id, emit);
      emit({
        type: 'wonder_completed',
        settlement: id,
        owner: s.owner,
        wonder: item.id,
        tile: item.tile!,
        visibleTo: 'all',
      });
      break;
    case 'project':
      projectReward(draft, ctx, id, item, emit);
      break;
  }
}

/** Founds a settlement for `player` on `tile` (the caller has checked it's allowed). */
export function foundSettlement(
  draft: Draft<GameState>,
  ctx: EngineContext,
  player: PlayerId,
  tile: number,
  emit: Emit,
): string {
  const rules = ctx.content.rules.settlements;
  const p = draft.players[player]!;
  const civ = ctx.content.entities.civ[p.civ];
  const taken = new Set(Object.values(draft.settlements).map((s) => s.name));
  const names = (civ?.cityNames ?? []).map((n) => resolveText(ctx.content, n));
  const name =
    names.slice(p.settlementsFounded).find((n) => !taken.has(n)) ??
    names.find((n) => !taken.has(n)) ??
    `${civ ? resolveText(ctx.content, civ.adjective) : p.name} settlement ${p.settlementsFounded + 1}`;
  const id = `s${draft.nextEntityId++}`;
  const capital = p.capital === null;
  draft.settlements[id] = {
    id,
    owner: player,
    name,
    tile,
    kind: capital ? 'city' : 'town',
    capital,
    founded: draft.turn,
    population: 1,
    food: 0,
    culture: 0,
    tilesAcquired: 0,
    progress: {},
    queue: [],
    buildings: capital ? [rules.capitalBuilding] : [],
    worked: [],
    locked: [],
    focus: 'balanced',
    pendingDevelop: 0,
    districts: [],
    wonders: [],
    specialists: {},
    specialization: null,
    specializationChanges: 0,
    health: settlementMaxHealth(ctx, capital ? 'city' : 'town'),
    walls: 0,
    attackedTurn: null,
    struckTurn: null,
    founder: player,
    originalCapital: capital,
    capturedFrom: null,
    captureChoice: false,
    unitsTrained: 0,
    religion: null,
    pressure: {},
  };
  roadToCapital(draft, ctx, player, tile);
  // Abilities that give every new settlement a building (if it can have it).
  const fresh = draft.settlements[id]!;
  for (const { effect } of playerEffects(ctx, view(draft), player, 'free_building')) {
    const b = effect.params.building;
    const def = ctx.content.entities.building[b];
    if (def && !fresh.buildings.includes(b) && (!def.cityOnly || fresh.kind === 'city'))
      fresh.buildings.push(b);
  }
  // A later-era game (setup "Start era"): settlements start bigger and with the era's basics.
  const era = draft.settings.startEra
    ? ctx.content.entities.era[draft.settings.startEra]
    : undefined;
  if (era?.start) {
    for (const b of era.start.buildings) {
      const def = ctx.content.entities.building[b];
      if (!def || def.district || fresh.buildings.includes(b) || (def.cityOnly && !capital))
        continue;
      fresh.buildings.push(b);
      fresh.walls += def.walls;
    }
    fresh.population += era.start.population;
    fresh.pendingDevelop += era.start.population;
  }
  if (capital) p.capital = id;
  p.settlementsFounded++;
  const s = { id, owner: player };
  claim(draft, tile, s);
  // The center is cleared: no improvement, and woods, rainforest or marsh are removed.
  const center = draft.map.tiles[tile]!;
  center.improvement = null;
  if (center.feature !== null && ctx.content.entities.feature[center.feature]?.removable) {
    center.feature = null;
  }
  for (const t of tilesWithin(draft.map, tile, rules.startingRadius)) {
    if (draft.map.tiles[t]!.owner === null) claim(draft, t, s);
  }
  refreshCitizens(draft, ctx, id);
  refreshExplored(draft, ctx, player);
  emit({
    type: 'settlement_founded',
    settlement: id,
    owner: player,
    tile,
    name,
    visibleTo: watchers(ctx, view(draft), player, [tile]),
  });
  return id;
}

function develop(
  draft: Draft<GameState>,
  ctx: EngineContext,
  id: string,
  tile: number,
  improvement: string,
  emit: Emit,
) {
  const s = draft.settlements[id]!;
  const t = draft.map.tiles[tile]!;
  t.improvement = improvement;
  if (t.owner === null) claim(draft, tile, s);
  s.pendingDevelop = Math.max(0, s.pendingDevelop - 1);
  refreshCitizens(draft, ctx, id);
  emit({
    type: 'tile_developed',
    settlement: id,
    owner: s.owner,
    tile,
    improvement,
    visibleTo: [s.owner],
  });
}

/**
 * Resource tiles developed before their own improvement was known get it once it is (a farm on
 * wine becomes a plantation the turn Irrigation arrives), like Civ VII placing the right
 * improvement on a resource. Runs at the start of each settlement's turn.
 */
export function upgradeResourceTiles(
  draft: Draft<GameState>,
  ctx: EngineContext,
  id: string,
  emit: Emit,
) {
  const s = draft.settlements[id]!;
  const snap = view(draft);
  for (const t of tilesWithin(draft.map, s.tile, ctx.content.rules.settlements.ownRadius)) {
    const tile = draft.map.tiles[t]!;
    if (tile.settlement !== id || tile.resource === null || tile.improvement === null) continue;
    if (ctx.content.entities.improvement[tile.improvement]?.resources.includes(tile.resource))
      continue;
    const better = improvementsFor(ctx, snap, t, s.owner)[0];
    if (!better || !ctx.content.entities.improvement[better]!.resources.includes(tile.resource))
      continue;
    tile.improvement = better;
    emit({
      type: 'tile_developed',
      settlement: id,
      owner: s.owner,
      tile: t,
      improvement: better,
      visibleTo: [s.owner],
    });
  }
}

/**
 * What developing a tile with an improvement is worth beyond its yields: an improved luxury
 * cheers several settlements and a strategic resource fills a stockpile, so growth (and
 * auto-develop) reaches for them first, as a player would.
 */
function resourceBonus(ctx: EngineContext, tile: number, improvement: string, state: GameState) {
  const t = state.map.tiles[tile]!;
  if (t.resource === null) return 0;
  if (!ctx.content.entities.improvement[improvement]!.resources.includes(t.resource)) return 0;
  const res = ctx.content.entities.resource[t.resource]!;
  const w = ctx.content.rules.settlements.citizenWeights;
  const reach = 1 + ctx.content.rules.luxuryHappinessRadius;
  if (res.class === 'luxury') return res.happiness * 100 * (w.happiness ?? 10) * reach;
  if (res.class === 'strategic') return (res.stockpilePerTurn || 1) * 100 * 20;
  return 0;
}

/** The develop choice auto-play makes: the tile that gains the most, with its first improvement. */
export function bestDevelopChoice(
  ctx: EngineContext,
  state: GameState,
  s: SettlementState,
): { tile: number; improvement: string } | undefined {
  return withSourceMemo(state, () => chooseDevelopment(ctx, state, s));
}

function chooseDevelopment(
  ctx: EngineContext,
  state: GameState,
  s: SettlementState,
): { tile: number; improvement: string } | undefined {
  let best: { tile: number; improvement: string; score: number } | undefined;
  const scope: YieldScope = new Map();
  for (const tile of developCandidates(ctx, state, s)) {
    // Every improvement that fits, best match first (a resource's improvement wins ties).
    for (const improvement of improvementsFor(ctx, state, tile, s.owner)) {
      const yields = { ...tileYields(ctx, state, tile, s.owner, scope).total };
      const extra = ctx.content.entities.improvement[improvement]!.yields;
      for (const [y, v] of Object.entries(extra)) yields[y] = (yields[y] ?? 0) + toFixed(v);
      const score = tileScore(ctx, yields, s.focus) + resourceBonus(ctx, tile, improvement, state);
      if (!best || score > best.score) best = { tile, improvement, score };
    }
  }
  return best && { tile: best.tile, improvement: best.improvement };
}

// --- Actions ---------------------------------------------------------------------------------

function settlementAction<T extends Action['type']>(
  check: (
    s: SettlementState,
    state: GameState,
    action: A<T>,
    ctx: EngineContext,
  ) => RuleError | undefined,
  apply: (draft: Draft<GameState>, action: A<T>, ctx: EngineContext, emit: Emit) => void,
): ActionHandler<A<T>> {
  return {
    validate(state, action, ctx) {
      const a = action as unknown as { type: string; player: string; settlement: string };
      const s = ownedSettlement(state, a.player, a.settlement);
      if (isError(s)) return s;
      // A puppet runs itself: only renaming and annexing it are up to its owner.
      if (a.type !== 'rename_settlement' && a.type !== 'annex_puppet') {
        const puppet = puppetProblem(s);
        if (puppet) return puppet;
      }
      return check(s, state, action, ctx);
    },
    apply,
  };
}

export const settlementHandlers = {
  found_settlement: {
    validate(state, action, ctx) {
      const unit = ownedUnit(state, action.player, action.unit);
      if ('code' in unit) return unit;
      if (!unitDef(ctx, unit).actions.includes('found_settlement'))
        return { code: 'cannot_found', message: "This unit can't found settlements" };
      if (unit.moves <= 0)
        return { code: 'no_moves', message: 'The settler has no moves left this turn' };
      return foundingProblem(ctx, state, action.player, unit.tile);
    },
    apply(draft, action, ctx, emit) {
      const unit = draft.units[action.unit]!;
      const tile = unit.tile;
      delete draft.units[action.unit];
      foundSettlement(draft, ctx, action.player, tile, emit);
    },
  } satisfies ActionHandler<A<'found_settlement'>>,

  set_queue: settlementAction<'set_queue'>(
    (s, state, action, ctx) => {
      if (s.kind === 'town')
        return {
          code: 'town',
          message: 'Towns turn production into gold; upgrade to a city to build',
        };
      const seen = new Set<string>();
      for (const item of action.queue) {
        const problem = itemProblem(ctx, state, s, item, action.queue);
        if (problem) return problem;
        const key = item.kind === 'unit' ? '' : itemKey(item);
        if (key && seen.has(key))
          return { code: 'duplicate', message: 'That is already in the queue' };
        seen.add(key);
        if (item.kind !== 'unit' && item.kind !== 'building' && item.tile === undefined)
          return { code: 'bad_placement', message: 'Pick a tile for it' };
      }
      return undefined;
    },
    (draft, action) => {
      draft.settlements[action.settlement]!.queue = action.queue;
    },
  ),

  buy_item: settlementAction<'buy_item'>(
    (s, state, action, ctx) => {
      if (!isBuyable(action.item))
        return { code: 'not_buyable', message: "Districts, wonders and projects can't be bought" };
      const problem =
        itemProblem(ctx, state, s, action.item) ?? completionProblem(ctx, state, s, action.item);
      if (problem) return problem;
      const cost = purchaseCost(ctx, state, action.player, action.item, s);
      const p = state.players[action.player]!;
      if (action.currency === 'faith') {
        if (!canBuyWithFaith(ctx, state, action.player, action.item))
          return { code: 'no_faith_purchase', message: "That can't be bought with faith" };
        return p.faith < cost
          ? { code: 'no_faith', message: `Needs ${Math.ceil(cost / 100)} faith` }
          : undefined;
      }
      return p.gold < cost ? noGold(cost) : undefined;
    },
    (draft, action, ctx, emit) => {
      const snap = view(draft);
      const cost = purchaseCost(
        ctx,
        snap,
        action.player,
        action.item,
        snap.settlements[action.settlement],
      );
      if (action.currency === 'faith') draft.players[action.player]!.faith -= cost;
      else draft.players[action.player]!.gold -= cost;
      complete(draft, ctx, action.settlement, action.item, false, emit);
      refreshCitizens(draft, ctx, action.settlement);
      emit({
        type: 'item_bought',
        settlement: action.settlement,
        owner: action.player,
        item: action.item,
        visibleTo: [action.player],
      });
    },
  ),

  develop_tile: settlementAction<'develop_tile'>(
    (s, state, action, ctx) => {
      if (s.pendingDevelop <= 0)
        return { code: 'no_growth', message: 'Tiles are developed when the settlement grows' };
      if (!developCandidates(ctx, state, s).includes(action.tile))
        return { code: 'bad_tile', message: "That tile can't be developed by this settlement" };
      if (!improvementsFor(ctx, state, action.tile, action.player).includes(action.improvement))
        return { code: 'bad_improvement', message: "That improvement can't go on this tile" };
      return undefined;
    },
    (draft, action, ctx, emit) => {
      develop(draft, ctx, action.settlement, action.tile, action.improvement, emit);
    },
  ),

  set_focus: settlementAction<'set_focus'>(
    () => undefined,
    (draft, action, ctx) => {
      draft.settlements[action.settlement]!.focus = action.focus;
      refreshCitizens(draft, ctx, action.settlement);
    },
  ),

  lock_tile: settlementAction<'lock_tile'>(
    (s, state, action, ctx) =>
      workableTiles(ctx, state, s).includes(action.tile)
        ? undefined
        : { code: 'bad_tile', message: "This settlement can't work that tile" },
    (draft, action, ctx) => {
      const s = draft.settlements[action.settlement]!;
      const others = s.locked.filter((t) => t !== action.tile);
      s.locked = action.locked ? [...others, action.tile].slice(-s.population) : others;
      refreshCitizens(draft, ctx, action.settlement);
    },
  ),

  buy_tile: settlementAction<'buy_tile'>(
    (s, state, action, ctx) => {
      if (!purchasableTiles(ctx, state, s).includes(action.tile))
        return { code: 'bad_tile', message: "That tile can't be bought by this settlement" };
      const cost = tilePurchaseCost(ctx, state, s, action.tile);
      return state.players[action.player]!.gold < cost ? noGold(cost) : undefined;
    },
    (draft, action, ctx) => {
      const snap = view(draft);
      const s = draft.settlements[action.settlement]!;
      draft.players[action.player]!.gold -= tilePurchaseCost(
        ctx,
        snap,
        snap.settlements[s.id]!,
        action.tile,
      );
      claim(draft, action.tile, s);
      s.tilesAcquired++;
      refreshCitizens(draft, ctx, s.id);
      refreshExplored(draft, ctx, s.owner);
    },
  ),

  upgrade_town: settlementAction<'upgrade_town'>(
    (s, state, action, ctx) => {
      if (s.kind !== 'town')
        return { code: 'already_city', message: `${s.name} is already a city` };
      const cost = townUpgradeCost(ctx, state, action.player);
      return state.players[action.player]!.gold < cost ? noGold(cost) : undefined;
    },
    (draft, action, ctx, emit) => {
      draft.players[action.player]!.gold -= townUpgradeCost(ctx, view(draft), action.player);
      const s = draft.settlements[action.settlement]!;
      s.kind = 'city';
      s.health += settlementMaxHealth(ctx, 'city') - settlementMaxHealth(ctx, 'town');
      // Cities don't specialize: they build.
      draft.settlements[action.settlement]!.specialization = null;
      emit({
        type: 'town_upgraded',
        settlement: action.settlement,
        owner: action.player,
        visibleTo: 'all',
      });
    },
  ),

  set_specialization: settlementAction<'set_specialization'>(
    (s, state, action, ctx) => {
      const rules = ctx.content.rules.settlements.specialization;
      if (s.kind !== 'town') return { code: 'not_town', message: 'Only towns specialize' };
      if (action.specialization === s.specialization)
        return { code: 'already', message: 'That is already its specialization' };
      if (action.specialization !== null) {
        const def = ctx.content.entities.specialization[action.specialization];
        if (!def) return { code: 'unknown', message: 'Unknown specialization' };
        const locked = lockedReason(ctx, state, s.owner, def);
        if (locked) return { code: 'locked', message: locked };
        if (s.population < rules.minPopulation)
          return {
            code: 'too_small',
            message: `Towns specialize at ${rules.minPopulation} citizens`,
          };
      }
      const cost = s.specializationChanges > 0 ? toFixed(rules.changeCost) : 0;
      return state.players[action.player]!.gold < cost ? noGold(cost) : undefined;
    },
    (draft, action, ctx) => {
      const s = draft.settlements[action.settlement]!;
      if (s.specializationChanges > 0)
        draft.players[action.player]!.gold -= toFixed(
          ctx.content.rules.settlements.specialization.changeCost,
        );
      s.specialization = action.specialization;
      if (action.specialization !== null) s.specializationChanges++;
      refreshCitizens(draft, ctx, action.settlement);
    },
  ),

  annex_puppet: settlementAction<'annex_puppet'>(
    (s, state, action, ctx) => {
      if (!s.puppet) return { code: 'not_puppet', message: `${s.name} isn't a puppet` };
      const cost = annexCost(ctx, state, s);
      if (state.players[action.player]!.gold < cost)
        return { code: 'no_gold', message: `Needs ${Math.ceil(cost / 100)} gold` };
      return undefined;
    },
    (draft, action, ctx) => {
      const s = draft.settlements[action.settlement]!;
      draft.players[action.player]!.gold -= annexCost(ctx, view(draft), s);
      s.puppet = false;
    },
  ),
  rename_settlement: settlementAction<'rename_settlement'>(
    () => undefined,
    (draft, action) => {
      draft.settlements[action.settlement]!.name = action.name;
    },
  ),
} satisfies {
  [
    T in
      | 'found_settlement'
      | 'set_queue'
      | 'buy_item'
      | 'develop_tile'
      | 'set_focus'
      | 'lock_tile'
      | 'buy_tile'
      | 'upgrade_town'
      | 'set_specialization'
      | 'annex_puppet'
      | 'rename_settlement'
  ]: ActionHandler<A<T>>;
};

// --- Turn processing -------------------------------------------------------------------------

/** The owner's nearest city within the send range of a specialized town (ties: oldest first). */
function nearestCity(ctx: EngineContext, state: GameState, s: SettlementState): string | undefined {
  const range = ctx.content.rules.settlements.specialization.sendRange;
  let best: { id: string; d: number } | undefined;
  for (const id of settlementIds(state)) {
    const c = state.settlements[id]!;
    if (c.owner !== s.owner || c.kind !== 'city' || c.id === s.id) continue;
    const d = distance(state.map, s.tile, c.tile);
    if (d <= range && (!best || d < best.d)) best = { id, d };
  }
  return best?.id;
}

/** What a settlement's turn adds to its owner's empire-wide totals. */
interface SettlementTurn {
  science: number;
  culture: number;
  tourism: number;
  happiness: number;
}

export function processSettlement(
  draft: Draft<GameState>,
  ctx: EngineContext,
  id: string,
  emit: Emit,
): SettlementTurn {
  const rules = ctx.content.rules.settlements;
  const s = draft.settlements[id]!;
  const owner = s.owner;
  const player = draft.players[owner]!;

  upgradeResourceTiles(draft, ctx, id, emit);
  // Growth choices nobody made (an AI seat, or the turn timer ran out) are made automatically.
  while (s.pendingDevelop > 0) {
    const snap = view(draft);
    const choice = bestDevelopChoice(ctx, snap, snap.settlements[id]!);
    if (!choice) {
      s.pendingDevelop = 0;
      break;
    }
    develop(draft, ctx, id, choice.tile, choice.improvement, emit);
  }
  refreshCitizens(draft, ctx, id);

  const snap = view(draft);
  const y = settlementYields(ctx, snap, snap.settlements[id]!);
  const population = s.population;
  const acquired = s.tilesAcquired;
  const production = y.total.production ?? 0;

  // Gold, faith and upkeep.
  player.gold += y.total.gold ?? 0;
  player.faith += y.total.faith ?? 0;
  for (const b of s.buildings)
    player.gold -= toFixed(ctx.content.entities.building[b]!.maintenance);

  // A specialized town may send part of its food or production to its nearest city.
  const spec = s.specialization ? ctx.content.entities.specialization[s.specialization] : undefined;
  const city = spec?.send ? nearestCity(ctx, snap, snap.settlements[id]!) : undefined;
  const sendShare = (amount: number) =>
    spec?.send && city && amount > 0 ? percentOf(amount, spec.send.percent) : 0;

  // Production: cities build, towns sell it for gold.
  if (s.kind === 'town') {
    const sent = spec?.send?.yield === 'production' ? sendShare(production) : 0;
    if (sent > 0 && city) {
      const target = draft.settlements[city]!;
      const next = target.queue[0];
      if (next) target.progress[itemKey(next)] = (target.progress[itemKey(next)] ?? 0) + sent;
      else player.gold += sent;
    }
    player.gold += percentOf(production - sent, rules.townGoldPercent);
  } else {
    // A unit that's been replaced by a newer one becomes that one, keeping its progress.
    for (const [i, q] of s.queue.entries()) {
      const newer = q.kind === 'unit' ? obsoletedBy(ctx, snap, owner, q.id) : undefined;
      if (!newer) continue;
      const done = s.progress[itemKey(q)];
      delete s.progress[itemKey(q)];
      s.queue[i] = { kind: 'unit', id: newer };
      if (done) s.progress[itemKey(s.queue[i]!)] = (s.progress[itemKey(s.queue[i]!)] ?? 0) + done;
    }
    while (s.queue.length > 0 && itemProblem(ctx, snap, s, s.queue[0]!)) s.queue.shift();
    if (s.puppet && s.queue.length === 0) {
      const next = puppetBuild(ctx, snap, snap.settlements[id]!);
      if (next) s.queue.push(next);
    }
    // A plain copy: events outlive the draft.
    const first = s.queue[0];
    const head: BuildItem | undefined = first && {
      kind: first.kind,
      id: first.id,
      ...(first.tile !== undefined ? { tile: first.tile } : {}),
    };
    if (!head) {
      // Nothing to build: the production isn't lost, it's sold for gold like a town's.
      if (production > 0) {
        player.gold += percentOf(production, rules.townGoldPercent);
        emit({ type: 'production_idle', settlement: id, owner, visibleTo: [owner] });
      }
    } else {
      const key = itemKey(head);
      s.progress[key] =
        (s.progress[key] ?? 0) +
        productionToward(ctx, snap, snap.settlements[id]!, head, production);
      const cost = itemCost(ctx, snap, owner, head, snap.settlements[id]!);
      if (s.progress[key]! >= cost && !completionProblem(ctx, current(draft), s, head)) {
        const overflow = s.progress[key]! - cost;
        delete s.progress[key];
        complete(draft, ctx, id, head, true, emit);
        emit({ type: 'item_completed', settlement: id, owner, item: head, visibleTo: [owner] });
        const next = s.queue[0];
        if (next && overflow > 0) {
          s.progress[itemKey(next)] = (s.progress[itemKey(next)] ?? 0) + overflow;
        } else if (overflow > 0) {
          // Nothing queued after it: the overflow is sold for gold rather than lost.
          player.gold += percentOf(overflow, rules.townGoldPercent);
        }
      }
    }
  }

  // Food: grow (and earn a develop choice) or starve.
  const growth = growthPerTurn(ctx, snap, snap.settlements[id]!, y);
  const foodSent = spec?.send?.yield === 'food' ? sendShare(growth) : 0;
  if (foodSent > 0 && city) draft.settlements[city]!.food += foodSent;
  s.food += growth - foodSent;
  const needed = growthThreshold(ctx, draft, s.population);
  if (s.food >= needed) {
    s.food -= needed;
    s.population++;
    const after = view(draft);
    if (developCandidates(ctx, after, after.settlements[id]!).length > 0) s.pendingDevelop++;
    emit({
      type: 'settlement_grew',
      settlement: id,
      owner,
      population: s.population,
      visibleTo: [owner],
    });
  } else if (s.food < 0) {
    s.food = 0;
    if (s.population > 1) {
      s.population--;
      emit({
        type: 'settlement_starved',
        settlement: id,
        owner,
        population: s.population,
        visibleTo: [owner],
      });
    }
  }

  // Culture: borders grow by one tile each time the store fills.
  s.culture += borderCulture(ctx, snap, snap.settlements[id]!, y.total.culture ?? 0);
  const threshold = borderThreshold(ctx, draft, s.tilesAcquired);
  if (s.culture >= threshold) {
    const after = view(draft);
    const tile = nextBorderTile(ctx, after, after.settlements[id]!);
    if (tile !== undefined) {
      s.culture -= threshold;
      s.tilesAcquired++;
      claim(draft, tile, s);
      emit({ type: 'border_grew', settlement: id, owner, tile, visibleTo: 'all' });
    }
  }
  // Re-pick worked tiles only if the population or territory changed this turn.
  if (s.population !== population || s.tilesAcquired !== acquired) refreshCitizens(draft, ctx, id);
  return {
    science: y.total.science ?? 0,
    culture: y.total.culture ?? 0,
    tourism: y.total.tourism ?? 0,
    happiness: y.happiness.balance,
  };
}

/**
 * What a puppet builds by itself (it runs on its own, like Civ V's): the building with the most
 * yield for its cost, else a district project, never units, districts or wonders.
 */
function puppetBuild(
  ctx: EngineContext,
  state: GameState,
  s: SettlementState,
): BuildItem | undefined {
  const items = availableItems(ctx, state, s);
  let best: { item: BuildItem; score: number } | undefined;
  for (const item of items) {
    if (item.kind !== 'building') continue;
    const def = ctx.content.entities.building[item.id]!;
    if (def.walls > 0) continue;
    const value =
      Object.values(def.yields).reduce((a, b) => a + b, 0) + 2 * def.happiness - def.maintenance;
    if (value <= 0) continue;
    const score = Math.floor((value * 10_000) / Math.max(1, def.cost));
    if (!best || score > best.score) best = { item, score };
  }
  if (best) return best.item;
  for (const item of items) {
    if (item.kind !== 'project') continue;
    const def = ctx.content.entities.project[item.id]!;
    if (!def.repeatable || def.clears || def.speedsExpedition) continue;
    const tile = placementTiles(ctx, state, s, 'project', item.id)[0];
    if (tile !== undefined) return { kind: 'project', id: item.id, tile };
  }
  return undefined;
}

/** A settlement being razed loses a citizen; at none, it's gone and its land is free. */
function burnDown(draft: Draft<GameState>, ctx: EngineContext, id: string, emit: Emit) {
  const s = draft.settlements[id]!;
  s.population -= 1;
  if (s.population > 0) {
    refreshCitizens(draft, ctx, id);
    return;
  }
  for (const t of draft.map.tiles) {
    if (t.settlement !== id) continue;
    t.settlement = null;
    t.owner = null;
    t.district = null;
  }
  delete draft.settlements[id];
  emit({
    type: 'settlement_razed',
    settlement: id,
    name: s.name,
    by: s.owner,
    tile: s.tile,
    visibleTo: 'all',
  });
}

/**
 * Each player in turn: every settlement's turn (founding order), then the empire's: upkeep,
 * research, civics, celebrations and boosts.
 */
export function settlementsTurn(draft: Draft<GameState>, ctx: EngineContext, emit: Emit) {
  for (const player of turnOrder(draft)) {
    const p = draft.players[player]!;
    if (!p.alive) continue;
    const totals = { science: 0, culture: 0, tourism: 0, happiness: 0 };
    for (const id of settlementIds(draft)) {
      if (draft.settlements[id]!.owner !== player) continue;
      if (draft.settlements[id]!.razing) {
        burnDown(draft, ctx, id, emit);
        continue;
      }
      const t = processSettlement(draft, ctx, id, emit);
      totals.science += t.science;
      totals.culture += t.culture;
      totals.tourism += t.tourism;
      totals.happiness += t.happiness;
    }
    empireTurn(draft, ctx, player, totals, emit);
    strategicTurn(draft, ctx, player, view(draft), emit);
    refreshExplored(draft, ctx, player);
  }
}
