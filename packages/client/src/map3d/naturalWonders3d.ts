import type { BufferGeometry } from 'three';
import type { Emitter } from './effects3d';
import { G, scaled, seeded } from './parts';

/**
 * Natural wonder landmarks (docs/10-art-direction.md, "Natural wonders"): one hand-shaped model
 * per kind (content: `feature.naturalWonder.model`), big enough to spot from strategy zoom.
 * Mountains get a taller, sharper summit than ordinary peaks; water wonders sit at sea level.
 */
export function naturalWonderParts(
  model: string,
  x: number,
  z: number,
  ground: number,
  seed: number,
): { parts: BufferGeometry[]; emitters: Emitter[] } {
  const r = seeded(seed * 7 + 3);
  const parts: BufferGeometry[] = [];
  const emitters: Emitter[] = [];
  const y = Math.max(0, ground);
  const ring = (n: number, radius: number, fn: (px: number, pz: number, i: number) => void) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r() * 0.4;
      const rr = radius * (0.7 + r() * 0.4);
      fn(x + Math.cos(a) * rr, z + Math.sin(a) * rr, i);
    }
  };
  switch (model) {
    case 'peak': {
      // A great summit: rock body, ridges, a deep snow cap.
      parts.push(
        scaled(G.cone, 0x6a6460, x, y + 0.55, z, 0.62, 1.1, 0.62),
        scaled(G.cone, 0x7c7670, x + 0.22, y + 0.35, z + 0.12, 0.38, 0.7, 0.38),
        scaled(G.cone, 0x5e5854, x - 0.24, y + 0.3, z - 0.1, 0.34, 0.6, 0.34),
        scaled(G.cone, 0xf4f6fa, x, y + 0.86, z, 0.3, 0.5, 0.3),
        scaled(G.cone, 0xe8ecf2, x + 0.22, y + 0.58, z + 0.12, 0.16, 0.26, 0.16),
      );
      emitters.push({ kind: 'mist', at: [x, y + 1.15, z] });
      break;
    }
    case 'reef': {
      const corals = [0xe0705a, 0xf0a050, 0x6ad0c0, 0xd060a0, 0xf4d070];
      ring(14, 0.55, (px, pz, i) => {
        const s = 0.06 + r() * 0.06;
        parts.push(
          scaled(G.bush, corals[i % corals.length]!, px, 0.02 + s * 0.4, pz, s, s * 0.8, s),
        );
      });
      parts.push(scaled(G.hex, 0x3fb7a8, x, 0.004, z, 0.7, 0.01, 0.7));
      break;
    }
    case 'monolith':
      parts.push(
        scaled(G.ball, 0xb8503a, x, y + 0.12, z, 0.62, 0.3, 0.34, r()),
        scaled(G.box, 0xa04430, x, y + 0.08, z, 0.9, 0.16, 0.42, r() * 0.2),
      );
      break;
    case 'canyon':
      // Terraced red walls stepping down to a dark river cut.
      for (let k = 0; k < 4; k++) {
        const c = [0xc0683e, 0xa8562f, 0xd08050, 0x8e4a2a][k]!;
        for (const side of [-1, 1]) {
          parts.push(
            scaled(
              G.box,
              c,
              x + side * (0.18 + k * 0.1),
              y + 0.2 - k * 0.05,
              z,
              0.12,
              0.4 - k * 0.1,
              0.9,
            ),
          );
        }
      }
      parts.push(scaled(G.box, 0x3a6a8a, x, y + 0.01, z, 0.12, 0.02, 0.9));
      break;
    case 'falls':
      parts.push(
        scaled(G.box, 0x5e584e, x - 0.1, y + 0.18, z, 0.7, 0.36, 0.3),
        scaled(G.box, 0xdff0f8, x - 0.1, y + 0.17, z + 0.16, 0.55, 0.34, 0.02),
        scaled(G.hex, 0x7fb6d8, x - 0.1, y + 0.01, z + 0.35, 0.42, 0.02, 0.22),
      );
      emitters.push({ kind: 'mist', at: [x - 0.1, y + 0.06, z + 0.32] });
      break;
    case 'lake':
      parts.push(
        scaled(G.hex, 0xf0ece0, x, y + 0.008, z, 0.66, 0.01, 0.66),
        scaled(G.hex, 0x5fb0b8, x, y + 0.012, z, 0.56, 0.01, 0.56),
      );
      break;
    case 'islands':
      ring(5, 0.45, (px, pz) => {
        const s = 0.1 + r() * 0.08;
        parts.push(
          scaled(G.rock, 0x8a7a62, px, 0.03, pz, s, s * 0.5, s),
          scaled(G.bush, 0x5a9a4a, px, 0.07, pz, s * 0.8, s * 0.4, s * 0.8),
        );
      });
      break;
    case 'bay':
      ring(11, 0.5, (px, pz) => {
        const h = 0.25 + r() * 0.35;
        parts.push(
          scaled(G.cyl, 0xb8b4a6, px, h / 2, pz, 0.06, h, 0.06),
          scaled(G.bush, 0x4f8a4a, px, h + 0.02, pz, 0.07, 0.05, 0.07),
        );
      });
      break;
    case 'cliffs':
      parts.push(
        scaled(G.box, 0x9a9e98, x - 0.15, y + 0.35, z - 0.1, 0.32, 0.7, 0.3, 0.2),
        scaled(G.box, 0x8a8f88, x + 0.2, y + 0.26, z + 0.1, 0.3, 0.52, 0.26, -0.3),
        scaled(G.ball, 0x9a9e98, x - 0.15, y + 0.7, z - 0.1, 0.17, 0.08, 0.15),
      );
      ring(7, 0.55, (px, pz) => {
        const s = 0.06 + r() * 0.03;
        parts.push(scaled(G.cone, 0x2f5a36, px, y + s * 2, pz, s, s * 4, s));
      });
      emitters.push({ kind: 'mist', at: [x + 0.05, y + 0.45, z + 0.25] });
      break;
    case 'wetland':
      ring(9, 0.5, (px, pz, i) => {
        parts.push(
          scaled(G.hex, i % 2 ? 0x4e8a46 : 0x5a7a52, px, y + 0.006, pz, 0.16, 0.01, 0.16),
          scaled(G.cyl, 0x8a9a52, px + 0.05, y + 0.05, pz, 0.006, 0.1, 0.006),
        );
      });
      parts.push(scaled(G.hex, 0x5a8aa0, x, y + 0.004, z, 0.4, 0.01, 0.4));
      break;
    case 'columns':
      for (let i = 0; i < 16; i++) {
        const px = x + ((i % 4) - 1.5) * 0.12 + (Math.floor(i / 4) % 2) * 0.06;
        const pz = z + (Math.floor(i / 4) - 1.5) * 0.12;
        const h = 0.08 + (3 - Math.floor(i / 4)) * 0.06 + r() * 0.04;
        parts.push(scaled(G.hex, 0x4a4d52, px, y + h / 2, pz, 0.06, h, 0.06));
      }
      break;
    case 'rings':
      for (let k = 0; k < 4; k++) {
        const rr = 0.6 - k * 0.13;
        parts.push(
          scaled(G.cyl, k % 2 ? 0xd8b080 : 0x8a5a3a, x, y + 0.006 + k * 0.004, z, rr, 0.01, rr),
        );
      }
      break;
    default:
      parts.push(scaled(G.cone, 0xd4a94e, x, y + 0.3, z, 0.2, 0.6, 0.2));
  }
  // Small-featured landmarks are drawn larger, so they read from strategy zoom.
  const k = GROW[model] ?? 1;
  if (k !== 1) for (const p of parts) p.translate(-x, -y, -z).scale(k, k, k).translate(x, y, z);
  return { parts, emitters };
}

const GROW: Record<string, number> = {
  columns: 1.9,
  rings: 1.3,
  lake: 1.2,
  wetland: 1.4,
  islands: 1.5,
  bay: 1.5,
  reef: 1.3,
  monolith: 1.3,
  cliffs: 1.3,
  falls: 1.4,
};
