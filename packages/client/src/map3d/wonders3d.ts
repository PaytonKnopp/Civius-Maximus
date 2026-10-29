import { type BufferGeometry, Color } from 'three';
import { G, scaled } from './parts';

/**
 * Landmarks for the world wonders that came with the full roster (docs/10-art-direction.md,
 * "Wonders"): one recognizable silhouette each, built from the same few primitives as the
 * rest of the map, within one hex.
 */

const STONE = 0xb3a385;
const PALE = 0xd2c4a0;
const MARBLE = 0xe8e2d4;
const GOLD = 0xc9a24a;
const WATER = 0x3f7fa0;
const shade = (c: number, k: number) => new Color(c).multiplyScalar(k).getHex();

type Geo = keyof typeof G;

/**
 * Adds the landmark for `model` to `out`, around the tile center. `at` turns tile offsets
 * into world positions (already rotated by `rot`); `y` is the ground. Returns false for an
 * unknown model.
 */
export function moreWonderParts(
  model: string,
  out: BufferGeometry[],
  at: (dx: number, dz: number) => [number, number],
  y: number,
  rot: number,
): boolean {
  /** A part `dx, dz` off center, its base `dy` up, `sx × sy × sz` big, turned with the tile. */
  const p = (
    g: Geo,
    c: number,
    dx: number,
    dy: number,
    dz: number,
    sx: number,
    sy: number,
    sz: number,
    turn = 0,
  ) => {
    const [px, pz] = at(dx, dz);
    out.push(scaled(G[g], c, px, y + dy + sy / 2, pz, sx, sy, sz, rot + turn));
  };
  /** A column ring or row: `n` columns `h` tall along x from x0 to x1 at depth dz. */
  const columns = (x0: number, x1: number, dz: number, n: number, h: number, dy = 0, c = PALE) => {
    for (let i = 0; i < n; i++)
      p('cyl', c, x0 + ((x1 - x0) * i) / Math.max(1, n - 1), dy, dz, 0.014, h, 0.014);
  };
  /** A slender tower with a cap: minarets, spires, chimneys. */
  const tower = (
    dx: number,
    dz: number,
    h: number,
    w: number,
    c: number,
    cap: number,
    capKind: Geo = 'cone',
  ) => {
    p('cyl', c, dx, 0, dz, w, h, w);
    p(capKind, cap, dx, h, dz, w * 1.3, capKind === 'cone' ? w * 3 : w * 1.3, w * 1.3);
  };
  switch (model) {
    case 'ziggurat': {
      const brick = 0xb08a5a;
      [0.62, 0.44, 0.26].forEach((s, i) =>
        p('box', shade(brick, 1 - i * 0.06), 0, i * 0.1, 0, s, 0.1, s),
      );
      p('box', shade(brick, 0.8), 0, 0, 0.3, 0.08, 0.2, 0.22);
      p('box', MARBLE, 0, 0.3, 0, 0.12, 0.08, 0.12);
      p('roof', 0x4a6a9a, 0, 0.38, 0, 0.16, 0.06, 0.16);
      return true;
    }
    case 'bath': {
      const brick = 0xa8744a;
      p('box', brick, 0, 0, 0, 0.62, 0.04, 0.42);
      p('box', WATER, 0, 0.04, 0, 0.42, 0.01, 0.26);
      for (const dz of [-0.17, 0.17]) p('box', brick, 0, 0.04, dz, 0.5, 0.05, 0.05);
      for (const dx of [-0.25, 0.25]) p('box', brick, dx, 0.04, 0, 0.05, 0.05, 0.34);
      for (const [dx, dz] of [
        [-0.3, -0.3],
        [0.3, -0.28],
        [0.28, 0.3],
      ] as const) {
        p('box', shade(brick, 1.1), dx, 0, dz, 0.14, 0.1, 0.12);
        p('box', shade(brick, 0.85), dx, 0.1, dz, 0.15, 0.02, 0.13);
      }
      return true;
    }
    case 'lighthouse': {
      p('box', STONE, 0, 0, 0, 0.3, 0.12, 0.3);
      p('box', PALE, 0, 0.12, 0, 0.2, 0.22, 0.2);
      p('cyl', PALE, 0, 0.34, 0, 0.07, 0.18, 0.07);
      p('cyl', MARBLE, 0, 0.52, 0, 0.05, 0.06, 0.05);
      p('ball', 0xffc84a, 0, 0.56, 0, 0.05, 0.06, 0.05);
      p('cone', GOLD, 0, 0.62, 0, 0.03, 0.06, 0.03);
      return true;
    }
    case 'mausoleum': {
      p('box', STONE, 0, 0, 0, 0.5, 0.12, 0.5);
      p('box', PALE, 0, 0.12, 0, 0.32, 0.12, 0.32);
      for (const dz of [-0.17, 0.17]) columns(-0.17, 0.17, dz, 5, 0.12, 0.12, MARBLE);
      p('pyramid', PALE, 0, 0.24, 0, 0.26, 0.18, 0.26);
      p('box', 0x6f9a86, 0, 0.42, 0, 0.08, 0.05, 0.05);
      return true;
    }
    case 'terracotta': {
      p('box', 0x6a5440, 0, 0, 0, 0.66, 0.03, 0.5);
      const clay = 0xa86a4a;
      for (let i = 0; i < 5; i++)
        for (let j = 0; j < 4; j++) {
          const dx = -0.24 + i * 0.12;
          const dz = -0.16 + j * 0.105;
          p('cyl', clay, dx, 0.03, dz, 0.018, 0.07, 0.018);
          p('ball', shade(clay, 1.1), dx, 0.1, dz, 0.015, 0.016, 0.015);
        }
      p('box', clay, 0.29, 0.03, -0.18, 0.08, 0.05, 0.05);
      return true;
    }
    case 'parthenon': {
      p('box', STONE, 0, 0, 0, 0.78, 0.04, 0.5);
      p('box', MARBLE, 0, 0.04, 0, 0.7, 0.03, 0.42);
      for (const dz of [-0.18, 0.18]) columns(-0.32, 0.32, dz, 9, 0.18, 0.07, MARBLE);
      for (const dx of [-0.32, 0.32])
        for (const dz of [-0.06, 0.06]) p('cyl', MARBLE, dx, 0.07, dz, 0.014, 0.18, 0.014);
      p('box', MARBLE, 0, 0.25, 0, 0.72, 0.04, 0.42);
      p('roof', 0xc8bca4, 0, 0.29, 0, 0.82, 0.08, 0.44);
      return true;
    }
    case 'zeus': {
      p('box', STONE, 0, 0, 0, 0.6, 0.05, 0.44);
      p('box', MARBLE, 0, 0.05, -0.04, 0.5, 0.26, 0.3);
      columns(-0.22, 0.22, 0.14, 6, 0.26, 0.05, MARBLE);
      p('roof', 0x9a5a3a, 0, 0.31, -0.02, 0.62, 0.1, 0.38);
      // The seated god in the doorway: ivory and gold.
      p('box', GOLD, 0, 0.05, 0.08, 0.12, 0.08, 0.08);
      p('box', 0xf0e6cc, 0, 0.13, 0.07, 0.08, 0.1, 0.06);
      p('ball', 0xf0e6cc, 0, 0.23, 0.07, 0.03, 0.035, 0.03);
      return true;
    }
    case 'domed_church': {
      const wall = 0xc89a72;
      p('box', wall, 0, 0, 0, 0.44, 0.16, 0.44);
      p('cyl', wall, 0, 0.16, 0, 0.14, 0.05, 0.14);
      p('dome', 0x8a9aa8, 0, 0.21, 0, 0.17, 0.12, 0.17);
      for (const dx of [-0.2, 0.2]) p('dome', 0x8a9aa8, dx, 0.16, 0, 0.09, 0.06, 0.12);
      for (const [dx, dz] of [
        [-0.3, -0.3],
        [0.3, -0.3],
        [-0.3, 0.3],
        [0.3, 0.3],
      ] as const)
        tower(dx, dz, 0.36, 0.022, PALE, 0x8a9aa8);
      return true;
    }
    case 'angkor': {
      const sand = 0x9a8a68;
      p('box', WATER, 0, 0, 0, 0.84, 0.01, 0.84);
      [0.62, 0.48, 0.34].forEach((s, i) =>
        p('box', shade(sand, 1 - i * 0.05), 0, 0.01 + i * 0.05, 0, s, 0.05, s),
      );
      const prang = (dx: number, dz: number, h: number) => {
        p('cyl', sand, dx, 0.16, dz, 0.04, h * 0.5, 0.04);
        p('cone', shade(sand, 0.9), dx, 0.16 + h * 0.5, dz, 0.045, h * 0.6, 0.045);
      };
      prang(0, 0, 0.36);
      for (const [dx, dz] of [
        [-0.14, -0.14],
        [0.14, -0.14],
        [-0.14, 0.14],
        [0.14, 0.14],
      ] as const)
        prang(dx, dz, 0.24);
      return true;
    }
    case 'step_pyramid': {
      const lime = 0xb8ae94;
      for (let i = 0; i < 5; i++)
        p('box', shade(lime, 1 - i * 0.03), 0, i * 0.06, 0, 0.56 - i * 0.09, 0.06, 0.56 - i * 0.09);
      p('box', shade(lime, 0.8), 0, 0, 0.24, 0.08, 0.28, 0.12);
      p('box', 0xa84a3a, 0, 0.3, 0, 0.13, 0.08, 0.13);
      p('box', lime, 0, 0.38, 0, 0.15, 0.02, 0.15);
      return true;
    }
    case 'terraces': {
      const grass = 0x6a8a4a;
      p('rock', 0x7a7468, -0.2, 0, -0.22, 0.24, 0.42, 0.2);
      [0.6, 0.48, 0.36].forEach((s, i) =>
        p('box', shade(grass, 1 - i * 0.05), 0.04, i * 0.05, 0.08, s, 0.05, s * 0.7),
      );
      for (const [dx, dz] of [
        [0.0, 0.1],
        [0.14, 0.0],
        [0.16, 0.18],
        [-0.08, 0.2],
      ] as const) {
        p('box', 0x8a8476, dx, 0.15, dz, 0.07, 0.05, 0.06);
        p('roof', 0x6a5a3a, dx, 0.2, dz, 0.09, 0.05, 0.08);
      }
      return true;
    }
    case 'gothic': {
      const lime = 0xc8bca0;
      p('box', lime, 0.06, 0, 0, 0.46, 0.18, 0.2);
      p('roof', 0x5a6a7a, 0.06, 0.18, 0, 0.5, 0.1, 0.2);
      for (const dz of [-0.07, 0.07]) p('box', lime, -0.22, 0, dz, 0.1, 0.32, 0.1);
      p('cone', 0x5a6a7a, 0.1, 0.25, 0, 0.025, 0.2, 0.025);
      p('ball', 0x3a5a9a, -0.272, 0.17, 0, 0.006, 0.05, 0.05);
      return true;
    }
    case 'stone_walls': {
      const granite = 0x8a7a62;
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * Math.PI * 2;
        p(
          'box',
          shade(granite, 0.9 + (i % 3) * 0.05),
          Math.cos(a) * 0.36,
          0,
          Math.sin(a) * 0.28,
          0.1,
          0.14,
          0.05,
          -a + Math.PI / 2,
        );
      }
      p('cyl', granite, 0.08, 0, -0.04, 0.06, 0.24, 0.06);
      p('cone', granite, 0.08, 0.24, -0.04, 0.06, 0.06, 0.06);
      p('box', 0x5a4a3a, -0.12, 0, 0.06, 0.12, 0.06, 0.1);
      return true;
    }
    case 'mud_mosque': {
      const mud = 0xb08a5e;
      p('box', mud, 0, 0, 0, 0.56, 0.16, 0.4);
      for (const dx of [-0.2, 0, 0.2]) {
        p('box', shade(mud, 1.05), dx, 0, 0.2, 0.1, 0.3, 0.08);
        p('cone', shade(mud, 1.05), dx, 0.3, 0.2, 0.035, 0.06, 0.035);
        for (const dy of [0.1, 0.18, 0.26]) p('box', 0x5a4a32, dx, dy, 0.25, 0.08, 0.008, 0.02);
      }
      for (let i = 0; i < 6; i++)
        p('cone', shade(mud, 0.95), -0.25 + i * 0.1, 0.16, -0.19, 0.02, 0.05, 0.02);
      return true;
    }
    case 'mosque_domes': {
      const coral = 0xd8ccb0;
      p('box', coral, 0, 0, 0, 0.56, 0.12, 0.44);
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++)
          p('dome', shade(coral, 0.95), -0.18 + i * 0.18, 0.12, -0.14 + j * 0.14, 0.06, 0.05, 0.06);
      tower(0.3, 0.24, 0.3, 0.03, coral, coral, 'dome');
      return true;
    }
    case 'palace': {
      const red = 0x9a2a22;
      const yellow = 0xd8a830;
      for (const dz of [-0.36, 0.36]) p('box', red, 0, 0, dz, 0.8, 0.08, 0.04);
      for (const dx of [-0.38, 0.38]) p('box', red, dx, 0, 0, 0.04, 0.08, 0.72);
      p('box', PALE, 0, 0, 0, 0.5, 0.04, 0.34);
      p('box', red, 0, 0.04, -0.04, 0.36, 0.1, 0.18);
      p('roof', yellow, 0, 0.14, -0.04, 0.5, 0.08, 0.26);
      for (const dx of [-0.24, 0.24]) {
        p('box', red, dx, 0.04, 0.16, 0.14, 0.07, 0.1);
        p('roof', yellow, dx, 0.11, 0.16, 0.2, 0.05, 0.14);
      }
      return true;
    }
    case 'alhambra': {
      const ochre = 0xb86a4a;
      for (const dz of [-0.3, 0.3]) p('box', ochre, 0, 0, dz, 0.7, 0.1, 0.05);
      for (const dx of [-0.34, 0.34]) p('box', ochre, dx, 0, 0, 0.05, 0.1, 0.6);
      for (const [dx, dz] of [
        [-0.34, -0.3],
        [0.34, -0.3],
        [-0.34, 0.3],
        [0.34, 0.3],
        [0, -0.3],
      ] as const)
        p('box', shade(ochre, 1.08), dx, 0, dz, 0.1, 0.2, 0.1);
      p('box', 0xe8dcc0, 0, 0, -0.05, 0.36, 0.12, 0.16);
      p('box', WATER, 0, 0, 0.14, 0.28, 0.012, 0.08);
      columns(-0.16, 0.16, 0.05, 6, 0.1, 0, 0xe8dcc0);
      return true;
    }
    case 'potala': {
      const white = 0xece6d8;
      p('rock', 0x7a7060, 0, 0, -0.1, 0.5, 0.18, 0.34);
      [
        [0.7, 0.06, 0.3],
        [0.56, 0.18, 0.24],
        [0.36, 0.28, 0.16],
      ].forEach(([w, dy, d]) => p('box', white, 0, dy!, 0.04, w!, 0.1, d!));
      p('box', 0x8a2a2a, 0, 0.38, 0.02, 0.2, 0.08, 0.12);
      for (const dx of [-0.06, 0.06]) p('roof', GOLD, dx, 0.46, 0.02, 0.08, 0.05, 0.08);
      return true;
    }
    case 'shipyard': {
      const brick = 0x9a5a3a;
      for (const dz of [-0.2, 0, 0.2]) {
        p('box', PALE, 0, 0, dz, 0.56, 0.1, 0.14);
        p('roof', brick, 0, 0.1, dz, 0.62, 0.08, 0.16, Math.PI / 4);
      }
      for (const dx of [-0.36, 0.36]) {
        p('box', PALE, dx, 0, 0.36, 0.07, 0.22, 0.07);
        p('pyramid', brick, dx, 0.22, 0.36, 0.08, 0.06, 0.08);
      }
      p('box', 0x6a4a2e, 0.1, 0.02, 0.33, 0.2, 0.04, 0.06);
      return true;
    }
    case 'castle': {
      const white = 0xf0ece4;
      const roof = 0x4a5a64;
      p('box', 0x8a8070, 0, 0, 0, 0.5, 0.08, 0.42);
      [
        [0.4, 0.32],
        [0.32, 0.25],
        [0.24, 0.18],
        [0.16, 0.12],
      ].forEach(([w, d], i) => {
        p('box', white, 0, 0.08 + i * 0.1, 0, w!, 0.07, d!);
        p('roof', roof, 0, 0.15 + i * 0.1, 0, w! * 1.3, 0.04, d! * 1.3);
      });
      p('box', white, 0.26, 0.08, 0.14, 0.12, 0.08, 0.1);
      p('roof', roof, 0.26, 0.16, 0.14, 0.17, 0.04, 0.14);
      return true;
    }
    case 'pagoda': {
      const white = 0xf2f0ea;
      for (let i = 0; i < 7; i++) {
        const s = 0.16 - i * 0.015;
        p('cyl', white, 0, 0.02 + i * 0.075, 0, s, 0.055, s);
        p('cone', 0x3a6a5a, 0, 0.075 + i * 0.075, 0, s * 1.45, 0.025, s * 1.45);
      }
      p('cone', GOLD, 0, 0.56, 0, 0.025, 0.1, 0.025);
      p('box', STONE, 0, 0, 0, 0.46, 0.02, 0.46);
      return true;
    }
    case 'observatory': {
      const red = 0xc0704a;
      p('box', 0xb8a888, 0, 0, 0, 0.8, 0.02, 0.6);
      p('roof', red, -0.06, 0.02, -0.08, 0.5, 0.34, 0.1);
      p('box', MARBLE, -0.06, 0.02, -0.08, 0.04, 0.02, 0.36);
      for (const [dx, dz, s] of [
        [0.24, 0.16, 0.12],
        [-0.24, 0.2, 0.1],
        [0.26, -0.16, 0.08],
      ] as const) {
        p('cyl', red, dx, 0.02, dz, s, 0.05, s);
        p('cyl', MARBLE, dx, 0.07, dz, s * 0.85, 0.005, s * 0.85);
      }
      return true;
    }
    case 'baroque': {
      const green = 0x6aa88a;
      p('box', green, 0, 0, 0, 0.78, 0.16, 0.22);
      columns(-0.36, 0.36, 0.115, 12, 0.14, 0.01, MARBLE);
      p('box', MARBLE, 0, 0.16, 0, 0.8, 0.03, 0.24);
      p('box', green, 0, 0.19, 0, 0.7, 0.04, 0.18);
      for (const dx of [-0.3, 0, 0.3]) p('dome', GOLD, dx, 0.23, 0, 0.04, 0.04, 0.04);
      return true;
    }
    case 'factory': {
      const brick = 0x8a4a3a;
      for (const dx of [-0.2, 0, 0.2]) {
        p('box', brick, dx, 0, 0, 0.18, 0.14, 0.42);
        p('roof', 0x4a4a4a, dx, 0.14, 0, 0.18, 0.08, 0.44);
      }
      for (const [dx, dz] of [
        [-0.32, -0.26],
        [-0.1, 0.3],
        [0.3, 0.28],
      ] as const) {
        p('cyl', shade(brick, 0.85), dx, 0, dz, 0.03, 0.46, 0.03);
        p('ball', 0x8a8a8a, dx, 0.5, dz, 0.06, 0.05, 0.06);
      }
      return true;
    }
    case 'college': {
      const sand = 0xd0be92;
      for (const dz of [-0.24, 0.24]) p('box', sand, 0, 0, dz, 0.6, 0.12, 0.1);
      for (const dx of [-0.26, 0.26]) p('box', sand, dx, 0, 0, 0.1, 0.12, 0.38);
      p('box', 0x6a8a4a, 0, 0, 0, 0.42, 0.01, 0.38);
      p('box', sand, 0, 0, 0.24, 0.1, 0.28, 0.1);
      for (const [dx, dz] of [
        [-0.035, 0.205],
        [0.035, 0.205],
        [-0.035, 0.275],
        [0.035, 0.275],
      ] as const)
        p('cone', sand, dx, 0.28, dz, 0.012, 0.06, 0.012);
      p('dome', 0x5a6a5a, -0.26, 0.12, 0, 0.06, 0.07, 0.06);
      return true;
    }
    case 'redeemer': {
      p('rock', 0x6a6a5a, 0, 0, 0, 0.42, 0.3, 0.36);
      const white = 0xecece4;
      p('box', white, 0, 0.28, 0, 0.06, 0.04, 0.06);
      p('cyl', white, 0, 0.32, 0, 0.035, 0.2, 0.035);
      p('box', white, 0, 0.46, 0, 0.26, 0.03, 0.035);
      p('ball', white, 0, 0.52, 0, 0.025, 0.03, 0.025);
      return true;
    }
    case 'stadium': {
      const white = 0xe8e8e0;
      p('box', 0x4a8a3a, 0, 0, 0, 0.42, 0.015, 0.28);
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2;
        p(
          'box',
          i % 2 ? white : shade(white, 0.85),
          Math.cos(a) * 0.38,
          0,
          Math.sin(a) * 0.28,
          0.09,
          0.16,
          0.05,
          -a + Math.PI / 2,
        );
      }
      return true;
    }
    case 'dam': {
      const concrete = 0xb8b4aa;
      p('box', WATER, 0, 0, -0.22, 0.8, 0.16, 0.36);
      for (let i = 0; i < 9; i++) {
        const a = -0.9 + (i / 8) * 1.8;
        p('box', concrete, Math.sin(a) * 0.42, 0, Math.cos(a) * 0.18 - 0.1, 0.1, 0.24, 0.06, -a);
      }
      for (const dx of [-0.12, 0.12]) p('box', concrete, dx, 0.24, 0.07, 0.05, 0.08, 0.05);
      p('box', 0x6a6a64, 0, 0, 0.2, 0.3, 0.03, 0.12);
      return true;
    }
    case 'shells': {
      const white = 0xf4f2ec;
      p('box', 0xb87a5a, 0, 0, 0, 0.6, 0.06, 0.36);
      for (const [dx, s] of [
        [-0.2, 0.14],
        [-0.05, 0.17],
        [0.12, 0.15],
        [0.25, 0.1],
      ] as const) {
        p('dome', white, dx, 0.06, -0.05, s * 0.7, s * 1.6, s);
        p('dome', shade(white, 0.92), dx + 0.02, 0.06, 0.09, s * 0.5, s * 1.1, s * 0.7);
      }
      return true;
    }
    case 'spire': {
      const concrete = 0xc8c4bc;
      p('box', 0x8a8680, 0, 0, 0, 0.3, 0.04, 0.3);
      p('cyl', concrete, 0, 0.04, 0, 0.045, 0.5, 0.045);
      p('cyl', 0x5a6a7a, 0, 0.42, 0, 0.09, 0.05, 0.09);
      p('cyl', concrete, 0, 0.47, 0, 0.06, 0.02, 0.06);
      p('cone', concrete, 0, 0.54, 0, 0.015, 0.2, 0.015);
      return true;
    }
    case 'onion': {
      const colors = [0xc83a2a, 0x2a8a5a, 0x2a5aa8, 0xd8a830];
      p('box', 0xb04a3a, 0, 0, 0, 0.44, 0.12, 0.44);
      const dome = (dx: number, dz: number, h: number, w: number, c: number) => {
        p('cyl', 0xc87a5a, dx, 0.12, dz, w, h, w);
        p('ball', c, dx, 0.12 + h, dz, w * 1.4, w * 1.6, w * 1.4);
        p('cone', GOLD, dx, 0.12 + h + w * 1.3, dz, w * 0.4, w * 1.6, w * 0.4);
      };
      dome(0, 0, 0.3, 0.05, colors[3]!);
      [
        [-0.16, -0.16],
        [0.16, -0.16],
        [-0.16, 0.16],
        [0.16, 0.16],
      ].forEach(([dx, dz], i) => dome(dx!, dz!, 0.16, 0.04, colors[i % 3]!));
      return true;
    }
    case 'taj': {
      const white = 0xf4f0e8;
      p('box', STONE, 0, 0, 0, 0.62, 0.04, 0.62);
      p('box', WATER, 0, 0.04, 0.3, 0.08, 0.005, 0.24);
      p('box', white, 0, 0.04, -0.06, 0.28, 0.16, 0.28);
      p('cyl', white, 0, 0.2, -0.06, 0.09, 0.05, 0.09);
      p('ball', white, 0, 0.25, -0.06, 0.12, 0.14, 0.12);
      p('cone', GOLD, 0, 0.37, -0.06, 0.015, 0.06, 0.015);
      for (const [dx, dz] of [
        [-0.26, -0.28],
        [0.26, -0.28],
        [-0.26, 0.16],
        [0.26, 0.16],
      ] as const)
        tower(dx, dz, 0.3, 0.02, white, white, 'dome');
      return true;
    }
    case 'clock_tower': {
      const sand = 0xc8b48a;
      p('box', sand, -0.12, 0, 0, 0.5, 0.14, 0.18);
      p('roof', 0x4a5a5a, -0.12, 0.14, 0, 0.54, 0.05, 0.2);
      p('box', sand, 0.22, 0, 0, 0.1, 0.46, 0.1);
      p('box', 0xf0e8c8, 0.22, 0.38, 0, 0.11, 0.06, 0.11);
      p('pyramid', 0x4a5a5a, 0.22, 0.46, 0, 0.09, 0.14, 0.09);
      return true;
    }
    case 'lattice_tower': {
      const iron = 0x6a5a48;
      for (const [dx, dz] of [
        [-0.13, -0.13],
        [0.13, -0.13],
        [-0.13, 0.13],
        [0.13, 0.13],
      ] as const)
        p('box', iron, dx, 0, dz, 0.04, 0.12, 0.04);
      p('box', iron, 0, 0.12, 0, 0.3, 0.025, 0.3);
      p('pyramid', iron, 0, 0.145, 0, 0.2, 0.2, 0.2);
      p('box', iron, 0, 0.3, 0, 0.1, 0.02, 0.1);
      p('cyl', iron, 0, 0.32, 0, 0.025, 0.2, 0.025);
      p('cone', iron, 0, 0.52, 0, 0.01, 0.12, 0.01);
      return true;
    }
    case 'colossus': {
      const bronze = 0x6f9a86;
      for (const dz of [-0.12, 0.12]) {
        p('box', STONE, 0, 0, dz, 0.12, 0.1, 0.12);
        p('box', bronze, 0, 0.1, dz * 0.7, 0.04, 0.2, 0.04);
      }
      p('cyl', bronze, 0, 0.3, 0, 0.05, 0.16, 0.05);
      p('ball', bronze, 0, 0.47, 0, 0.04, 0.045, 0.04);
      p('box', bronze, 0.03, 0.46, 0.06, 0.02, 0.12, 0.02);
      p('cone', 0xe0a040, 0.03, 0.58, 0.06, 0.025, 0.05, 0.025);
      return true;
    }
    default:
      return false;
  }
}
