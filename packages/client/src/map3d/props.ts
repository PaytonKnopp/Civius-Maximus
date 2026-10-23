import type { MapState } from '@cx/engine';
import {
  type BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  IcosahedronGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { center3 } from './sampler';

/**
 * Low-poly props scattered over the map: mixed forests, jungle, rocks and shrubs. Many small,
 * varied, flat-shaded pieces read as scale and realism; instancing keeps them cheap.
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

export function propGeometries(): Record<PropKind, BufferGeometry> {
  return {
    pineCrown: mergeGeometries([
      flat(new ConeGeometry(0.19, 0.4, 7).translate(0, 0.34, 0)),
      flat(new ConeGeometry(0.145, 0.34, 7).translate(0, 0.54, 0)),
      flat(new ConeGeometry(0.09, 0.24, 6).translate(0, 0.72, 0)),
    ])!,
    pineTrunk: new CylinderGeometry(0.025, 0.04, 0.26, 5).translate(0, 0.13, 0),
    broadCrown: mergeGeometries([
      flat(new IcosahedronGeometry(0.17, 0).translate(0, 0.42, 0)),
      flat(new IcosahedronGeometry(0.13, 0).translate(0.1, 0.36, 0.05)),
      flat(new IcosahedronGeometry(0.12, 0).translate(-0.09, 0.37, -0.05)),
    ])!,
    broadTrunk: new CylinderGeometry(0.03, 0.045, 0.32, 5).translate(0, 0.16, 0),
    jungleCrown: mergeGeometries([
      flat(new IcosahedronGeometry(0.24, 0).scale(1.35, 0.5, 1.35).translate(0, 0.66, 0)),
      flat(new IcosahedronGeometry(0.16, 0).scale(1.3, 0.55, 1.3).translate(0.12, 0.52, -0.06)),
    ])!,
    jungleTrunk: new CylinderGeometry(0.025, 0.04, 0.64, 5).translate(0, 0.32, 0),
    rock: new DodecahedronGeometry(0.08, 0).scale(1, 0.62, 1).translate(0, 0.02, 0),
    shrub: new IcosahedronGeometry(0.085, 0).scale(1, 0.7, 1).translate(0, 0.04, 0),
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
