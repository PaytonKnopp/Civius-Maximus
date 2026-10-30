import type { MapState } from '@cx/engine';
import {
  type BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { center3 } from './sampler';

/**
 * Props scattered over the map: mixed forests, jungle, rocks and shrubs. Soft, smooth canopies
 * with light baked in (darker beneath, brighter on top) and layered pines read as painted
 * woodland; rocks stay faceted. Many small, varied pieces read as scale; instancing keeps them
 * cheap.
 */

export type PropKind =
  | 'pineCrown'
  | 'pineTrunk'
  | 'broadCrown'
  | 'broadTrunk'
  | 'jungleCrown'
  | 'jungleTrunk'
  | 'rock'
  | 'shrub';

/** Merging needs every part non-indexed; some primitives (icosahedrons) already are. */
const flat = (g: BufferGeometry) => (g.index ? g.toNonIndexed() : g);

/**
 * Bakes light into a prop: darker underneath and inside, lighter on top, with a little mottling,
 * so canopies read as volumes of leaves rather than solid shapes. Instance colors tint on top.
 */
function shade(g: BufferGeometry, low: number, high: number, mottle = 0.07): BufferGeometry {
  const out = flat(g);
  out.computeBoundingBox();
  const { min, max } = out.boundingBox!;
  const pos = out.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = (y - min.y) / Math.max(1e-6, max.y - min.y);
    const m = Math.sin(pos.getX(i) * 41 + pos.getZ(i) * 29 + y * 17) * mottle;
    const v = low + (high - low) * Math.pow(t, 0.75) + m;
    colors.set([v, v, v * 0.97], i * 3);
  }
  out.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return out;
}

/** A leafy lobe: a smooth sphere with a lumpy outline (positions pushed in and out). */
function lobe(r: number, x: number, y: number, z: number, sy = 1): BufferGeometry {
  const g = new IcosahedronGeometry(r, 2);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const pz = pos.getZ(i);
    const k = 1 + 0.09 * Math.sin(px * 37 + py * 23) * Math.cos(pz * 31 - px * 13);
    pos.setXYZ(i, px * k, py * k * sy, pz * k);
  }
  return g.translate(x, y, z);
}

/** Faceted rock: one normal per face. */
function facets(g: BufferGeometry): BufferGeometry {
  const out = flat(g);
  out.computeVertexNormals();
  return out;
}

export function propGeometries(): Record<PropKind, BufferGeometry> {
  return {
    pineCrown: shade(
      mergeGeometries([
        flat(new ConeGeometry(0.2, 0.34, 11).translate(0, 0.3, 0)),
        flat(new ConeGeometry(0.165, 0.3, 11).translate(0, 0.46, 0)),
        flat(new ConeGeometry(0.125, 0.26, 10).translate(0, 0.6, 0)),
        flat(new ConeGeometry(0.08, 0.2, 9).translate(0, 0.73, 0)),
      ])!,
      0.45,
      1.12,
    ),
    pineTrunk: shade(new CylinderGeometry(0.022, 0.038, 0.26, 7).translate(0, 0.13, 0), 0.8, 1, 0),
    broadCrown: shade(
      mergeGeometries([
        lobe(0.15, 0, 0.44, 0),
        lobe(0.12, 0.1, 0.37, 0.06),
        lobe(0.115, -0.09, 0.38, -0.05),
        lobe(0.1, 0.02, 0.36, -0.1),
        lobe(0.095, -0.04, 0.52, 0.06),
      ])!,
      0.42,
      1.15,
      0.09,
    ),
    broadTrunk: shade(new CylinderGeometry(0.026, 0.044, 0.34, 7).translate(0, 0.17, 0), 0.8, 1, 0),
    jungleCrown: shade(
      mergeGeometries([
        lobe(0.2, 0, 0.66, 0, 0.5),
        lobe(0.15, 0.13, 0.55, -0.07, 0.55),
        lobe(0.13, -0.12, 0.58, 0.08, 0.5),
      ])!,
      0.45,
      1.1,
      0.08,
    ),
    jungleTrunk: shade(
      new CylinderGeometry(0.022, 0.038, 0.64, 7).translate(0, 0.32, 0),
      0.8,
      1,
      0,
    ),
    rock: shade(
      facets(new DodecahedronGeometry(0.08, 0).scale(1, 0.62, 1).translate(0, 0.02, 0)),
      0.7,
      1.1,
      0.05,
    ),
    shrub: shade(lobe(0.08, 0, 0.04, 0, 0.7), 0.55, 1.1, 0.08),
  };
}

const palette = (hexes: number[]) => hexes.map((h) => new Color(h));
const PINE = palette([0x253a23, 0x2d4328, 0x23372a, 0x30482b]);
const BROAD = palette([0x3b5527, 0x46602c, 0x52612b, 0x5f5f2a, 0x3f5a30]);
const JUNGLE = palette([0x22422a, 0x2a4e2d, 0x1f3b27]);
const TRUNK = palette([0x463527, 0x3d2f24]);
const ROCKS = palette([0x6a665e, 0x5b5852, 0x75705f, 0x625e55]);
const SANDSTONE = palette([0x8c7a5c, 0x7d6c52, 0x96845f]);
const SHRUBS: Record<string, Color[]> = {
  grassland: palette([0x46602f, 0x3e5629, 0x52673a]),
  plains: palette([0x6b6638, 0x5d5c33, 0x75703e]),
  tundra: palette([0x51554a, 0x5b5d4b]),
  marsh: palette([0x56664a, 0x4b5c45, 0x627048]),
};

export interface PropInstance {
  kind: PropKind;
  tile: number;
  x: number;
  z: number;
  scale: [number, number, number];
  rotation: number;
  color: Color;
}

/** Deterministic pseudo-random 0..1 from integers, so props never move between rebuilds. */
function rand(a: number, b: number, salt: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + salt * 977, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

export interface PropDensity {
  /** Trees per forest tile. */
  trees: number;
  /** Rocks and shrubs per open tile (0 turns scatter off). */
  scatter: number;
}

/** Every prop on the given tiles. */
export function placeProps(map: MapState, tiles: number[], density: PropDensity): PropInstance[] {
  const out: PropInstance[] = [];
  for (const t of tiles) {
    const tile = map.tiles[t]!;
    const [cx, cz] = center3(t % map.width, Math.floor(t / map.width));
    let n = 0;
    const spot = (minR: number, maxR: number) => {
      const a = rand(t, n, 1) * Math.PI * 2;
      const r = minR + (maxR - minR) * Math.sqrt(rand(t, n, 2));
      return [cx + Math.cos(a) * r, cz + Math.sin(a) * r] as const;
    };
    const add = (
      kind: PropKind,
      colors: Color[],
      size: number,
      stretch = 1,
      at = spot(0.1, 0.8),
    ) => {
      const s = size * (0.75 + rand(t, n, 3) * 0.55);
      out.push({
        kind,
        tile: t,
        x: at[0],
        z: at[1],
        scale: [s, s * stretch * (0.9 + rand(t, n, 4) * 0.25), s],
        rotation: rand(t, n, 5) * Math.PI * 2,
        color: colors[Math.floor(rand(t, n, 6) * colors.length)]!,
      });
      n++;
    };
    const tree = (crown: PropKind, trunk: PropKind, colors: Color[], size: number, stretch = 1) => {
      const at = spot(0.08, 0.82);
      const before = n;
      add(crown, colors, size, stretch, at);
      // Trunk shares the crown's position and scale.
      const crownInstance = out[out.length - 1]!;
      out.push({ ...crownInstance, kind: trunk, color: TRUNK[before % TRUNK.length]! });
    };

    if (tile.feature === 'woods') {
      const cold = tile.terrain === 'tundra' || tile.terrain === 'snow';
      for (let i = 0; i < density.trees; i++) {
        if (cold || rand(t, i, 7) < 0.45) tree('pineCrown', 'pineTrunk', PINE, 1, 1.1);
        else tree('broadCrown', 'broadTrunk', BROAD, 0.8);
      }
    } else if (tile.feature === 'rainforest') {
      for (let i = 0; i < density.trees + 2; i++) tree('jungleCrown', 'jungleTrunk', JUNGLE, 0.85);
    } else if (density.scatter > 0 && tile.elevation !== 'mountain') {
      const shrubs = SHRUBS[tile.feature === 'marsh' ? 'marsh' : tile.terrain];
      const count = Math.floor(rand(t, 99, 8) * (density.scatter + 1));
      if (tile.elevation === 'hills' || tile.terrain === 'tundra') {
        for (let i = 0; i < count + 1; i++) add('rock', ROCKS, 1.1);
      } else if (tile.terrain === 'desert' && rand(t, 98, 9) < 0.5) {
        add('rock', SANDSTONE, 1.2);
      }
      if (shrubs) for (let i = 0; i < count; i++) add('shrub', shrubs, 1.1);
    } else if (density.scatter > 0 && tile.elevation === 'mountain') {
      for (let i = 0; i < 3; i++) add('rock', ROCKS, 1.6, 1, spot(0.7, 0.95));
    }
  }
  return out;
}
