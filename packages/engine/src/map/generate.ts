import type { CompiledContent, MapScriptDef, TerrainDef } from '@cx/content';
import { computeTileYields } from '../effects/yields';
import { isqrt } from '../fixed';
import type { PlayerId } from '../state';
import {
  distance,
  type Grid,
  isOnRiver,
  neighbors,
  NO_TILE,
  colRow,
  setRiverEdge,
  directionTo,
  tilesWithin,
  vertexNeighbors,
  vertexTiles,
  type Vertex,
} from './hex';
import { noiseField } from './noise';
import type { Random } from './random';
import type { MapSettings, MapState, MapTile, StartBias } from './types';

export interface GenerateInput {
  content: CompiledContent;
  settings: MapSettings;
  /** Players in processing order, with their civ's start bias (if any). */
  players: { id: PlayerId; startBias?: readonly StartBias[] }[];
}

export interface GenerateResult {
  map: MapState;
  starts: Record<PlayerId, number>;
}

/** Thrown when a map can't fit the requested players (e.g. 12 players on a Duel map). */
export class MapGenerationError extends Error {}

/**
 * Generates a world. Deterministic: the same content, settings, players and random state always
 * produce the same map. Pipeline: landmass → elevation → water → climate & terrain → rivers →
 * features → resources → start positions.
 */
export function generateMap(input: GenerateInput, random: Random): GenerateResult {
  const { content, settings } = input;
  const chosen = content.entities.mapScript[settings.script];
  if (!chosen) throw new MapGenerationError(`Unknown map script "${settings.script}"`);
  // Shuffle: any other map type, picked by the seed.
  const others = content.ids.mapScript.filter(
    (id) => content.entities.mapScript[id]!.algorithm !== 'shuffle',
  );
  const base =
    chosen.algorithm === 'shuffle'
      ? content.entities.mapScript[others[random.int(others.length)]!]!
      : chosen;
  const script = worldAdjusted(base, settings, content);
  const size = content.entities.mapSize[settings.size];
  if (!size) throw new MapGenerationError(`Unknown map size "${settings.size}"`);

  const grid: Grid = { width: size.width, height: size.height, wrapX: settings.wrapX };
  const count = grid.width * grid.height;
  const seed = () => random.int(0x7fffffff);

  // 1. Landmass.
  const heights = landHeights(grid, script, random, seed);
  const land = pickTop(heights, script.landPercent, (i) => !isPolar(grid, i, content));
  const mg = content.rules.mapgen;

  // Inland lakes: flat-ish land tiles fully surrounded by land become water.
  const inland = indices(count).filter((i) => land[i] && neighbors(grid, i).every((n) => land[n]));
  random.shuffle(inland);
  const lakes = new Set<number>();
  for (const i of inland) {
    if (
      lakes.size >= Math.floor((inland.length * script.lakePercent) / (mg.landTilesPerLake * 100))
    )
      break;
    if (neighbors(grid, i).some((n) => lakes.has(n) || !land[n])) continue;
    lakes.add(i);
    land[i] = false;
  }

  // 2. Elevation.
  const ridges = noiseField(seed(), grid, 10, 3);
  const bumps = noiseField(seed(), grid, 16, 2);
  const landTiles = indices(count).filter((i) => land[i]);
  const mountainScore = (i: number) => ridges.at(...colRow(grid, i)) * 2 + heights[i]!;
  const mountains = topOf(landTiles, mountainScore, script.mountainPercent);
  const hillCandidates = landTiles.filter((i) => !mountains.has(i));
  const hills = topOf(hillCandidates, (i) => bumps.at(...colRow(grid, i)), script.hillPercent);

  // 3. Climate. Moisture is ranked across land, so terrain proportions are the same on every map.
  const world = worldShifts(settings, content);
  const tempNoise = noiseField(seed(), grid, 4, 3);
  const moistNoise = noiseField(seed(), grid, 6, 4);
  const moistRank = new Map<number, number>();
  const byMoisture = [...landTiles].sort(
    (a, b) => moistNoise.at(...colRow(grid, a)) - moistNoise.at(...colRow(grid, b)) || a - b,
  );
  byMoisture.forEach((t, k) =>
    moistRank.set(t, Math.floor((k * 100) / Math.max(1, byMoisture.length - 1))),
  );
  const climate = indices(count).map((i) => {
    const [col, row] = colRow(grid, i);
    const latitude = Math.floor(
      (Math.abs(row * 2 - (grid.height - 1)) * 100) / Math.max(1, grid.height - 1),
    );
    const temperature = clamp(
      100 - latitude + Math.floor(((tempNoise.at(col, row) - 512) * 18) / 512) + world.temperature,
      0,
      100,
    );
    const moisture = clamp(
      (moistRank.get(i) ?? Math.floor((moistNoise.at(col, row) * 100) / 1023)) + world.moisture,
      0,
      100,
    );
    return { latitude, temperature, moisture };
  });

  const landTerrains = content.ids.terrain
    .map((id) => content.entities.terrain[id]!)
    .filter((t) => !t.water && t.generation);
  const tiles: MapTile[] = indices(count).map((i) => {
    const c = climate[i]!;
    return {
      terrain: land[i]
        ? (chooseTerrain(landTerrains, c.temperature, c.moisture) ?? mg.fallbackLandTerrain)
        : mg.oceanTerrain,
      feature: null,
      elevation: !land[i]
        ? 'flat'
        : mountains.has(i)
          ? 'mountain'
          : hills.has(i)
            ? 'hills'
            : 'flat',
      resource: null,
      river: 0,
      owner: null,
      settlement: null,
      improvement: null,
      district: null,
      wonder: null,
    };
  });
  // Elevations a terrain doesn't allow fall back to flat (e.g. a mod terrain without hills).
  for (const t of tiles) {
    if (!content.entities.terrain[t.terrain]!.elevations.includes(t.elevation))
      t.elevation = 'flat';
  }

  // 4. Water: coast next to land, small enclosed bodies become lakes, the rest is ocean.
  for (const i of indices(count)) {
    if (!land[i] && neighbors(grid, i).some((n) => land[n])) tiles[i]!.terrain = mg.coastTerrain;
  }
  for (const body of components(grid, (i) => !land[i])) {
    if (body.length <= mg.maxLakeSize) for (const i of body) tiles[i]!.terrain = mg.lakeTerrain;
  }
  for (const i of lakes) tiles[i]!.terrain = mg.lakeTerrain;

  // 5. Rivers.
  const rivers = tiles.map(() => 0);
  generateRivers(
    grid,
    land,
    heights,
    rivers,
    Math.floor(landTiles.length / script.landTilesPerRiver),
    random,
  );
  tiles.forEach((t, i) => (t.river = rivers[i]!));

  // 6. Features.
  const features = content.ids.feature
    .map((id) => content.entities.feature[id]!)
    .filter((f) => f.generation)
    .sort((a, b) => a.generation!.order - b.generation!.order || (a.id < b.id ? -1 : 1));
  for (const i of indices(count)) {
    const t = tiles[i]!;
    if (t.elevation === 'mountain') continue;
    const c = climate[i]!;
    for (const f of features) {
      const g = f.generation!;
      if (!f.validTerrains.includes(t.terrain) || !f.validElevations.includes(t.elevation))
        continue;
      if (f.requiresRiver && !isOnRiver(grid, rivers, i)) continue;
      if (!inRange(g.temperature, c.temperature) || !inRange(g.moisture, c.moisture)) continue;
      if (!inRange(g.latitude, c.latitude)) continue;
      if (random.chance(Math.floor((g.chance * world.features) / 100))) {
        t.feature = f.id;
        break;
      }
    }
  }

  const map: MapState = { ...grid, tiles };

  // 7. Resources.
  placeResources(map, content, settings.resources, random);

  // 8. Start positions.
  const starts = placeStarts(map, content, script, input.players, settings.startBalance, random);

  // 9. Natural wonders, away from each other and from every start.
  placeNaturalWonders(map, content, size.naturalWonders, Object.values(starts), random);
  return { map, starts };
}

/** Climate shifts from the world settings (all zero, and 100% features, when standard). */
function worldShifts(settings: MapSettings, content: CompiledContent) {
  const w = content.rules.mapgen.world;
  return {
    temperature:
      !w || !settings.temperature || settings.temperature === 'standard'
        ? 0
        : w.temperature[settings.temperature],
    moisture:
      !w || !settings.rainfall || settings.rainfall === 'standard'
        ? 0
        : w.rainfall[settings.rainfall].moisture,
    features:
      !w || !settings.rainfall || settings.rainfall === 'standard'
        ? 100
        : w.rainfall[settings.rainfall].features,
  };
}

/** The map script with the world settings' land, mountain and hill changes applied. */
function worldAdjusted(
  script: MapScriptDef,
  settings: MapSettings,
  content: CompiledContent,
): MapScriptDef {
  const w = content.rules.mapgen.world;
  if (!w) return script;
  const age = settings.age && settings.age !== 'standard' ? w.age[settings.age] : null;
  const sea =
    settings.seaLevel && settings.seaLevel !== 'standard' ? w.seaLevel[settings.seaLevel] : 0;
  if (!age && !sea) return script;
  return {
    ...script,
    landPercent: clamp(script.landPercent + sea, 5, 90),
    mountainPercent: clamp(
      Math.floor((script.mountainPercent * (age?.mountains ?? 100)) / 100),
      0,
      50,
    ),
    hillPercent: clamp(Math.floor((script.hillPercent * (age?.hills ?? 100)) / 100), 0, 60),
  };
}

/** Places up to `count` natural wonders on tiles that suit them (docs/03, "Natural wonders"). */
function placeNaturalWonders(
  map: MapState,
  content: CompiledContent,
  count: number,
  starts: number[],
  random: Random,
) {
  const wonders = content.ids.feature
    .map((id) => content.entities.feature[id]!)
    .filter((f) => f.naturalWonder);
  if (count <= 0 || wonders.length === 0) return;
  const spacing = content.rules.mapgen.naturalWonderSpacing;
  const order = [...wonders];
  random.shuffle(order);
  const placed: number[] = [];
  const water = (i: number) => content.entities.terrain[map.tiles[i]!.terrain]?.water === true;
  for (const nw of order) {
    if (placed.length >= count) break;
    const fits = indices(map.tiles.length).filter((i) => {
      const t = map.tiles[i]!;
      if (t.settlement || (t.feature && content.entities.feature[t.feature]?.naturalWonder))
        return false;
      if (!nw.validTerrains.includes(t.terrain) || !nw.validElevations.includes(t.elevation))
        return false;
      const row = Math.floor(i / map.width);
      if (row < 2 || row >= map.height - 2) return false;
      if (nw.naturalWonder!.coastal && !neighbors(map, i).some(water)) return false;
      if (starts.some((s) => distance(map, s, i) < 3)) return false;
      return placed.every((p) => distance(map, p, i) >= spacing);
    });
    if (fits.length === 0) continue;
    const tile = fits[random.int(fits.length)]!;
    const t = map.tiles[tile]!;
    t.feature = nw.id;
    t.resource = null;
    placed.push(tile);
  }
}

// --- Landmass shapes ---------------------------------------------------------------------------

function landHeights(
  grid: Grid,
  script: MapScriptDef,
  random: Random,
  seed: () => number,
): number[] {
  const count = grid.width * grid.height;
  const base = noiseField(seed(), grid, script.detail, 5);
  const at = (i: number) => base.at(...colRow(grid, i));
  const maxDistance = Math.max(1, Math.floor(Math.min(grid.width / 2, grid.height) * 0.9));

  if (script.algorithm === 'fractal' || script.algorithm === 'archipelago') {
    return indices(count).map(at);
  }

  if (script.algorithm === 'inland_sea') {
    // Land all round a great sea in the middle.
    const middle = Math.floor(grid.height / 2) * grid.width + Math.floor(grid.width / 2);
    const reach = Math.max(1, Math.floor(Math.min(grid.width, grid.height) * 0.45));
    return indices(count).map((i) => {
      const d = distance(grid, i, middle);
      const rise = Math.min(1023, Math.floor((d * 1023) / reach));
      return Math.floor((at(i) * 40 + rise * 60) / 100);
    });
  }

  if (script.algorithm === 'mirror') {
    // Two halves, each the other's reflection: the same land for every side.
    const half = continentHeights(grid, script, random, at, maxDistance);
    return indices(count).map((i) => {
      const [col, row] = colRow(grid, i);
      const west = col < grid.width / 2 ? col : grid.width - 1 - col;
      return half[row * grid.width + west]!;
    });
  }

  if (script.algorithm === 'continents_islands') {
    // Continents, with islands scattered in the oceans between them.
    const islands = noiseField(seed(), grid, 14, 3);
    const main = continentHeights(grid, script, random, at, maxDistance);
    return indices(count).map((i) =>
      Math.max(main[i]!, Math.floor((islands.at(...colRow(grid, i)) * 80) / 100)),
    );
  }

  return continentHeights(grid, script, random, at, maxDistance);
}

/** Continents (or one, for pangaea and lakes) around random centers, with ocean between. */
function continentHeights(
  grid: Grid,
  script: MapScriptDef,
  random: Random,
  at: (i: number) => number,
  maxDistance: number,
): number[] {
  const count = grid.width * grid.height;
  const centerRow = Math.floor(grid.height / 2);
  const centers: number[] = [];
  const n = script.algorithm === 'pangaea' || script.algorithm === 'lakes' ? 1 : script.continents;
  const offset = random.int(grid.width);
  for (let k = 0; k < n; k++) {
    const col = (offset + Math.floor((k * grid.width) / n)) % grid.width;
    const row = centerRow + random.int(5) - 2;
    centers.push(row * grid.width + col);
  }
  return indices(count).map((i) => {
    const d = Math.min(...centers.map((c) => distance(grid, i, c)));
    const falloff = Math.max(0, 1023 - Math.floor((d * 1023 * n) / maxDistance));
    let h = Math.floor((at(i) * 55 + falloff * 45) / 100);
    if (n > 1) {
      // Keep an ocean channel between continents: penalize tiles nearly equidistant to two centers.
      const sorted = centers.map((c) => distance(grid, i, c)).sort((a, b) => a - b);
      if (sorted[1]! - sorted[0]! <= 2) h -= 260;
    }
    return h;
  });
}

function isPolar(grid: Grid, index: number, content: CompiledContent): boolean {
  const row = Math.floor(index / grid.width);
  const p = content.rules.mapgen.polarRows;
  return row < p || row >= grid.height - p;
}

// --- Terrain -----------------------------------------------------------------------------------

function chooseTerrain(
  terrains: TerrainDef[],
  temperature: number,
  moisture: number,
): string | undefined {
  let best: TerrainDef | undefined;
  for (const t of terrains) {
    const g = t.generation!;
    if (!inRange(g.temperature, temperature) || !inRange(g.moisture, moisture)) continue;
    if (!best || g.priority > best.generation!.priority) best = t;
  }
  return best?.id;
}

// --- Rivers ------------------------------------------------------------------------------------

function generateRivers(
  grid: Grid,
  land: boolean[],
  heights: number[],
  rivers: number[],
  wanted: number,
  random: Random,
) {
  const height = (v: Vertex) => vertexTiles(grid, v).reduce((s, t) => s + heights[t]!, 0);
  const touchesWater = (v: Vertex) => vertexTiles(grid, v).some((t) => !land[t]);
  const allLand = (v: Vertex) => {
    const ts = vertexTiles(grid, v);
    return ts.length === 3 && ts.every((t) => land[t]);
  };
  const riverVertices = new Set<Vertex>();

  // Sources: high corners, inland, not on mountains-only ridges (any land works).
  const sources = indices(grid.width * grid.height * 2).filter(allLand);
  sources.sort((a, b) => height(b) - height(a) || a - b);
  const pool = sources.slice(0, Math.max(wanted * 6, 12));
  random.shuffle(pool);

  let made = 0;
  for (const start of pool) {
    if (made >= wanted) break;
    if (riverVertices.has(start)) continue;
    const path: { vertex: Vertex; between: [number, number] }[] = [];
    const visited = new Set([start]);
    let current = start;
    let uphillSteps = 0;
    let reached = false;
    while (path.length < 30) {
      if (touchesWater(current) || (path.length > 0 && riverVertices.has(current))) {
        reached = true;
        break;
      }
      const options = vertexNeighbors(grid, current).filter(
        (o) => !visited.has(o.vertex) && land[o.between[0]] && land[o.between[1]],
      );
      if (options.length === 0) break;
      options.sort((a, b) => height(a.vertex) - height(b.vertex) || a.vertex - b.vertex);
      const lowest = height(options[0]!.vertex);
      const ties = options.filter((o) => height(o.vertex) === lowest);
      const step = ties.length > 1 ? random.pick(ties) : options[0]!;
      if (height(step.vertex) >= height(current) && ++uphillSteps > 3) break;
      path.push(step);
      visited.add(step.vertex);
      current = step.vertex;
    }
    if (!reached || path.length < 4) continue;
    for (const step of path) {
      const dir = directionTo(grid, step.between[0], step.between[1]);
      if (dir !== undefined) setRiverEdge(grid, rivers, step.between[0], dir);
      riverVertices.add(step.vertex);
    }
    riverVertices.add(start);
    made++;
  }
}

// --- Resources ---------------------------------------------------------------------------------

function canHold(content: CompiledContent, tile: MapTile, resourceId: string): boolean {
  const r = content.entities.resource[resourceId]!;
  if (!r.validElevations.includes(tile.elevation)) return false;
  return tile.feature !== null
    ? r.validFeatures.includes(tile.feature)
    : r.validTerrains.includes(tile.terrain);
}

function eligibleForResource(content: CompiledContent, tile: MapTile): boolean {
  const terrain = content.entities.terrain[tile.terrain]!;
  if (tile.elevation === 'mountain' || terrain.deepWater) return false;
  const feature = tile.feature === null ? undefined : content.entities.feature[tile.feature];
  return !feature?.impassable;
}

function placeResources(
  map: MapState,
  content: CompiledContent,
  density: MapSettings['resources'],
  random: Random,
) {
  const perTiles = content.rules.mapgen.resourceDensity[density];
  const eligible = indices(map.tiles.length).filter((i) =>
    eligibleForResource(content, map.tiles[i]!),
  );
  const target = Math.floor(eligible.length / perTiles);
  const resources = content.ids.resource
    .map((id) => content.entities.resource[id]!)
    .filter((r) => r.frequency > 0);
  random.shuffle(eligible);
  let placed = 0;
  for (const i of eligible) {
    if (placed >= target) break;
    if (neighbors(map, i).some((n) => map.tiles[n]!.resource !== null)) continue;
    const options = resources.filter((r) => canHold(content, map.tiles[i]!, r.id));
    if (options.length === 0) continue;
    map.tiles[i]!.resource = random.weighted(options, (r) => r.frequency).id;
    placed++;
  }
}

// --- Start positions ---------------------------------------------------------------------------

/** Per-tile yields (whole units) for start scoring, recomputed only for tiles that change. */
function yieldCache(map: MapState, content: CompiledContent, rivers: number[]) {
  const cache = new Map<number, Record<string, number>>();
  const get = (i: number) => {
    let y = cache.get(i);
    if (!y) {
      const t = map.tiles[i]!;
      const total = computeTileYields({
        content,
        tile: { ...t, river: isOnRiver(map, rivers, i), ownerId: null },
        neighbors: [],
        playerId: '',
      }).total;
      y = Object.fromEntries(Object.entries(total).map(([k, v]) => [k, Math.floor(v / 100)]));
      cache.set(i, y);
    }
    return y;
  };
  return { get, invalidate: (i: number) => cache.delete(i) };
}
type YieldCache = ReturnType<typeof yieldCache>;

function isWaterTile(map: MapState, content: CompiledContent, i: number): boolean {
  return content.entities.terrain[map.tiles[i]!.terrain]!.water;
}

function canStartOn(
  map: MapState,
  content: CompiledContent,
  yields: YieldCache,
  i: number,
): boolean {
  const t = map.tiles[i]!;
  if (isWaterTile(map, content, i) || t.elevation === 'mountain') return false;
  if (t.feature !== null && content.entities.feature[t.feature]?.impassable) return false;
  const y = yields.get(i);
  if ((y.food ?? 0) + (y.production ?? 0) === 0) return false;
  const row = Math.floor(i / map.width);
  return row >= 2 && row < map.height - 2;
}

function hasFreshWater(
  map: MapState,
  content: CompiledContent,
  rivers: number[],
  i: number,
): boolean {
  if (isOnRiver(map, rivers, i)) return true;
  return [i, ...neighbors(map, i)].some((n) => {
    const t = map.tiles[n]!;
    return (
      content.entities.terrain[t.terrain]!.freshWater ||
      (t.feature !== null && content.entities.feature[t.feature]!.freshWater)
    );
  });
}

/** Total food and production within 2 tiles (the start tile included). */
function startYields(map: MapState, yields: YieldCache, i: number) {
  let food = 0;
  let production = 0;
  for (const t of tilesWithin(map, i, 2)) {
    const y = yields.get(t);
    food += y.food ?? 0;
    production += y.production ?? 0;
  }
  return { food, production };
}

function startScore(
  map: MapState,
  content: CompiledContent,
  rivers: number[],
  yields: YieldCache,
  i: number,
): number {
  const s = content.rules.mapgen.start;
  let score = 0;
  for (const t of tilesWithin(map, i, 2)) {
    for (const [id, v] of Object.entries(yields.get(t))) {
      score += v * (id === 'food' ? 3 : id === 'production' ? 2 : 1);
    }
  }
  if (hasFreshWater(map, content, rivers, i)) score += s.freshWaterBonus;
  if (neighbors(map, i).some((n) => isWaterTile(map, content, n))) score += s.coastalBonus;
  return score;
}

function biasScore(
  map: MapState,
  content: CompiledContent,
  rivers: number[],
  i: number,
  bias: readonly StartBias[],
): number {
  let score = 0;
  for (const t of tilesWithin(map, i, 2)) {
    const tile = map.tiles[t]!;
    for (const b of bias) {
      if (b.terrain !== undefined && tile.terrain !== b.terrain) continue;
      if (b.feature !== undefined && tile.feature !== b.feature) continue;
      if (b.elevation !== undefined && tile.elevation !== b.elevation) continue;
      if (b.river !== undefined && isOnRiver(map, rivers, t) !== b.river) continue;
      if (b.coastal !== undefined) {
        const coastal =
          !isWaterTile(map, content, t) &&
          neighbors(map, t).some((n) => isWaterTile(map, content, n));
        if (coastal !== b.coastal) continue;
      }
      score += b.weight;
    }
  }
  return score;
}

function placeStarts(
  map: MapState,
  content: CompiledContent,
  script: MapScriptDef,
  players: GenerateInput['players'],
  balance: MapSettings['startBalance'],
  random: Random,
): Record<PlayerId, number> {
  const rivers = map.tiles.map((t) => t.river);
  const yields = yieldCache(map, content, rivers);
  const n = players.length;
  const minDistance = content.rules.settlements.minDistance;
  const landmass = new Map<number, number>();
  const landComponents = components(map, (i) => !isWaterTile(map, content, i));
  for (const comp of landComponents) for (const i of comp) landmass.set(i, comp.length);

  const startable = indices(map.tiles.length).filter((i) => canStartOn(map, content, yields, i));
  let candidates = startable.filter((i) => (landmass.get(i) ?? 0) >= script.minStartLandmass);
  if (candidates.length < n) candidates = startable;
  if (candidates.length < n)
    throw new MapGenerationError(`Not enough land for ${n} players on this map`);

  const scores = new Map(candidates.map((i) => [i, startScore(map, content, rivers, yields, i)]));
  const best = Math.max(...scores.values());
  let good = candidates.filter((i) => scores.get(i)! * 100 >= best * 60);
  if (good.length < n * 3) good = candidates;

  // Spread players out: farthest-point selection, preferring good land.
  const landCount = landComponents.reduce((sum, c) => sum + c.length, 0);
  const spacing = Math.max(
    minDistance + 2,
    Math.floor((isqrt(Math.floor((landCount * 2) / n)) * 4) / 5),
  );
  const byScore = [...good].sort((a, b) => scores.get(b)! - scores.get(a)! || a - b);
  const chosen = [byScore[random.int(Math.min(5, byScore.length))]!];
  const nearest = new Map(good.map((c) => [c, distance(map, chosen[0]!, c)]));
  while (chosen.length < n) {
    let pick = NO_TILE;
    let pickValue = -Infinity;
    for (const c of good) {
      const minD = nearest.get(c)!;
      if (minD <= minDistance) continue;
      const value = Math.min(minD, spacing) * 1000 + scores.get(c)!;
      if (value > pickValue) {
        pickValue = value;
        pick = c;
      }
    }
    if (pick === NO_TILE) throw new MapGenerationError(`Can't fit ${n} players on this map`);
    chosen.push(pick);
    for (const c of good) nearest.set(c, Math.min(nearest.get(c)!, distance(map, pick, c)));
  }

  // Assign: players with a start bias pick first (in player order), then everyone else.
  const starts: Record<PlayerId, number> = {};
  const remaining = [...chosen].sort((a, b) => a - b);
  const ordered = [...players].sort(
    (a, b) => Number(!a.startBias?.length) - Number(!b.startBias?.length),
  );
  for (const p of ordered) {
    let bestIndex = 0;
    if (p.startBias?.length) {
      let bestBias = -Infinity;
      remaining.forEach((t, k) => {
        const b = biasScore(map, content, rivers, t, p.startBias!);
        if (b > bestBias) {
          bestBias = b;
          bestIndex = k;
        }
      });
    }
    starts[p.id] = remaining.splice(bestIndex, 1)[0]!;
  }

  // Make every start playable, then (if asked) roughly equal.
  const s = content.rules.mapgen.start;
  for (const p of players) {
    const start = starts[p.id]!;
    for (let tries = 0; tries < 20; tries++) {
      const y = startYields(map, yields, start);
      if (y.food >= s.minFood && y.production >= s.minProduction) break;
      const need = y.food < s.minFood ? 'food' : 'production';
      if (!addBonusResource(map, content, yields, start, need, random)) break;
    }
  }
  if (balance === 'balanced') {
    for (let round = 0; round < 30; round++) {
      const values = players.map((p) => startScore(map, content, rivers, yields, starts[p.id]!));
      const top = Math.max(...values);
      let changed = false;
      players.forEach((p, k) => {
        if (values[k]! * 100 < top * s.balancedPercent) {
          const need = random.chance(50) ? 'food' : 'production';
          changed = addBonusResource(map, content, yields, starts[p.id]!, need, random) || changed;
        }
      });
      if (!changed) break;
    }
  }
  return starts;
}

/**
 * Improves one tile near a start for `yieldId`: a bonus resource, a feature that yields it
 * (e.g. woods for production), or raising flat land to hills. Everything comes from content,
 * so modded terrains and features work too. Returns false when nothing near the start can help.
 */
function addBonusResource(
  map: MapState,
  content: CompiledContent,
  yields: YieldCache,
  start: number,
  yieldId: string,
  random: Random,
): boolean {
  const options: { tile: number; apply: (t: MapTile) => void }[] = [];
  const hillsGive = (content.rules.elevation.hills.yields[yieldId] ?? 0) > 0;
  for (const t of tilesWithin(map, start, 2)) {
    if (t === start) continue;
    const tile = map.tiles[t]!;
    if (!eligibleForResource(content, tile)) continue;
    const terrain = content.entities.terrain[tile.terrain]!;
    if (tile.resource === null) {
      for (const id of content.ids.resource) {
        const r = content.entities.resource[id]!;
        if (r.class === 'bonus' && (r.yields[yieldId] ?? 0) > 0 && canHold(content, tile, id)) {
          options.push({ tile: t, apply: (x) => (x.resource = id) });
        }
      }
    }
    // Water counts too: a reef can rescue a start hemmed in by the sea.
    if (tile.feature === null && tile.resource === null) {
      for (const id of content.ids.feature) {
        const f = content.entities.feature[id]!;
        if (
          (f.yields[yieldId] ?? 0) > 0 &&
          !f.requiresRiver &&
          !f.impassable &&
          f.validTerrains.includes(tile.terrain) &&
          f.validElevations.includes(tile.elevation)
        ) {
          options.push({ tile: t, apply: (x) => (x.feature = id) });
        }
      }
    }
    if (
      hillsGive &&
      tile.elevation === 'flat' &&
      !terrain.water &&
      terrain.elevations.includes('hills')
    ) {
      const featureOk =
        tile.feature === null ||
        content.entities.feature[tile.feature]!.validElevations.includes('hills');
      const resourceOk =
        tile.resource === null ||
        content.entities.resource[tile.resource]!.validElevations.includes('hills');
      if (featureOk && resourceOk) options.push({ tile: t, apply: (x) => (x.elevation = 'hills') });
    }
  }
  if (options.length === 0 && hillsGive) {
    // Last resort: clear a feature that can't sit on hills (e.g. floodplains) and raise the tile.
    for (const t of tilesWithin(map, start, 2)) {
      const tile = map.tiles[t]!;
      const terrain = content.entities.terrain[tile.terrain]!;
      if (t === start || terrain.water || tile.elevation !== 'flat' || tile.feature === null)
        continue;
      // Resources can depend on the feature (wheat on floodplains), so leave those tiles alone.
      if (!terrain.elevations.includes('hills') || tile.resource !== null) continue;
      options.push({
        tile: t,
        apply: (x) => {
          x.feature = null;
          x.elevation = 'hills';
        },
      });
    }
  }
  if (options.length === 0) return false;
  const choice = random.pick(options);
  choice.apply(map.tiles[choice.tile]!);
  yields.invalidate(choice.tile);
  return true;
}

/** How good each player's start is (food, production and other yields nearby, fresh water, coast). */
export function scoreStarts(
  map: MapState,
  content: CompiledContent,
  starts: Record<PlayerId, number>,
): Record<PlayerId, number> {
  const rivers = map.tiles.map((t) => t.river);
  const yields = yieldCache(map, content, rivers);
  return Object.fromEntries(
    Object.entries(starts).map(([id, tile]) => [
      id,
      startScore(map, content, rivers, yields, tile),
    ]),
  );
}

// --- Helpers -----------------------------------------------------------------------------------

function indices(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function inRange(range: readonly [number, number] | undefined, v: number): boolean {
  return range === undefined || (v >= range[0] && v <= range[1]);
}

/** Marks exactly `percent`% of the allowed tiles with the highest values (ties by index). */
function pickTop(values: number[], percent: number, allowed: (i: number) => boolean): boolean[] {
  const pool = indices(values.length).filter(allowed);
  pool.sort((a, b) => values[b]! - values[a]! || a - b);
  const out = values.map(() => false);
  for (const i of pool.slice(0, Math.floor((values.length * percent) / 100))) out[i] = true;
  return out;
}

function topOf(pool: number[], score: (i: number) => number, percent: number): Set<number> {
  const sorted = [...pool].sort((a, b) => score(b) - score(a) || a - b);
  return new Set(sorted.slice(0, Math.floor((pool.length * percent) / 100)));
}

/** Connected groups of tiles matching `inside`, each sorted, in order of their first tile. */
function components(grid: Grid, inside: (i: number) => boolean): number[][] {
  const seen = new Uint8Array(grid.width * grid.height);
  const out: number[][] = [];
  for (let i = 0; i < seen.length; i++) {
    if (seen[i] || !inside(i)) continue;
    const comp: number[] = [];
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const t = stack.pop()!;
      comp.push(t);
      for (const n of neighbors(grid, t)) {
        if (!seen[n] && inside(n)) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    out.push(comp.sort((a, b) => a - b));
  }
  return out;
}
