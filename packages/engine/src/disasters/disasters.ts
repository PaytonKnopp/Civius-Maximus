import { type DisasterDef, resolveText } from '@cx/content';
import { castDraft, current, type Draft } from 'immer';
import { decodeBits, getBit } from '../bitset';
import type { Emit, EngineContext } from '../context';
import { killUnit } from '../combat/handlers';
import { neighbors, tilesWithin } from '../map/hex';
import { makeRandom } from '../map/random';
import { refreshCitizens } from '../settlements/handlers';
import { settlementIds, tileOnRiver } from '../settlements/rules';
import type { GameState, PlayerId } from '../state';
import { canTraverse, hasForeignUnit, hasRoom, isWater, unitsOn } from '../units/movement';

/**
 * Climate and disasters (docs/04-advanced-systems.md, "Climate & disasters"), after Civ VI's
 * Gathering Storm. Each turn every kind of disaster may strike somewhere it can (floods on
 * floodplains, eruptions at volcanoes...): it damages improvements for a few turns and hurts
 * units, but often leaves the land richer. Industry's emissions add up; each climate phase
 * they reach makes disasters likelier and puts more low coastal land under the sea.
 */

export const disastersOn = (state: Pick<GameState, 'settings'>) =>
  state.settings.disasters !== false;

/** World emissions a turn: every settlement's buildings. */
export function emissionsPerTurn(ctx: EngineContext, state: GameState): Record<PlayerId, number> {
  const out: Record<PlayerId, number> = {};
  for (const id of settlementIds(state)) {
    const s = state.settlements[id]!;
    let n = 0;
    for (const b of s.buildings) n += ctx.content.entities.building[b]?.emissions ?? 0;
    if (n > 0) out[s.owner] = (out[s.owner] ?? 0) + n;
  }
  return out;
}

/** The climate phase now (0 = none yet), and the next one's threshold. */
export function climateOf(ctx: EngineContext, state: GameState) {
  const phases = ctx.content.rules.climate.phases;
  const c = state.climate ?? { emissions: 0, phase: 0 };
  const now = c.phase > 0 ? phases[c.phase - 1] : undefined;
  const next = phases[c.phase];
  return {
    emissions: c.emissions,
    phase: c.phase,
    name: now ? resolveText(ctx.content, now.name) : 'Stable',
    disasters: now?.disasters ?? 0,
    next: next ? { name: resolveText(ctx.content, next.name), at: next.at } : null,
  };
}

const asList = (v: string | string[] | undefined) =>
  v === undefined ? undefined : Array.isArray(v) ? v : [v];

/** Tiles where a disaster can start. */
function origins(ctx: EngineContext, state: GameState, def: DisasterDef, rivers: Set<number>) {
  const features = asList(def.origin.feature);
  const terrains = asList(def.origin.terrain);
  const out: number[] = [];
  state.map.tiles.forEach((t, i) => {
    if (isWater(ctx, state, i)) return;
    if (features && !(t.feature && features.includes(t.feature))) return;
    if (terrains && !terrains.includes(t.terrain)) return;
    if (def.origin.river !== undefined && rivers.has(i) !== def.origin.river) return;
    if (def.origin.coastal && !neighbors(state.map, i).some((n) => isWater(ctx, state, n))) return;
    out.push(i);
  });
  return out;
}

function riverTiles(state: GameState): Set<number> {
  const out = new Set<number>();
  state.map.tiles.forEach((_, i) => {
    if (tileOnRiver(state.map, i)) out.add(i);
  });
  return out;
}

/** Moves land units off a tile that's going under, or loses them. */
function evictLand(draft: Draft<GameState>, ctx: EngineContext, tile: number, emit: Emit) {
  const snap = current(draft);
  for (const u of unitsOn(snap, tile)) {
    const cls = ctx.content.entities.unitClass[ctx.content.entities.unit[u.type]!.class]!;
    if (cls.domain !== 'land') continue;
    const to = tilesWithin(snap.map, tile, 3).find(
      (t) =>
        t !== tile &&
        !isWater(ctx, snap, t) &&
        canTraverse(ctx, snap, u, t) &&
        hasRoom(ctx, snap, u, t) &&
        !hasForeignUnit(snap, u, t),
    );
    if (to === undefined) killUnit(draft, ctx, u.id, u.owner, emit);
    else {
      draft.units[u.id]!.tile = to;
      draft.units[u.id]!.orders = null;
    }
  }
}

/** Low coastal land that the sea can take: flat, next to water, nothing built that holds it. */
function lowlands(ctx: EngineContext, state: GameState): number[] {
  const centers = new Set(settlementIds(state).map((id) => state.settlements[id]!.tile));
  return state.map.tiles
    .map((t, i) => ({ t, i }))
    .filter(
      ({ t, i }) =>
        !isWater(ctx, state, i) &&
        t.elevation === 'flat' &&
        !centers.has(i) &&
        t.district === null &&
        t.wonder === null &&
        !(t.feature && ctx.content.entities.feature[t.feature]?.naturalWonder) &&
        neighbors(state.map, i).some((n) => {
          const w = state.map.tiles[n]!.terrain;
          return (
            w === ctx.content.rules.mapgen.coastTerrain ||
            w === ctx.content.rules.mapgen.oceanTerrain
          );
        }),
    )
    .map(({ i }) => i);
}

/** Emissions add up; a new phase raises the seas. */
function climateTurn(draft: Draft<GameState>, ctx: EngineContext, emit: Emit) {
  const phases = ctx.content.rules.climate.phases;
  if (phases.length === 0) return;
  const snap = current(draft);
  const total = Object.values(emissionsPerTurn(ctx, snap)).reduce((a, b) => a + b, 0);
  if (total === 0 && !draft.climate) return;
  const c = (draft.climate ??= { emissions: 0, phase: 0 });
  c.emissions += total;
  while (c.phase < phases.length && c.emissions >= phases[c.phase]!.at) {
    c.phase++;
    emit({ type: 'climate_phase', phase: c.phase, emissions: c.emissions, visibleTo: 'all' });
    flood(draft, ctx, phases[c.phase - 1]!.submerged, emit);
  }
}

/** Puts low coastal land under the sea until `percent` of what there was is gone. */
function flood(draft: Draft<GameState>, ctx: EngineContext, percent: number, emit: Emit) {
  const snap = current(draft);
  const land = lowlands(ctx, snap);
  const done = draft.climate!.submerged ?? 0;
  const want = Math.floor(((land.length + done) * percent) / 100) - done;
  if (want <= 0) return;
  const random = makeRandom(draft.rng as GameState['rng']);
  const sinking = random
    .shuffle([...land])
    .slice(0, want)
    .sort((a, b) => a - b);
  draft.rng = castDraft(random.state());
  const touched = new Set<string>();
  for (const i of sinking) {
    evictLand(draft, ctx, i, emit);
    const t = draft.map.tiles[i]!;
    t.terrain = ctx.content.rules.mapgen.coastTerrain;
    t.feature = null;
    t.resource = null;
    t.improvement = null;
    t.river = 0;
    delete t.pillaged;
    delete t.fertile;
    if (t.settlement) touched.add(t.settlement);
  }
  draft.climate!.submerged = done + sinking.length;
  for (const id of [...touched].sort()) if (draft.settlements[id]) refreshCitizens(draft, ctx, id);
  emit({ type: 'sea_level_rose', phase: draft.climate!.phase, tiles: sinking, visibleTo: 'all' });
}

/** One disaster: where it hits, and what it does there. */
function strike(
  draft: Draft<GameState>,
  ctx: EngineContext,
  def: DisasterDef,
  origin: number,
  emit: Emit,
) {
  const r = ctx.content.rules.disasters;
  const snap = current(draft);
  const spread = asList(def.spreadFeature);
  const tiles = tilesWithin(snap.map, origin, def.radius)
    .filter((i) => !isWater(ctx, snap, i))
    .filter((i) => i === origin || !spread || spread.includes(snap.map.tiles[i]!.feature ?? ''))
    .sort((a, b) => a - b);
  const random = makeRandom(draft.rng as GameState['rng']);
  let pillaged = 0;
  const hit = new Set<string>();
  for (const i of tiles) {
    const t = draft.map.tiles[i]!;
    if (
      t.improvement &&
      t.pillaged === undefined &&
      def.pillage > 0 &&
      random.chance(def.pillage)
    ) {
      t.pillaged = draft.turn + 1 + r.repairTurns;
      pillaged++;
    }
    for (const [y, v] of Object.entries(def.fertility).sort(([a], [b]) => (a < b ? -1 : 1))) {
      const f = (t.fertile ??= {});
      f[y] = Math.min(r.maxFertility, (f[y] ?? 0) + v);
    }
    if (def.damage > 0) {
      for (const u of unitsOn(snap, i)) {
        const d = draft.units[u.id];
        if (d) d.health = Math.max(1, d.health - def.damage);
      }
    }
    if (t.settlement) hit.add(t.settlement);
  }
  draft.rng = castDraft(random.state());
  const settlements = [...hit].sort();
  for (const id of settlements) {
    const s = draft.settlements[id];
    if (!s) continue;
    if (def.foodLoss > 0) s.food -= Math.trunc((s.food * def.foodLoss) / 100);
    if (def.populationLoss > 0 && tiles.includes(s.tile))
      s.population = Math.max(1, s.population - def.populationLoss);
  }
  for (const id of settlements) if (draft.settlements[id]) refreshCitizens(draft, ctx, id);
  const log = (draft.disasterLog ??= []);
  log.push({ turn: draft.turn, disaster: def.id, tile: origin });
  if (log.length > 30) log.splice(0, log.length - 30);
  const n = draft.map.tiles.length;
  const seen = draft.playerOrder.filter((p) =>
    getBit(decodeBits(draft.players[p]!.explored, n), origin),
  );
  emit({
    type: 'disaster',
    disaster: def.id,
    tile: origin,
    tiles,
    pillaged,
    settlements,
    visibleTo: seen,
  });
}

/**
 * Turn step: emissions and sea level, then any disasters this turn (damaged improvements are
 * repaired by `falloutTurn`, whatever the settings).
 */
export function disastersTurn(draft: Draft<GameState>, ctx: EngineContext, emit: Emit) {
  if (!disastersOn(draft) || draft.status !== 'playing') return;
  climateTurn(draft, ctx, emit);
  // A few quiet turns while the first settlements find their feet.
  if (draft.turn < 10) return;
  const r = ctx.content.rules.disasters;
  const boost = climateOf(ctx, current(draft)).disasters;
  let rivers: Set<number> | undefined;
  for (const id of ctx.content.ids.disaster) {
    const def = ctx.content.entities.disaster[id]!;
    const chance = Math.floor((def.chance * r.intensity * (100 + boost)) / 10_000);
    const random = makeRandom(draft.rng as GameState['rng']);
    const rolled = random.int(1000) < chance;
    draft.rng = castDraft(random.state());
    if (!rolled) continue;
    const snap = current(draft);
    rivers ??= riverTiles(snap);
    const where = origins(ctx, snap, def, rivers);
    if (where.length === 0) continue;
    const pick = makeRandom(draft.rng as GameState['rng']);
    const origin = pick.pick(where);
    draft.rng = castDraft(pick.state());
    strike(draft, ctx, def, origin, emit);
  }
}
