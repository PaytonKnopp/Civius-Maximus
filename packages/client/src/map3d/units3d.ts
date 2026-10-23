import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
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
  PlaneGeometry,
  RingGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
} from 'three';
import type { PathView, UnitView } from '../map/renderer';

/**
 * Units in the 3D world: small low-poly squads (oversized against the terrain so they read at
 * strategy zoom), a floating badge per unit, smooth movement along the path just taken, the
 * selection ring and the path preview with turn markers.
 */

const SCALE = 2.1;
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
  body: new ConeGeometry(0.05, 0.17, 6).translate(0, 0.085, 0),
  head: new SphereGeometry(0.034, 6, 5).translate(0, 0.2, 0),
  shield: new BoxGeometry(0.015, 0.09, 0.07).translate(0.055, 0.1, 0),
  stick: new CylinderGeometry(0.008, 0.008, 0.26, 4).translate(-0.05, 0.12, 0),
  bow: new TorusGeometry(0.06, 0.007, 4, 10, Math.PI).rotateY(Math.PI / 2).translate(0.05, 0.12, 0),
  wagon: new BoxGeometry(0.24, 0.07, 0.13).translate(0, 0.085, 0),
  canopy: new CylinderGeometry(0.075, 0.075, 0.24, 10, 1, false, 0, Math.PI)
    .rotateZ(Math.PI / 2)
    .rotateX(-Math.PI / 2)
    .translate(0, 0.12, 0),
  wheel: new CylinderGeometry(0.04, 0.04, 0.018, 10).rotateX(Math.PI / 2),
  horse: new BoxGeometry(0.2, 0.07, 0.07).translate(0, 0.14, 0),
  neck: new BoxGeometry(0.05, 0.1, 0.05).rotateZ(-0.5).translate(0.11, 0.2, 0),
  leg: new BoxGeometry(0.018, 0.11, 0.018).translate(0, 0.055, 0),
  hull: new CylinderGeometry(0.06, 0.09, 0.34, 4, 1)
    .rotateZ(Math.PI / 2)
    .scale(1, 0.55, 1)
    .translate(0, 0.04, 0),
  mast: new CylinderGeometry(0.008, 0.008, 0.3, 4).translate(0, 0.2, 0),
  sail: new PlaneGeometry(0.16, 0.15).translate(0, 0.22, 0),
  base: new RingGeometry(0.2, 0.24, 24).rotateX(-Math.PI / 2),
};

const solid = (color: number) =>
  new MeshStandardMaterial({ color, roughness: 0.85, flatShading: true });
const mats = {
  skin: solid(0xb88e6a),
  wood: solid(0x5a4330),
  dark: solid(0x2a2420),
  canvas: solid(0xc9bfa3),
  horse: solid(0x6b4b33),
  metal: new MeshStandardMaterial({ color: 0x9a8f7a, roughness: 0.45, metalness: 0.7 }),
};
const clothCache = new Map<number, MeshStandardMaterial>();
const cloth = (color: number) => {
  let m = clothCache.get(color);
  if (!m) {
    m = new MeshStandardMaterial({ color, roughness: 0.8, flatShading: true, side: DoubleSide });
    clothCache.set(color, m);
  }
  return m;
};
const baseCache = new Map<number, MeshBasicMaterial>();
const baseMat = (color: number) => {
  let m = baseCache.get(color);
  if (!m) {
    m = new MeshBasicMaterial({ color, transparent: true, opacity: 0.85, toneMapped: false });
    baseCache.set(color, m);
  }
  return m;
};

function part(g: BufferGeometry, m: MeshStandardMaterial, x = 0, z = 0, y = 0) {
  const mesh = new Mesh(g, m);
  mesh.position.set(x, y, z);
  return mesh;
}

function figure(color: number, x: number, z: number, extra?: 'shield' | 'stick' | 'bow') {
  const g = new Group();
  g.add(part(geo.body, cloth(color)), part(geo.head, mats.skin));
  if (extra === 'shield') g.add(part(geo.shield, cloth(color)), part(geo.stick, mats.wood));
  if (extra === 'stick') g.add(part(geo.stick, mats.wood));
  if (extra === 'bow') g.add(part(geo.bow, mats.wood));
  g.position.set(x, 0, z);
  return g;
}

function buildModel(view: UnitView): Group {
  const color = view.color;
  const g = new Group();
  switch (view.model) {
    case 'warrior':
      g.add(
        figure(color, -0.07, 0.04, 'shield'),
        figure(color, 0.07, 0.04, 'shield'),
        figure(color, 0, -0.07, 'shield'),
      );
      break;
    case 'archer':
      g.add(
        figure(color, -0.07, 0.04, 'bow'),
        figure(color, 0.07, 0.04, 'bow'),
        figure(color, 0, -0.07, 'bow'),
      );
      break;
    case 'scout':
      g.add(figure(color, -0.05, 0.02, 'stick'), figure(color, 0.06, -0.03, 'stick'));
      break;
    case 'settler': {
      g.add(part(geo.wagon, mats.wood), part(geo.canopy, mats.canvas));
      for (const [x, z] of [
        [-0.08, 0.07],
        [0.08, 0.07],
        [-0.08, -0.07],
        [0.08, -0.07],
      ] as const) {
        g.add(part(geo.wheel, mats.dark, x, z, 0.04));
      }
      g.add(figure(color, 0.2, 0));
      break;
    }
    case 'cavalry': {
      g.add(part(geo.horse, mats.horse), part(geo.neck, mats.horse));
      for (const [x, z] of [
        [-0.08, 0.025],
        [0.08, 0.025],
        [-0.08, -0.025],
        [0.08, -0.025],
      ] as const) {
        g.add(part(geo.leg, mats.horse, x, z));
      }
      const rider = figure(color, 0, 0, 'stick');
      rider.position.y = 0.13;
      g.add(rider);
      break;
    }
    case 'ship':
      g.add(
        part(geo.hull, mats.wood),
        part(geo.mast, mats.wood),
        part(geo.sail, cloth(color), 0, 0),
      );
      break;
    default:
      g.add(figure(color, -0.05, 0), figure(color, 0.05, 0));
  }
  g.add(new Mesh(geo.base, baseMat(color)));
  g.scale.setScalar(SCALE);
  return g;
}

const badgeCache = new Map<string, SpriteMaterial>();
function badge(view: UnitView): SpriteMaterial {
  const key = `${view.color}:${view.accent}:${view.icon}:${view.mine}:${view.needsOrders}`;
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
  ctx.fillStyle = `#${view.accent.toString(16).padStart(6, '0')}`;
  ctx.font = '700 34px "IBM Plex Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(view.icon, 64, 62);
  if (view.needsOrders) {
    ctx.beginPath();
    ctx.arc(104, 22, 15, 0, Math.PI * 2);
    ctx.fillStyle = '#d4a94e';
    ctx.fill();
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
  ctx.font = '700 40px "IBM Plex Sans", sans-serif';
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
        const group = buildModel(view);
        const sprite = new Sprite(badge(view));
        sprite.scale.set(0.34, 0.34, 1);
        sprite.renderOrder = 30;
        d = { view, group, badge: sprite, pos: target.clone(), route: [] };
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
    for (const d of this.drawn.values()) {
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
