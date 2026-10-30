import {
  Bone,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  Skeleton,
  SkinnedMesh,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { PathView, UnitView } from '../map/renderer';
import { drawIcon } from '../ui/drawIcon';
import { type AttackAnim, animateRigs, restOffsets } from './figures';
import type { Rig } from './rig';
import { type UnitGeometry, unitGeometry } from './unitModels';

/**
 * Units in the 3D world: squads of rigged figures (oversized against the terrain so they read at
 * strategy zoom) that breathe at rest, walk along the path just taken and swing, thrust, draw or
 * fire when they attack; a soft shadow and a ring in the owner's color under them, a floating
 * badge, the selection ring and the path preview with turn markers.
 */

const SCALE = 2.25;
const ATTACK_SECONDS = 0.75;
const LAYER_OFFSET: Record<UnitView['layer'], [number, number]> = {
  military: [-0.22, -0.04],
  civilian: [0.25, 0.14],
  support: [0, -0.32],
};
const SPEED = 6; // tiles per second when animating moves

export interface UnitWorld {
  /** World x/z of a tile's center (unwrapped). */
  center(tile: number): [number, number];
  height(x: number, z: number): number;
  worldWidth(): number;
  wrap(): boolean;
}

const geo = {
  base: new RingGeometry(0.2, 0.226, 40).rotateX(-Math.PI / 2),
  shadow: new CircleGeometry(0.27, 28).rotateX(-Math.PI / 2),
};

/** A soft round shadow: dark in the middle, fading out. */
const shadowMat = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,0.62)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.38)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new MeshBasicMaterial({
    map: new CanvasTexture(c),
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
})();

const baseCache = new Map<number, MeshBasicMaterial>();
const baseMat = (color: number) => {
  let m = baseCache.get(color);
  if (!m) {
    m = new MeshBasicMaterial({ color, transparent: true, opacity: 0.85, toneMapped: false });
    baseCache.set(color, m);
  }
  return m;
};

/** A warm rim of light on the edges, so figures stand out from the land behind them. */
function withRim<T extends MeshStandardMaterial>(m: T, strength: number): T {
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `float rimF = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.4);
      outgoingLight += vec3(1.0, 0.86, 0.64) * rimF * ${strength.toFixed(2)};
      #include <opaque_fragment>`,
    );
  };
  return m;
}

const matte = withRim(
  new MeshStandardMaterial({ vertexColors: true, roughness: 0.74, side: DoubleSide }),
  0.26,
);
const metal = withRim(
  new MeshStandardMaterial({ vertexColors: true, roughness: 0.36, metalness: 0.7 }),
  0.18,
);

const IDENTITY = new Matrix4();
const inverseCache = new WeakMap<UnitGeometry, Matrix4[]>();
/** Each bone's inverse rest transform (rest bones have no rotation: a translation). */
function inverses(geom: UnitGeometry): Matrix4[] {
  let list = inverseCache.get(geom);
  if (!list) {
    list = geom.bones.map((b) => new Matrix4().makeTranslation(-b.at[0], -b.at[1], -b.at[2]));
    inverseCache.set(geom, list);
  }
  return list;
}

interface Model {
  group: Group;
  bones: Bone[];
  rest: Vector3[];
  rigs: Rig[];
}

function buildModel(view: UnitView): Model {
  const g = new Group();
  const geom = unitGeometry(view.model, view.color, view.accent);
  const rest = restOffsets(geom.bones);
  const bones = geom.bones.map((_, i) => {
    const b = new Bone();
    b.position.copy(rest[i]!);
    return b;
  });
  geom.bones.forEach((d, i) => d.parent >= 0 && bones[d.parent]!.add(bones[i]!));
  const skeleton = new Skeleton(bones, inverses(geom));
  const skinned = (geometry: BufferGeometry, material: MeshStandardMaterial) => {
    const mesh = new SkinnedMesh(geometry, material);
    mesh.bind(skeleton, IDENTITY);
    mesh.boundingSphere = geometry.boundingSphere!.clone();
    mesh.boundingSphere.radius *= 1.4;
    return mesh;
  };
  const body = skinned(geom.matte, matte);
  body.add(bones[0]!);
  g.add(body);
  if (geom.metal) g.add(skinned(geom.metal, metal));
  const shadow = new Mesh(geo.shadow, shadowMat);
  shadow.position.y = 0.004;
  shadow.renderOrder = 1;
  g.add(shadow, new Mesh(geo.base, baseMat(view.color)));
  g.scale.setScalar(SCALE);
  return { group: g, bones, rest, rigs: geom.rigs };
}

const badgeCache = new Map<string, SpriteMaterial>();
function badge(view: UnitView): SpriteMaterial {
  // Health in steps of 5%, so a badge is drawn once per look, not once per HP.
  const health = Math.max(0, Math.min(100, Math.ceil(view.health / 5) * 5));
  const key = `${view.color}:${view.accent}:${view.model}:${view.icon}:${view.mine}:${view.needsOrders}:${health}:${view.promotable}`;
  const cached = badgeCache.get(key);
  if (cached) return cached;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const color = `#${view.color.toString(16).padStart(6, '0')}`;
  // Shield shape: rounded top, pointed bottom.
  ctx.beginPath();
  ctx.moveTo(20, 18);
  ctx.lineTo(108, 18);
  ctx.lineTo(108, 70);
  ctx.quadraticCurveTo(108, 100, 64, 122);
  ctx.quadraticCurveTo(20, 100, 20, 70);
  ctx.closePath();
  ctx.fillStyle = '#10161d';
  ctx.fill();
  ctx.lineWidth = 9;
  ctx.strokeStyle = view.mine ? '#d4a94e' : color;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(64, 60, 30, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  const accent = `#${view.accent.toString(16).padStart(6, '0')}`;
  if (!drawIcon(ctx, view.model, 64, 60, 50, 'glyph', accent)) {
    ctx.fillStyle = accent;
    ctx.font = '700 34px "Source Sans 3 Variable", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(view.icon, 64, 62);
  }
  if (view.needsOrders) {
    ctx.beginPath();
    ctx.arc(104, 22, 15, 0, Math.PI * 2);
    ctx.fillStyle = '#d4a94e';
    ctx.fill();
  }
  if (view.promotable) {
    // A gold star: a promotion is ready.
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 === 0 ? 17 : 7;
      ctx.lineTo(24 + Math.cos(a) * rr, 24 + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = '#ffd56a';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#10161d';
    ctx.stroke();
  }
  if (health < 100) {
    // Health bar across the bottom of the shield: green, amber, then red.
    ctx.fillStyle = '#10161d';
    ctx.fillRect(28, 96, 72, 14);
    ctx.fillStyle = health > 60 ? '#7fc35a' : health > 30 ? '#e0b040' : '#e0503c';
    ctx.fillRect(31, 99, (66 * health) / 100, 8);
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  const m = new SpriteMaterial({ map: tex, toneMapped: false, depthTest: false });
  badgeCache.set(key, m);
  return m;
}

const markerCache = new Map<string, SpriteMaterial>();
function turnMarker(label: string, final: boolean): SpriteMaterial {
  const key = `${label}:${final}`;
  const cached = markerCache.get(key);
  if (cached) return cached;
  const size = 96;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.beginPath();
  ctx.arc(48, 48, 38, 0, Math.PI * 2);
  ctx.fillStyle = final ? '#d4a94e' : '#10161d';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#d4a94e';
  ctx.stroke();
  ctx.fillStyle = final ? '#10161d' : '#ecdcb4';
  ctx.font = '700 40px "Source Sans 3 Variable", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 48, 50);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  const m = new SpriteMaterial({ map: tex, toneMapped: false, depthTest: false });
  markerCache.set(key, m);
  return m;
}

interface Drawn {
  view: UnitView;
  group: Group;
  model: Model;
  /** An attack under way: its kind and when it started. */
  attack: { kind: AttackAnim['kind']; start: number } | null;
  badge: Sprite;
  /** World position (unwrapped) and pending animation waypoints. */
  pos: Vector3;
  route: Vector3[];
}

export class UnitLayer {
  readonly group = new Group();
  private drawn = new Map<string, Drawn>();
  private selected: string | null = null;
  private ring = new Mesh(
    new RingGeometry(0.42, 0.5, 40).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({
      color: 0xe6c070,
      transparent: true,
      opacity: 0.9,
      toneMapped: false,
      depthTest: false,
    }),
  );
  private pathGroup = new Group();
  private pathOrigin = 0;
  private dots = new InstancedMesh(
    new SphereGeometry(0.05, 8, 6),
    new MeshBasicMaterial({ toneMapped: false, depthTest: false, transparent: true }),
    256,
  );

  constructor(private world: UnitWorld) {
    this.ring.renderOrder = 20;
    this.ring.visible = false;
    this.dots.count = 0;
    this.dots.frustumCulled = false;
    this.dots.renderOrder = 21;
    this.pathGroup.add(this.dots);
    this.group.add(this.ring, this.pathGroup);
  }

  private slot(view: UnitView): Vector3 {
    const [x, z] = this.world.center(view.tile);
    const [ox, oz] = LAYER_OFFSET[view.layer];
    return new Vector3(x + ox, Math.max(0, this.world.height(x + ox, z + oz)), z + oz);
  }

  /** Brings an unwrapped x next to `ref`, so movement across the date line doesn't sweep the map. */
  private near(x: number, ref: number): number {
    if (!this.world.wrap()) return x;
    const w = this.world.worldWidth();
    return x + Math.round((ref - x) / w) * w;
  }

  setUnits(views: UnitView[], moves: { unit: string; path: number[] }[] = []) {
    const keep = new Set(views.map((v) => v.id));
    for (const [id, d] of this.drawn) {
      if (!keep.has(id)) {
        this.group.remove(d.group, d.badge);
        this.drawn.delete(id);
      }
    }
    const moved = new Map(moves.map((m) => [m.unit, m.path]));
    for (const view of views) {
      let d = this.drawn.get(view.id);
      const target = this.slot(view);
      if (!d || d.view.model !== view.model || d.view.color !== view.color) {
        if (d) this.group.remove(d.group, d.badge);
        const model = buildModel(view);
        const group = model.group;
        const sprite = new Sprite(badge(view));
        sprite.scale.set(0.34, 0.34, 1);
        sprite.renderOrder = 30;
        d = { view, group, model, attack: null, badge: sprite, pos: target.clone(), route: [] };
        this.group.add(group, sprite);
        this.drawn.set(view.id, d);
      }
      d.badge.material = badge(view);
      const path = moved.get(view.id);
      if (path && path.length > 1) {
        // Walk the path tile by tile, ending on the unit's layer spot.
        let ref = d.pos.x;
        d.route = path.slice(1).map((t, i, all) => {
          const p =
            i === all.length - 1
              ? target.clone()
              : (() => {
                  const [x, z] = this.world.center(t);
                  return new Vector3(x, Math.max(0, this.world.height(x, z)), z);
                })();
          p.x = this.near(p.x, ref);
          ref = p.x;
          return p;
        });
      } else if (d.route.length === 0) {
        d.pos.copy(target);
        d.pos.x = this.near(target.x, d.pos.x);
      }
      d.view = view;
    }
  }

  setSelected(id: string | null) {
    this.selected = id;
  }

  /**
   * An attack on a tile: the unit turns to face it and plays its attack (a swing, a thrust, a
   * draw or a volley); melee units also lunge toward the tile and back.
   */
  attack(id: string, tile: number, mode: 'melee' | 'ranged') {
    const d = this.drawn.get(id);
    if (!d) return;
    const [x0, z] = this.world.center(tile);
    const x = this.near(x0, d.pos.x);
    d.group.rotation.y = Math.atan2(-(z - d.pos.z), x - d.pos.x);
    d.attack = { kind: mode, start: this.now };
    if (mode === 'melee') {
      const home = d.route.length > 0 ? d.route[d.route.length - 1]!.clone() : d.pos.clone();
      const toward = home.clone().lerp(new Vector3(x, home.y, z), 0.4);
      d.route.push(toward, home);
    }
  }

  private now = 0;

  setPath(path: PathView | null, fromTile: number | null) {
    for (const child of [...this.pathGroup.children])
      if (child !== this.dots) this.pathGroup.remove(child);
    this.dots.count = 0;
    if (!path || path.steps.length === 0 || fromTile === null) return;
    const [sx, sz] = this.world.center(fromTile);
    this.pathOrigin = sx;
    let ref = sx;
    const pts: Vector3[] = [new Vector3(sx, Math.max(0, this.world.height(sx, sz)) + 0.1, sz)];
    const m = new Matrix4();
    const now = new Color(0xe6c070);
    const later = new Color(0x9fb0bf);
    path.steps.forEach((step, i) => {
      const [x0, z] = this.world.center(step.tile);
      const x = this.near(x0, ref);
      ref = x;
      const y = Math.max(0, this.world.height(x0, z)) + 0.1;
      pts.push(new Vector3(x, y, z));
      if (i < 256) {
        m.makeTranslation(x, y, z);
        this.dots.setMatrixAt(i, m);
        this.dots.setColorAt(i, step.turn === 0 ? now : later);
      }
      const final = i === path.steps.length - 1;
      if (step.endsTurn || final) {
        const marker = new Sprite(turnMarker(String(step.turn + 1), final));
        marker.position.set(x, y + 0.32, z);
        marker.scale.set(0.3, 0.3, 1);
        marker.renderOrder = 22;
        this.pathGroup.add(marker);
      }
    });
    this.dots.count = Math.min(256, path.steps.length);
    this.dots.instanceMatrix.needsUpdate = true;
    if (this.dots.instanceColor) this.dots.instanceColor.needsUpdate = true;
    const line = new Line(
      new BufferGeometry().setAttribute(
        'position',
        new Float32BufferAttribute(
          pts.flatMap((p) => [p.x, p.y, p.z]),
          3,
        ),
      ),
      new LineBasicMaterial({
        color: 0xe6c070,
        transparent: true,
        opacity: 0.75,
        depthTest: false,
        toneMapped: false,
      }),
    );
    line.renderOrder = 21;
    this.pathGroup.add(line);
  }

  /** Per frame: animate moves, keep everything in the world copy nearest the camera. */
  update(dt: number, cameraX: number, time: number) {
    const w = this.world.worldWidth();
    const shiftFor = (x: number) => (this.world.wrap() ? Math.round((cameraX - x) / w) * w : 0);
    this.now = time;
    for (const d of this.drawn.values()) {
      const walking = d.route.length > 0;
      let attack: AttackAnim | null = null;
      if (d.attack) {
        const u = (time - d.attack.start) / ATTACK_SECONDS;
        if (u >= 1 || u < 0) d.attack = null;
        else attack = { kind: d.attack.kind, u };
      }
      animateRigs(d.model.rigs, d.model.bones, d.model.rest, time, walking, attack);
      if (d.route.length > 0) {
        const next = d.route[0]!;
        const step = SPEED * dt * Math.sqrt(3);
        const delta = next.clone().sub(d.pos);
        const dist = delta.length();
        if (dist <= step) {
          d.pos.copy(next);
          d.route.shift();
        } else {
          d.pos.add(delta.multiplyScalar(step / dist));
        }
        if (Math.abs(next.x - d.pos.x) + Math.abs(next.z - d.pos.z) > 0.001) {
          d.group.rotation.y = Math.atan2(-(next.z - d.pos.z), next.x - d.pos.x);
        }
      }
      const shift = shiftFor(d.pos.x);
      d.group.position.set(d.pos.x + shift, d.pos.y, d.pos.z);
      d.badge.position.set(d.pos.x + shift, d.pos.y + 0.78, d.pos.z);
      if (d.view.id === this.selected) {
        this.ring.position.set(d.pos.x + shift, d.pos.y + 0.03, d.pos.z);
        (this.ring.material as MeshBasicMaterial).opacity = 0.65 + 0.3 * Math.sin(time * 4);
      }
    }
    this.ring.visible = this.selected !== null && this.drawn.has(this.selected);
    this.pathGroup.position.x = shiftFor(this.pathOrigin);
  }

  isAnimating(): boolean {
    for (const d of this.drawn.values()) if (d.route.length > 0) return true;
    return false;
  }
}
