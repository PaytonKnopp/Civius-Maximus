import {
  BoxGeometry,
  type BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { type FigureOpts, mount, person, rider } from './figures';
import { type BoneDef, on, put, type Rig, resetRig, rig } from './rig';

/**
 * The unit models (docs/10-art-direction.md, "Units"; polish P2): squads of rigged figures with
 * gear by era (see figures.ts), riders on horses, oxen and elephants, siege engines, guns,
 * tanks, ships from galleys to destroyers, and aircraft. Local space: y up, +x is the way the
 * unit faces. Each model is two skinned meshes (cloth, wood and skin with vertex colors; metal)
 * on one skeleton, cached per model and color, so a unit costs two draw calls whatever its
 * detail.
 */

const unit = {
  box: new BoxGeometry(1, 1, 1),
  cyl: new CylinderGeometry(1, 1, 1, 8),
  cyl12: new CylinderGeometry(1, 1, 1, 12),
  cone: new ConeGeometry(1, 1, 8),
  ball: new SphereGeometry(1, 8, 6),
  dome: new SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2),
  plane: new PlaneGeometry(1, 1),
  arc: new TorusGeometry(1, 0.1, 4, 10, Math.PI),
};

/** Parts being assembled: `m` matte (cloth, wood, skin), `k` metal. */
interface Kit {
  m: BufferGeometry[];
  k: BufferGeometry[];
}

const C = {
  skin: 0xc79a74,
  skin2: 0x9c7254,
  hair: 0x2e2218,
  wood: 0x6b4a2e,
  woodDark: 0x4a3322,
  leather: 0x7a5434,
  canvas: 0xd8ccae,
  bronze: 0xb88a3e,
  iron: 0x8e9196,
  steel: 0x5c636a,
  dark: 0x2a2622,
  olive: 0x5a6340,
  khaki: 0x8a7d58,
  horse: 0x6e4c33,
  horse2: 0x3b2a1e,
  grey: 0x7a7f84,
  white: 0xe8e2d2,
  gold: 0xd4a94e,
  red: 0x8e2b22,
};

function wheel(kit: Kit, x: number, y: number, z: number, r: number, color = C.woodDark) {
  kit.m.push(put(unit.cyl12, color, [x, y, z], [r, 0.014, r], [Math.PI / 2, 0, 0]));
  kit.m.push(put(unit.cyl, C.dark, [x, y, z], [r * 0.3, 0.02, r * 0.3], [Math.PI / 2, 0, 0]));
}

/** A hull along x: `len` long, `beam` wide, its deck at `deck`. */
const smooth = {
  keel: new SphereGeometry(1, 22, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
  disk: new CylinderGeometry(1, 1, 1, 24),
  rail: new TorusGeometry(1, 0.03, 5, 32),
  prow: new ConeGeometry(1, 1, 14),
  sail: new CylinderGeometry(1, 1, 1, 12, 1, true, -0.5, 1.0),
  pod: new SphereGeometry(1, 18, 12),
  rod: new CylinderGeometry(1, 1, 1, 10),
};

/** A hull along x: `len` long, `beam` wide, its deck at `deck`; smooth and rounded, with a prow. */
function hull(kit: Kit, len: number, beam: number, deck: number, color: number, metal = false) {
  on(
    0,
    () => {
      const g = (metal ? kit.k : kit.m) as BufferGeometry[];
      g.push(put(smooth.keel, color, [0, deck, 0], [len * 0.5, deck * 1.6, beam * 0.5]));
      g.push(
        put(
          smooth.prow,
          color,
          [len * 0.5, deck * 0.62, 0],
          [beam * 0.24, len * 0.2, deck * 0.7],
          [0, 0, -Math.PI / 2],
        ),
      );
      kit.m.push(
        put(smooth.disk, metal ? C.grey : C.wood, [0, deck, 0], [len * 0.49, 0.004, beam * 0.47]),
      );
      (metal ? kit.k : kit.m).push(
        put(
          smooth.rail,
          metal ? C.steel : C.woodDark,
          [0, deck + 0.004, 0],
          [len * 0.5, beam * 0.5, 0.06],
          [Math.PI / 2, 0, 0],
        ),
      );
    },
    true,
  );
}

/** A square sail bellied forward by the wind, on a yard. */
function sail(kit: Kit, x: number, y: number, w: number, h: number, color: number) {
  on(
    0,
    () => {
      const r = w * 1.05;
      kit.m.push(put(smooth.sail, color, [x - r * 0.88, y, 0], [r, h, r], [0, Math.PI / 2, 0]));
      kit.m.push(
        put(
          smooth.rod,
          C.woodDark,
          [x + 0.002, y + h / 2, 0],
          [0.003, w * 1.08, 0.003],
          [Math.PI / 2, 0, 0],
        ),
      );
    },
    true,
  );
}

const SOLDIER: Record<string, Omit<FigureOpts, 'body' | 'trim'>> = {
  warrior: { helmet: 'none', weapon: 'club', legs: C.leather, beard: true },
  spear: { helmet: 'bronze', weapon: 'spear', shield: 'round', legs: C.leather },
  pike: { helmet: 'plume', weapon: 'pike', armor: C.iron, sleeves: true, skirt: false },
  sword: { helmet: 'crest', weapon: 'sword', shield: 'tower', armor: C.iron },
  archer: { helmet: 'hood', weapon: 'bow', legs: C.leather },
  crossbow: { helmet: 'plume', weapon: 'crossbow', armor: C.iron, sleeves: true },
  musket: { helmet: 'tricorn', weapon: 'musket', legs: C.white, sleeves: true, skirt: false },
  rifle: { helmet: 'shako', weapon: 'rifle', legs: C.white, sleeves: true, skirt: false },
  infantry: { helmet: 'steel', weapon: 'rifle', legs: C.olive, sleeves: true, skirt: false },
};

/** How a vehicle moves on its own: ships ride the swell, aircraft hover. */
const VEHICLES: Record<string, 'float' | 'hover' | 'none'> = {
  ship: 'float',
  frigate: 'float',
  steamship: 'float',
  destroyer: 'float',
  plane: 'hover',
  bomber: 'hover',
  helicopter: 'hover',
  rocket: 'hover',
  tank: 'none',
  cannon: 'none',
  artillery: 'none',
  siege: 'none',
};

/** Builds a model's parts. `body` and `trim` are the owner's colors. */
function build(model: string, body: number, trim: number, kit: Kit) {
  const squad = (style: Omit<FigureOpts, 'body' | 'trim'>, n = 3) => {
    const spots: [number, number][] =
      n === 3
        ? [
            [0.06, 0],
            [-0.05, 0.075],
            [-0.05, -0.075],
          ]
        : [
            [0.03, 0.05],
            [-0.03, -0.05],
          ];
    spots.forEach(([x, z], i) =>
      person({ x, z }, { beard: i === 1, ...style, body, trim, look: i * 2 + 1 }),
    );
  };
  switch (model) {
    case 'warrior':
    case 'spear':
    case 'pike':
    case 'sword':
    case 'archer':
    case 'crossbow':
    case 'musket':
    case 'rifle':
    case 'infantry':
      squad(SOLDIER[model]!);
      break;
    case 'scout':
      person(
        { x: 0.03, z: 0.05 },
        { helmet: 'hood', weapon: 'staff', legs: C.leather, body, trim, look: 2 },
      );
      person(
        { x: -0.04, z: -0.04 },
        { helmet: 'none', weapon: 'bow', legs: C.leather, body, trim, look: 3, beard: true },
      );
      break;
    case 'settler': {
      // A covered wagon, an ox and the family walking beside it.
      kit.m.push(put(unit.box, C.wood, [0, 0.08, 0], [0.22, 0.05, 0.12]));
      kit.m.push(put(unit.cyl12, C.canvas, [0, 0.12, 0], [0.065, 0.2, 0.065], [0, 0, Math.PI / 2]));
      kit.m.push(put(unit.box, trim, [0, 0.19, 0], [0.2, 0.012, 0.03]));
      for (const x of [-0.07, 0.07])
        for (const z of [0.065, -0.065]) wheel(kit, x, 0.045, z, 0.042);
      mount(0.2, 0, { kind: 'ox' });
      person(
        { x: 0.06, z: 0.13 },
        { helmet: 'hood', weapon: 'staff', body, trim, legs: C.leather, look: 1 },
      );
      break;
    }
    case 'trader': {
      // A pack mule with bundles and a merchant.
      const mule = mount(0.02, 0, { kind: 'mule', cloth: trim });
      on(mule.rig.body, () => {
        kit.m.push(put(unit.box, trim, [0.0, mule.back - 0.005, 0.038], [0.07, 0.045, 0.028]));
        kit.m.push(put(unit.box, body, [0.0, mule.back - 0.005, -0.038], [0.07, 0.045, 0.028]));
        kit.m.push(put(unit.box, C.canvas, [0.0, mule.back + 0.018, 0], [0.08, 0.026, 0.07]));
      });
      person(
        { x: 0.1, z: 0.1 },
        { helmet: 'hood', weapon: 'staff', body, trim, legs: C.leather, look: 4, beard: true },
      );
      break;
    }
    case 'cavalry':
      for (const z of [0.06, -0.06]) {
        const h = mount(0, z, { kind: 'horse', cloth: trim });
        rider(h, -0.005, z, {
          helmet: 'shako',
          weapon: 'sword',
          body,
          trim,
          legs: C.white,
          sleeves: true,
          skirt: false,
          look: z > 0 ? 1 : 3,
        });
      }
      break;
    case 'horseman':
      for (const z of [0.06, -0.06]) {
        const h = mount(0, z, { kind: 'horse', cloth: trim, coat: z > 0 ? C.horse : C.horse2 });
        rider(h, -0.005, z, {
          helmet: 'none',
          weapon: 'spear',
          body,
          trim,
          legs: C.leather,
          look: z > 0 ? 2 : 0,
          beard: z > 0,
        });
      }
      break;
    case 'knight':
      for (const z of [0.065, -0.065]) {
        const h = mount(0, z, { kind: 'horse', coat: C.horse2, barding: trim });
        rider(h, -0.005, z, {
          helmet: 'plume',
          weapon: 'pike',
          shield: 'kite',
          armor: C.iron,
          sleeves: true,
          cloak: true,
          body,
          trim,
          look: z > 0 ? 3 : 1,
        });
      }
      break;
    case 'elephant': {
      // A war elephant with a howdah and two riders.
      const e = mount(0, 0, { kind: 'elephant' });
      on(e.rig.body, () => {
        kit.m.push(put(unit.box, trim, [-0.015, e.back + 0.028, 0], [0.1, 0.045, 0.085]));
        kit.m.push(put(unit.box, body, [-0.015, e.back + 0.003, 0], [0.15, 0.012, 0.13]));
      });
      rider(e, 0.005, 0.025, { helmet: 'none', weapon: 'bow', body, trim, look: 2 });
      rider(e, -0.035, -0.025, { helmet: 'none', weapon: 'spear', body, trim, look: 4 });
      break;
    }
    case 'chariot': {
      mount(0.13, 0.042, { kind: 'horse', cloth: trim });
      mount(0.13, -0.042, { kind: 'horse', coat: C.horse2, cloth: trim });
      kit.m.push(put(unit.box, trim, [-0.06, 0.08, 0], [0.08, 0.06, 0.1]));
      kit.m.push(put(unit.box, C.wood, [0.04, 0.07, 0], [0.16, 0.012, 0.012]));
      for (const z of [0.065, -0.065]) wheel(kit, -0.06, 0.05, z, 0.05);
      person({ x: -0.07, z: 0.015, y: 0.05 }, { helmet: 'bronze', weapon: 'bow', body, trim });
      break;
    }
    case 'siege': {
      // A catapult: frame, throwing arm, crew.
      kit.m.push(put(unit.box, C.wood, [0, 0.06, 0], [0.2, 0.03, 0.12]));
      for (const z of [0.05, -0.05])
        kit.m.push(put(unit.box, C.wood, [0.02, 0.12, z], [0.02, 0.12, 0.02]));
      kit.m.push(put(unit.box, C.woodDark, [-0.03, 0.15, 0], [0.2, 0.016, 0.016], [0, 0, 0.6]));
      kit.m.push(put(unit.dome, C.leather, [-0.11, 0.1, 0], [0.025, 0.02, 0.025], [Math.PI, 0, 0]));
      for (const x of [-0.07, 0.07]) for (const z of [0.065, -0.065]) wheel(kit, x, 0.04, z, 0.04);
      person({ x: -0.18, z: 0.06 }, { helmet: 'crest', armor: C.iron, body, trim, look: 2 });
      break;
    }
    case 'cannon':
    case 'artillery': {
      const modern = model === 'artillery';
      kit.m.push(
        put(
          unit.box,
          modern ? C.olive : C.wood,
          [-0.05, 0.045, 0.03],
          [0.16, 0.02, 0.02],
          [0, 0.25, -0.15],
        ),
      );
      kit.m.push(
        put(
          unit.box,
          modern ? C.olive : C.wood,
          [-0.05, 0.045, -0.03],
          [0.16, 0.02, 0.02],
          [0, -0.25, -0.15],
        ),
      );
      kit.k.push(
        put(
          unit.cyl,
          modern ? C.olive : C.dark,
          [0.05, 0.1, 0],
          [0.022, modern ? 0.26 : 0.18, 0.022],
          [0, 0, -Math.PI / 2 + 0.2],
        ),
      );
      if (modern) kit.k.push(put(unit.box, C.olive, [0.02, 0.1, 0], [0.01, 0.07, 0.11]));
      for (const z of [0.055, -0.055])
        wheel(kit, 0.01, 0.055, z, 0.055, modern ? C.dark : C.woodDark);
      const crew = modern ? SOLDIER.infantry! : SOLDIER.musket!;
      person({ x: -0.16, z: 0.08 }, { ...crew, weapon: 'none', body, trim, look: 1 });
      person({ x: -0.16, z: -0.08 }, { ...crew, weapon: 'none', body, trim, look: 4 });
      break;
    }
    case 'tank': {
      for (const z of [0.07, -0.07]) {
        kit.k.push(put(unit.box, C.dark, [0, 0.035, z], [0.3, 0.05, 0.04]));
        for (const x of [-0.1, -0.035, 0.035, 0.1])
          kit.k.push(
            put(
              unit.cyl,
              C.steel,
              [x, 0.03, z + Math.sign(z) * 0.021],
              [0.022, 0.006, 0.022],
              [Math.PI / 2, 0, 0],
            ),
          );
      }
      kit.k.push(put(unit.box, C.olive, [0, 0.075, 0], [0.28, 0.045, 0.12]));
      kit.k.push(put(unit.box, C.olive, [0.12, 0.065, 0], [0.06, 0.03, 0.12], [0, 0, 0.5]));
      on(
        0,
        () => {
          kit.k.push(put(smooth.pod, C.olive, [-0.02, 0.11, 0], [0.07, 0.034, 0.052]));
          kit.k.push(put(smooth.disk, C.olive, [-0.035, 0.142, 0.012], [0.014, 0.006, 0.014]));
        },
        true,
      );
      kit.k.push(
        put(unit.cyl, C.steel, [0.12, 0.118, 0], [0.011, 0.18, 0.011], [0, 0, -Math.PI / 2]),
      );
      kit.m.push(put(unit.box, body, [-0.06, 0.124, 0], [0.012, 0.016, 0.06]));
      kit.m.push(put(unit.box, trim, [-0.13, 0.08, 0], [0.004, 0.02, 0.08]));
      break;
    }
    case 'ship': {
      // A galley: low hull, oars, one square sail in the owner's color.
      hull(kit, 0.36, 0.1, 0.05, C.wood);
      kit.m.push(put(unit.cyl, C.woodDark, [0, 0.17, 0], [0.006, 0.26, 0.006]));
      sail(kit, 0, 0.19, 0.16, 0.13, body);
      kit.m.push(put(unit.box, trim, [0.021, 0.19, 0], [0.008, 0.026, 0.15]));
      for (let i = -2; i <= 2; i++)
        for (const z of [1, -1])
          kit.m.push(
            put(
              unit.box,
              C.woodDark,
              [i * 0.05, 0.03, z * 0.08],
              [0.008, 0.008, 0.07],
              [z * 0.5, 0, 0],
            ),
          );
      kit.m.push(put(unit.cone, C.woodDark, [-0.17, 0.09, 0], [0.012, 0.08, 0.012], [0, 0, 0.6]));
      break;
    }
    case 'frigate': {
      hull(kit, 0.42, 0.12, 0.07, C.woodDark);
      kit.m.push(put(unit.box, C.wood, [-0.15, 0.09, 0], [0.08, 0.04, 0.11]));
      kit.m.push(put(unit.box, trim, [0, 0.072, 0], [0.32, 0.012, 0.122]));
      for (const [x, h] of [
        [0.1, 0.3],
        [-0.01, 0.36],
        [-0.12, 0.28],
      ] as const) {
        kit.m.push(put(unit.cyl, C.woodDark, [x, 0.07 + h / 2, 0], [0.006, h, 0.006]));
        sail(kit, x, 0.07 + h * 0.4, 0.15, h * 0.32, C.white);
        sail(kit, x, 0.07 + h * 0.78, 0.11, h * 0.22, C.white);
      }
      kit.m.push(
        put(
          unit.plane,
          body,
          [-0.01, 0.07 + 0.36 + 0.02, 0.03],
          [0.06, 0.04, 1],
          [0, Math.PI / 2, 0],
        ),
      );
      break;
    }
    case 'steamship': {
      // An ironclad: low armored hull, one funnel, a casemate.
      hull(kit, 0.4, 0.12, 0.06, C.steel, true);
      kit.k.push(put(unit.box, C.dark, [0, 0.09, 0], [0.16, 0.04, 0.09]));
      kit.m.push(put(unit.cyl, C.dark, [0.02, 0.15, 0], [0.018, 0.1, 0.018]));
      kit.m.push(put(unit.cyl, trim, [0.02, 0.19, 0], [0.019, 0.012, 0.019]));
      kit.m.push(put(unit.plane, body, [-0.15, 0.13, 0], [0.05, 0.035, 1], [0, Math.PI / 2, 0]));
      kit.m.push(put(unit.cyl, C.woodDark, [-0.15, 0.1, 0], [0.004, 0.08, 0.004]));
      break;
    }
    case 'destroyer': {
      hull(kit, 0.46, 0.1, 0.055, C.grey, true);
      kit.k.push(put(unit.box, C.grey, [-0.02, 0.085, 0], [0.12, 0.04, 0.07]));
      kit.k.push(put(unit.box, C.grey, [0.0, 0.12, 0], [0.05, 0.035, 0.05]));
      kit.m.push(put(unit.cyl, C.dark, [-0.06, 0.12, 0], [0.015, 0.06, 0.02]));
      kit.m.push(put(unit.cyl, body, [-0.06, 0.152, 0], [0.016, 0.008, 0.021]));
      for (const x of [0.13, -0.15]) {
        kit.k.push(put(unit.cyl, C.grey, [x, 0.07, 0], [0.025, 0.025, 0.025]));
        kit.k.push(
          put(
            unit.cyl,
            C.steel,
            [x + 0.04 * Math.sign(x), 0.075, 0],
            [0.005, 0.07, 0.005],
            [0, 0, -Math.PI / 2],
          ),
        );
      }
      kit.m.push(put(unit.cyl, C.dark, [0.02, 0.17, 0], [0.003, 0.08, 0.003]));
      kit.m.push(put(unit.plane, body, [0.02, 0.2, 0], [0.04, 0.025, 1], [0, Math.PI / 2, 0]));
      break;
    }
    case 'plane': {
      // A propeller fighter, flying.
      const y = 0.32;
      on(0, () => kit.k.push(put(smooth.pod, C.grey, [-0.01, y, 0], [0.15, 0.026, 0.026])), true);
      kit.m.push(put(unit.box, body, [0.01, y, 0], [0.07, 0.008, 0.34]));
      kit.m.push(put(unit.box, body, [-0.15, y + 0.005, 0], [0.04, 0.006, 0.12]));
      kit.m.push(put(unit.box, trim, [-0.15, y + 0.03, 0], [0.04, 0.05, 0.006]));
      kit.m.push(put(unit.box, C.dark, [0.125, y, 0], [0.004, 0.09, 0.012]));
      kit.m.push(put(unit.dome, 0x9fc4d8, [0.02, y + 0.018, 0], [0.025, 0.018, 0.016]));
      break;
    }
    case 'bomber': {
      const y = 0.34;
      on(0, () => kit.k.push(put(smooth.pod, C.grey, [0, y, 0], [0.2, 0.034, 0.034])), true);
      kit.m.push(put(unit.box, body, [0.02, y, 0], [0.08, 0.01, 0.48]));
      for (const z of [0.1, -0.1, 0.18, -0.18])
        kit.k.push(
          put(unit.cyl, C.dark, [0.06, y - 0.01, z], [0.014, 0.05, 0.014], [0, 0, Math.PI / 2]),
        );
      kit.m.push(put(unit.box, body, [-0.16, y + 0.005, 0], [0.05, 0.006, 0.16]));
      kit.m.push(put(unit.box, trim, [-0.16, y + 0.04, 0], [0.05, 0.07, 0.006]));
      break;
    }
    case 'helicopter': {
      const y = 0.28;
      on(0, () => kit.k.push(put(smooth.pod, C.olive, [0, y, 0], [0.075, 0.046, 0.046])), true);
      kit.k.push(
        put(unit.cyl, C.olive, [-0.11, y + 0.01, 0], [0.01, 0.14, 0.01], [0, 0, Math.PI / 2]),
      );
      kit.m.push(put(unit.box, C.dark, [0, y + 0.055, 0], [0.32, 0.004, 0.02], [0, 0.4, 0]));
      kit.m.push(put(unit.box, C.dark, [0, y + 0.055, 0], [0.32, 0.004, 0.02], [0, -1.17, 0]));
      kit.m.push(put(unit.box, trim, [-0.17, y + 0.02, 0], [0.03, 0.04, 0.004]));
      kit.m.push(
        put(unit.dome, 0x9fc4d8, [0.045, y + 0.005, 0], [0.03, 0.03, 0.035], [0, 0, -1.2]),
      );
      break;
    }
    case 'rocket': {
      // A missile standing on its launch trailer.
      kit.m.push(put(unit.box, C.dark, [0, 0.05, 0], [0.22, 0.04, 0.1]));
      kit.m.push(put(unit.cyl, C.white, [0, 0.22, 0], [0.035, 0.16, 0.035]));
      kit.m.push(put(unit.cyl, trim, [0, 0.1, 0], [0.04, 0.03, 0.04]));
      kit.k.push(put(unit.ball, body, [0, 0.39, 0], [0.035, 0.05, 0.035]));
      for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2])
        kit.m.push(
          put(
            unit.box,
            trim,
            [Math.cos(a) * 0.04, 0.1, Math.sin(a) * 0.04],
            [0.004, 0.05, 0.03],
            [0, a, 0],
          ),
        );
      break;
    }
    case 'commander': {
      const h = mount(0, 0, { kind: 'horse', coat: C.white, barding: trim });
      rider(h, -0.005, 0, {
        helmet: 'plume',
        weapon: 'sword',
        armor: C.gold,
        cloak: true,
        sleeves: true,
        beard: true,
        body,
        trim,
        scale: 1.1,
        look: 3,
      });
      kit.m.push(put(unit.cyl, C.woodDark, [-0.1, 0.24, 0.07], [0.005, 0.4, 0.005]));
      kit.m.push(put(unit.box, body, [-0.06, 0.38, 0.07], [0.08, 0.06, 0.004]));
      kit.m.push(put(unit.box, trim, [-0.06, 0.352, 0.07], [0.08, 0.008, 0.005]));
      break;
    }
    case 'robed':
      person(
        { x: 0, z: 0 },
        {
          robe: C.white,
          body: C.white,
          trim: body,
          weapon: 'staff',
          cloak: true,
          look: 2,
          beard: true,
        },
      );
      break;
    default:
      squad({ helmet: 'none', weapon: 'staff' }, 2);
  }
}

export interface UnitGeometry {
  matte: BufferGeometry;
  metal: BufferGeometry | null;
  /** The skeleton (rest positions) and what moves on it. */
  bones: BoneDef[];
  rigs: Rig[];
}

const cache = new Map<string, UnitGeometry>();

/** The merged geometry for a model in an owner's colors (cached). */
export function unitGeometry(model: string, body: number, trim: number): UnitGeometry {
  const key = `${model}:${body}:${trim}`;
  let g = cache.get(key);
  if (!g) {
    resetRig();
    build(model, body, trim, rig.out);
    const motion = VEHICLES[model];
    if (motion) rig.rigs.push({ kind: 'vehicle', motion });
    const merge = (list: BufferGeometry[]) => {
      if (list.length === 0) return null;
      const out = mergeGeometries(list)!;
      for (const p of list) p.dispose();
      out.computeBoundingSphere();
      return out;
    };
    g = { matte: merge(rig.out.m)!, metal: merge(rig.out.k), bones: rig.bones, rigs: rig.rigs };
    cache.set(key, g);
  }
  return g;
}

/** Models that fly: drawn above the ground, with a shadow-ish ring. */
export const AIR_MODELS = new Set(['plane', 'bomber', 'helicopter']);
