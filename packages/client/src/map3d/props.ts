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
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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
  | 'cypressCrown'
  | 'cypressTrunk'
  | 'palmCrown'
  | 'palmTrunk'
  | 'reeds'
  | 'rock'
  | 'shrub';

/** Merging needs every part non-indexed; some primitives (icosahedrons) already are. */
const flat = (g: BufferGeometry) => (g.index ? g.toNonIndexed() : g);

/**
 * Bakes light into a prop: darker underneath and inside, lighter on top, with a little mottling,
 * so canopies read as volumes of leaves rather than solid shapes. Instance colors tint on top.
 */
function shade(g: BufferGeometry, low: number, high: number, mottle = 0.07): BufferGeometry {
  const out = g;
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
  // Shared vertices (indexed): 42 per lobe, so a forest of thousands of trees stays light.
  const g = mergeVertices(new IcosahedronGeometry(r, 1).deleteAttribute('uv'));
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

/** Pushes every vertex in or out by a smooth function of its position (shared corners agree). */
function rough(g: BufferGeometry, amount: number, freq = 29): BufferGeometry {
  const pos = g.getAttribute('position');
  g.computeBoundingBox();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k =
      1 +
      amount *
        Math.sin(x * freq + y * freq * 0.7) *
        Math.cos(z * freq * 1.1 - y * freq * 0.5) *
        Math.sin((x + z) * freq * 0.6);
    // Only sideways, so tiers keep their heights.
    pos.setXYZ(i, x * k, y, z * k);
  }
  return g;
}

/** A conifer: tiers of drooping, uneven skirts, narrower toward the top, like a spruce. */
function spruceCrown(): BufferGeometry {
  const tiers: BufferGeometry[] = [];
  const n = 6;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const r = 0.215 * (1 - t) ** 0.85 + 0.035;
    const h = 0.25 - t * 0.07;
    tiers.push(
      rough(flat(new ConeGeometry(r, h, 10, 1)), 0.13, 31 + i * 7).translate(0, 0.2 + i * 0.105, 0),
    );
  }
  tiers.push(flat(new ConeGeometry(0.03, 0.12, 6)).translate(0, 0.2 + n * 0.105 + 0.02, 0));
  return mergeGeometries(tiers)!;
}

/** A broadleaf crown: many lobes of different sizes in a rounded, uneven cap. */
function oakCrown(): BufferGeometry {
  const lobes: [number, number, number, number][] = [
    [0.16, 0, 0.46, 0],
    [0.13, 0.13, 0.4, 0.05],
    [0.125, -0.12, 0.41, -0.06],
    [0.115, 0.04, 0.38, -0.13],
    [0.12, -0.05, 0.39, 0.13],
    [0.1, 0.09, 0.56, -0.04],
    [0.095, -0.08, 0.57, 0.05],
    [0.085, 0.2, 0.34, -0.05],
    [0.08, -0.2, 0.35, 0.04],
  ];
  return mergeGeometries(lobes.map(([r, x, y, z]) => lobe(r, x, y, z, 0.88)))!;
}

/** A trunk that forks into two branches under the crown. */
function forkedTrunk(): BufferGeometry {
  const stem = new CylinderGeometry(0.024, 0.045, 0.3, 7).translate(0, 0.15, 0);
  const branch = (dx: number, dz: number, len: number) => {
    const g = new CylinderGeometry(0.012, 0.022, len, 5).translate(0, len / 2, 0);
    g.rotateZ(-dx * 1.1);
    g.rotateX(dz * 1.1);
    return g.translate(0, 0.26, 0);
  };
  return mergeGeometries([
    stem,
    branch(0.45, 0.1, 0.22),
    branch(-0.4, -0.18, 0.2),
    branch(0.05, 0.4, 0.18),
  ])!;
}

/** A Mediterranean cypress: a tall, dark flame. */
function cypressCrown(): BufferGeometry {
  return mergeGeometries([
    lobe(0.075, 0, 0.2, 0, 1.9),
    lobe(0.07, 0.005, 0.36, 0, 2.0),
    lobe(0.06, -0.004, 0.5, 0, 1.9),
    lobe(0.04, 0, 0.62, 0, 1.7),
  ])!;
}

/** A date palm: a gently curved trunk (and where its top ends up). */
function palmTrunk(): { geometry: BufferGeometry; top: [number, number] } {
  const parts: BufferGeometry[] = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i < 7; i++) {
    const len = 0.1;
    const g = new CylinderGeometry(0.018 - i * 0.0014, 0.022 - i * 0.0014, len, 6);
    g.translate(0, len / 2, 0).rotateZ(-0.075 * i);
    parts.push(g.translate(x, y, 0));
    x += Math.sin(0.075 * (i + 0.5)) * len;
    y += Math.cos(0.075 * (i + 0.5)) * len;
  }
  return { geometry: mergeGeometries(parts)!, top: [x, y] };
}

/** The palm's crown: a dozen drooping fronds around a knot of dates, at the trunk's top. */
function palmCrown(): BufferGeometry {
  const [topX, topY] = palmTrunk().top;
  const top = { x: topX, y: topY };
  const parts: BufferGeometry[] = [];
  const fronds = 11;
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2 + (i % 2) * 0.2;
    // From nearly level to hanging over, so the crown arches.
    const tilt = 1.1 + (i % 3) * 0.32;
    // A wide, thin leaf (flat sideways, so it reads as foliage from above, not a spike).
    const g = flat(new ConeGeometry(0.05, 0.36, 4, 1)).deleteAttribute('uv');
    g.scale(0.16, 1, 1).translate(0, 0.18, 0);
    g.rotateZ(-tilt).rotateY(a);
    parts.push(g.translate(top.x, top.y, 0));
  }
  parts.push(flat(lobe(0.032, top.x, top.y - 0.025, 0, 1)));
  return mergeGeometries(parts)!;
}

/** Reeds: a tuft of thin leaning blades. */
function reeds(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4;
    const r = 0.03 + (i % 3) * 0.028;
    const h = 0.2 + ((i * 7) % 5) * 0.045;
    const g = flat(new ConeGeometry(0.011, h, 4, 1)).translate(0, h / 2, 0);
    g.rotateZ(Math.sin(a * 1.7) * 0.28).rotateY(a);
    parts.push(g.translate(Math.cos(a) * r, 0, Math.sin(a) * r));
  }
  return mergeGeometries(parts)!;
}

/** A boulder with a couple of smaller stones beside it. */
function boulders(): BufferGeometry {
  const stone = (r: number, x: number, z: number, sy: number, detail: number) =>
    facets(
      rough(flat(new DodecahedronGeometry(r, detail)), 0.18, 23 + x * 40)
        .scale(1, sy, 1.1)
        .translate(x, r * sy * 0.55, z),
    );
  return mergeGeometries([
    stone(0.085, 0, 0, 0.66, 0),
    stone(0.05, 0.1, 0.045, 0.7, 0),
    stone(0.035, -0.07, 0.08, 0.6, 0),
  ])!;
}

export function propGeometries(): Record<PropKind, BufferGeometry> {
  return {
    pineCrown: shade(spruceCrown(), 0.42, 1.14, 0.08),
    pineTrunk: shade(new CylinderGeometry(0.022, 0.038, 0.3, 7).translate(0, 0.15, 0), 0.8, 1, 0),
    broadCrown: shade(oakCrown(), 0.4, 1.18, 0.1),
    broadTrunk: shade(forkedTrunk(), 0.8, 1, 0),
    cypressCrown: shade(cypressCrown(), 0.4, 1.12, 0.06),
    cypressTrunk: shade(
      new CylinderGeometry(0.014, 0.024, 0.14, 6).translate(0, 0.07, 0),
      0.8,
      1,
      0,
    ),
    palmCrown: shade(palmCrown(), 0.55, 1.15, 0.06),
    palmTrunk: shade(palmTrunk().geometry, 0.7, 1.05, 0.05),
    reeds: shade(reeds(), 0.6, 1.15, 0.05),
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
    rock: shade(boulders(), 0.7, 1.1, 0.05),
    shrub: shade(lobe(0.08, 0, 0.04, 0, 0.7), 0.55, 1.1, 0.08),
  };
}

const palette = (hexes: number[]) => hexes.map((h) => new Color(h));
const PINE = palette([0x253a23, 0x2d4328, 0x23372a, 0x30482b]);
const BROAD = palette([0x3b5527, 0x46602c, 0x52612b, 0x5f5f2a, 0x3f5a30]);
const JUNGLE = palette([0x22422a, 0x2a4e2d, 0x1f3b27]);
const TRUNK = palette([0x463527, 0x3d2f24]);
const CYPRESS = palette([0x1f3322, 0x263b25, 0x1b2d20]);
const PALM = palette([0x4d6a2c, 0x56742f, 0x45622a]);
const PALM_TRUNK = palette([0x7d6446, 0x6e5a40]);
const REEDS = palette([0x6b7440, 0x5e6b3a, 0x77803f]);
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
    const tree = (
      crown: PropKind,
      trunk: PropKind,
      colors: Color[],
      size: number,
      stretch = 1,
      trunks = TRUNK,
    ) => {
      const at = spot(0.08, 0.82);
      const before = n;
      add(crown, colors, size, stretch, at);
      // Trunk shares the crown's position and scale.
      const crownInstance = out[out.length - 1]!;
      out.push({ ...crownInstance, kind: trunk, color: trunks[before % trunks.length]! });
    };

    if (tile.feature === 'woods') {
      const cold = tile.terrain === 'tundra' || tile.terrain === 'snow';
      const dry = tile.terrain === 'plains' || tile.terrain === 'desert';
      for (let i = 0; i < density.trees; i++) {
        const roll = rand(t, i, 7);
        if (cold || roll < 0.4) tree('pineCrown', 'pineTrunk', PINE, 1, 1.1);
        // Dry ground is Mediterranean: dark cypresses among the oaks.
        else if (dry && roll < 0.75) tree('cypressCrown', 'cypressTrunk', CYPRESS, 0.9, 1.05);
        else tree('broadCrown', 'broadTrunk', BROAD, 0.8);
      }
    } else if (tile.feature === 'oasis') {
      for (let i = 0; i < 4; i++) tree('palmCrown', 'palmTrunk', PALM, 1, 1, PALM_TRUNK);
      for (let i = 0; i < 2; i++) add('reeds', REEDS, 1.0, 1, spot(0.2, 0.5));
    } else if (tile.feature?.startsWith('floodplains') && density.scatter > 0) {
      // River valleys of dry lands: date palms and reeds on the banks.
      const palms = tile.terrain === 'desert' || tile.terrain === 'plains' ? 2 : 1;
      for (let i = 0; i < palms; i++) tree('palmCrown', 'palmTrunk', PALM, 0.95, 1, PALM_TRUNK);
      add('reeds', REEDS, 1.0, 1, spot(0.3, 0.8));
    } else if (tile.feature === 'marsh' && density.scatter > 0) {
      for (let i = 0; i < 3 + density.scatter; i++) add('reeds', REEDS, 1.05, 1, spot(0.1, 0.85));
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
