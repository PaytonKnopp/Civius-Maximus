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
  grassland: 0x52703a,
  plains: 0x7c7849,
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
  /**
   * Which ground textures show here: [grass, dry plains, sand, dirt, rock]. Snow is whatever is
   * left over (and the shader adds more by height). Only filled when the caller supplies it.
   */
  mat?: Float32Array;
}

/** Ground texture weights per base terrain: [grass, dry plains, sand, dirt]. */
const TERRAIN_MAT: Record<string, [number, number, number, number]> = {
  grassland: [1, 0, 0, 0],
  plains: [0.1, 0.9, 0, 0],
  desert: [0, 0.1, 0.9, 0],
  tundra: [0, 0.25, 0, 0.75],
  snow: [0, 0, 0, 0],
  coast: [0, 0, 1, 0],
  lake: [0, 0, 1, 0],
  ocean: [0, 0, 1, 0],
};
const FEATURE_MAT: Record<string, [number, number, number, number]> = {
  woods: [0.35, 0, 0, 0.65],
  rainforest: [0.25, 0, 0, 0.75],
  marsh: [0.3, 0, 0, 0.7],
  ice: [0, 0, 0, 0],
};

interface TileInfo {
  x: number;
  z: number;
  water: boolean;
  base: number;
  hills: boolean;
  mountain: boolean;
  color: Color;
  mat: [number, number, number, number];
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
      const mat: [number, number, number, number] = [
        ...(FEATURE_MAT[t.feature ?? ''] ?? TERRAIN_MAT[t.terrain] ?? [0.5, 0.5, 0, 0]),
      ];
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
        mat,
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
      out.mat?.fill(0);
      if (out.mat) out.mat[2] = 1;
      return out;
    }
    let wSum = 0;
    let base = 0;
    let bumps = 0;
    let cw = 0;
    let r = 0;
    let g = 0;
    let b = 0;
    let mountainSum = 0;
    let nearWater = false;
    let m0 = 0;
    let m1 = 0;
    let m2 = 0;
    let m3 = 0;
    for (const i of this.around[tile]!) {
      const t = this.tiles[i]!;
      const d = Math.hypot(this.wrapDx(t.x - x), t.z - z);
      const w = Math.max(0, 1.3 - d) ** 2;
      wSum += w;
      base += w * t.base;
      if (t.water && d < 1.6) nearWater = true;
      if (t.hills) bumps += 0.4 * Math.max(0, 1 - d / 1.1) ** 2;
      if (t.mountain) {
        // Each summit sits a little off its tile's center, and neighbouring mountains join as a
        // soft union (a p-norm), so they gather into ranges with saddles, not a row of cones.
        const jx = (noise2(i * 1.7, 3.1) - 0.5) * 0.7;
        const jz = (noise2(i * 2.3, 7.9) - 0.5) * 0.7;
        const dm = Math.hypot(this.wrapDx(t.x + jx - x), t.z + jz - z);
        const ridge = 1 - Math.abs(smoothNoise(x * 1.6, z * 1.6) * 2 - 1);
        const m = Math.max(0, 1 - dm / 1.45) ** 1.2 * (0.62 + 0.6 * ridge);
        mountainSum += m ** 3;
      }
      const cwI = Math.max(0, 1.08 - d) ** 3;
      cw += cwI;
      r += cwI * t.color.r;
      g += cwI * t.color.g;
      b += cwI * t.color.b;
      m0 += cwI * t.mat[0];
      m1 += cwI * t.mat[1];
      m2 += cwI * t.mat[2];
      m3 += cwI * t.mat[3];
    }
    const mountain = Math.min(1.15, Math.cbrt(mountainSum));
    let height = base / wSum + bumps + mountain * 1.55;
    if (mountain > 0) {
      // Crags: ridged noise at three scales, growing toward the summit so slopes are rough and
      // peaks are sharp, plus faint rock strata (horizontal banding the light picks out).
      const ridged = (f: number, o: number) =>
        1 - Math.abs(smoothNoise(x * f + o, z * f - o) * 2 - 1);
      const crag = ridged(3.1, 5.1) * 0.5 + ridged(6.3, 9.7) * 0.3 + ridged(9.1, 2.3) * 0.2;
      height += crag * 0.62 * mountain ** 1.35;
      height += Math.sin(height * 26 + crag * 3) * 0.014 * mountain;
    }
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
    if (out.mat) {
      const mat = out.mat;
      mat[0] = m0 / cw;
      mat[1] = m1 / cw;
      mat[2] = m2 / cw;
      mat[3] = m3 / cw;
      if (!land) {
        // Seabed is sand.
        mat[0] = mat[1] = mat[3] = 0;
        mat[2] = 1;
      } else {
        // Beaches along the water.
        if (nearWater && height < 0.15) {
          const k = mountain < 0.05 ? 0.5 : 0;
          for (let c = 0; c < 4; c++) mat[c] = mat[c]! * (1 - k);
          mat[2] = mat[2]! + k;
        }
        // River banks are mud.
        if (riverDist < 0.22) {
          const k = Math.min(1, (1 - riverDist / 0.22) * 1.4);
          for (let c = 0; c < 4; c++) mat[c] = mat[c]! * (1 - k);
          mat[3] = mat[3]! + k;
        }
      }
      mat[4] = Math.min(1, mountain * 1.5);
    }
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
