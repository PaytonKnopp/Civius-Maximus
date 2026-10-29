import { type BufferGeometry, Color } from 'three';
import { G, house, scaled, seeded } from './parts';
import { moreWonderParts } from './wonders3d';

/**
 * District and wonder models: low-poly, flat-shaded parts merged into the settlement's mesh like
 * houses and improvements. A district stands on a paved plate edged in its accent color; a wonder
 * fills most of its tile so it reads from far out.
 */

const PAVING = 0x857a68;
const STONE = 0xb3a385;
const PALE = 0xd2c4a0;
const WOOD = 0x6b4a2e;
const DARK = 0x2a2622;

const shade = (c: number, k: number) => new Color(c).multiplyScalar(k).getHex();

/**
 * Turns local (dx, dz) offsets around a center by `rot`, the same way three.js turns a part by
 * `rot` around Y, so a part placed with `at(...)` and rotated by `rot + θ` keeps its layout.
 */
function placer(x: number, z: number, rot: number) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return (dx: number, dz: number): [number, number] => [x + dx * c + dz * s, z - dx * s + dz * c];
}

/** A row of columns along local x from `x0` to `x1` at depth `dz`. */
function colonnade(
  out: BufferGeometry[],
  at: (dx: number, dz: number) => [number, number],
  y: number,
  x0: number,
  x1: number,
  dz: number,
  count: number,
  h: number,
  color = PALE,
) {
  for (let i = 0; i < count; i++) {
    const [px, pz] = at(x0 + ((x1 - x0) * i) / Math.max(1, count - 1), dz);
    out.push(scaled(G.cyl, color, px, y + h / 2, pz, 0.014, h, 0.014));
  }
}

/** Where an industrial zone's smokestacks end (for smoke), matching its model below. */
export function districtStacks(
  model: string,
  x: number,
  z: number,
  ground: number,
  seed: number,
): [number, number, number][] {
  if (model !== 'industrial') return [];
  const r = seeded(seed * 31 + 5);
  const rot = Math.floor(r() * 6) * (Math.PI / 3);
  const at = placer(x, z, rot);
  const y = ground + 0.02;
  return [
    [0.2, -0.16, 0.36],
    [0.08, -0.18, 0.28],
  ].map(([dx, dz, h]) => {
    const [cx, cz] = at(dx!, dz!);
    return [cx, y + h! + 0.06, cz];
  });
}

export function districtParts(
  model: string,
  color: number,
  x: number,
  z: number,
  ground: number,
  seed: number,
): BufferGeometry[] {
  const r = seeded(seed * 31 + 5);
  const rot = Math.floor(r() * 6) * (Math.PI / 3);
  const at = placer(x, z, rot);
  const out: BufferGeometry[] = [];
  const water = model === 'harbor';
  const y = water ? 0 : ground + 0.02;
  if (!water) {
    // Paved plate with an accent rim.
    out.push(
      scaled(G.hex, shade(color, 0.55), x, ground + 0.004, z, 0.66, 0.03, 0.66),
      scaled(G.hex, PAVING, x, ground + 0.01, z, 0.6, 0.03, 0.6),
    );
  }
  switch (model) {
    case 'campus': {
      const [bx, bz] = at(-0.12, 0.05);
      out.push(
        scaled(G.box, STONE, bx, y + 0.08, bz, 0.34, 0.16, 0.2, rot),
        scaled(G.roof, 0x5e4a3c, bx, y + 0.19, bz, 0.34, 0.07, 0.2, rot),
      );
      colonnade(out, at, y, -0.27, 0.03, 0.17, 5, 0.12);
      const [ox, oz] = at(0.2, -0.12);
      out.push(
        scaled(G.cyl, PALE, ox, y + 0.1, oz, 0.09, 0.2, 0.09),
        scaled(G.dome, color, ox, y + 0.2, oz, 0.095, 0.095, 0.095),
        scaled(G.box, DARK, ox + 0.02, y + 0.25, oz, 0.08, 0.012, 0.02, rot + 0.6),
      );
      const [tx, tz] = at(0.22, 0.2);
      out.push(
        scaled(G.box, STONE, tx, y + 0.12, tz, 0.07, 0.24, 0.07, rot),
        scaled(G.pyramid, color, tx, y + 0.28, tz, 0.06, 0.08, 0.06, rot),
      );
      break;
    }
    case 'holy_site': {
      const [px, pz] = at(0, 0);
      out.push(
        scaled(G.box, PALE, px, y + 0.02, pz, 0.46, 0.04, 0.36, rot),
        scaled(G.box, STONE, px, y + 0.05, pz, 0.38, 0.03, 0.3, rot),
        scaled(G.box, PALE, px, y + 0.13, pz, 0.24, 0.14, 0.18, rot),
        scaled(G.roof, color, px, y + 0.24, pz, 0.3, 0.1, 0.24, rot),
      );
      colonnade(out, at, y + 0.065, -0.16, 0.16, -0.13, 4, 0.11);
      colonnade(out, at, y + 0.065, -0.16, 0.16, 0.13, 4, 0.11);
      const [sx, sz] = at(0.26, 0.2);
      out.push(
        scaled(G.cyl, PALE, sx, y + 0.16, sz, 0.03, 0.32, 0.03),
        scaled(G.cone, color, sx, y + 0.36, sz, 0.045, 0.1, 0.045),
      );
      break;
    }
    case 'theater': {
      // Tiered half-ring of seats around a stage.
      for (let tier = 0; tier < 3; tier++) {
        const radius = 0.2 + tier * 0.08;
        for (let i = 0; i <= 8; i++) {
          const a = Math.PI * (i / 8);
          const [sx, sz] = at(Math.cos(a) * radius, -Math.sin(a) * radius + 0.08);
          out.push(
            scaled(
              G.box,
              tier % 2 ? STONE : PALE,
              sx,
              y + 0.02 + tier * 0.035,
              sz,
              0.08,
              0.04 + tier * 0.035,
              0.06,
              rot + a - Math.PI / 2,
            ),
          );
        }
      }
      const [stx, stz] = at(0, 0.18);
      out.push(
        scaled(G.box, WOOD, stx, y + 0.025, stz, 0.3, 0.05, 0.1, rot),
        scaled(G.box, color, stx, y + 0.12, stz + 0.0, 0.3, 0.14, 0.01, rot),
      );
      break;
    }
    case 'commercial': {
      const awnings = [color, 0xc94f3a, 0xe0c060, 0x4a8fc0, color, 0x8fc05a];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        const [sx, sz] = at(Math.cos(a) * 0.3, Math.sin(a) * 0.27);
        out.push(
          scaled(G.box, WOOD, sx, y + 0.03, sz, 0.08, 0.06, 0.07, rot + a),
          scaled(G.roof, awnings[i]!, sx, y + 0.085, sz, 0.11, 0.04, 0.1, rot + a),
        );
      }
      const [hx, hz] = at(0, 0);
      out.push(
        scaled(G.box, STONE, hx, y + 0.09, hz, 0.2, 0.18, 0.2, rot),
        scaled(G.roof, color, hx, y + 0.21, hz, 0.24, 0.08, 0.24, rot),
      );
      break;
    }
    case 'harbor': {
      // A pier out over the water, a warehouse, a crane and a moored boat.
      const [px, pz] = at(0, 0);
      out.push(scaled(G.box, WOOD, px, 0.03, pz, 0.6, 0.03, 0.12, rot));
      for (const dx of [-0.25, -0.08, 0.08, 0.25]) {
        for (const dz of [-0.05, 0.05]) {
          const [lx, lz] = at(dx, dz);
          out.push(scaled(G.cyl, shade(WOOD, 0.7), lx, 0, lz, 0.012, 0.08, 0.012));
        }
      }
      const [wx, wz] = at(-0.18, -0.2);
      out.push(
        scaled(G.box, WOOD, wx, 0.03, wz, 0.3, 0.03, 0.22, rot),
        scaled(G.box, STONE, wx, 0.11, wz, 0.22, 0.13, 0.15, rot),
        scaled(G.roof, color, wx, 0.2, wz, 0.26, 0.06, 0.18, rot),
      );
      const [cx, cz] = at(0.22, -0.02);
      out.push(
        scaled(G.box, WOOD, cx, 0.15, cz, 0.02, 0.24, 0.02, rot),
        scaled(G.box, WOOD, cx - 0.04, 0.27, cz, 0.16, 0.02, 0.02, rot),
      );
      const [bx, bz] = at(0.05, 0.16);
      out.push(
        scaled(G.box, 0x5a3e28, bx, 0.02, bz, 0.2, 0.04, 0.07, rot),
        scaled(G.cyl, 0x5a3e28, bx, 0.1, bz, 0.006, 0.15, 0.006),
        scaled(G.box, 0xd8d0bc, bx + 0.02, 0.11, bz, 0.005, 0.1, 0.07, rot + Math.PI / 2),
      );
      break;
    }
    case 'industrial': {
      const [fx, fz] = at(-0.05, 0.02);
      out.push(scaled(G.box, 0x7a5a48, fx, y + 0.08, fz, 0.42, 0.16, 0.24, rot));
      for (let i = 0; i < 4; i++) {
        const [rx, rz] = at(-0.2 + i * 0.105, 0.02);
        out.push(scaled(G.roof, shade(color, 0.8), rx, y + 0.19, rz, 0.1, 0.06, 0.24, rot));
      }
      for (const [dx, dz, h] of [
        [0.2, -0.16, 0.36],
        [0.08, -0.18, 0.28],
      ] as const) {
        const [cx, cz] = at(dx, dz);
        out.push(
          scaled(G.cyl, 0x5a4a40, cx, y + h / 2, cz, 0.03, h, 0.03),
          scaled(G.ball, 0x8a8580, cx, y + h + 0.04, cz, 0.05, 0.04, 0.05),
        );
      }
      const [px, pz] = at(0.25, 0.18);
      out.push(scaled(G.box, 0x4a4640, px, y + 0.03, pz, 0.12, 0.06, 0.1, rot));
      break;
    }
    case 'encampment': {
      // Palisade ring, tents, a flag.
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * Math.PI * 2;
        if (i === 5 || i === 6) continue; // gate
        const [sx, sz] = at(Math.cos(a) * 0.42, Math.sin(a) * 0.42);
        out.push(scaled(G.cyl, WOOD, sx, y + 0.06, sz, 0.018, 0.12, 0.018));
      }
      for (const [dx, dz] of [
        [-0.15, -0.1],
        [0.12, -0.14],
        [-0.05, 0.16],
      ] as const) {
        const [tx, tz] = at(dx, dz);
        out.push(scaled(G.cone, shade(color, 0.85), tx, y + 0.07, tz, 0.09, 0.14, 0.09));
      }
      const [fx, fz] = at(0.14, 0.1);
      out.push(
        scaled(G.cyl, WOOD, fx, y + 0.16, fz, 0.008, 0.32, 0.008),
        scaled(G.box, color, fx + 0.05, y + 0.28, fz, 0.1, 0.06, 0.004, rot),
      );
      break;
    }
    case 'entertainment': {
      // An oval arena with a green field.
      const [fx, fz] = at(0, 0);
      out.push(scaled(G.cyl, 0x5f7a3a, fx, y + 0.012, fz, 0.3, 0.02, 0.22));
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        const [sx, sz] = at(Math.cos(a) * 0.38, Math.sin(a) * 0.29);
        out.push(
          scaled(
            G.box,
            i % 2 ? STONE : PALE,
            sx,
            y + 0.06,
            sz,
            0.11,
            0.12,
            0.06,
            rot - a + Math.PI / 2,
          ),
        );
      }
      for (const a of [0, Math.PI]) {
        const [bx, bz] = at(Math.cos(a) * 0.38, Math.sin(a) * 0.29);
        out.push(
          scaled(G.cyl, WOOD, bx, y + 0.16, bz, 0.006, 0.2, 0.006),
          scaled(G.box, color, bx, y + 0.22, bz + 0.03, 0.004, 0.05, 0.06, rot),
        );
      }
      break;
    }
    case 'aqueduct': {
      // A row of arches carrying a channel across the tile.
      const n = 5;
      for (let i = 0; i < n; i++) {
        const dx = -0.4 + (0.8 * i) / (n - 1);
        const [px, pz] = at(dx, 0);
        out.push(scaled(G.box, STONE, px, y + 0.09, pz, 0.05, 0.18, 0.07, rot));
      }
      const [cx, cz] = at(0, 0);
      out.push(
        scaled(G.box, PALE, cx, y + 0.2, cz, 0.86, 0.05, 0.09, rot),
        scaled(G.box, 0x4f7f9a, cx, y + 0.227, cz, 0.84, 0.006, 0.05, rot),
      );
      break;
    }
    case 'plaza': {
      const [hx, hz] = at(0, -0.06);
      out.push(
        scaled(G.box, PALE, hx, y + 0.02, hz, 0.42, 0.04, 0.28, rot),
        scaled(G.box, STONE, hx, y + 0.12, hz, 0.32, 0.16, 0.2, rot),
        scaled(G.cyl, PALE, hx, y + 0.23, hz, 0.07, 0.06, 0.07),
        scaled(G.dome, 0xc9a24a, hx, y + 0.26, hz, 0.075, 0.075, 0.075),
      );
      colonnade(out, at, y + 0.04, -0.15, 0.15, 0.12, 5, 0.12);
      const [ox, oz] = at(0, 0.26);
      out.push(scaled(G.pyramid, color, ox, y + 0.11, oz, 0.03, 0.22, 0.03, rot));
      break;
    }
    default: {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const [hx, hz] = at(Math.cos(a) * 0.2, Math.sin(a) * 0.2);
        out.push(
          scaled(G.box, STONE, hx, y + 0.06, hz, 0.14, 0.12, 0.12, rot + a),
          scaled(G.roof, color, hx, y + 0.15, hz, 0.16, 0.06, 0.14, rot + a),
        );
      }
    }
  }
  // A few houses tucked into the edges, so districts feel lived in.
  if (!water && model !== 'aqueduct' && model !== 'encampment') {
    for (let i = 0; i < 2; i++) {
      const a = r() * Math.PI * 2;
      const [hx, hz] = at(Math.cos(a) * 0.48, Math.sin(a) * 0.48);
      house(out, hx, ground, hz, a, r, 0.8);
    }
  }
  return out;
}

const SAND = 0xd8c08a;

export function wonderParts(
  model: string,
  x: number,
  z: number,
  ground: number,
  seed: number,
): BufferGeometry[] {
  const r = seeded(seed * 17 + 3);
  const rot = Math.floor(r() * 6) * (Math.PI / 3);
  const at = placer(x, z, rot);
  const out: BufferGeometry[] = [];
  const y = ground;
  switch (model) {
    case 'pyramid': {
      const [px, pz] = at(-0.05, -0.04);
      out.push(
        scaled(G.pyramid, SAND, px, y + 0.24, pz, 0.5, 0.48, 0.5, rot),
        scaled(G.pyramid, 0xf0e2b8, px, y + 0.44, pz, 0.08, 0.08, 0.08, rot),
      );
      const [sx, sz] = at(0.36, 0.3);
      out.push(scaled(G.pyramid, shade(SAND, 0.9), sx, y + 0.1, sz, 0.2, 0.2, 0.2, rot));
      const [tx, tz] = at(-0.4, 0.34);
      out.push(scaled(G.pyramid, shade(SAND, 0.85), tx, y + 0.07, tz, 0.14, 0.14, 0.14, rot));
      break;
    }
    case 'gardens': {
      const [px, pz] = at(0, 0);
      for (let i = 0; i < 4; i++) {
        const s = 0.6 - i * 0.13;
        const h = 0.09;
        const top = y + h * (i + 1);
        out.push(
          scaled(G.box, i % 2 ? STONE : PALE, px, top - h / 2, pz, s, h, s * 0.85, rot),
          scaled(G.box, 0x4f7a32, px, top + 0.004, pz, s * 0.96, 0.012, s * 0.82, rot),
        );
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + i;
          const [bx, bz] = at(Math.cos(a) * s * 0.45, Math.sin(a) * s * 0.38);
          const b = 0.035;
          out.push(scaled(G.bush, 0x3f6b2a, bx, top + b, bz, b, b * 1.2, b));
        }
      }
      const [wx, wz] = at(0, 0.32);
      out.push(scaled(G.box, 0x4f7f9a, wx, y + 0.004, wz, 0.5, 0.006, 0.06, rot));
      break;
    }
    case 'stones': {
      const n = 12;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const [sx, sz] = at(Math.cos(a) * 0.36, Math.sin(a) * 0.36);
        out.push(
          scaled(G.box, 0x8a8478, sx, y + 0.09, sz, 0.07, 0.18, 0.035, rot - a + Math.PI / 2),
        );
        if (i % 2 === 0) {
          const b = a + Math.PI / n;
          const [lx, lz] = at(Math.cos(b) * 0.36, Math.sin(b) * 0.36);
          out.push(
            scaled(G.box, 0x7d776c, lx, y + 0.195, lz, 0.2, 0.035, 0.045, rot - b + Math.PI / 2),
          );
        }
      }
      const [cx, cz] = at(0, 0);
      out.push(scaled(G.box, 0x6e6a64, cx, y + 0.03, cz, 0.1, 0.06, 0.06, rot));
      break;
    }
    case 'temple': {
      const [px, pz] = at(0, 0);
      out.push(
        scaled(G.box, PALE, px, y + 0.025, pz, 0.7, 0.05, 0.42, rot),
        scaled(G.box, STONE, px, y + 0.06, pz, 0.62, 0.03, 0.36, rot),
        scaled(G.box, PALE, px, y + 0.15, pz, 0.44, 0.15, 0.2, rot),
        scaled(G.roof, 0x9a5a3a, px, y + 0.3, pz, 0.74, 0.11, 0.42, rot),
      );
      colonnade(out, at, y + 0.075, -0.28, 0.28, -0.15, 8, 0.17);
      colonnade(out, at, y + 0.075, -0.28, 0.28, 0.15, 8, 0.17);
      break;
    }
    case 'library': {
      const [px, pz] = at(0, -0.05);
      out.push(
        scaled(G.box, PALE, px, y + 0.025, pz, 0.66, 0.05, 0.46, rot),
        scaled(G.box, STONE, px, y + 0.15, pz, 0.5, 0.2, 0.3, rot),
        scaled(G.cyl, PALE, px, y + 0.3, pz, 0.12, 0.1, 0.12),
        scaled(G.dome, 0x6f8fa8, px, y + 0.35, pz, 0.13, 0.13, 0.13),
      );
      colonnade(out, at, y + 0.05, -0.24, 0.24, 0.2, 7, 0.2);
      const [rx, rz] = at(0, 0.2);
      out.push(scaled(G.box, PALE, rx, y + 0.265, rz, 0.54, 0.03, 0.06, rot));
      break;
    }
    case 'statue': {
      // A bronze figure on a pedestal at the harbor mouth, torch raised.
      const base = Math.max(0, ground);
      const [px, pz] = at(0, 0);
      const bronze = 0x6f9a86;
      out.push(
        scaled(G.cyl, STONE, px, base + 0.04, pz, 0.2, 0.08, 0.2),
        scaled(G.box, PALE, px, base + 0.14, pz, 0.14, 0.12, 0.14, rot),
        scaled(G.cyl, bronze, px, base + 0.32, pz, 0.05, 0.24, 0.05),
        scaled(G.ball, bronze, px, base + 0.47, pz, 0.04, 0.045, 0.04),
      );
      const [ax, az] = at(0.05, 0);
      out.push(
        scaled(G.box, bronze, ax, base + 0.5, az, 0.02, 0.14, 0.02, rot),
        scaled(G.cone, 0xe0a040, ax, base + 0.6, az, 0.025, 0.05, 0.025),
      );
      break;
    }
    case 'arena': {
      const [fx, fz] = at(0, 0);
      out.push(scaled(G.cyl, 0xc8b07a, fx, y + 0.01, fz, 0.32, 0.02, 0.25));
      for (let tier = 0; tier < 2; tier++) {
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2;
          const rx = 0.42 + tier * 0.02;
          const rz = 0.33 + tier * 0.02;
          const [sx, sz] = at(Math.cos(a) * rx, Math.sin(a) * rz);
          const h = 0.12;
          out.push(
            scaled(
              G.box,
              tier ? STONE : PALE,
              sx,
              y + h / 2 + tier * h,
              sz,
              0.1,
              h * (tier ? 0.8 : 1),
              0.06,
              rot - a + Math.PI / 2,
            ),
          );
        }
      }
      break;
    }
    case 'rock_city': {
      // A rose-red cliff with a carved temple front.
      const rose = 0xb0644a;
      for (const [dx, dz, s] of [
        [-0.2, -0.18, 0.28],
        [0.15, -0.2, 0.24],
        [0.32, 0.05, 0.18],
        [-0.36, 0.05, 0.17],
      ] as const) {
        const [rx, rz] = at(dx, dz);
        out.push(scaled(G.rock, shade(rose, 0.85 + r() * 0.2), rx, y + s * 0.7, rz, s, s * 1.1, s));
      }
      const [fx, fz] = at(0, 0.05);
      out.push(
        scaled(G.box, 0xc98a6a, fx, y + 0.17, fz, 0.3, 0.34, 0.06, rot),
        scaled(G.box, DARK, fx, y + 0.07, fz + 0.0, 0.07, 0.12, 0.065, rot),
        scaled(G.roof, 0xc98a6a, fx, y + 0.37, fz, 0.32, 0.07, 0.07, rot),
      );
      colonnade(out, at, y, -0.12, 0.12, 0.09, 4, 0.22, 0xd99a7a);
      break;
    }
    default: {
      // Water wonders stand on the sea surface.
      if (moreWonderParts(model, out, at, model === 'colossus' ? Math.max(0, ground) : y, rot))
        break;
      const [ox, oz] = at(0, 0);
      out.push(
        scaled(G.box, PALE, ox, y + 0.03, oz, 0.3, 0.06, 0.3, rot),
        scaled(G.box, STONE, ox, y + 0.25, oz, 0.08, 0.4, 0.08, rot),
        scaled(G.pyramid, 0xc9a24a, ox, y + 0.48, oz, 0.06, 0.06, 0.06, rot),
      );
    }
  }
  return out;
}

/** A hostile camp: hide tents inside a rough palisade, a fire, a war banner. */
/** A tribal village (goody hut): round thatched huts, a carved post and a cooking fire. */
export function hutParts(x: number, z: number, ground: number, seed: number): BufferGeometry[] {
  const r = seeded(seed * 17 + 3);
  const rot = r() * Math.PI * 2;
  const at = placer(x, z, rot);
  const out: BufferGeometry[] = [];
  const y = ground;
  out.push(scaled(G.hex, 0x7a6a48, x, y + 0.004, z, 0.4, 0.02, 0.4));
  for (const [dx, dz, s] of [
    [-0.13, -0.08, 0.1],
    [0.14, -0.04, 0.085],
    [0.0, 0.16, 0.08],
  ] as const) {
    const [hx, hz] = at(dx, dz);
    out.push(
      scaled(G.cyl, 0x9a7a52, hx, y + s * 0.5, hz, s, s, s),
      scaled(G.cone, 0xc8a860, hx, y + s * 1.35, hz, s * 1.25, s * 0.9, s * 1.25),
    );
  }
  const [fx, fz] = at(0.03, -0.01);
  out.push(
    scaled(G.cyl, 0x2a2622, fx, y + 0.01, fz, 0.04, 0.02, 0.04),
    scaled(G.cone, 0xff9a3a, fx, y + 0.04, fz, 0.025, 0.06, 0.025),
  );
  const [px, pz] = at(0.2, 0.16);
  out.push(
    scaled(G.cyl, 0x6a4a2a, px, y + 0.15, pz, 0.018, 0.3, 0.018),
    scaled(G.box, 0x3a8a8a, px, y + 0.22, pz, 0.05, 0.03, 0.05, rot),
    scaled(G.box, 0xd0a030, px, y + 0.28, pz, 0.07, 0.025, 0.025, rot),
  );
  return out;
}

export function campParts(x: number, z: number, ground: number, seed: number): BufferGeometry[] {
  const r = seeded(seed * 13 + 7);
  const rot = r() * Math.PI * 2;
  const at = placer(x, z, rot);
  const out: BufferGeometry[] = [];
  const y = ground;
  out.push(scaled(G.hex, 0x4a3b2c, x, y + 0.004, z, 0.52, 0.02, 0.52));
  for (let i = 0; i < 18; i++) {
    if (i === 4 || i === 5) continue; // the gap they ride out of
    const a = (i / 18) * Math.PI * 2;
    const h = 0.1 + r() * 0.06;
    const [sx, sz] = at(Math.cos(a) * 0.46, Math.sin(a) * 0.46);
    out.push(
      scaled(G.cyl, 0x4a3420, sx, y + h / 2, sz, 0.016, h, 0.016),
      scaled(G.cone, 0x4a3420, sx, y + h + 0.015, sz, 0.017, 0.03, 0.017),
    );
  }
  for (const [dx, dz, s] of [
    [-0.16, -0.12, 0.11],
    [0.15, -0.16, 0.09],
    [-0.04, 0.2, 0.1],
  ] as const) {
    const [tx, tz] = at(dx, dz);
    out.push(scaled(G.cone, 0x6b5a44, tx, y + s * 0.8, tz, s, s * 1.6, s));
  }
  const [fx, fz] = at(0.08, 0.04);
  out.push(
    scaled(G.cyl, 0x2a2622, fx, y + 0.01, fz, 0.06, 0.02, 0.06),
    scaled(G.cone, 0xff7a2a, fx, y + 0.05, fz, 0.035, 0.08, 0.035),
    scaled(G.cone, 0xffd060, fx, y + 0.045, fz, 0.018, 0.05, 0.018),
  );
  const [px, pz] = at(-0.24, 0.12);
  out.push(
    scaled(G.cyl, 0x3a2a1a, px, y + 0.2, pz, 0.01, 0.4, 0.01),
    scaled(G.box, 0xb02a1e, px + 0.05, y + 0.34, pz, 0.1, 0.07, 0.005, rot),
    scaled(G.ball, 0xd8d0bc, px, y + 0.41, pz, 0.025, 0.022, 0.025),
  );
  return out;
}
