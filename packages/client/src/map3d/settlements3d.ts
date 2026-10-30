import {
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { SettlementView, TerritoryView, TileHighlight } from '../map/renderer';
import { drawRichText, measureRichText } from '../ui/drawIcon';
import {
  ageOfEra,
  architecture,
  building,
  cityCenter,
  factory,
  gardenTree,
  palace,
  walls,
} from './architecture';
import { campParts, districtParts, districtStacks, hutParts, wonderParts } from './districts3d';
import { type Emitter, EffectsLayer } from './effects3d';
import { naturalWonderParts } from './naturalWonders3d';
import { G, house, off, part, scaled, seeded } from './parts';

/**
 * Settlements in the 3D world: clusters of houses that grow with population (a keep for cities,
 * a palace for the capital), border ribbons in each owner's color, improvement models on
 * developed tiles, floating name banners, and tile highlights for choices (develop, buy).
 * Everything for one settlement is merged into a few meshes, so draw calls stay low.
 */

export interface SettlementWorld {
  center(tile: number): [number, number];
  height(x: number, z: number): number;
  neighbors(tile: number): number[];
  worldWidth(): number;
  wrap(): boolean;
  /** Fog level per tile: 2 visible, 1 remembered, 0 unexplored. */
  fog(tile: number): number;
}

/** The buildings of one settlement, around its center tile at (cx, cz), and its smoke and fire. */
function settlementParts(
  view: SettlementView,
  cx: number,
  cz: number,
  height: (x: number, z: number) => number,
): { parts: BufferGeometry[]; emitters: Emitter[] } {
  const parts: BufferGeometry[] = [];
  const emitters: Emitter[] = [];
  const r = seeded(view.tile + 7);
  const ground = (x: number, z: number) => Math.max(0, height(x, z)) - 0.01;
  const city = view.kind === 'city';
  const style = architecture(view.architecture);
  const age = ageOfEra(view.era);
  // Paved plaza in the middle.
  parts.push(
    scaled(G.cyl, age >= 3 ? 0x7a7670 : 0x6f6658, cx, ground(cx, cz) + 0.005, cz, 0.3, 0.02, 0.3),
  );
  const y = ground(cx, cz);
  if (view.capital) palace(parts, cx, y, cz, style, age);
  else if (city) cityCenter(parts, cx, y, cz, style, age);
  else {
    // A town's well.
    parts.push(
      scaled(G.cyl, 0x7d7466, cx, y + 0.03, cz, 0.05, 0.06, 0.05),
      scaled(G.box, 0x6b4a2e, cx, y + 0.09, cz, 0.12, 0.012, 0.012),
    );
  }
  const count = Math.min(60, (city ? 10 : 5) + Math.round(view.population * (city ? 3.6 : 2.4)));
  const radius = city ? 0.78 : 0.62;
  const homes: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    // Rings outward from the plaza, with jitter.
    const t = Math.sqrt((i + 1) / count);
    const ring = 0.24 + t * (radius - 0.24);
    const a = i * 2.39996 + r() * 0.5;
    const x = cx + Math.cos(a) * ring;
    const z = cz + Math.sin(a) * ring * 0.92;
    // An industrial city puts a factory at the edge.
    if (age === 3 && city && i === count - 1 && view.population >= 4) {
      for (const top of factory(parts, x, ground(x, z), z, a))
        emitters.push({ kind: 'chimney', at: top });
      continue;
    }
    building(parts, x, ground(x, z), z, a + r(), r, city ? 1.45 : 1.2, style, age, t);
    homes.push([x, z]);
  }
  // Gardens: a few trees between the houses (fewer among modern blocks).
  const trees = (city ? 3 : 2) + Math.floor(view.population / 3);
  for (let i = 0; i < trees; i++) {
    const a = i * 2.39996 + 1.2 + r();
    const ring = radius * (0.5 + r() * 0.55);
    const x = cx + Math.cos(a) * ring;
    const z = cz + Math.sin(a) * ring * 0.92;
    if (age < 4 || r() < 0.4) gardenTree(parts, x, ground(x, z), z, r);
  }
  if (city && view.wallsMax > 0)
    walls(parts, cx, cz, ground, style, age, view.walls / view.wallsMax, view.tile);
  // Chimney smoke in the Industrial age, from a few houses.
  if (age === 3)
    for (const [x, z] of homes.slice(0, Math.min(3, homes.length)))
      emitters.push({ kind: 'chimney', at: [x, ground(x, z) + 0.2, z] });
  // Burning: fire and black smoke over the houses. Badly damaged: a fire or two.
  const fires = view.razing ? 4 : view.health < view.maxHealth * 0.5 ? 2 : 0;
  for (const [x, z] of homes.slice(0, fires)) {
    emitters.push({ kind: 'fire', at: [x, ground(x, z) + 0.08, z] });
    emitters.push({ kind: 'smoke', at: [x, ground(x, z) + 0.22, z] });
  }
  return { parts, emitters };
}

/** Improvement models, sized to sit inside a tile around (x, z). */
function improvementParts(
  model: string,
  x: number,
  z: number,
  y: number,
  seed: number,
  /** The ground under a point, so fields lie on slopes instead of floating. */
  groundAt: (x: number, z: number) => number = () => y,
): BufferGeometry[] {
  const r = seeded(seed);
  const rot = r() * Math.PI;
  // Turned the same way `scaled` turns a part, so the pieces of an improvement line up.
  const at = (dx: number, dz: number): [number, number] => off(x, z, rot, dx, dz);
  const out: BufferGeometry[] = [];
  switch (model) {
    case 'farm': {
      // Four fields in different crops, each lying on its own patch of ground, with furrows
      // running along it, a hedge on two sides, and a farmhouse with a haystack.
      const fields = [0xb39a4e, 0x6f7f3c, 0xc2a85a, 0x5d6d34];
      [
        [-0.21, -0.15],
        [0.2, -0.15],
        [-0.21, 0.16],
        [0.2, 0.16],
      ].forEach(([dx, dz], i) => {
        const [px, pz] = at(dx!, dz!);
        const fy = groundAt(px, pz);
        const crop = new Color(fields[(i + Math.floor(r() * 2)) % 4]!);
        out.push(scaled(G.box, crop.getHex(), px, fy + 0.012, pz, 0.36, 0.01, 0.26, rot));
        for (let k = -2; k <= 2; k++) {
          const [fx, fz] = at(dx!, dz! + k * 0.048);
          out.push(
            scaled(
              G.box,
              crop.clone().multiplyScalar(0.72).getHex(),
              fx,
              groundAt(fx, fz) + 0.019,
              fz,
              0.34,
              0.006,
              0.012,
              rot,
            ),
          );
        }
        const [hx, hz] = at(dx!, dz! + (dz! < 0 ? -0.14 : 0.14));
        out.push(
          scaled(G.box, 0x3f5228, hx, groundAt(hx, hz) + 0.018, hz, 0.36, 0.028, 0.018, rot),
        );
      });
      const [bx, bz] = at(0.02, 0.0);
      const by = groundAt(bx, bz);
      out.push(
        scaled(G.box, 0xd8ccae, bx, by + 0.03, bz, 0.07, 0.06, 0.05, rot),
        scaled(G.gable, 0x8a4a30, bx, by + 0.058, bz, 0.062, 0.04, 0.078, rot + Math.PI / 2),
      );
      const [sx, sz] = at(-0.06, 0.02);
      out.push(scaled(G.cone, 0xd6b863, sx, groundAt(sx, sz) + 0.028, sz, 0.028, 0.056, 0.028));
      break;
    }
    case 'mine': {
      const [ex, ez] = at(0, -0.05);
      out.push(
        scaled(G.box, 0x1f1b18, ex, y + 0.05, ez, 0.14, 0.1, 0.05, rot),
        scaled(G.box, 0x6b4a2e, ex, y + 0.105, ez, 0.18, 0.02, 0.06, rot),
      );
      for (const s of [-1, 1]) {
        const [px, pz] = at(s * 0.08, -0.05);
        out.push(scaled(G.box, 0x6b4a2e, px, y + 0.05, pz, 0.02, 0.1, 0.02, rot));
      }
      for (const [dx, dz, s] of [
        [0.22, 0.15, 0.06],
        [-0.2, 0.18, 0.05],
        [0.05, 0.25, 0.04],
      ] as const) {
        const [px, pz] = at(dx, dz);
        out.push(scaled(G.rock, 0x6e6a64, px, y + s * 0.6, pz, s, s * 0.8, s));
      }
      const [cx2, cz2] = at(0.1, 0.12);
      out.push(scaled(G.box, 0x5a4a3a, cx2, y + 0.03, cz2, 0.08, 0.05, 0.05, rot));
      break;
    }
    case 'quarry': {
      const [px, pz] = at(0, 0);
      out.push(scaled(G.box, 0x4a4640, px, y + 0.005, pz, 0.4, 0.01, 0.3, rot));
      for (const [dx, dz, h] of [
        [-0.12, -0.05, 0.08],
        [0.02, -0.06, 0.12],
        [0.14, 0.04, 0.06],
        [-0.05, 0.1, 0.05],
      ] as const) {
        const [bx, bz] = at(dx, dz);
        out.push(scaled(G.box, 0xbdb5a2, bx, y + h / 2, bz, 0.09, h, 0.08, rot + r() * 0.4));
      }
      break;
    }
    case 'pasture': {
      const s = 0.28;
      for (const [dx, dz, w, d] of [
        [0, -s, 2 * s, 0.012],
        [0, s, 2 * s, 0.012],
        [-s, 0, 0.012, 2 * s],
        [s, 0, 0.012, 2 * s],
      ] as const) {
        const [px, pz] = at(dx, dz);
        out.push(scaled(G.box, 0x6b4a2e, px, y + 0.03, pz, w, 0.025, d, rot));
      }
      for (let i = 0; i < 4; i++) {
        const [px, pz] = at((r() - 0.5) * 0.4, (r() - 0.5) * 0.4);
        const c = i % 2 ? 0xd9d4c8 : 0x7a5a3e;
        out.push(
          scaled(G.box, c, px, y + 0.035, pz, 0.07, 0.04, 0.035, rot + r()),
          scaled(G.box, c, px + 0.035, y + 0.05, pz, 0.025, 0.025, 0.025, rot),
        );
      }
      break;
    }
    case 'plantation': {
      const [px, pz] = at(0, 0);
      out.push(scaled(G.box, 0x3d3324, px, y + 0.004, pz, 0.5, 0.008, 0.4, rot));
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          const [bx, bz] = at(i * 0.15, j * 0.12);
          const s = 0.045 + r() * 0.015;
          out.push(scaled(G.bush, 0x3f6b2a, bx, y + s, bz, s, s * 1.1, s));
        }
      }
      break;
    }
    case 'camp': {
      const [tx, tz] = at(-0.06, 0);
      const [fx, fz] = at(0.12, 0.08);
      out.push(
        scaled(G.cone, 0xa08a62, tx, y + 0.08, tz, 0.1, 0.16, 0.1),
        scaled(G.cone, 0xd9772a, fx, y + 0.025, fz, 0.025, 0.05, 0.025),
        scaled(G.box, 0x6b4a2e, fx + 0.06, y + 0.06, fz - 0.1, 0.012, 0.12, 0.012),
      );
      break;
    }
    case 'boats': {
      for (const [dx, dz] of [
        [-0.12, -0.08],
        [0.14, 0.1],
      ] as const) {
        const [bx, bz] = at(dx, dz);
        out.push(
          scaled(G.box, 0x5a3e28, bx, 0.02, bz, 0.18, 0.04, 0.06, rot),
          scaled(G.cyl, 0x5a3e28, bx, 0.1, bz, 0.006, 0.14, 0.006),
          scaled(G.box, 0xd8d0bc, bx + 0.02, 0.11, bz, 0.005, 0.09, 0.06, rot + Math.PI / 2),
        );
      }
      break;
    }
    case 'woodcutter': {
      const lying = new Quaternion().setFromEuler(new Euler(0, rot, Math.PI / 2));
      for (const [dx, dz, dy] of [
        [0.1, 0.1, 0],
        [0.1, 0.14, 0],
        [0.1, 0.12, 0.035],
      ] as const) {
        const [lx, lz] = at(dx, dz);
        out.push(
          part(G.cyl, 0x6b4a2e).applyMatrix4(
            new Matrix4().compose(
              new Vector3(lx, y + 0.02 + dy, lz),
              lying,
              new Vector3(0.02, 0.2, 0.02),
            ),
          ),
        );
      }
      const [hx, hz] = at(-0.15, -0.1);
      house(out, hx, y, hz, rot, r, 0.9);
      break;
    }
    default: {
      const [px, pz] = at(0, 0);
      out.push(
        scaled(G.cyl, 0x6b4a2e, px, y + 0.08, pz, 0.008, 0.16, 0.008),
        scaled(G.box, 0xb8914a, px + 0.04, y + 0.14, pz, 0.07, 0.04, 0.004),
      );
    }
  }
  return out;
}

// --- Banners and labels ----------------------------------------------------------------------

const css = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function bannerTexture(view: SettlementView): { texture: CanvasTexture; aspect: number } {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const nameFont = '400 46px "Cinzel Variable", Georgia, serif';
  ctx.font = nameFont;
  const name = `${view.capital ? '★ ' : ''}${view.name}`;
  const nameW = ctx.measureText(name).width;
  ctx.font = '500 26px "Source Sans 3 Variable", sans-serif';
  const statusW = view.status ? ctx.measureText(view.status).width : 0;
  const bars = view.health < view.maxHealth || view.wallsMax > 0;
  const textH = view.status ? 118 : 84;
  const h = textH + (bars ? 26 : 0);
  const w = Math.ceil(Math.max(nameW, statusW) + 130);
  canvas.width = w;
  canvas.height = h;
  roundRect(ctx, 3, 3, w - 6, h - 6, 14);
  ctx.fillStyle = 'rgba(14, 20, 27, 0.9)';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = view.mine ? '#d4a94e' : css(view.color);
  ctx.stroke();
  // Population medallion in the owner's colors.
  ctx.beginPath();
  ctx.arc(48, textH / 2, 31, 0, Math.PI * 2);
  ctx.fillStyle = css(view.color);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = css(view.accent);
  ctx.stroke();
  ctx.fillStyle = css(view.accent);
  ctx.font = '700 32px "Source Sans 3 Variable", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(view.population), 48, textH / 2 + 1);
  ctx.textAlign = 'left';
  ctx.fillStyle = view.kind === 'city' ? '#f0e6cc' : '#d9cfb6';
  ctx.font = nameFont;
  ctx.fillText(name, 94, view.status ? 42 : textH / 2 + 2);
  if (view.status) {
    ctx.font = '500 26px "Source Sans 3 Variable", sans-serif';
    ctx.fillStyle = '#c9b98a';
    ctx.fillText(view.status, 96, 86);
  }
  if (bars) {
    // Walls (grey-blue) over health (green to red), along the bottom.
    const x = 18;
    const width = w - 36;
    const y = textH - 4;
    ctx.fillStyle = '#05080b';
    ctx.fillRect(x - 2, y - 2, width + 4, 22);
    const hp = view.health / view.maxHealth;
    ctx.fillStyle = hp > 0.6 ? '#7fc35a' : hp > 0.3 ? '#e0b040' : '#e0503c';
    ctx.fillRect(x, y + (view.wallsMax > 0 ? 9 : 0), width * hp, view.wallsMax > 0 ? 9 : 18);
    if (view.wallsMax > 0) {
      ctx.fillStyle = '#8fa8c0';
      ctx.fillRect(x, y, (width * view.walls) / view.wallsMax, 8);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return { texture, aspect: w / h };
}

const TONES: Record<TileHighlight['tone'], number> = {
  develop: 0x9fd36a,
  buy: 0xd4a94e,
  worked: 0xe8dcc0,
  selected: 0xe6c070,
  place: 0x7fc3e8,
  planned: 0xb49ce0,
  attack: 0xe0503c,
  lens: 0xc9d0d4,
};

const labelCache = new Map<string, SpriteMaterial>();
function labelMaterial(text: string, color: number): SpriteMaterial {
  const key = `${color}:${text}`;
  const cached = labelCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = '600 34px "Source Sans 3 Variable", sans-serif';
  const w = Math.ceil(measureRichText(ctx, text, 38) + 36);
  canvas.width = w;
  canvas.height = 60;
  roundRect(ctx, 2, 2, w - 4, 56, 12);
  ctx.fillStyle = 'rgba(14, 20, 27, 0.88)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = css(color);
  ctx.stroke();
  ctx.font = '600 34px "Source Sans 3 Variable", sans-serif';
  ctx.fillStyle = '#f0e6cc';
  ctx.textBaseline = 'middle';
  drawRichText(ctx, text, 18, 31, 38);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  const m = new SpriteMaterial({ map: tex, toneMapped: false, depthTest: false });
  (m.userData as { aspect: number }).aspect = w / 60;
  labelCache.set(key, m);
  return m;
}

// --- The layer -------------------------------------------------------------------------------

const buildingMaterial = new MeshStandardMaterial({
  vertexColors: true,
  flatShading: true,
  roughness: 0.88,
  metalness: 0,
});
const ribbonMaterial = new MeshBasicMaterial({
  vertexColors: true,
  side: DoubleSide,
  transparent: true,
  toneMapped: false,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -4,
});

interface Drawn {
  key: string;
  group: Group;
  /** Unwrapped x of the settlement center (for east-west wrap). */
  x: number;
}

/** A ribbon along the inside of a tile edge, as RGBA triangles appended to `pos` / `col`. */
function ribbon(
  pos: number[],
  col: number[],
  world: SettlementWorld,
  center: [number, number],
  a: [number, number],
  b: [number, number],
  inner: number,
  outer: number,
  color: Color,
  alphaOut: number,
  alphaIn: number,
  lift: number,
) {
  const steps = 4;
  const point = (t: number, k: number): [number, number, number] => {
    const ex = a[0] + (b[0] - a[0]) * t;
    const ez = a[1] + (b[1] - a[1]) * t;
    const x = ex + (center[0] - ex) * k;
    const z = ez + (center[1] - ez) * k;
    return [x, Math.max(0, world.height(x, z)) + lift, z];
  };
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    const o0 = point(t0, outer);
    const o1 = point(t1, outer);
    const i0 = point(t0, inner);
    const i1 = point(t1, inner);
    for (const [p, alpha] of [
      [o0, alphaOut],
      [i0, alphaIn],
      [o1, alphaOut],
      [o1, alphaOut],
      [i0, alphaIn],
      [i1, alphaIn],
    ] as const) {
      pos.push(...p);
      col.push(color.r, color.g, color.b, alpha);
    }
  }
}

/** A flat road strip from `from` to `to`, draped over the ground. */
function roadStrip(
  pos: number[],
  col: number[],
  world: SettlementWorld,
  from: [number, number],
  to: [number, number],
  color: Color,
) {
  const steps = 3;
  const half = 0.055;
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const len = Math.hypot(dx, dz) || 1;
  const px = (-dz / len) * half;
  const pz = (dx / len) * half;
  const at = (t: number, side: number): [number, number, number] => {
    const x = from[0] + dx * t + px * side;
    const z = from[1] + dz * t + pz * side;
    return [x, Math.max(0, world.height(x, z)) + 0.02, z];
  };
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    for (const p of [at(t0, -1), at(t0, 1), at(t1, -1), at(t1, -1), at(t0, 1), at(t1, 1)]) {
      pos.push(...p);
      col.push(color.r, color.g, color.b, 0.9);
    }
  }
}

function ribbonMesh(pos: number[], col: number[]): Mesh {
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new Float32BufferAttribute(col, 4));
  const mesh = new Mesh(geo, ribbonMaterial);
  mesh.renderOrder = 3;
  mesh.frustumCulled = false;
  return mesh;
}

export class SettlementLayer {
  readonly group = new Group();
  private drawn = new Map<string, Drawn>();
  /** Hostile camps, one small group each (by tile). */
  private camps = new Map<number, Drawn>();
  /** Tribal villages, likewise. */
  private huts = new Map<number, Drawn>();
  /** Roads, one small group per road tile (so east-west wrap can move each). */
  private roads = new Map<number, Drawn>();
  /** Natural wonder landmarks, by tile. */
  private wonders = new Map<number, Drawn>();
  private highlights = new Group();
  private highlightKey = '';
  private highlightX: number[] = [];
  /** Smoke and fire over settlements and industrial zones. */
  readonly effects: EffectsLayer;

  constructor(private world: SettlementWorld) {
    this.effects = new EffectsLayer(world);
    this.group.add(this.highlights, this.effects.group);
  }

  /** The corners of the edge a tile shares with its neighbor, and the tile's center. */
  private edge(
    t: number,
    n: number,
  ): { c: [number, number]; a: [number, number]; b: [number, number] } {
    const c = this.world.center(t);
    const [x0, nz] = this.world.center(n);
    let nx = x0;
    if (this.world.wrap()) {
      const w = this.world.worldWidth();
      nx += Math.round((c[0] - nx) / w) * w;
    }
    const dx = nx - c[0];
    const dz = nz - c[1];
    const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len;
    const uz = dz / len;
    const mx = c[0] + ux * (Math.sqrt(3) / 2);
    const mz = c[1] + uz * (Math.sqrt(3) / 2);
    return { c, a: [mx - uz * 0.5, mz + ux * 0.5], b: [mx + uz * 0.5, mz - ux * 0.5] };
  }

  set(views: SettlementView[], territory: TerritoryView) {
    const byId = new Map(views.map((v) => [v.id, v]));
    const ownerOf = (t: number) => {
      const s = territory.settlement[t];
      return s ? (byId.get(s)?.owner ?? `?${s}`) : null;
    };
    const tilesOf = new Map<string, number[]>();
    territory.settlement.forEach((s, t) => {
      if (s === null || this.world.fog(t) === 0) return;
      const list = tilesOf.get(s) ?? [];
      list.push(t);
      tilesOf.set(s, list);
    });

    const keep = new Set<string>();
    for (const view of views) {
      const tiles = tilesOf.get(view.id) ?? [];
      const sig = tiles
        .map((t) => {
          const ns = this.world
            .neighbors(t)
            .map((n) => (ownerOf(n) === view.owner ? 1 : 0))
            .join('');
          const built = territory.districts[t]?.model ?? territory.wonders[t]?.model ?? '';
          return `${t}:${territory.improvements[t] ?? ''}:${built}:${this.world.fog(t)}:${ns}`;
        })
        .join('|');
      const key = `${JSON.stringify(view)}#${this.world.fog(view.tile)}#${sig}`;
      keep.add(view.id);
      const prev = this.drawn.get(view.id);
      if (prev?.key === key) continue;
      if (prev) this.dispose(prev);
      const drawn = this.build(view, tiles, territory, ownerOf);
      drawn.key = key;
      this.drawn.set(view.id, drawn);
      this.group.add(drawn.group);
    }
    for (const [id, d] of this.drawn) {
      if (keep.has(id)) continue;
      this.dispose(d);
      this.drawn.delete(id);
      this.effects.set(id, []);
    }
    this.setMarkers(this.camps, territory.camps, campParts);
    this.setMarkers(this.huts, territory.huts ?? [], hutParts);
    this.setRoads(territory.roads);
  }

  private setRoads(roads: boolean[]) {
    const want = new Map<number, string>();
    roads.forEach((r, t) => {
      if (!r || this.world.fog(t) === 0) return;
      const mask = this.world
        .neighbors(t)
        .map((n) => (roads[n] ? 1 : 0))
        .join('');
      want.set(t, `${this.world.fog(t)}:${mask}`);
    });
    for (const [t, d] of this.roads) {
      if (want.get(t) === d.key) continue;
      this.dispose(d);
      this.roads.delete(t);
    }
    for (const [t, key] of want) {
      if (this.roads.has(t)) continue;
      const pos: number[] = [];
      const col: number[] = [];
      const dim = this.world.fog(t) === 1 ? 0.5 : 1;
      const color = new Color(0x9a7a52).multiplyScalar(dim);
      for (const n of this.world.neighbors(t)) {
        if (!roads[n]) continue;
        const { c, a, b } = this.edge(t, n);
        roadStrip(pos, col, this.world, c, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], color);
      }
      const group = new Group();
      if (pos.length > 0) group.add(ribbonMesh(pos, col));
      this.group.add(group);
      this.roads.set(t, { key, group, x: this.world.center(t)[0] });
    }
  }

  /** The natural wonders the viewer has found (dimmed when only remembered). */
  setNaturalWonders(list: { tile: number; model: string }[]) {
    const want = new Map<number, { model: string; key: string }>();
    for (const w of list) {
      const fog = this.world.fog(w.tile);
      if (fog !== 0) want.set(w.tile, { model: w.model, key: `${w.model}:${fog}` });
    }
    for (const [t, d] of this.wonders) {
      if (want.get(t)?.key === d.key) continue;
      this.dispose(d);
      this.wonders.delete(t);
      this.effects.set(`nw${t}`, []);
    }
    for (const [t, w] of want) {
      if (this.wonders.has(t)) continue;
      const [x, z] = this.world.center(t);
      const { parts, emitters } = naturalWonderParts(w.model, x, z, this.world.height(x, z), t);
      const merged = mergeGeometries(parts);
      for (const p of parts) p.dispose();
      const group = new Group();
      const remembered = this.world.fog(t) === 1;
      if (merged) {
        if (remembered) {
          const c = merged.getAttribute('color');
          for (let i = 0; i < c.count; i++)
            c.setXYZ(i, c.getX(i) * 0.35, c.getY(i) * 0.37, c.getZ(i) * 0.42);
        }
        merged.computeBoundingSphere();
        group.add(new Mesh(merged, buildingMaterial));
      }
      this.group.add(group);
      this.wonders.set(t, { key: w.key, group, x });
      this.effects.set(`nw${t}`, remembered ? [] : emitters);
    }
  }

  /** One small model per marked tile (camps, villages), dimmed under fog. */
  private setMarkers(store: Map<number, Drawn>, marks: boolean[], model: typeof campParts) {
    const want = new Set<number>();
    marks.forEach((c, t) => c && want.add(t));
    for (const [t, d] of store) {
      const key = `${this.world.fog(t)}`;
      if (want.has(t) && d.key === key) continue;
      this.dispose(d);
      store.delete(t);
    }
    for (const t of want) {
      if (store.has(t)) continue;
      const [x, z] = this.world.center(t);
      const parts = model(x, z, Math.max(0, this.world.height(x, z)) - 0.005, t);
      const merged = mergeGeometries(parts);
      for (const p of parts) p.dispose();
      const group = new Group();
      if (merged) {
        if (this.world.fog(t) === 1) {
          const c = merged.getAttribute('color');
          for (let i = 0; i < c.count; i++) {
            c.setXYZ(i, c.getX(i) * 0.35, c.getY(i) * 0.37, c.getZ(i) * 0.42);
          }
        }
        merged.computeBoundingSphere();
        group.add(new Mesh(merged, buildingMaterial));
      }
      this.group.add(group);
      store.set(t, { key: `${this.world.fog(t)}`, group, x });
    }
  }

  private build(
    view: SettlementView,
    tiles: number[],
    territory: TerritoryView,
    ownerOf: (t: number) => string | null,
  ): Drawn {
    const group = new Group();
    const [cx, cz] = this.world.center(view.tile);
    const height = (x: number, z: number) => this.world.height(x, z);
    const centerKnown = this.world.fog(view.tile) !== 0;
    const remembered = this.world.fog(view.tile) === 1;

    // Buildings and improvements: one merged mesh.
    const town = centerKnown ? settlementParts(view, cx, cz, height) : { parts: [], emitters: [] };
    const parts: BufferGeometry[] = town.parts;
    const emitters: Emitter[] = remembered ? [] : town.emitters;
    for (const t of tiles) {
      if (t === view.tile) continue;
      const [x, z] = this.world.center(t);
      const ground = Math.max(0, height(x, z)) - 0.005;
      const district = territory.districts[t];
      const wonder = territory.wonders[t];
      const model = territory.improvements[t];
      if (district) {
        parts.push(...districtParts(district.model, district.color, x, z, ground, t));
        if (this.world.fog(t) === 2)
          for (const at of districtStacks(district.model, x, z, ground, t))
            emitters.push({ kind: 'chimney', at });
      } else if (wonder) parts.push(...wonderParts(wonder.model, x, z, ground, t));
      else if (model)
        parts.push(
          ...improvementParts(
            model,
            x,
            z,
            ground,
            t,
            (px, pz) => Math.max(0, height(px, pz)) - 0.005,
          ),
        );
    }
    if (parts.length > 0) {
      const merged = mergeGeometries(parts);
      for (const p of parts) p.dispose();
      if (merged) {
        if (remembered) {
          const c = merged.getAttribute('color');
          for (let i = 0; i < c.count; i++) {
            c.setXYZ(i, c.getX(i) * 0.35, c.getY(i) * 0.37, c.getZ(i) * 0.42);
          }
        }
        merged.computeBoundingSphere();
        const mesh = new Mesh(merged, buildingMaterial);
        group.add(mesh);
      }
    }

    // Borders: a bright edge with a soft glow fading inward, on edges facing other owners.
    const pos: number[] = [];
    const col: number[] = [];
    // Lifted toward white so dark civ colors still read against dark terrain.
    const main = new Color(view.color).lerp(new Color(0xffffff), 0.12);
    const edgeDark = new Color(0x0b0f14);
    for (const t of tiles) {
      const dim = this.world.fog(t) === 1 ? 0.55 : 1;
      const color = main.clone().multiplyScalar(dim);
      for (const n of this.world.neighbors(t)) {
        if (ownerOf(n) === view.owner) continue;
        const { c, a, b } = this.edge(t, n);
        ribbon(pos, col, this.world, c, a, b, 0.012, 0, edgeDark, 0.7, 0.7, 0.045);
        ribbon(pos, col, this.world, c, a, b, 0.05, 0.012, color, 1, 1, 0.045);
        ribbon(pos, col, this.world, c, a, b, 0.17, 0.05, color, 0.32, 0, 0.04);
      }
    }
    if (pos.length > 0) group.add(ribbonMesh(pos, col));

    // Name banner.
    if (centerKnown) {
      const { texture, aspect } = bannerTexture(view);
      const sprite = new Sprite(
        new SpriteMaterial({
          map: texture,
          toneMapped: false,
          depthTest: false,
          transparent: true,
        }),
      );
      const h = 0.42;
      sprite.scale.set(h * aspect, h, 1);
      sprite.position.set(cx, Math.max(0, height(cx, cz)) + 0.95, cz + 0.2);
      sprite.renderOrder = 30;
      if (remembered) sprite.material.color.setScalar(0.6);
      group.add(sprite);
    }
    this.effects.set(view.id, emitters);
    return { key: '', group, x: cx };
  }

  private dispose(d: Drawn) {
    this.group.remove(d.group);
    d.group.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
      if (o instanceof Sprite) {
        o.material.map?.dispose();
        o.material.dispose();
      }
    });
  }

  setHighlights(list: TileHighlight[]) {
    const key = JSON.stringify(list);
    if (key === this.highlightKey) return;
    this.highlightKey = key;
    for (const child of [...this.highlights.children]) {
      this.highlights.remove(child);
      if (child instanceof Mesh) child.geometry.dispose();
    }
    this.highlightX = [];
    for (const h of list) {
      const holder = new Group();
      const [cx, cz] = this.world.center(h.tile);
      const pos: number[] = [];
      const col: number[] = [];
      const color = new Color(h.color ?? TONES[h.tone]);
      if (h.tone !== 'worked') {
        for (const n of this.world.neighbors(h.tile)) {
          const { c, a, b } = this.edge(h.tile, n);
          ribbon(pos, col, this.world, c, a, b, 0.1, 0.04, color, 0.9, 0.9, 0.05);
        }
        holder.add(ribbonMesh(pos, col));
      }
      if (h.label) {
        const m = labelMaterial(h.label, h.color ?? TONES[h.tone]);
        const sprite = new Sprite(m);
        const s = h.tone === 'worked' ? 0.18 : 0.2;
        sprite.scale.set(s * (m.userData as { aspect: number }).aspect, s, 1);
        sprite.position.set(cx, Math.max(0, this.world.height(cx, cz)) + 0.3, cz);
        sprite.renderOrder = 25;
        holder.add(sprite);
      }
      this.highlights.add(holder);
      this.highlightX.push(cx);
    }
  }

  /** Keeps everything in the copy of the world nearest the camera (east-west wrap). */
  update(cameraX: number, dt = 0) {
    this.effects.update(dt, cameraX);
    if (!this.world.wrap()) return;
    const w = this.world.worldWidth();
    const shift = (x: number) => Math.round((cameraX - x) / w) * w;
    for (const d of this.drawn.values()) d.group.position.x = shift(d.x);
    for (const d of this.camps.values()) d.group.position.x = shift(d.x);
    for (const d of this.huts.values()) d.group.position.x = shift(d.x);
    for (const d of this.roads.values()) d.group.position.x = shift(d.x);
    for (const d of this.wonders.values()) d.group.position.x = shift(d.x);
    this.highlights.children.forEach((c, i) => {
      c.position.x = shift(this.highlightX[i] ?? 0);
    });
  }

  clear() {
    this.effects.clear();
    for (const d of this.drawn.values()) this.dispose(d);
    this.drawn.clear();
    for (const d of this.camps.values()) this.dispose(d);
    this.camps.clear();
    for (const d of this.huts.values()) this.dispose(d);
    this.huts.clear();
    for (const d of this.roads.values()) this.dispose(d);
    this.roads.clear();
    for (const d of this.wonders.values()) this.dispose(d);
    this.wonders.clear();
  }
}
