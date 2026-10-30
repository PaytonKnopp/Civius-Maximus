import {
  BufferGeometry,
  Color,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  Matrix4,
  Quaternion,
  Uint16BufferAttribute,
  Vector3,
} from 'three';

/**
 * The unit rig (docs/10-art-direction.md, "Units"): every unit model is one skinned mesh per
 * material, built from parts that each follow one bone. People get hips, chest, head, two arms
 * and two legs; horses and other mounts get a body, neck, head, four legs and a tail; vehicles
 * hang everything on the root. The bones let `animate` give figures an idle, a walk and an
 * attack without any animation files: rigid parts on a skeleton, like a well-made puppet.
 *
 * While a model is being built, `rig` holds its bones and the bone new parts attach to.
 */

export type V3 = [number, number, number];

export interface BoneDef {
  parent: number;
  /** Rest position in model space. */
  at: V3;
}

export type Style = 'none' | 'melee' | 'spear' | 'bow' | 'gun' | 'staff';

export interface PersonRig {
  kind: 'person';
  root: number;
  hips: number;
  chest: number;
  head: number;
  armR: number;
  foreR: number;
  armL: number;
  foreL: number;
  /** -1 for robed or seated figures (no walking legs). */
  thighR: number;
  shinR: number;
  thighL: number;
  shinL: number;
  style: Style;
  mounted: boolean;
  phase: number;
}

export interface MountRig {
  kind: 'mount';
  body: number;
  neck: number;
  head: number;
  /** Front right, front left, back right, back left: [upper, lower]. */
  legs: [number, number][];
  tail: number;
  phase: number;
  /** Heavy mounts (elephants, oxen) walk slower and swing less. */
  heavy: boolean;
}

export interface VehicleRig {
  kind: 'vehicle';
  /** Ships roll on the swell, aircraft hover, wheels and tracks stay put. */
  motion: 'float' | 'hover' | 'none';
}

export type Rig = PersonRig | MountRig | VehicleRig;

export const rig = {
  bones: [] as BoneDef[],
  rigs: [] as Rig[],
  /** The parts so far: matte (cloth, wood, skin) and metal. */
  out: { m: [] as BufferGeometry[], k: [] as BufferGeometry[] },
  /** The bone parts attach to now. */
  bone: 0,
  /** Faceted (legacy vehicle) or smooth parts. */
  smooth: false,
};

export function resetRig() {
  rig.bones = [{ parent: -1, at: [0, 0, 0] }];
  rig.rigs = [];
  rig.out = { m: [], k: [] };
  rig.bone = 0;
  rig.smooth = false;
}

export function addBone(parent: number, at: V3): number {
  rig.bones.push({ parent, at });
  return rig.bones.length - 1;
}

/** Runs `fn` with new parts on `bone` (and smooth or faceted shading). */
export function on<T>(bone: number, fn: () => T, smooth = rig.smooth): T {
  const was = rig.bone;
  const wasSmooth = rig.smooth;
  rig.bone = bone;
  rig.smooth = smooth;
  try {
    return fn();
  } finally {
    rig.bone = was;
    rig.smooth = wasSmooth;
  }
}

const m4 = new Matrix4();
const qt = new Quaternion();
const eu = new Euler();
const tmp = new Color();

/**
 * A part: `g` colored, placed at `at`, scaled by `s` and rotated by `rot` (radians, XYZ), on the
 * current bone. Smooth parts keep their normals; faceted ones get one normal per face.
 */
export function put(
  g: BufferGeometry,
  color: number,
  at: V3,
  s: V3 = [1, 1, 1],
  rot: V3 = [0, 0, 0],
): BufferGeometry {
  const src = g.clone();
  src.deleteAttribute('uv');
  qt.setFromEuler(eu.set(rot[0], rot[1], rot[2]));
  src.applyMatrix4(m4.compose(new Vector3(...at), qt, new Vector3(...s)));
  // Every part ends up indexed, so they all merge: smooth parts keep their shared vertices
  // (a fifth of the size); faceted ones get a vertex per corner, one normal per face.
  let out = src;
  if (!rig.smooth || !src.index) {
    out = src.index ? src.toNonIndexed() : src;
    if (!rig.smooth) out.computeVertexNormals();
    out.setIndex([...Array(out.getAttribute('position').count).keys()]);
  }
  const n = out.getAttribute('position').count;
  tmp.set(color);
  const col = new Float32Array(n * 3);
  const idx = new Uint16Array(n * 4);
  const wt = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    col[i * 3] = tmp.r;
    col[i * 3 + 1] = tmp.g;
    col[i * 3 + 2] = tmp.b;
    idx[i * 4] = rig.bone;
    wt[i * 4] = 1;
  }
  out.setAttribute('color', new Float32BufferAttribute(col, 3));
  out.setAttribute('skinIndex', new Uint16BufferAttribute(idx, 4));
  out.setAttribute('skinWeight', new Float32BufferAttribute(wt, 4));
  return out;
}

const up = new Vector3(0, 1, 0);

/** A tapered limb from `a` to `b` (radius `ra` at a, `rb` at b), smooth. */
export function limb(
  a: V3,
  b: V3,
  ra: number,
  rb: number,
  color: number,
  segments = 8,
): BufferGeometry {
  const va = new Vector3(...a);
  const vb = new Vector3(...b);
  const dir = vb.clone().sub(va);
  const len = dir.length();
  const c = new CylinderGeometry(rb, ra, len, segments, 1, false);
  qt.setFromUnitVectors(up, dir.normalize());
  const mid = va.clone().add(vb).multiplyScalar(0.5);
  c.applyQuaternion(qt);
  c.translate(mid.x, mid.y, mid.z);
  const out = put(c, color, [0, 0, 0]);
  c.dispose();
  return out;
}
