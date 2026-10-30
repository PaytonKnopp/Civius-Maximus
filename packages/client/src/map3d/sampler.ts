import type { CompiledContent } from '@cx/content';
import { DIRECTIONS, type MapState, neighbor, neighbors, NO_TILE } from '@cx/engine';
import { Color } from 'three';
import { HEX, tileAt } from '../map/geometry';

/**
 * Turns the hex map into a continuous painted landscape: a height and a color for any point.
 * World units: 1 = hex radius. Rendering only (floats are fine here).
 */

export const SQRT3 = Math.sqrt(3);
export const HEX_W3 = SQRT3;
export const ROW_H3 = 1.5;

export function center3(col: number, row: number): [number, number] {
  return [HEX_W3 * (col + 0.5 * (row & 1)) + HEX_W3 / 2, 1 + row * ROW_H3];
}

export function worldSize3(map: { width: number; height: number }): [number, number] {
  return [HEX_W3 * map.width, ROW_H3 * (map.height - 1) + 2];
}

/**
 * Natural palette per base terrain (sRGB hex): meadow green, golden savanna, warm sand, slate. Water
 * terrains color the seabed seen through the shallows.
 */
const TERRAIN_PALETTE: Record<string, number> = {
  grassland: 0x5a7a36,
  plains: 0x857f4a,
  desert: 0xab9066,
  tundra: 0x6d715e,
  snow: 0xcfd6dc,
  coast: 0x7d7052,
  lake: 0x5e6a4e,
  ocean: 0x2a3b3c,
};
const FEATURE_TINT: Record<string, number> = {
  woods: 0x3c5229,
  rainforest: 0x2c4424,
  marsh: 0x4a5c46,
  floodplains: 0x8f8752,
  floodplains_grassland: 0x62823a,
  floodplains_plains: 0x878144,
};
const ROCK = new Color(0x55534f);
const SAND = new Color(0xa89870);
const SEABED_SHALLOW = new Color(0x8a7c58);
const SEABED_DEEP = new Color(0x1e2e33);
const RIVER = new Color(0x2a5a6c);
const RIVER_BANK = new Color(0x4a5a34);

export interface Sample {
  height: number;
  color: Color;
}

interface TileInfo {
  x: number;
  z: number;
  water: boolean;
  base: number;
  hills: boolean;
  mountain: boolean;
  color: Color;
  feature: string | null;
  /** River segments on this tile's edges: [x1, z1, x2, z2] each. */
  rivers: number[][];
}

function noise2(x: number, z: number): number {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/** Smooth value noise, 0..1. */
export function smoothNoise(x: number, z: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fz = z - zi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = noise2(xi, zi);
  const b = noise2(xi + 1, zi);
  const c = noise2(xi, zi + 1);
  const d = noise2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export class TerrainSampler {
  readonly width: number;
  readonly depth: number;
  private tiles: TileInfo[];
  private around: number[][];

  constructor(
    private map: MapState,
    content: CompiledContent,
  ) {
    [this.width, this.depth] = worldSize3(map);
    const corners = (cx: number, cz: number, i: number): [number, number] => {
      const a = (Math.PI / 180) * (60 * i - 30);
      return [cx + Math.cos(a), cz + Math.sin(a)];
    };
    const EDGE: [number, number][] = [
      [0, 1],
      [5, 0],
      [4, 5],
      [3, 4],
      [2, 3],
      [1, 2],
    ];
    this.tiles = map.tiles.map((t, i) => {
      const [x, z] = center3(i % map.width, Math.floor(i / map.width));
      const terrain = content.entities.terrain[t.terrain]!;
      const water = terrain.water && t.feature !== 'ice';
      const color = new Color(
        TERRAIN_PALETTE[t.terrain] ?? Number.parseInt(terrain.color.slice(1), 16),
      );
      if (t.feature && FEATURE_TINT[t.feature] !== undefined)
        color.lerp(new Color(FEATURE_TINT[t.feature]), 0.55);
      if (t.feature === 'ice') color.set(0x8f9ba4);
      const rivers: number[][] = [];
      for (const d of DIRECTIONS) {
        const n = neighbor(map, i, d);
        if (n === NO_TILE) continue;
        // Bits: own E=1, SW=2, SE=4; the other three edges are stored on the neighbor.
        const own = d === 0 ? 1 : d === 4 ? 2 : d === 5 ? 4 : 0;
        const has = own
          ? (t.river & own) !== 0
          : (map.tiles[n]!.river & (d === 3 ? 1 : d === 1 ? 2 : 4)) !== 0;
        if (!has) continue;
        const [a, b] = EDGE[d]!;
        rivers.push([...corners(x, z, a), ...corners(x, z, b)]);
      }
      return {
        x,
        z,
        water,
        base: !water ? 0.14 : terrain.deepWater ? -0.55 : t.terrain === 'lake' ? -0.22 : -0.3,
        hills: t.elevation === 'hills',
        mountain: t.elevation === 'mountain',
        color,
        feature: t.feature,
        rivers,
      };
    });
    this.around = map.tiles.map((_, i) => [i, ...neighbors(map, i)]);
  }

  /** The tile containing a world point (x already wrapped), or undefined off the map. */
  tileAt(x: number, z: number): number | undefined {
    const hit = tileAt(x * HEX, z * HEX, this.map);
    return hit ? hit.row * this.map.width + hit.col : undefined;
  }

  private wrapDx(dx: number): number {
    if (!this.map.wrapX) return dx;
    if (dx > this.width / 2) return dx - this.width;
    if (dx < -this.width / 2) return dx + this.width;
    return dx;
  }

  sample(xIn: number, z: number, out: Sample): Sample {
    const x = this.map.wrapX ? ((xIn % this.width) + this.width) % this.width : xIn;
    const tile = this.tileAt(x, z);
    if (tile === undefined) {
      out.height = -0.6;
      out.color.copy(SEABED_DEEP);
      return out;
    }
    let wSum = 0;
    let base = 0;
    let bumps = 0;
    let cw = 0;
    let r = 0;
    let g = 0;
    let b = 0;
    let mountain = 0;
    let nearWater = false;
    for (const i of this.around[tile]!) {
      const t = this.tiles[i]!;
      const d = Math.hypot(this.wrapDx(t.x - x), t.z - z);
      const w = Math.max(0, 1.3 - d) ** 2;
      wSum += w;
      base += w * t.base;
      if (t.water && d < 1.6) nearWater = true;
      if (t.hills) bumps += 0.4 * Math.max(0, 1 - d / 1.1) ** 2;
      if (t.mountain) {
        // Broad bases merge neighbouring mountains into ranges; ridged noise makes crags.
        const ridge = 1 - Math.abs(smoothNoise(x * 1.6, z * 1.6) * 2 - 1);
        const m = Math.max(0, 1 - d / 1.32) ** 1.15 * (0.62 + 0.6 * ridge);
        mountain = Math.max(mountain, m);
      }
      const cwI = Math.max(0, 1.08 - d) ** 3;
      cw += cwI;
      r += cwI * t.color.r;
      g += cwI * t.color.g;
      b += cwI * t.color.b;
    }
    let height = base / wSum + bumps + mountain * 1.75;
    if (mountain > 0)
      height += (1 - Math.abs(smoothNoise(x * 4.3, z * 4.3) * 2 - 1)) * 0.22 * mountain;
    // Wandering shorelines: broad noise so coasts and lakes don't follow hex outlines.
    height +=
      (smoothNoise(x * 0.8 + 11.3, z * 0.8 - 4.2) - 0.5) * 0.2 +
      (smoothNoise(x * 2.1, z * 2.1) - 0.5) * 0.06;
    const land = height > 0;
    // Fine relief so flat land isn't perfectly flat.
    if (land) height += (smoothNoise(x * 3.3, z * 3.3) - 0.5) * 0.05;

    const color = out.color.setRGB(r / cw, g / cw, b / cw);
    // Painterly variation: broad soft patches of light and shade.
    const patch = smoothNoise(x * 0.9 + 3.1, z * 0.9) - 0.5;
    const fine = smoothNoise(x * 4.1 - 7.7, z * 4.1) - 0.5;
    color.multiplyScalar(1 + patch * 0.2 + fine * 0.08);
    if (mountain > 0.05) color.lerp(ROCK, Math.min(0.85, mountain * 1.4));
    if (land && nearWater && height < 0.15 && mountain < 0.05) color.lerp(SAND, 0.5);
    if (!land) {
      // Seabed: sandy near the shore, darkening with depth (seen through the shallows).
      const deep = Math.min(1, Math.max(0, (-height - 0.04) / 0.4));
      color.copy(SEABED_SHALLOW).lerp(SEABED_DEEP, deep);
    }

    const here = this.tiles[tile]!;
    if (here.feature === 'oasis') {
      const d = Math.hypot(this.wrapDx(here.x - x), here.z - z);
      if (d < 0.42) height = Math.min(height, -0.08 + d * 0.2);
    }

    // Carve rivers along tile edges.
    let riverDist = Infinity;
    for (const i of this.around[tile]!) {
      for (const s of this.tiles[i]!.rivers)
        riverDist = Math.min(riverDist, segDist(this, x, z, s));
    }
    if (riverDist < 0.22 && height > 0) {
      // Rivers are painted ribbons sunk into the land, kept above sea level so the ocean's
      // shoreline foam doesn't paint them.
      const k = 1 - riverDist / 0.22;
      height = Math.max(0.02, height * (1 - k * 0.85));
      color.lerp(k > 0.45 ? RIVER : RIVER_BANK, Math.min(1, k * 1.8));
    }
    out.height = height;
    return out;
  }

  /**
   * A smooth blend of a per-tile value around a point (e.g. visibility), so edges between
   * tiles fade instead of following hex outlines.
   */
  blend(xIn: number, z: number, value: (tile: number) => number, outside: number): number {
    const x = this.map.wrapX ? ((xIn % this.width) + this.width) % this.width : xIn;
    const tile = this.tileAt(x, z);
    if (tile === undefined) return outside;
    let wSum = 0;
    let v = 0;
    for (const i of this.around[tile]!) {
      const t = this.tiles[i]!;
      const d = Math.hypot(this.wrapDx(t.x - x), t.z - z);
      const w = Math.max(0, 1.25 - d) ** 2;
      wSum += w;
      v += w * value(i);
    }
    return wSum > 0 ? v / wSum : outside;
  }

  /** Sampler helper for segment distance (wrap-aware). */
  dx(a: number): number {
    return this.wrapDx(a);
  }
}

function segDist(s: TerrainSampler, px: number, pz: number, seg: number[]): number {
  const ax = s.dx(seg[0]! - px);
  const az = seg[1]! - pz;
  const bx = s.dx(seg[2]! - px);
  const bz = seg[3]! - pz;
  const vx = bx - ax;
  const vz = bz - az;
  const t = Math.max(0, Math.min(1, -(ax * vx + az * vz) / (vx * vx + vz * vz)));
  return Math.hypot(ax + vx * t, az + vz * t);
}
