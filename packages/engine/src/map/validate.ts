import type { CompiledContent } from '@cx/content';
import { computeTileYields } from '../effects/yields';
import type { PlayerId } from '../state';
import {
  DIRECTIONS,
  distance,
  hasRiverEdge,
  isOnRiver,
  neighbor,
  neighbors,
  NO_TILE,
  tilesWithin,
} from './hex';
import type { MapState } from './types';

/**
 * Checks a generated map against the rules map generation promises. Returns problems in plain
 * English (empty = valid). Used by tests and by `pnpm cx mapcheck`.
 */
export function validateMap(
  map: MapState,
  starts: Record<PlayerId, number>,
  content: CompiledContent,
): string[] {
  const problems: string[] = [];
  const terrain = (i: number) => content.entities.terrain[map.tiles[i]!.terrain];
  const rivers = map.tiles.map((t) => t.river);
  const mg = content.rules.mapgen;

  map.tiles.forEach((t, i) => {
    const ter = terrain(i);
    if (!ter) return problems.push(`tile ${i}: unknown terrain ${t.terrain}`);
    if (!ter.elevations.includes(t.elevation))
      problems.push(`tile ${i}: ${t.terrain} can't be ${t.elevation}`);
    if (
      ter.water &&
      t.terrain === mg.oceanTerrain &&
      neighbors(map, i).some((n) => !terrain(n)?.water)
    ) {
      problems.push(`tile ${i}: ocean next to land (should be coast)`);
    }
    if (t.feature !== null) {
      const f = content.entities.feature[t.feature];
      if (!f?.validTerrains.includes(t.terrain) || !f.validElevations.includes(t.elevation)) {
        problems.push(`tile ${i}: ${t.feature} can't be on ${t.elevation} ${t.terrain}`);
      }
      if (f?.requiresRiver && !isOnRiver(map, rivers, i))
        problems.push(`tile ${i}: ${t.feature} needs a river`);
    }
    if (t.resource !== null) {
      const r = content.entities.resource[t.resource];
      const ok =
        r !== undefined &&
        r.validElevations.includes(t.elevation) &&
        (t.feature !== null
          ? r.validFeatures.includes(t.feature)
          : r.validTerrains.includes(t.terrain));
      if (!ok) problems.push(`tile ${i}: ${t.resource} can't be on this tile`);
    }
    for (const d of DIRECTIONS) {
      if (!hasRiverEdge(map, rivers, i, d)) continue;
      const n = neighbor(map, i, d);
      if (n === NO_TILE || ter.water || terrain(n)?.water)
        problems.push(`tile ${i}: river edge touches water`);
    }
  });

  const ids = Object.keys(starts);
  const tiles = ids.map((id) => starts[id]!);
  if (new Set(tiles).size !== tiles.length) problems.push('two players share a start');
  for (let a = 0; a < tiles.length; a++) {
    const s = tiles[a]!;
    const t = map.tiles[s];
    if (!t || terrain(s)?.water || t.elevation === 'mountain') {
      problems.push(`${ids[a]}: starts on water or a mountain`);
      continue;
    }
    for (let b = a + 1; b < tiles.length; b++) {
      if (distance(map, s, tiles[b]!) <= content.rules.settlements.minDistance) {
        problems.push(`${ids[a]} and ${ids[b]} start ${distance(map, s, tiles[b]!)} tiles apart`);
      }
    }
    let food = 0;
    let production = 0;
    for (const n of tilesWithin(map, s, 2)) {
      const y = computeTileYields({
        content,
        tile: { ...map.tiles[n]!, river: isOnRiver(map, rivers, n), ownerId: null },
        neighbors: [],
        playerId: '',
      }).total;
      food += Math.floor((y.food ?? 0) / 100);
      production += Math.floor((y.production ?? 0) / 100);
    }
    if (food < mg.start.minFood)
      problems.push(`${ids[a]}: only ${food} food near start (min ${mg.start.minFood})`);
    if (production < mg.start.minProduction) {
      problems.push(
        `${ids[a]}: only ${production} production near start (min ${mg.start.minProduction})`,
      );
    }
  }
  return problems;
}
