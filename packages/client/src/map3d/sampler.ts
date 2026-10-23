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

/** Painted palette per base terrain (sRGB hex), richer than the 2D placeholders. */
const TERRAIN_PALETTE: Record<string, number> = {
  grassland: 0x7fae4a,
  plains: 0xbfb45a,
  desert: 0xe8c987,
  tundra: 0x9a9a78,
  snow: 0xf1f4f6,
  coast: 0x3c9fb4,
  lake: 0x4fb0b0,
  ocean: 0x245b8f,
};
const FEATURE_TINT: Record<string, number> = {
  woods: 0x5f8a3e,
  rainforest: 0x3f7a40,
  marsh: 0x6f9a7a,
  floodplains: 0xd9cf7f,
  floodplains_grassland: 0x9ccc5e,
  floodplains_plains: 0xcfc566,
};
const ROCK = new Color(0x8a8378);
const SNOW = new Color(0xf4f6f8);
const SAND = new Color(0xf0dca0);
const RIVER = new Color(0x4aa8d0);
const RIVER_BANK = new Color(0x6f8f4a);

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
      if (t.feature === 'ice') color.set(0xe8f1f6);
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
      out.color.set(0x1d4a7a);
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
      if (t.hills) bumps += 0.34 * Math.max(0, 1 - d / 1.1) ** 2;
      if (t.mountain) {
        const m = Math.max(0, 1 - d / 1.02) ** 1.4 * (0.75 + 0.5 * smoothNoise(x * 2.3, z * 2.3));
        mountain = Math.max(mountain, m);
      }
      const cwI = Math.max(0, 1.08 - d) ** 3;
      cw += cwI;
      r += cwI * t.color.r;
      g += cwI * t.color.g;
      b += cwI * t.color.b;
    }
    let height = base / wSum + bumps + mountain * 2.1;
    // Wandering shorelines: broad noise so coasts and lakes don't follow hex outlines.
    height +=
      (smoothNoise(x * 0.8 + 11.3, z * 0.8 - 4.2) - 0.5) * 0.2 +
      (smoothNoise(x * 2.1, z * 2.1) - 0.5) * 0.06;
    const land = height > 0;

    const color = out.color.setRGB(r / cw, g / cw, b / cw);
    // Painterly variation: broad soft patches of light and shade.
    const patch = smoothNoise(x * 0.9 + 3.1, z * 0.9) - 0.5;
    color.multiplyScalar(1 + patch * 0.16);
    if (mountain > 0.05) color.lerp(ROCK, Math.min(1, mountain * 1.6));
    if (height > 1.55) color.lerp(SNOW, Math.min(1, (height - 1.55) * 2.5));
    if (land && nearWater && height < 0.16 && mountain < 0.05) color.lerp(SAND, 0.55);

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
