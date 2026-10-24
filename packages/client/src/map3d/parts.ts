import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  Matrix4,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';

/** Shared geometry helpers for the merged-mesh models (settlements, improvements, districts). */

const tmp = new Matrix4();
const q = new Quaternion();
const yAxis = new Vector3(0, 1, 0);

/** A geometry part, placed and colored, ready to merge (position + normal + color only). */
export function part(
  g: BufferGeometry,
  color: number | Color,
  x = 0,
  y = 0,
  z = 0,
  rotY = 0,
  scale = 1,
): BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g.clone();
  out.deleteAttribute('uv');
  q.setFromAxisAngle(yAxis, rotY);
  out.applyMatrix4(tmp.compose(new Vector3(x, y, z), q, new Vector3(scale, scale, scale)));
  const c = color instanceof Color ? color : new Color(color);
  const n = out.getAttribute('position').count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
  out.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return out;
}

/** Deterministic pseudo-random numbers from a seed (so a town looks the same every frame). */
export function seeded(seed: number) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

export const G = {
  box: new BoxGeometry(1, 1, 1),
  roof: new ConeGeometry(0.75, 1, 4).rotateY(Math.PI / 4),
  cyl: new CylinderGeometry(1, 1, 1, 8),
  cone: new ConeGeometry(1, 1, 8),
  dome: new SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
  ball: new SphereGeometry(1, 8, 6),
  hex: new CylinderGeometry(1, 1, 1, 6),
  pyramid: new ConeGeometry(1, 1, 4).rotateY(Math.PI / 4),
  rock: new DodecahedronGeometry(1, 0),
  bush: new IcosahedronGeometry(1, 0),
};

export const WALLS = [0xa89679, 0x9c8a6e, 0xb3a385, 0x8f7f66];
export const ROOFS = [0x7a3f2c, 0x6b3a2a, 0x845034, 0x5e4a3c];

export function house(
  parts: BufferGeometry[],
  x: number,
  y: number,
  z: number,
  rot: number,
  r: () => number,
  big = 1,
) {
  const w = (0.09 + r() * 0.05) * big;
  const d = (0.08 + r() * 0.04) * big;
  const h = (0.06 + r() * 0.04) * big;
  const wall = WALLS[Math.floor(r() * WALLS.length)]!;
  const roof = ROOFS[Math.floor(r() * ROOFS.length)]!;
  parts.push(
    scaled(G.box, wall, x, y + h / 2, z, w, h, d, rot),
    scaled(G.roof, roof, x, y + h + h * 0.45, z, w * 0.95, h * 0.9, d * 0.95, rot),
  );
}

export function scaled(
  g: BufferGeometry,
  color: number,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  rot = 0,
) {
  return part(g, color).applyMatrix4(
    new Matrix4().compose(
      new Vector3(x, y, z),
      new Quaternion().setFromAxisAngle(yAxis, rot),
      new Vector3(sx, sy, sz),
    ),
  );
}
