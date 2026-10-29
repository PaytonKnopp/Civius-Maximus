import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * The unit models (docs/10-art-direction.md, "Units"): small squads of chunky figures with gear
 * by era (bronze helmets and round shields, mail and crests, tricorns and muskets, steel
 * helmets and rifles), horses, chariots, siege engines, guns, tanks, ships from galleys to
 * destroyers, and aircraft. Local space: y up, +x is the way the unit faces. Each model is two
 * merged meshes (cloth and wood with vertex colors, metal), cached per model and color, so a
 * unit costs two draw calls whatever its detail.
 */

type V3 = [number, number, number];

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

const m4 = new Matrix4();
const qt = new Quaternion();
const eu = new Euler();

/** A unit geometry, colored, placed at `at`, scaled by `s` and rotated by `rot` (radians, XYZ). */
function put(g: BufferGeometry, color: number, at: V3, s: V3, rot: V3 = [0, 0, 0]) {
  const out = g.index ? g.toNonIndexed() : g.clone();
  out.deleteAttribute('uv');
  qt.setFromEuler(eu.set(rot[0], rot[1], rot[2]));
  out.applyMatrix4(m4.compose(new Vector3(...at), qt, new Vector3(...s)));
  const c = new Color(color);
  const n = out.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  out.setAttribute('color', new Float32BufferAttribute(col, 3));
  return out;
}

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

type Helmet = 'none' | 'bronze' | 'crest' | 'plume' | 'tricorn' | 'shako' | 'steel' | 'hood';
type Weapon =
  'none' | 'club' | 'spear' | 'pike' | 'sword' | 'bow' | 'crossbow' | 'musket' | 'rifle' | 'staff';
type Shield = 'none' | 'round' | 'tower' | 'kite';

interface FigureOpts {
  helmet?: Helmet;
  weapon?: Weapon;
  shield?: Shield;
  /** Tunic color (the owner's main color). */
  body: number;
  /** Trim color (the owner's accent). */
  trim: number;
  /** Trousers and boots. */
  legs?: number;
  /** Armor over the tunic. */
  armor?: number;
  scale?: number;
  skin?: number;
}

/** One soldier, standing at (x, z), facing +x. About 0.25 tall. */
function figure(kit: Kit, x: number, z: number, o: FigureOpts, y = 0) {
  const s = o.scale ?? 1;
  const at = (dx: number, dy: number, dz: number): V3 => [x + dx * s, y + dy * s, z + dz * s];
  const sz = (a: number, b: number, c: number): V3 => [a * s, b * s, c * s];
  const legs = o.legs ?? C.dark;
  const skin = o.skin ?? C.skin;
  // Legs and boots.
  for (const side of [-1, 1]) {
    kit.m.push(put(unit.box, legs, at(0, 0.045, side * 0.017), sz(0.024, 0.09, 0.022)));
    kit.m.push(put(unit.box, C.dark, at(0.006, 0.01, side * 0.017), sz(0.032, 0.02, 0.024)));
  }
  // Torso, tapering to the shoulders, a belt.
  kit.m.push(put(unit.box, o.body, at(0, 0.125, 0), sz(0.04, 0.075, 0.062)));
  kit.m.push(put(unit.box, o.armor ?? o.trim, at(0, 0.093, 0), sz(0.044, 0.012, 0.066)));
  if (o.armor !== undefined)
    kit.k.push(put(unit.box, o.armor, at(0.002, 0.135, 0), sz(0.042, 0.05, 0.064)));
  // Arms: the right (−z) holds the weapon forward, the left the shield.
  kit.m.push(put(unit.box, o.body, at(0.012, 0.13, -0.042), sz(0.02, 0.07, 0.02), [0, 0, -0.5]));
  kit.m.push(put(unit.box, o.body, at(0.012, 0.13, 0.042), sz(0.02, 0.07, 0.02), [0, 0, -0.35]));
  kit.m.push(put(unit.ball, skin, at(0.032, 0.1, -0.044), sz(0.012, 0.012, 0.012)));
  // Neck and head.
  kit.m.push(put(unit.ball, skin, at(0, 0.188, 0), sz(0.026, 0.028, 0.026)));
  helmet(kit, o.helmet ?? 'none', at, sz, o.trim);
  weapon(kit, o.weapon ?? 'none', at, sz);
  shield(kit, o.shield ?? 'none', at, sz, o.trim, o.body);
}

function helmet(
  kit: Kit,
  h: Helmet,
  at: (x: number, y: number, z: number) => V3,
  sz: (a: number, b: number, c: number) => V3,
  trim: number,
) {
  switch (h) {
    case 'none':
      kit.m.push(put(unit.dome, C.hair, at(-0.004, 0.194, 0), sz(0.028, 0.024, 0.028)));
      break;
    case 'hood':
      kit.m.push(put(unit.dome, C.canvas, at(-0.004, 0.19, 0), sz(0.031, 0.034, 0.031)));
      break;
    case 'bronze':
      kit.k.push(put(unit.dome, C.bronze, at(0, 0.196, 0), sz(0.03, 0.028, 0.03)));
      break;
    case 'crest':
      kit.k.push(put(unit.dome, C.iron, at(0, 0.196, 0), sz(0.03, 0.028, 0.03)));
      kit.m.push(put(unit.box, trim, at(-0.002, 0.226, 0), sz(0.05, 0.016, 0.008)));
      break;
    case 'plume':
      kit.k.push(put(unit.dome, C.steel, at(0, 0.196, 0), sz(0.031, 0.03, 0.031)));
      kit.m.push(put(unit.cone, trim, at(-0.01, 0.235, 0), sz(0.012, 0.04, 0.012), [0, 0, 0.4]));
      break;
    case 'tricorn':
      kit.m.push(put(unit.cyl, C.dark, at(0, 0.206, 0), sz(0.038, 0.008, 0.038)));
      kit.m.push(put(unit.dome, C.dark, at(0, 0.208, 0), sz(0.024, 0.018, 0.024)));
      break;
    case 'shako':
      kit.m.push(put(unit.cyl, C.dark, at(0, 0.222, 0), sz(0.024, 0.04, 0.024)));
      kit.m.push(put(unit.box, trim, at(0.022, 0.23, 0), sz(0.004, 0.012, 0.012)));
      break;
    case 'steel':
      kit.k.push(put(unit.dome, C.olive, at(0, 0.196, 0), sz(0.034, 0.026, 0.034)));
      kit.k.push(put(unit.cyl, C.olive, at(0, 0.197, 0), sz(0.04, 0.004, 0.04)));
      break;
  }
}

function weapon(
  kit: Kit,
  w: Weapon,
  at: (x: number, y: number, z: number) => V3,
  sz: (a: number, b: number, c: number) => V3,
) {
  const hand = (dx: number, dy: number) => at(0.032 + dx, 0.1 + dy, -0.044);
  switch (w) {
    case 'club':
      kit.m.push(put(unit.cyl, C.wood, hand(0.02, 0.03), sz(0.008, 0.09, 0.008), [0, 0, -0.6]));
      kit.m.push(put(unit.ball, C.woodDark, hand(0.046, 0.066), sz(0.016, 0.016, 0.016)));
      break;
    case 'spear':
    case 'pike': {
      const len = w === 'pike' ? 0.42 : 0.3;
      kit.m.push(put(unit.cyl, C.wood, hand(0, 0.05), sz(0.005, len, 0.005)));
      kit.k.push(put(unit.cone, C.iron, hand(0, 0.05 + len / 2 + 0.018), sz(0.01, 0.036, 0.01)));
      break;
    }
    case 'sword':
      kit.k.push(put(unit.box, C.iron, hand(0.04, 0.03), sz(0.07, 0.01, 0.004), [0, 0, 0.6]));
      kit.m.push(put(unit.box, C.bronze, hand(0.008, 0.008), sz(0.006, 0.024, 0.008), [0, 0, 0.6]));
      break;
    case 'bow':
      kit.m.push(
        put(unit.arc, C.wood, at(0.05, 0.13, 0.04), sz(0.07, 0.07, 0.07), [
          Math.PI / 2,
          0,
          -Math.PI / 2,
        ]),
      );
      kit.m.push(
        put(unit.box, C.leather, at(-0.026, 0.13, 0.012), sz(0.014, 0.06, 0.02), [0.4, 0, 0]),
      );
      break;
    case 'crossbow':
      kit.m.push(put(unit.box, C.wood, hand(0.04, 0.02), sz(0.08, 0.012, 0.012)));
      kit.m.push(
        put(unit.arc, C.iron, hand(0.07, 0.02), sz(0.04, 0.04, 0.04), [
          Math.PI / 2,
          0,
          -Math.PI / 2,
        ]),
      );
      break;
    case 'musket':
    case 'rifle':
      kit.m.push(put(unit.box, C.woodDark, hand(0.01, 0.02), sz(0.05, 0.014, 0.01), [0, 0, 0.9]));
      kit.k.push(put(unit.cyl, C.steel, hand(0.04, 0.08), sz(0.004, 0.11, 0.004), [0, 0, -0.68]));
      if (w === 'musket')
        kit.k.push(
          put(unit.cone, C.iron, hand(0.085, 0.135), sz(0.003, 0.03, 0.003), [0, 0, -0.68]),
        );
      break;
    case 'staff':
      kit.m.push(put(unit.cyl, C.wood, hand(0, 0.06), sz(0.005, 0.26, 0.005)));
      break;
  }
}

function shield(
  kit: Kit,
  s: Shield,
  at: (x: number, y: number, z: number) => V3,
  sz: (a: number, b: number, c: number) => V3,
  trim: number,
  body: number,
) {
  switch (s) {
    case 'round':
      kit.m.push(
        put(unit.cyl12, trim, at(0.03, 0.125, 0.05), sz(0.045, 0.008, 0.045), [0, 0, Math.PI / 2]),
      );
      kit.k.push(put(unit.ball, C.bronze, at(0.035, 0.125, 0.05), sz(0.01, 0.01, 0.01)));
      break;
    case 'tower':
      kit.m.push(put(unit.box, body, at(0.032, 0.12, 0.05), sz(0.008, 0.1, 0.06)));
      kit.k.push(put(unit.box, C.gold, at(0.037, 0.12, 0.05), sz(0.004, 0.016, 0.016)));
      break;
    case 'kite':
      kit.m.push(put(unit.box, trim, at(0.032, 0.135, 0.05), sz(0.008, 0.06, 0.05)));
      kit.m.push(
        put(unit.cone, trim, at(0.032, 0.088, 0.05), sz(0.025, 0.04, 0.004), [Math.PI, 0, 0]),
      );
      break;
  }
}

/** A horse facing +x, standing at (x, z); its back is about 0.13 up. */
function horse(kit: Kit, x: number, z: number, coat = C.horse, barding?: number) {
  kit.m.push(put(unit.box, barding ?? coat, [x, 0.125, z], [0.17, 0.065, 0.06]));
  kit.m.push(put(unit.box, coat, [x + 0.095, 0.17, z], [0.04, 0.09, 0.035], [0, 0, -0.55]));
  kit.m.push(put(unit.box, coat, [x + 0.13, 0.205, z], [0.06, 0.03, 0.03], [0, 0, 0.35]));
  kit.m.push(put(unit.box, C.horse2, [x + 0.085, 0.2, z], [0.03, 0.06, 0.012], [0, 0, -0.55]));
  kit.m.push(put(unit.box, C.horse2, [x - 0.1, 0.11, z], [0.016, 0.06, 0.014], [0, 0, 0.5]));
  for (const [dx, dz] of [
    [0.06, 0.022],
    [0.06, -0.022],
    [-0.065, 0.022],
    [-0.065, -0.022],
  ] as const) {
    kit.m.push(put(unit.box, coat, [x + dx, 0.05, z + dz], [0.018, 0.1, 0.018]));
  }
}

function rider(kit: Kit, x: number, z: number, o: FigureOpts) {
  // Seated: no legs below the saddle, so draw the figure lifted and let the horse hide them.
  figure(kit, x, z, o, 0.075);
}

function wheel(kit: Kit, x: number, y: number, z: number, r: number, color = C.woodDark) {
  kit.m.push(put(unit.cyl12, color, [x, y, z], [r, 0.014, r], [Math.PI / 2, 0, 0]));
  kit.m.push(put(unit.cyl, C.dark, [x, y, z], [r * 0.3, 0.02, r * 0.3], [Math.PI / 2, 0, 0]));
}

/** A hull along x: `len` long, `beam` wide, its deck at `deck`. */
function hull(kit: Kit, len: number, beam: number, deck: number, color: number, metal = false) {
  const g = (metal ? kit.k : kit.m) as BufferGeometry[];
  g.push(put(unit.box, color, [0, deck / 2, 0], [len * 0.78, deck, beam]));
  g.push(
    put(
      unit.cone,
      color,
      [len * 0.39 + len * 0.1, deck / 2, 0],
      [beam * 0.5, len * 0.2, deck * 0.9],
      [0, 0, -Math.PI / 2],
    ),
  );
  g.push(put(unit.box, color, [-len * 0.41, deck / 2, 0], [len * 0.06, deck, beam * 0.9]));
}

function sail(kit: Kit, x: number, y: number, w: number, h: number, color: number) {
  kit.m.push(put(unit.box, color, [x, y, 0], [0.006, h, w]));
}

const SOLDIER: Record<string, Omit<FigureOpts, 'body' | 'trim'>> = {
  warrior: { helmet: 'none', weapon: 'club', shield: 'none', legs: C.leather, skin: C.skin2 },
  spear: { helmet: 'bronze', weapon: 'spear', shield: 'round', legs: C.leather },
  pike: { helmet: 'plume', weapon: 'pike', shield: 'none', armor: C.iron },
  sword: { helmet: 'crest', weapon: 'sword', shield: 'tower', armor: C.iron },
  archer: { helmet: 'hood', weapon: 'bow', shield: 'none', legs: C.leather },
  crossbow: { helmet: 'crest', weapon: 'crossbow', shield: 'none', armor: C.iron },
  musket: { helmet: 'tricorn', weapon: 'musket', legs: C.white },
  rifle: { helmet: 'shako', weapon: 'rifle', legs: C.white },
  infantry: { helmet: 'steel', weapon: 'rifle', legs: C.olive },
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
    for (const [x, z] of spots) figure(kit, x, z, { ...style, body, trim });
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
      figure(kit, 0.03, 0.05, { helmet: 'hood', weapon: 'staff', legs: C.leather, body, trim });
      figure(kit, -0.04, -0.04, { helmet: 'none', weapon: 'bow', legs: C.leather, body, trim });
      break;
    case 'settler': {
      // A covered wagon, an ox and the family walking beside it.
      kit.m.push(put(unit.box, C.wood, [0, 0.08, 0], [0.22, 0.05, 0.12]));
      kit.m.push(put(unit.cyl12, C.canvas, [0, 0.12, 0], [0.065, 0.2, 0.065], [0, 0, Math.PI / 2]));
      kit.m.push(put(unit.box, trim, [0, 0.19, 0], [0.2, 0.012, 0.03]));
      for (const x of [-0.07, 0.07])
        for (const z of [0.065, -0.065]) wheel(kit, x, 0.045, z, 0.042);
      kit.m.push(put(unit.box, 0x8a7a66, [0.19, 0.085, 0], [0.11, 0.06, 0.06]));
      kit.m.push(put(unit.box, 0x8a7a66, [0.255, 0.1, 0], [0.04, 0.04, 0.04]));
      for (const [dx, dz] of [
        [0.15, 0.02],
        [0.15, -0.02],
        [0.225, 0.02],
        [0.225, -0.02],
      ] as const)
        kit.m.push(put(unit.box, 0x6e604f, [dx, 0.03, dz], [0.016, 0.06, 0.016]));
      figure(kit, 0.06, 0.13, { helmet: 'hood', weapon: 'staff', body, trim, legs: C.leather });
      break;
    }
    case 'trader': {
      // A pack mule with bundles and a merchant.
      horse(kit, 0.02, 0, 0x7d6a58);
      kit.m.push(put(unit.box, trim, [0.0, 0.17, 0.04], [0.08, 0.05, 0.03]));
      kit.m.push(put(unit.box, body, [0.0, 0.17, -0.04], [0.08, 0.05, 0.03]));
      kit.m.push(put(unit.box, C.canvas, [0.0, 0.19, 0], [0.09, 0.03, 0.08]));
      figure(kit, 0.1, 0.1, { helmet: 'hood', weapon: 'staff', body, trim, legs: C.leather });
      break;
    }
    case 'cavalry':
      for (const z of [0.06, -0.06]) {
        horse(kit, 0, z);
        rider(kit, -0.01, z, { helmet: 'shako', weapon: 'sword', body, trim, legs: C.white });
      }
      break;
    case 'horseman':
      for (const z of [0.06, -0.06]) {
        horse(kit, 0, z);
        rider(kit, -0.01, z, { helmet: 'none', weapon: 'spear', body, trim, legs: C.leather });
      }
      break;
    case 'knight':
      for (const z of [0.065, -0.065]) {
        horse(kit, 0, z, C.horse2, trim);
        rider(kit, -0.01, z, {
          helmet: 'plume',
          weapon: 'pike',
          shield: 'kite',
          armor: C.iron,
          body,
          trim,
        });
      }
      break;
    case 'elephant': {
      // A war elephant with a howdah and two riders.
      const hide = 0x6e6a66;
      kit.m.push(put(unit.ball, hide, [0, 0.17, 0], [0.15, 0.085, 0.075]));
      kit.m.push(put(unit.ball, hide, [0.13, 0.2, 0], [0.055, 0.055, 0.05]));
      for (const z of [0.045, -0.045])
        kit.m.push(
          put(
            unit.box,
            hide,
            [0.12, 0.2, z * 1.25],
            [0.045, 0.07, 0.01],
            [0, 0.4 * Math.sign(z), 0],
          ),
        );
      kit.m.push(put(unit.cyl, hide, [0.18, 0.13, 0], [0.012, 0.1, 0.012], [0, 0, -0.2]));
      for (const z of [0.022, -0.022])
        kit.m.push(put(unit.cone, 0xe8e0c8, [0.17, 0.16, z], [0.008, 0.06, 0.008], [0, 0, -1.9]));
      for (const [dx, dz] of [
        [0.07, 0.04],
        [0.07, -0.04],
        [-0.07, 0.04],
        [-0.07, -0.04],
      ] as const) {
        kit.m.push(put(unit.cyl, hide, [dx, 0.05, dz], [0.022, 0.1, 0.022]));
      }
      kit.m.push(put(unit.box, trim, [-0.01, 0.255, 0], [0.11, 0.04, 0.09]));
      kit.m.push(put(unit.box, body, [-0.01, 0.235, 0], [0.13, 0.012, 0.11]));
      figure(kit, 0.0, 0.025, { helmet: 'none', weapon: 'bow', body, trim }, 0.2);
      figure(kit, -0.03, -0.025, { helmet: 'none', weapon: 'spear', body, trim }, 0.2);
      break;
    }
    case 'chariot': {
      horse(kit, 0.12, 0.035);
      horse(kit, 0.12, -0.035, C.horse2);
      kit.m.push(put(unit.box, trim, [-0.06, 0.08, 0], [0.08, 0.06, 0.1]));
      kit.m.push(put(unit.box, C.wood, [0.04, 0.07, 0], [0.16, 0.012, 0.012]));
      for (const z of [0.065, -0.065]) wheel(kit, -0.06, 0.05, z, 0.05);
      figure(kit, -0.07, 0.015, { helmet: 'bronze', weapon: 'bow', body, trim }, 0.05);
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
      figure(kit, -0.18, 0.06, { helmet: 'crest', body, trim });
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
      figure(kit, -0.16, 0.08, { ...crew, weapon: 'none', body, trim });
      figure(kit, -0.16, -0.08, { ...crew, weapon: 'none', body, trim });
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
      kit.k.push(put(unit.box, C.olive, [-0.02, 0.115, 0], [0.12, 0.045, 0.09]));
      kit.k.push(
        put(unit.cyl, C.steel, [0.12, 0.118, 0], [0.011, 0.18, 0.011], [0, 0, -Math.PI / 2]),
      );
      kit.m.push(put(unit.box, body, [-0.02, 0.14, 0], [0.06, 0.006, 0.05]));
      kit.m.push(put(unit.box, trim, [-0.13, 0.08, 0], [0.004, 0.02, 0.08]));
      break;
    }
    case 'ship': {
      // A galley: low hull, oars, one square sail in the owner's color.
      hull(kit, 0.36, 0.1, 0.05, C.wood);
      kit.m.push(put(unit.cyl, C.woodDark, [0, 0.17, 0], [0.006, 0.26, 0.006]));
      sail(kit, 0, 0.19, 0.16, 0.13, body);
      kit.m.push(put(unit.box, trim, [0.001, 0.19, 0], [0.008, 0.03, 0.162]));
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
      kit.k.push(put(unit.cyl, C.grey, [0, y, 0], [0.022, 0.24, 0.022], [0, 0, Math.PI / 2]));
      kit.k.push(put(unit.cone, C.grey, [-0.15, y, 0], [0.022, 0.06, 0.022], [0, 0, Math.PI / 2]));
      kit.m.push(put(unit.box, body, [0.01, y, 0], [0.07, 0.008, 0.34]));
      kit.m.push(put(unit.box, body, [-0.15, y + 0.005, 0], [0.04, 0.006, 0.12]));
      kit.m.push(put(unit.box, trim, [-0.15, y + 0.03, 0], [0.04, 0.05, 0.006]));
      kit.m.push(put(unit.box, C.dark, [0.125, y, 0], [0.004, 0.09, 0.012]));
      kit.m.push(put(unit.dome, 0x9fc4d8, [0.02, y + 0.018, 0], [0.025, 0.018, 0.016]));
      break;
    }
    case 'bomber': {
      const y = 0.34;
      kit.k.push(put(unit.cyl, C.grey, [0, y, 0], [0.03, 0.34, 0.03], [0, 0, Math.PI / 2]));
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
      kit.k.push(put(unit.ball, C.olive, [0, y, 0], [0.07, 0.045, 0.045]));
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
      horse(kit, 0, 0, C.white, trim);
      rider(kit, -0.01, 0, {
        helmet: 'plume',
        weapon: 'sword',
        armor: C.gold,
        body,
        trim,
        scale: 1.1,
      });
      kit.m.push(put(unit.cyl, C.woodDark, [-0.1, 0.24, 0.07], [0.005, 0.4, 0.005]));
      kit.m.push(put(unit.box, body, [-0.06, 0.38, 0.07], [0.08, 0.06, 0.004]));
      kit.m.push(put(unit.box, trim, [-0.06, 0.352, 0.07], [0.08, 0.008, 0.005]));
      break;
    }
    case 'robed': {
      kit.m.push(put(unit.cone, C.white, [0, 0.1, 0], [0.05, 0.2, 0.05]));
      kit.m.push(put(unit.box, trim, [0.001, 0.12, 0], [0.052, 0.012, 0.03]));
      kit.m.push(put(unit.ball, C.skin, [0, 0.205, 0], [0.026, 0.028, 0.026]));
      kit.m.push(put(unit.dome, body, [-0.004, 0.21, 0], [0.03, 0.03, 0.03]));
      kit.m.push(put(unit.cyl, C.wood, [0.04, 0.14, -0.04], [0.005, 0.28, 0.005]));
      kit.k.push(put(unit.ball, C.gold, [0.04, 0.285, -0.04], [0.014, 0.014, 0.014]));
      break;
    }
    default:
      squad({ helmet: 'none', weapon: 'staff' }, 2);
  }
}

export interface UnitGeometry {
  matte: BufferGeometry;
  metal: BufferGeometry | null;
}

const cache = new Map<string, UnitGeometry>();

/** The merged geometry for a model in an owner's colors (cached). */
export function unitGeometry(model: string, body: number, trim: number): UnitGeometry {
  const key = `${model}:${body}:${trim}`;
  let g = cache.get(key);
  if (!g) {
    const kit: Kit = { m: [], k: [] };
    build(model, body, trim, kit);
    const merge = (list: BufferGeometry[]) => {
      if (list.length === 0) return null;
      const out = mergeGeometries(list)!;
      for (const p of list) p.dispose();
      out.computeVertexNormals();
      return out;
    };
    g = { matte: merge(kit.m)!, metal: merge(kit.k) };
    cache.set(key, g);
  }
  return g;
}

/** Models that fly: drawn above the ground, with a shadow-ish ring. */
export const AIR_MODELS = new Set(['plane', 'bomber', 'helicopter']);
