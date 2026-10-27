import type { BufferGeometry } from 'three';
import { G, scaled } from './parts';

/**
 * How settlements look (docs/10-art-direction.md, "Settlements"): each civ builds in its own
 * architecture (content: `civ.architecture`), and the buildings move through the ages. Huts and
 * tents first, then stone towns in the civ's style, taller and richer streets in the
 * Renaissance, brick and chimneys in the Industrial age, and concrete blocks and towers in the
 * Modern age, where the styles converge as they did in real cities. The palace keeps its style.
 */

export type Architecture =
  | 'mediterranean'
  | 'european'
  | 'northern'
  | 'east_asian'
  | 'south_asian'
  | 'middle_eastern'
  | 'african'
  | 'american'
  | 'steppe';

/** 0 ancient, 1 classical and medieval, 2 renaissance, 3 industrial, 4 modern and later. */
export type Age = 0 | 1 | 2 | 3 | 4;

export function ageOfEra(order: number): Age {
  if (order <= 1) return 0;
  if (order <= 3) return 1;
  if (order === 4) return 2;
  if (order === 5) return 3;
  return 4;
}

interface Palette {
  walls: number[];
  roofs: number[];
  /** The roof shape for ordinary houses in age 1–2. */
  roof: 'hip' | 'gable' | 'flat' | 'flared' | 'thatch' | 'dome';
  /** What the first huts look like. */
  hut: 'round' | 'box' | 'tent' | 'long';
  stone: number;
  accent: number;
}

const P: Record<Architecture, Palette> = {
  mediterranean: {
    walls: [0xe2d8c2, 0xd8c9a8, 0xcdbb98, 0xe8dfcc],
    roofs: [0xb0583a, 0xa04a30, 0xb86a44, 0x9a4c36],
    roof: 'hip',
    hut: 'box',
    stone: 0xd8ccb0,
    accent: 0xb08a3e,
  },
  european: {
    walls: [0xd4c6a6, 0xc2b08e, 0xa89679, 0xdacdb2],
    roofs: [0x5e4a3c, 0x4a3a30, 0x55606a, 0x6b3a2a],
    roof: 'gable',
    hut: 'box',
    stone: 0x9c9384,
    accent: 0x4a5560,
  },
  northern: {
    walls: [0x6b4a2e, 0x7a5638, 0x5e4228, 0x86603e],
    roofs: [0x3a3a32, 0x4a4a3a, 0x52583e, 0x3e3426],
    roof: 'gable',
    hut: 'long',
    stone: 0x8a8478,
    accent: 0x8e2b22,
  },
  east_asian: {
    walls: [0xddd2b8, 0xcfc2a2, 0x9a6a46, 0xe2d8c4],
    roofs: [0x3e4a52, 0x46525a, 0x4a6a50, 0x37414a],
    roof: 'flared',
    hut: 'box',
    stone: 0xb8b0a0,
    accent: 0xa8382f,
  },
  south_asian: {
    walls: [0xd4a070, 0xc98a5a, 0xe0b88a, 0xd8ae80],
    roofs: [0xa86a44, 0x9a5a3a, 0xc08458, 0xd4b48a],
    roof: 'dome',
    hut: 'box',
    stone: 0xc98a5a,
    accent: 0xd4a94e,
  },
  middle_eastern: {
    walls: [0xd8b98a, 0xc9a66f, 0xe2c89c, 0xbf9a64],
    roofs: [0xc9a66f, 0xb89460, 0xd2b07c, 0xa88654],
    roof: 'flat',
    hut: 'box',
    stone: 0xd2b688,
    accent: 0x2f7a8a,
  },
  african: {
    walls: [0xb07a4a, 0xa66d3f, 0xbd8a58, 0x9a6438],
    roofs: [0x9c8550, 0x8a7444, 0xa88f5a, 0x7e6a3e],
    roof: 'thatch',
    hut: 'round',
    stone: 0xa66d3f,
    accent: 0x5e3a22,
  },
  american: {
    walls: [0xb8b0a0, 0xa8a090, 0xc4bcaa, 0x9c9484],
    roofs: [0x8a7444, 0x9c8550, 0xa8a090, 0x7e6a3e],
    roof: 'flat',
    hut: 'round',
    stone: 0xb8b0a0,
    accent: 0x2f8a6a,
  },
  steppe: {
    walls: [0xe8e0cc, 0xddd4bc, 0xd2c8ae, 0xece6d6],
    roofs: [0xa83f2c, 0x2f5f8a, 0xc9a14f, 0x8e2b22],
    roof: 'dome',
    hut: 'tent',
    stone: 0xa89679,
    accent: 0x2f5f8a,
  },
};

export function architecture(id: string | undefined): Architecture {
  return id && id in P ? (id as Architecture) : 'mediterranean';
}

const BRICK = [0x8e4a36, 0x7e4232, 0x9a5a42, 0x6e3a2c];
const SLATE = [0x4a5058, 0x3e444a, 0x55606a, 0x5a4a40];
const CONCRETE = [0xb8bcc0, 0xa4aab0, 0xc8c4bc, 0x8e969e];
const GLASS = [0x6f8ea6, 0x5a7890, 0x86a2b4, 0x4e6a80];

type Parts = BufferGeometry[];
const pick = <T>(list: T[], r: () => number) => list[Math.floor(r() * list.length)]!;

function roofOn(
  parts: Parts,
  shape: Palette['roof'],
  color: number,
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  h: number,
  rot: number,
) {
  switch (shape) {
    case 'hip':
      parts.push(scaled(G.roof, color, x, y + h * 0.3, z, w * 0.98, h * 0.6, d * 0.98, rot));
      break;
    case 'gable':
      // A ridge: a stretched four-sided roof, steeper.
      parts.push(scaled(G.roof, color, x, y + h * 0.45, z, w * 1.02, h * 0.95, d * 0.8, rot));
      break;
    case 'flat':
      parts.push(scaled(G.box, color, x, y + 0.004, z, w * 1.04, 0.008, d * 1.04, rot));
      break;
    case 'flared':
      parts.push(
        scaled(G.pyramid, color, x, y + h * 0.18, z, w * 0.95, h * 0.36, d * 0.95, rot),
        scaled(G.pyramid, color, x, y + h * 0.42, z, w * 0.55, h * 0.4, d * 0.55, rot),
      );
      break;
    case 'thatch':
      parts.push(scaled(G.cone, color, x, y + h * 0.35, z, w * 0.62, h * 0.7, d * 0.62, rot));
      break;
    case 'dome':
      parts.push(
        scaled(G.box, color, x, y + 0.004, z, w * 1.02, 0.008, d * 1.02, rot),
        scaled(G.dome, color, x, y, z, w * 0.32, h * 0.45, w * 0.32, rot),
      );
      break;
  }
}

/** One ordinary building in a settlement. `big` grows them in cities. */
export function building(
  parts: Parts,
  x: number,
  y: number,
  z: number,
  rot: number,
  r: () => number,
  big: number,
  style: Architecture,
  age: Age,
  /** How far from the center (0–1): the core gets the tallest buildings. */
  core: number,
) {
  const p = P[style];
  const w = (0.09 + r() * 0.05) * big;
  const d = (0.08 + r() * 0.04) * big;
  let h = (0.06 + r() * 0.04) * big;
  if (age === 0) {
    switch (p.hut) {
      case 'round':
        parts.push(
          scaled(G.cyl, pick(p.walls, r), x, y + h * 0.4, z, w * 0.45, h * 0.8, w * 0.45),
          scaled(G.cone, pick(p.roofs, r), x, y + h * 0.8 + h * 0.4, z, w * 0.6, h * 0.8, w * 0.6),
        );
        return;
      case 'tent':
        parts.push(
          scaled(G.cyl, pick(p.walls, r), x, y + h * 0.3, z, w * 0.5, h * 0.6, w * 0.5),
          scaled(G.dome, pick(p.walls, r), x, y + h * 0.6, z, w * 0.5, h * 0.45, w * 0.5),
          scaled(G.cyl, pick(p.roofs, r), x, y + h * 0.55, z, w * 0.51, h * 0.08, w * 0.51),
        );
        return;
      case 'long':
        parts.push(
          scaled(G.box, pick(p.walls, r), x, y + h * 0.35, z, w * 1.5, h * 0.7, d * 0.8, rot),
          scaled(
            G.roof,
            pick(p.roofs, r),
            x,
            y + h * 0.7 + h * 0.4,
            z,
            w * 1.55,
            h * 0.8,
            d * 0.75,
            rot,
          ),
        );
        return;
      case 'box':
        h *= 0.8;
        parts.push(scaled(G.box, pick(p.walls, r), x, y + h / 2, z, w * 0.9, h, d * 0.9, rot));
        roofOn(
          parts,
          p.roof === 'flat' || p.roof === 'dome' ? 'flat' : 'thatch',
          p.roof === 'flat' || p.roof === 'dome' ? pick(p.walls, r) : 0x9c8550,
          x,
          y + h,
          z,
          w,
          d,
          h * 1.1,
          rot,
        );
        return;
    }
  }
  if (age <= 2) {
    // The civ's own style; taller streets in the Renaissance, and near the center.
    const stories =
      age === 2
        ? core < 0.5
          ? 2 + Math.floor(r() * 2)
          : 1 + Math.floor(r() * 2)
        : core < 0.4 && r() < 0.5
          ? 2
          : 1;
    const hh = h * (0.75 + stories * 0.35);
    parts.push(scaled(G.box, pick(p.walls, r), x, y + hh / 2, z, w, hh, d, rot));
    if (stories > 1) {
      // A cornice between floors.
      parts.push(scaled(G.box, p.stone, x, y + hh * 0.52, z, w * 1.03, 0.006, d * 1.03, rot));
    }
    roofOn(parts, p.roof, pick(p.roofs, r), x, y + hh, z, w, d, h, rot);
    return;
  }
  if (age === 3) {
    // Brick rows, slate roofs, chimneys.
    const hh = h * (core < 0.5 ? 1.9 : 1.4);
    parts.push(scaled(G.box, pick(BRICK, r), x, y + hh / 2, z, w, hh, d, rot));
    parts.push(scaled(G.roof, pick(SLATE, r), x, y + hh + h * 0.25, z, w, h * 0.5, d, rot));
    parts.push(
      scaled(G.box, 0x5a3a2e, x + w * 0.25, y + hh + h * 0.35, z, 0.012, h * 0.5, 0.012, rot),
    );
    return;
  }
  // Modern: blocks near the center, towers in big cities, houses at the edge.
  if (core < 0.45) {
    const tall = h * (2.4 + r() * 2.6) * (core < 0.25 ? 1.5 : 1);
    const glass = r() < 0.5;
    parts.push(
      scaled(
        G.box,
        glass ? pick(GLASS, r) : pick(CONCRETE, r),
        x,
        y + tall / 2,
        z,
        w * 0.9,
        tall,
        d * 0.9,
        rot,
      ),
      scaled(G.box, 0x8e969e, x, y + tall + 0.006, z, w * 0.7, 0.012, d * 0.7, rot),
    );
  } else {
    const hh = h * 1.2;
    parts.push(scaled(G.box, pick(CONCRETE, r), x, y + hh / 2, z, w, hh, d, rot));
    roofOn(parts, 'flat', 0x6a6e72, x, y + hh, z, w, d, h, rot);
  }
}

/** The capital's palace, in the civ's style. */
export function palace(
  parts: Parts,
  cx: number,
  y: number,
  cz: number,
  style: Architecture,
  age: Age,
) {
  const p = P[style];
  const scale = age >= 2 ? 1.15 : 1;
  const s = (v: number) => v * scale;
  switch (style) {
    case 'mediterranean':
      // A columned hall with a dome and a pediment.
      parts.push(scaled(G.box, p.stone, cx, y + s(0.015), cz, s(0.4), s(0.03), s(0.28)));
      for (let i = -3; i <= 3; i++)
        parts.push(
          scaled(
            G.cyl,
            0xf0e8d8,
            cx + i * s(0.05),
            y + s(0.09),
            cz + s(0.12),
            s(0.012),
            s(0.13),
            s(0.012),
          ),
        );
      parts.push(
        scaled(G.box, 0xe8dfcc, cx, y + s(0.09), cz - s(0.02), s(0.34), s(0.13), s(0.18)),
        scaled(G.roof, 0xb0583a, cx, y + s(0.18), cz + s(0.02), s(0.38), s(0.06), s(0.24)),
        scaled(G.dome, p.accent, cx, y + s(0.2), cz - s(0.03), s(0.08), s(0.08), s(0.08)),
      );
      return;
    case 'european':
    case 'northern':
      // A keep with four round towers and conical roofs.
      parts.push(scaled(G.box, p.stone, cx, y + s(0.12), cz, s(0.24), s(0.24), s(0.22)));
      parts.push(scaled(G.roof, p.roofs[2]!, cx, y + s(0.29), cz, s(0.26), s(0.1), s(0.24)));
      for (const [dx, dz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ] as const) {
        parts.push(
          scaled(
            G.cyl,
            p.stone,
            cx + dx * s(0.13),
            y + s(0.15),
            cz + dz * s(0.12),
            s(0.04),
            s(0.3),
            s(0.04),
          ),
          scaled(
            G.cone,
            p.roofs[2]!,
            cx + dx * s(0.13),
            y + s(0.35),
            cz + dz * s(0.12),
            s(0.05),
            s(0.1),
            s(0.05),
          ),
        );
      }
      return;
    case 'east_asian':
      // A three-tier hall on a stone platform, red pillars.
      parts.push(scaled(G.box, p.stone, cx, y + s(0.02), cz, s(0.38), s(0.04), s(0.3)));
      for (let tier = 0; tier < 3; tier++) {
        const w = s(0.3 - tier * 0.07);
        const base = y + s(0.04 + tier * 0.1);
        parts.push(
          scaled(
            G.box,
            tier === 0 ? 0x9a2b22 : 0xddd2b8,
            cx,
            base + s(0.035),
            cz,
            w * 0.8,
            s(0.07),
            w * 0.65,
          ),
          scaled(G.pyramid, p.roofs[0]!, cx, base + s(0.085), cz, w * 0.75, s(0.05), w * 0.62),
        );
      }
      parts.push(scaled(G.cone, p.accent, cx, y + s(0.39), cz, s(0.01), s(0.05), s(0.01)));
      return;
    case 'middle_eastern':
    case 'south_asian':
      // A great dome on a square hall, minarets at the corners.
      parts.push(
        scaled(G.box, p.stone, cx, y + s(0.08), cz, s(0.3), s(0.16), s(0.3)),
        scaled(G.cyl, p.stone, cx, y + s(0.18), cz, s(0.1), s(0.05), s(0.1)),
        scaled(
          G.dome,
          style === 'middle_eastern' ? p.accent : 0xf0e8d8,
          cx,
          y + s(0.2),
          cz,
          s(0.1),
          s(0.12),
          s(0.1),
        ),
      );
      for (const [dx, dz] of [
        [-1, -1],
        [1, 1],
        [-1, 1],
        [1, -1],
      ] as const) {
        parts.push(
          scaled(
            G.cyl,
            0xe8dfcc,
            cx + dx * s(0.18),
            y + s(0.17),
            cz + dz * s(0.18),
            s(0.018),
            s(0.34),
            s(0.018),
          ),
          scaled(
            G.cone,
            p.accent,
            cx + dx * s(0.18),
            y + s(0.36),
            cz + dz * s(0.18),
            s(0.022),
            s(0.05),
            s(0.022),
          ),
        );
      }
      return;
    case 'african':
      // A great adobe hall with buttress towers and the wooden beams poking out.
      parts.push(scaled(G.box, p.walls[0]!, cx, y + s(0.1), cz, s(0.34), s(0.2), s(0.22)));
      for (let i = -2; i <= 2; i++) {
        parts.push(
          scaled(
            G.box,
            p.walls[1]!,
            cx + i * s(0.075),
            y + s(0.13),
            cz + s(0.115),
            s(0.03),
            s(0.26),
            s(0.03),
          ),
          scaled(
            G.cone,
            p.walls[1]!,
            cx + i * s(0.075),
            y + s(0.275),
            cz + s(0.115),
            s(0.02),
            s(0.04),
            s(0.02),
          ),
        );
        for (const h of [0.08, 0.16])
          parts.push(
            scaled(
              G.box,
              0x4a3322,
              cx + i * s(0.075) + s(0.03),
              y + s(h),
              cz + s(0.12),
              s(0.03),
              s(0.006),
              s(0.006),
            ),
          );
      }
      parts.push(
        scaled(G.box, p.walls[3]!, cx, y + s(0.26), cz - s(0.02), s(0.08), s(0.12), s(0.08)),
      );
      return;
    case 'american':
      // A stepped pyramid with a temple on top.
      for (let i = 0; i < 4; i++) {
        const w = s(0.36 - i * 0.07);
        parts.push(scaled(G.box, p.stone, cx, y + s(0.025 + i * 0.05), cz, w, s(0.05), w));
      }
      parts.push(
        scaled(G.box, 0xe8dfcc, cx, y + s(0.24), cz, s(0.08), s(0.06), s(0.08)),
        scaled(G.box, p.accent, cx, y + s(0.28), cz, s(0.1), s(0.02), s(0.1)),
        scaled(G.box, p.stone, cx + s(0.13), y + s(0.1), cz, s(0.12), s(0.012), s(0.06), 0),
      );
      return;
    case 'steppe':
      // The great tent: a wide yurt with a gold crown and banners.
      parts.push(
        scaled(G.cyl, 0xece6d6, cx, y + s(0.06), cz, s(0.16), s(0.12), s(0.16)),
        scaled(G.dome, 0xe2dccb, cx, y + s(0.12), cz, s(0.16), s(0.1), s(0.16)),
        scaled(G.cyl, p.roofs[0]!, cx, y + s(0.1), cz, s(0.162), s(0.025), s(0.162)),
        scaled(G.ball, 0xd4a94e, cx, y + s(0.23), cz, s(0.025), s(0.025), s(0.025)),
      );
      for (const dx of [-1, 1]) {
        parts.push(
          scaled(
            G.cyl,
            0x4a3322,
            cx + dx * s(0.2),
            y + s(0.15),
            cz + s(0.1),
            s(0.005),
            s(0.3),
            s(0.005),
          ),
          scaled(
            G.cone,
            0xe8e0cc,
            cx + dx * s(0.2),
            y + s(0.27),
            cz + s(0.1),
            s(0.02),
            s(0.08),
            s(0.02),
          ),
        );
      }
      return;
  }
}

/** A city's central landmark (not the capital): a temple or tower in the civ's style. */
export function cityCenter(
  parts: Parts,
  cx: number,
  y: number,
  cz: number,
  style: Architecture,
  age: Age,
) {
  const p = P[style];
  if (age >= 3) {
    // A clock tower.
    parts.push(
      scaled(G.box, age === 3 ? BRICK[0]! : CONCRETE[0]!, cx, y + 0.16, cz, 0.08, 0.32, 0.08),
      scaled(G.box, 0xf0e8d8, cx, y + 0.26, cz + 0.041, 0.05, 0.05, 0.004),
      scaled(G.pyramid, SLATE[0]!, cx, y + 0.36, cz, 0.07, 0.08, 0.07),
    );
    return;
  }
  switch (p.roof) {
    case 'flared':
      parts.push(
        scaled(G.box, 0x9a2b22, cx, y + 0.06, cz, 0.08, 0.12, 0.08),
        scaled(G.pyramid, p.roofs[0]!, cx, y + 0.14, cz, 0.12, 0.05, 0.12),
        scaled(G.box, 0xddd2b8, cx, y + 0.19, cz, 0.06, 0.06, 0.06),
        scaled(G.pyramid, p.roofs[0]!, cx, y + 0.25, cz, 0.09, 0.05, 0.09),
      );
      return;
    case 'dome':
    case 'flat':
      parts.push(
        scaled(G.box, p.stone, cx, y + 0.07, cz, 0.16, 0.14, 0.16),
        scaled(G.dome, p.accent, cx, y + 0.14, cz, 0.065, 0.07, 0.065),
      );
      return;
    case 'thatch':
      parts.push(
        scaled(G.box, p.walls[0]!, cx, y + 0.08, cz, 0.14, 0.16, 0.12),
        scaled(G.cone, p.walls[1]!, cx - 0.05, y + 0.18, cz, 0.02, 0.05, 0.02),
        scaled(G.cone, p.walls[1]!, cx + 0.05, y + 0.18, cz, 0.02, 0.05, 0.02),
      );
      return;
    default:
      // A stone tower with a pointed roof (gable and hip styles).
      parts.push(
        scaled(G.cyl, p.stone, cx, y + 0.13, cz, 0.07, 0.26, 0.07),
        scaled(G.cone, p.roofs[0]!, cx, y + 0.31, cz, 0.09, 0.12, 0.09),
      );
  }
}

/**
 * City walls around the center: six stretches with towers at the corners, inside the center
 * tile. Damaged walls (below half) lose stretches. Renaissance and later: low, thick bastions.
 */
export function walls(
  parts: Parts,
  cx: number,
  cz: number,
  ground: (x: number, z: number) => number,
  style: Architecture,
  age: Age,
  intact: number,
  seed: number,
) {
  const stone = age >= 2 ? 0x8e8676 : P[style].stone;
  const R = 0.9;
  const corners = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    return [cx + Math.cos(a) * R, cz + Math.sin(a) * R] as const;
  });
  const h = age >= 2 ? 0.07 : 0.1;
  const broken = intact < 0.5 ? 1 + ((seed >>> 3) % 2) : 0;
  for (let i = 0; i < 6; i++) {
    const [ax, az] = corners[i]!;
    const [bx, bz] = corners[(i + 1) % 6]!;
    const tower = age >= 2 ? G.pyramid : G.cyl;
    const ty = ground(ax, az);
    parts.push(scaled(tower, stone, ax, ty + h * 0.75, az, 0.06, h * 1.5, 0.06));
    if (age < 2)
      parts.push(scaled(G.cone, P[style].roofs[0]!, ax, ty + h * 1.5 + 0.03, az, 0.07, 0.07, 0.07));
    if (i < broken) continue;
    // A stretch is made of short pieces so it follows the ground.
    const n = 5;
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      const len = Math.hypot(bx - ax, bz - az) / n;
      const rot = -Math.atan2(bz - az, bx - ax);
      parts.push(
        scaled(
          G.box,
          stone,
          x,
          ground(x, z) + h / 2,
          z,
          len * 1.02,
          h,
          age >= 2 ? 0.06 : 0.035,
          rot,
        ),
      );
      if (age < 2 && k % 2 === 0)
        parts.push(
          scaled(G.box, stone, x, ground(x, z) + h + 0.01, z, len * 0.45, 0.02, 0.035, rot),
        );
    }
  }
}

/** A factory with smokestacks, for industrial cities (returns the stack tops for smoke). */
export function factory(
  parts: Parts,
  x: number,
  y: number,
  z: number,
  rot: number,
): [number, number, number][] {
  parts.push(
    scaled(G.box, BRICK[1]!, x, y + 0.05, z, 0.2, 0.1, 0.12, rot),
    scaled(G.roof, SLATE[1]!, x, y + 0.12, z, 0.2, 0.05, 0.12, rot),
  );
  const tops: [number, number, number][] = [];
  for (const dx of [-0.06, 0.06]) {
    const sx = x + Math.cos(-rot) * dx;
    const sz = z + Math.sin(-rot) * dx;
    parts.push(scaled(G.cyl, 0x5a3a2e, sx, y + 0.15, sz - 0.07, 0.016, 0.3, 0.016));
    tops.push([sx, y + 0.31, sz - 0.07]);
  }
  return tops;
}
