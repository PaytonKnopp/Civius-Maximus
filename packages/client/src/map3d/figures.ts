import {
  BoxGeometry,
  type Bone,
  ConeGeometry,
  CylinderGeometry,
  LatheGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import {
  addBone,
  limb,
  type MountRig,
  on,
  type PersonRig,
  put,
  type Rig,
  rig,
  type Style,
  type V3,
} from './rig';

/**
 * The people and animals on the map (docs/10-art-direction.md, "Units"; polish P2): figures
 * about five and a half heads tall, in the Civ games' proportions, with faces, hair or helmets,
 * tunics, armor and cloaks by era, the weapon in the right hand and the shield on the left arm;
 * horses, oxen and elephants with jointed legs. Everything is smooth-shaded and rigged (see
 * rig.ts), and `animateRigs` gives them breath, a walk, a gallop and an attack.
 *
 * Local space: y up, the figure faces +x, its right hand is on the −z side.
 */

// --- Shapes --------------------------------------------------------------------------------------

const G = {
  ball: new SphereGeometry(1, 16, 12),
  cap: new SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  hood: new SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
  cyl: new CylinderGeometry(1, 1, 1, 14),
  disk: new CylinderGeometry(1, 1, 1, 22),
  tri: new CylinderGeometry(1, 1, 1, 3),
  cone: new ConeGeometry(1, 1, 12),
  box: new BoxGeometry(1, 1, 1),
  torso: new LatheGeometry(
    [
      [0.0, 0.0],
      [0.92, 0.0],
      [1.0, 0.12],
      [1.08, 0.4],
      [1.18, 0.66],
      [1.12, 0.86],
      [0.86, 0.97],
      [0.45, 1.0],
    ].map(([r, y]) => new Vector2(r!, y!)),
    16,
  ),
  skirt: new LatheGeometry(
    [
      [1.0, 1.0],
      [1.08, 0.6],
      [1.3, 0.0],
    ].map(([r, y]) => new Vector2(r!, y!)),
    16,
  ),
  robe: new LatheGeometry(
    [
      [0.55, 1.0],
      [0.95, 0.9],
      [1.0, 0.7],
      [1.25, 0.25],
      [1.42, 0.0],
    ].map(([r, y]) => new Vector2(r!, y!)),
    18,
  ),
  cloak: new CylinderGeometry(1, 1.5, 1, 14, 1, true, Math.PI * 0.95, Math.PI * 1.1),
  scutum: new CylinderGeometry(1, 1, 1, 12, 1, false, -0.55, 1.1),
  arc: new TorusGeometry(1, 0.045, 6, 18, Math.PI * 0.8),
  ring: new TorusGeometry(1, 0.07, 6, 22),
};

export const PALETTE = {
  skins: [0xd9a985, 0xb98763, 0x8e5f42, 0xe6bf9a, 0x6e4632],
  hairs: [0x2a1d14, 0x3d2a1b, 0x17110c, 0x5e4127, 0x7a5a36],
  eye: 0x18120d,
  lip: 0x8c4a3a,
  leather: 0x6e4a2c,
  leatherDark: 0x47301d,
  boot: 0x2c2119,
  canvas: 0xd9ccaa,
  linen: 0xe8dfca,
  wood: 0x6b4a2e,
  woodDark: 0x473021,
  bronze: 0xc4914a,
  iron: 0x9aa0a6,
  steel: 0x6b737a,
  gold: 0xd9b25a,
  olive: 0x5b6542,
  khaki: 0x8c7f58,
  white: 0xe8e2d2,
  dark: 0x26221e,
  red: 0x9a2e24,
};

export type Helmet =
  'none' | 'hood' | 'bronze' | 'crest' | 'plume' | 'tricorn' | 'shako' | 'steel' | 'circlet';
export type Weapon =
  | 'none'
  | 'club'
  | 'spear'
  | 'pike'
  | 'sword'
  | 'bow'
  | 'crossbow'
  | 'musket'
  | 'rifle'
  | 'staff'
  | 'banner';
export type Shield = 'none' | 'round' | 'tower' | 'kite';

export interface FigureOpts {
  helmet?: Helmet;
  weapon?: Weapon;
  shield?: Shield;
  /** Tunic or coat (the owner's main color). */
  body: number;
  /** Trim, crests, cloaks (the owner's accent). */
  trim: number;
  legs?: number;
  /** Plate or mail over the tunic. */
  armor?: number;
  /** Sleeves to the wrist (later eras); bare forearms otherwise. */
  sleeves?: boolean;
  /** A tunic skirt over the legs (ancient and medieval dress). */
  skirt?: boolean;
  cloak?: boolean;
  /** A long robe instead of legs (priests, great people). */
  robe?: number;
  beard?: boolean;
  /** Which of the skins and hairs (varies a squad). */
  look?: number;
  scale?: number;
}

const STYLE: Record<Weapon, Style> = {
  none: 'none',
  club: 'melee',
  sword: 'melee',
  spear: 'spear',
  pike: 'spear',
  bow: 'bow',
  crossbow: 'gun',
  musket: 'gun',
  rifle: 'gun',
  staff: 'staff',
  banner: 'staff',
};

/** Where a figure stands: on the ground, or seated on a mount's back. */
export interface Stand {
  x: number;
  z: number;
  y?: number;
  /** The bone it rides on (a mount's body), or the root. */
  parent?: number;
  seated?: boolean;
}

/** One person. Returns its rig (also kept in `rig.rigs`). */
export function person(stand: Stand, o: FigureOpts): PersonRig {
  const s = o.scale ?? 1;
  const { x, z } = stand;
  const y0 = stand.y ?? 0;
  const P = (dx: number, dy: number, dz: number): V3 => [x + dx * s, y0 + dy * s, z + dz * s];
  const S = (a: number, b: number, c: number): V3 => [a * s, b * s, c * s];
  const look = o.look ?? 0;
  const skin = PALETTE.skins[look % PALETTE.skins.length]!;
  const hair = PALETTE.hairs[(look * 3 + 1) % PALETTE.hairs.length]!;
  const weapon = o.weapon ?? 'none';
  const style = STYLE[weapon];
  const legs = o.legs ?? PALETTE.dark;
  const seated = stand.seated ?? false;
  const robed = o.robe !== undefined;
  const forearm = o.sleeves ? o.body : skin;

  // Joints of the ready stance.
  const shR = P(0, 0.205, -0.031);
  const shL = P(0, 0.205, 0.031);
  const raised = style === 'melee';
  const elR: V3 = raised ? P(0.006, 0.158, -0.035) : P(0.004, 0.157, -0.036);
  const haR: V3 = raised ? P(0.046, 0.166, -0.034) : P(0.02, 0.116, -0.037);
  const shielded = (o.shield ?? 'none') !== 'none';
  const elL: V3 = shielded ? P(0.006, 0.158, 0.036) : P(0.002, 0.157, 0.036);
  const haL: V3 = shielded
    ? P(0.04, 0.165, 0.032)
    : style === 'bow'
      ? P(0.014, 0.118, 0.04)
      : P(0.01, 0.114, 0.037);

  const root = addBone(stand.parent ?? 0, P(0, 0, 0));
  const hips = addBone(root, P(0, 0.125, 0));
  const chest = addBone(hips, P(0, 0.145, 0));
  const head = addBone(chest, P(0, 0.214, 0));
  const armR = addBone(chest, shR);
  const foreR = addBone(armR, elR);
  const armL = addBone(chest, shL);
  const foreL = addBone(armL, elL);
  let thighR = -1;
  let shinR = -1;
  let thighL = -1;
  let shinL = -1;

  const smooth = <T>(bone: number, fn: () => T) => on(bone, fn, true);
  const m = (g: Parameters<typeof put>[0], c: number, at: V3, sc: V3, rot?: V3) =>
    rig.out.m.push(put(g, c, at, sc, rot));
  const k = (g: Parameters<typeof put>[0], c: number, at: V3, sc: V3, rot?: V3) =>
    rig.out.k.push(put(g, c, at, sc, rot));

  // Legs.
  if (!robed) {
    for (const side of [-1, 1] as const) {
      const hip = P(0, 0.122, side * 0.0145);
      const knee = seated ? P(0.03, 0.088, side * 0.036) : P(0.003, 0.068, side * 0.0148);
      const ankle = seated ? P(0.018, 0.04, side * 0.037) : P(0, 0.014, side * 0.015);
      const thigh = addBone(hips, hip);
      const shin = addBone(thigh, knee);
      if (side < 0) {
        thighR = thigh;
        shinR = shin;
      } else {
        thighL = thigh;
        shinL = shin;
      }
      smooth(thigh, () => {
        rig.out.m.push(limb(hip, knee, 0.0118 * s, 0.009 * s, legs));
        m(G.ball, legs, knee, S(0.0092, 0.0092, 0.0092));
      });
      smooth(shin, () => {
        rig.out.m.push(limb(knee, ankle, 0.0088 * s, 0.0068 * s, PALETTE.boot));
        m(
          G.ball,
          PALETTE.boot,
          [ankle[0] + 0.006 * s, ankle[1] - 0.004 * s, ankle[2]],
          S(0.016, 0.009, 0.0095),
        );
      });
    }
  }

  // Hips: pelvis, tunic skirt or robe, belt.
  smooth(hips, () => {
    if (robed) {
      m(G.robe, o.robe!, P(0, 0, 0), S(0.03, 0.2, 0.03));
      m(G.cyl, o.trim, P(0, 0.142, 0), S(0.0245, 0.007, 0.0245));
    } else {
      m(G.ball, legs, P(0, 0.126, 0), S(0.019, 0.017, 0.024));
      if (o.skirt ?? true) m(G.skirt, o.armor ?? o.body, P(0, 0.093, 0), S(0.022, 0.05, 0.026));
      m(
        G.cyl,
        o.armor !== undefined ? PALETTE.leatherDark : o.trim,
        P(0, 0.142, 0),
        S(0.0225, 0.008, 0.0262),
      );
    }
  });

  // Chest: torso, armor, cloak, quiver.
  smooth(chest, () => {
    m(G.torso, o.body, P(0, 0.138, 0), S(0.0215, 0.075, 0.0262));
    if (o.armor !== undefined) {
      k(G.torso, o.armor, P(0.001, 0.152, 0), S(0.0232, 0.052, 0.0278));
      for (const side of [-1, 1])
        k(G.ball, o.armor, P(0, 0.204, side * 0.031), S(0.0128, 0.01, 0.013));
    }
    m(G.cyl, skin, P(0, 0.214, 0), S(0.0082, 0.014, 0.0082));
    if (o.cloak) m(G.cloak, o.trim, P(-0.004, 0.152, 0), S(0.026, 0.11, 0.032));
    if (weapon === 'bow') {
      m(G.cyl, PALETTE.leather, P(-0.026, 0.19, 0.012), S(0.0085, 0.065, 0.0085), [0, 0, 0.35]);
      for (const dz of [-0.003, 0.003])
        m(
          G.cone,
          PALETTE.canvas,
          P(-0.038, 0.228, 0.012 + dz),
          S(0.003, 0.012, 0.003),
          [0, 0, 0.35],
        );
    }
  });

  // Head: face, hair or helmet.
  smooth(head, () => {
    const hc = P(0, 0.2435, 0);
    m(G.ball, skin, hc, S(0.0205, 0.0222, 0.0192));
    m(G.ball, skin, P(0.0085, 0.2325, 0), S(0.0118, 0.0105, 0.0128));
    m(G.cone, skin, P(0.0208, 0.2425, 0), S(0.0034, 0.0085, 0.0034), [0, 0, -Math.PI / 2]);
    for (const side of [-1, 1]) {
      m(G.ball, PALETTE.eye, P(0.0172, 0.2468, side * 0.0074), S(0.0026, 0.0028, 0.0026));
      m(G.box, hair, P(0.0184, 0.2512, side * 0.0076), S(0.0022, 0.0018, 0.0078), [
        side * 0.18,
        0,
        0,
      ]);
      m(G.ball, skin, P(-0.001, 0.243, side * 0.0196), S(0.0042, 0.006, 0.0032));
    }
    m(G.box, PALETTE.lip, P(0.0192, 0.2338, 0), S(0.002, 0.0016, 0.0075));
    if (o.beard ?? false) m(G.ball, hair, P(0.0105, 0.2295, 0), S(0.0118, 0.0125, 0.0158));
    helmet(o.helmet ?? 'none', hc, s, hair, o.trim, m, k);
  });

  // Arms.
  for (const [arm, fore, sh, el, ha] of [
    [armR, foreR, shR, elR, haR],
    [armL, foreL, shL, elL, haL],
  ] as const) {
    smooth(arm, () => {
      m(G.ball, o.body, sh, S(0.0112, 0.0105, 0.0112));
      rig.out.m.push(limb(sh, el, 0.0088 * s, 0.0074 * s, o.body));
      m(G.ball, o.sleeves ? o.body : skin, el, S(0.0074, 0.0074, 0.0074));
    });
    smooth(fore, () => {
      rig.out.m.push(limb(el, ha, 0.0072 * s, 0.006 * s, robed ? o.robe! : forearm));
      m(G.ball, skin, ha, S(0.0068, 0.0072, 0.0064));
    });
  }

  // The weapon in the right hand, the shield or bow on the left.
  smooth(foreR, () => gear(weapon, haR, s, o, m, k));
  smooth(foreL, () => {
    if (weapon === 'bow') bow(haL, s, m);
    shield(o.shield ?? 'none', haL, s, o, m, k);
  });

  const r: PersonRig = {
    kind: 'person',
    root,
    hips,
    chest,
    head,
    armR,
    foreR,
    armL,
    foreL,
    thighR: seated ? -1 : thighR,
    shinR: seated ? -1 : shinR,
    thighL: seated ? -1 : thighL,
    shinL: seated ? -1 : shinL,
    style,
    mounted: seated,
    phase: (x * 13.7 + z * 7.3 + look) % (Math.PI * 2),
  };
  rig.rigs.push(r);
  return r;
}

/** Hoods and cowls: undyed wool. */
const HOOD = 0x5b4a33;

type Push = (g: Parameters<typeof put>[0], c: number, at: V3, sc: V3, rot?: V3) => void;

function helmet(h: Helmet, hc: V3, s: number, hair: number, trim: number, m: Push, k: Push) {
  const at = (dx: number, dy: number, dz: number): V3 => [
    hc[0] + dx * s,
    hc[1] + dy * s,
    hc[2] + dz * s,
  ];
  const S = (a: number, b: number, c: number): V3 => [a * s, b * s, c * s];
  switch (h) {
    case 'none':
    case 'circlet':
      m(G.hood, hair, at(-0.003, 0.002, 0), S(0.0222, 0.0236, 0.0208), [0, 0, 0.42]);
      if (h === 'circlet')
        k(G.ring, PALETTE.gold, at(0.001, 0.008, 0), S(0.0205, 0.0205, 0.016), [Math.PI / 2, 0, 0]);
      break;
    case 'hood':
      m(G.hood, HOOD, at(-0.003, 0.001, 0), S(0.0248, 0.026, 0.0232), [0, 0, 0.5]);
      m(G.cone, HOOD, at(-0.017, -0.018, 0), S(0.017, 0.03, 0.019), [0, 0, 0.25]);
      break;
    case 'bronze':
      k(G.cap, PALETTE.bronze, at(0, 0.0035, 0), S(0.0238, 0.0255, 0.0228));
      k(G.box, PALETTE.bronze, at(0.004, -0.009, 0.0185), S(0.012, 0.016, 0.003));
      k(G.box, PALETTE.bronze, at(0.004, -0.009, -0.0185), S(0.012, 0.016, 0.003));
      m(G.box, trim, at(-0.002, 0.029, 0), S(0.036, 0.009, 0.0045));
      break;
    case 'crest':
      k(G.cap, PALETTE.iron, at(0, 0.0035, 0), S(0.0238, 0.025, 0.0232));
      k(G.cyl, PALETTE.iron, at(-0.012, -0.002, 0), S(0.017, 0.003, 0.022), [0, 0, 0.5]);
      m(G.ball, trim, at(0.0, 0.029, 0), S(0.008, 0.009, 0.026));
      break;
    case 'plume':
      k(G.cap, PALETTE.steel, at(0, 0.004, 0), S(0.0245, 0.026, 0.0238));
      k(G.cyl, PALETTE.steel, at(0, 0.004, 0), S(0.031, 0.0025, 0.03));
      m(G.ball, trim, at(-0.012, 0.03, 0), S(0.01, 0.022, 0.006), [0, 0, 0.6]);
      break;
    case 'tricorn':
      m(G.cap, PALETTE.dark, at(0, 0.006, 0), S(0.021, 0.02, 0.021));
      m(G.tri, PALETTE.dark, at(0, 0.009, 0), S(0.036, 0.007, 0.036), [0, Math.PI / 2, 0]);
      m(G.tri, trim, at(0, 0.0055, 0), S(0.0372, 0.0018, 0.0372), [0, Math.PI / 2, 0]);
      break;
    case 'shako':
      m(G.cyl, PALETTE.dark, at(0, 0.02, 0), S(0.0212, 0.032, 0.0212));
      m(G.cap, PALETTE.dark, at(0.012, 0.003, 0), S(0.014, 0.004, 0.018), [0, 0, -0.2]);
      k(G.ball, PALETTE.gold, at(0.021, 0.022, 0), S(0.002, 0.006, 0.006));
      m(G.ball, trim, at(0.004, 0.041, 0), S(0.0075, 0.0075, 0.0075));
      break;
    case 'steel':
      k(G.cap, PALETTE.olive, at(0, 0.004, 0), S(0.0255, 0.0235, 0.0252));
      k(G.cyl, PALETTE.olive, at(0, 0.0035, 0), S(0.029, 0.0022, 0.0288));
      break;
  }
}

/** The right hand's weapon, in the ready stance, around hand position `h`. */
function gear(w: Weapon, h: V3, s: number, o: FigureOpts, m: Push, k: Push) {
  const at = (dx: number, dy: number, dz: number): V3 => [
    h[0] + dx * s,
    h[1] + dy * s,
    h[2] + dz * s,
  ];
  const S = (a: number, b: number, c: number): V3 => [a * s, b * s, c * s];
  switch (w) {
    case 'club':
      m(G.cyl, PALETTE.wood, at(0.012, 0.03, 0), S(0.0042, 0.07, 0.0042), [0, 0, -0.45]);
      m(G.ball, PALETTE.woodDark, at(0.028, 0.063, 0), S(0.0115, 0.014, 0.0115));
      break;
    case 'sword':
      k(G.box, PALETTE.iron, at(0.022, 0.044, 0), S(0.0028, 0.074, 0.0095), [0, 0, -0.5]);
      k(G.box, PALETTE.bronze, at(0.004, 0.009, 0), S(0.0045, 0.004, 0.024), [0, 0, -0.5]);
      m(G.cyl, PALETTE.leatherDark, at(-0.002, -0.002, 0), S(0.0035, 0.016, 0.0035), [0, 0, -0.5]);
      break;
    case 'spear':
    case 'pike': {
      const top = w === 'pike' ? 0.33 : 0.21;
      m(G.cyl, PALETTE.wood, at(0, (top - 0.1) / 2, 0), S(0.0029, top + 0.1, 0.0029));
      k(G.ball, PALETTE.iron, at(0, top + 0.012, 0), S(0.0045, 0.02, 0.0016));
      break;
    }
    case 'staff':
      m(G.cyl, PALETTE.wood, at(0, 0.035, 0), S(0.0032, 0.24, 0.0032));
      k(G.ball, PALETTE.gold, at(0, 0.157, 0), S(0.007, 0.007, 0.007));
      break;
    case 'banner':
      m(G.cyl, PALETTE.woodDark, at(0, 0.09, 0), S(0.0032, 0.36, 0.0032));
      m(G.box, o.body, at(-0.03, 0.235, 0), S(0.06, 0.05, 0.0025));
      m(G.box, o.trim, at(-0.03, 0.212, 0), S(0.06, 0.006, 0.003));
      k(G.cone, PALETTE.gold, at(0, 0.277, 0), S(0.005, 0.014, 0.005));
      break;
    case 'crossbow':
      m(G.box, PALETTE.wood, at(0.028, 0.004, 0.012), S(0.07, 0.009, 0.009));
      k(G.arc, PALETTE.iron, at(0.05, 0.004, 0.012), S(0.03, 0.03, 0.03), [
        Math.PI / 2,
        0,
        Math.PI * 0.1,
      ]);
      break;
    case 'musket':
    case 'rifle':
      m(G.box, PALETTE.woodDark, at(0.002, -0.07, 0), S(0.011, 0.05, 0.006));
      m(G.box, PALETTE.wood, at(0.002, 0.0, 0), S(0.007, 0.1, 0.005));
      k(G.cyl, PALETTE.steel, at(0.004, 0.035, 0), S(0.0022, 0.13, 0.0022));
      if (w === 'musket') k(G.cone, PALETTE.iron, at(0.004, 0.115, 0), S(0.0018, 0.03, 0.0018));
      break;
  }
}

function bow(h: V3, s: number, m: Push) {
  const r = 0.062 * s;
  // The arc is centered behind the hand so it passes through it, bulging forward.
  m(G.arc, PALETTE.wood, [h[0] - r, h[1], h[2]], [r, r, r], [0, 0, -Math.PI * 0.4]);
  const a = Math.PI * 0.4;
  const top: V3 = [h[0] - r + r * Math.cos(a), h[1] + r * Math.sin(a), h[2]];
  const bottom: V3 = [h[0] - r + r * Math.cos(a), h[1] - r * Math.sin(a), h[2]];
  rig.out.m.push(limb(bottom, top, 0.0009 * s, 0.0009 * s, PALETTE.linen, 4));
}

function shield(sh: Shield, h: V3, s: number, o: FigureOpts, m: Push, k: Push) {
  const c: V3 = [h[0] + 0.009 * s, h[1], h[2] + 0.006 * s];
  const S = (a: number, b: number, d: number): V3 => [a * s, b * s, d * s];
  switch (sh) {
    case 'round':
      m(G.disk, o.trim, c, S(0.042, 0.006, 0.042), [0, 0.35, Math.PI / 2]);
      k(G.ring, PALETTE.bronze, c, S(0.042, 0.042, 0.042), [0, Math.PI / 2 + 0.35, 0]);
      k(
        G.ball,
        PALETTE.bronze,
        [c[0] + 0.004 * s, c[1], c[2] - 0.0015 * s],
        S(0.009, 0.009, 0.009),
      );
      break;
    case 'tower':
      m(G.scutum, o.body, [c[0] - 0.05 * s, c[1] - 0.004 * s, c[2]], S(0.06, 0.108, 0.06), [
        0,
        Math.PI / 2 + 0.25,
        0,
      ]);
      k(G.ball, PALETTE.gold, [c[0] + 0.011 * s, c[1], c[2] - 0.003 * s], S(0.008, 0.012, 0.008));
      m(
        G.box,
        o.trim,
        [c[0] + 0.009 * s, c[1], c[2] - 0.0025 * s],
        S(0.002, 0.1, 0.006),
        [0, 0.25, 0],
      );
      break;
    case 'kite':
      m(G.ball, o.trim, [c[0], c[1] + 0.012 * s, c[2]], S(0.006, 0.034, 0.03), [0, 0.3, 0]);
      m(G.cone, o.trim, [c[0], c[1] - 0.03 * s, c[2]], S(0.03, 0.05, 0.006), [Math.PI, 0.3, 0]);
      m(
        G.box,
        o.body,
        [c[0] + 0.005 * s, c[1] + 0.004 * s, c[2]],
        S(0.002, 0.05, 0.007),
        [0, 0.3, 0],
      );
      break;
  }
}

// --- Mounts ---------------------------------------------------------------------------------------

export interface MountOpts {
  kind: 'horse' | 'ox' | 'elephant' | 'mule';
  coat?: number;
  /** Cloth barding over the body (knights). */
  barding?: number;
  /** Saddle cloth color. */
  cloth?: number;
}

/** A mount at (x, z) facing +x; returns its rig and the height of its back. */
export function mount(x: number, z: number, o: MountOpts): { rig: MountRig; back: number } {
  const heavy = o.kind === 'ox' || o.kind === 'elephant';
  const big = o.kind === 'elephant' ? 1.7 : o.kind === 'ox' ? 1.08 : o.kind === 'mule' ? 0.88 : 1;
  const coat =
    o.coat ??
    (o.kind === 'elephant'
      ? 0x77716b
      : o.kind === 'ox'
        ? 0x8a7660
        : o.kind === 'mule'
          ? 0x7d6a58
          : 0x6e4c33);
  const dark = o.kind === 'elephant' ? 0x5c5752 : 0x2e2119;
  const P = (dx: number, dy: number, dz: number): V3 => [x + dx * big, dy * big, z + dz * big];
  const S = (a: number, b: number, c: number): V3 => [a * big, b * big, c * big];
  const legH = o.kind === 'elephant' ? 0.1 : o.kind === 'ox' ? 0.085 : 0.11;

  const root = addBone(0, P(0, 0, 0));
  const body = addBone(root, P(0, 0.125, 0));
  const neck = addBone(body, P(0.07, 0.15, 0));
  const head = addBone(neck, P(0.105, 0.2, 0));
  const tail = addBone(body, P(-0.095, 0.145, 0));
  const m = (g: Parameters<typeof put>[0], c: number, at: V3, sc: V3, rot?: V3) =>
    rig.out.m.push(put(g, c, at, sc, rot));
  const k = (g: Parameters<typeof put>[0], c: number, at: V3, sc: V3, rot?: V3) =>
    rig.out.k.push(put(g, c, at, sc, rot));

  on(
    body,
    () => {
      if (o.kind === 'elephant') {
        m(G.ball, coat, P(0, 0.135, 0), S(0.105, 0.07, 0.06));
        m(G.ball, coat, P(-0.04, 0.14, 0), S(0.06, 0.066, 0.058));
      } else {
        m(G.ball, coat, P(0, 0.128, 0), S(0.092, 0.045, 0.039));
        m(G.ball, coat, P(0.052, 0.13, 0), S(0.042, 0.044, 0.035));
        m(G.ball, coat, P(-0.054, 0.133, 0), S(0.044, 0.046, 0.0375));
      }
      if (o.barding !== undefined) {
        m(G.skirt, o.barding, P(0, 0.08, 0), S(0.048, 0.07, 0.052), [0, 0, 0]);
        m(G.ball, o.barding, P(0, 0.14, 0), S(0.09, 0.04, 0.046));
      }
      if (o.kind === 'horse' || o.kind === 'mule') {
        m(G.ball, o.cloth ?? PALETTE.red, P(-0.005, 0.158, 0), S(0.03, 0.012, 0.04));
        m(G.cap, PALETTE.leather, P(-0.005, 0.166, 0), S(0.022, 0.012, 0.026));
      }
    },
    true,
  );

  // Neck and head.
  on(
    neck,
    () => {
      if (o.kind === 'elephant') {
        m(G.ball, coat, P(0.085, 0.16, 0), S(0.045, 0.05, 0.045));
      } else if (o.kind === 'ox') {
        rig.out.m.push(limb(P(0.06, 0.135, 0), P(0.095, 0.15, 0), 0.03 * big, 0.024 * big, coat));
      } else {
        rig.out.m.push(
          limb(P(0.064, 0.145, 0), P(0.103, 0.205, 0), 0.023 * big, 0.0145 * big, coat),
        );
        m(G.box, dark, P(0.075, 0.185, 0), S(0.008, 0.06, 0.007), [0, 0, -0.62]);
      }
    },
    true,
  );
  on(
    head,
    () => {
      if (o.kind === 'elephant') {
        m(G.ball, coat, P(0.115, 0.165, 0), S(0.042, 0.045, 0.04));
        rig.out.m.push(limb(P(0.145, 0.15, 0), P(0.16, 0.09, 0), 0.016 * big, 0.011 * big, coat));
        rig.out.m.push(limb(P(0.16, 0.09, 0), P(0.165, 0.035, 0), 0.011 * big, 0.008 * big, coat));
        for (const side of [-1, 1]) {
          m(G.ball, coat, P(0.098, 0.168, side * 0.042), S(0.006, 0.036, 0.03), [side * 0.3, 0, 0]);
          k(G.cone, 0xece3c8, P(0.155, 0.125, side * 0.018), S(0.0045, 0.04, 0.0045), [0, 0, -2.0]);
          m(G.ball, PALETTE.eye, P(0.142, 0.178, side * 0.025), S(0.004, 0.004, 0.004));
        }
      } else if (o.kind === 'ox') {
        m(G.ball, coat, P(0.115, 0.14, 0), S(0.028, 0.024, 0.022));
        m(G.ball, 0x5e4e40, P(0.138, 0.128, 0), S(0.014, 0.014, 0.017));
        for (const side of [-1, 1]) {
          m(G.cone, 0xe2d8c0, P(0.108, 0.165, side * 0.026), S(0.0045, 0.03, 0.0045), [
            side * 1.1,
            0,
            -0.2,
          ]);
          m(G.ball, PALETTE.eye, P(0.128, 0.148, side * 0.016), S(0.003, 0.003, 0.003));
        }
      } else {
        rig.out.m.push(
          limb(P(0.1, 0.212, 0), P(0.148, 0.182, 0), 0.0148 * big, 0.0095 * big, coat),
        );
        m(G.ball, coat, P(0.149, 0.181, 0), S(0.0105, 0.0098, 0.0092));
        for (const side of [-1, 1]) {
          m(G.cone, coat, P(0.098, 0.228, side * 0.0075), S(0.0042, 0.016, 0.0035), [0, 0, 0.2]);
          m(G.ball, PALETTE.eye, P(0.118, 0.212, side * 0.0115), S(0.0028, 0.003, 0.0028));
        }
        m(G.box, dark, P(0.1, 0.222, 0), S(0.008, 0.008, 0.006), [0, 0, -0.62]);
        k(G.ring, PALETTE.steel, P(0.142, 0.18, 0), S(0.006, 0.006, 0.006), [0, 0, 0]);
      }
    },
    true,
  );

  // Legs: front right, front left, back right, back left.
  const legs: [number, number][] = [];
  for (const [dx, dz] of [
    [0.055, -0.021],
    [0.055, 0.021],
    [-0.06, -0.021],
    [-0.06, 0.021],
  ] as const) {
    const top = P(dx, 0.115, dz);
    const knee = P(dx + (dx > 0 ? 0.002 : -0.004), legH * 0.55, dz);
    const hoof = P(dx, 0.008, dz);
    const upper = addBone(body, top);
    const lower = addBone(upper, knee);
    legs.push([upper, lower]);
    const r1 = o.kind === 'elephant' ? 0.02 : o.kind === 'ox' ? 0.014 : 0.0138;
    const r2 = o.kind === 'elephant' ? 0.018 : o.kind === 'ox' ? 0.0095 : 0.0074;
    on(upper, () => rig.out.m.push(limb(top, knee, r1 * big, r1 * 0.75 * big, coat)), true);
    on(
      lower,
      () => {
        rig.out.m.push(limb(knee, hoof, r2 * big, r2 * 0.85 * big, coat));
        m(G.cyl, dark, [hoof[0], hoof[1], hoof[2]], S(r2 * 1.2, 0.012, r2 * 1.2));
      },
      true,
    );
  }

  on(
    tail,
    () => {
      if (o.kind === 'elephant' || o.kind === 'ox')
        rig.out.m.push(
          limb(P(-0.095, 0.145, 0), P(-0.11, 0.08, 0), 0.004 * big, 0.003 * big, dark),
        );
      else
        rig.out.m.push(
          limb(P(-0.092, 0.145, 0), P(-0.122, 0.075, 0), 0.0085 * big, 0.0045 * big, dark),
        );
    },
    true,
  );

  const r: MountRig = {
    kind: 'mount',
    body,
    neck,
    head,
    legs,
    tail,
    phase: (x * 11.3 + z * 5.1) % (Math.PI * 2),
    heavy,
  };
  rig.rigs.push(r);
  return { rig: r, back: (o.kind === 'elephant' ? 0.2 : o.kind === 'ox' ? 0.16 : 0.165) * big };
}

/** A rider seated on a mount. */
export function rider(
  mounted: { rig: MountRig; back: number },
  x: number,
  z: number,
  o: FigureOpts,
) {
  return person({ x, z, y: mounted.back - 0.118, parent: mounted.rig.body, seated: true }, o);
}

// --- Animation -------------------------------------------------------------------------------------

export interface AttackAnim {
  kind: 'melee' | 'ranged';
  /** 0..1 through the attack. */
  u: number;
}

const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const bell = (u: number, at: number, width: number) => Math.max(0, 1 - Math.abs(u - at) / width);

/**
 * Poses the bones for this frame: breathing and glancing at rest, a walk or gallop while moving,
 * a swing, thrust, draw or volley while attacking. `rest` holds each bone's rest position.
 */
export function animateRigs(
  rigs: readonly Rig[],
  bones: readonly Bone[],
  rest: readonly Vector3[],
  t: number,
  walking: boolean,
  attack: AttackAnim | null,
) {
  for (let i = 0; i < bones.length; i++) {
    bones[i]!.position.copy(rest[i]!);
    bones[i]!.rotation.set(0, 0, 0);
  }
  for (const r of rigs) {
    if (r.kind === 'person') posePerson(r, bones, t, walking, attack);
    else if (r.kind === 'mount') poseMount(r, bones, t, walking);
    else poseVehicle(r, bones, t, attack);
  }
}

function posePerson(
  r: PersonRig,
  b: readonly Bone[],
  t: number,
  walking: boolean,
  attack: AttackAnim | null,
) {
  const p = r.phase;
  const chest = b[r.chest]!;
  const head = b[r.head]!;
  const armR = b[r.armR]!;
  const foreR = b[r.foreR]!;
  const armL = b[r.armL]!;
  const foreL = b[r.foreL]!;
  // Breath and a slow look around.
  chest.rotation.z = 0.025 * Math.sin(1.7 * t + p);
  head.rotation.y = 0.28 * Math.sin(0.31 * t + p * 2.1) * Math.max(0, Math.sin(0.13 * t + p));
  armR.rotation.x = 0.03 * Math.sin(1.7 * t + p + 1);
  armL.rotation.x = -0.03 * Math.sin(1.7 * t + p + 1);
  if (walking && r.thighR >= 0) {
    const w = 9 * t + p;
    const sw = Math.sin(w);
    b[r.thighR]!.rotation.z = 0.55 * sw;
    b[r.thighL]!.rotation.z = -0.55 * sw;
    b[r.shinR]!.rotation.z = -0.85 * Math.max(0, Math.cos(w));
    b[r.shinL]!.rotation.z = -0.85 * Math.max(0, -Math.cos(w));
    b[r.hips]!.position.y += 0.0045 * Math.abs(Math.cos(w));
    chest.rotation.z -= 0.07;
    armR.rotation.z = -0.35 * sw * (r.style === 'gun' || r.style === 'spear' ? 0.4 : 1);
    armL.rotation.z = 0.35 * sw;
  } else if (walking) {
    chest.rotation.z += 0.03 * Math.sin(9 * t + p);
  }
  if (!attack) return;
  const u = attack.u;
  if (
    attack.kind === 'melee' &&
    (r.style === 'melee' || r.style === 'none' || r.style === 'staff')
  ) {
    const raise =
      u < 0.4
        ? ease(u / 0.4)
        : u < 0.55
          ? 1 - ease((u - 0.4) / 0.15) * 1.15
          : -0.15 * (1 - ease((u - 0.55) / 0.45));
    armR.rotation.z = 2.5 * raise;
    chest.rotation.z += 0.16 * raise - 0.22 * bell(u, 0.5, 0.2);
    if (r.thighR >= 0) {
      b[r.thighR]!.rotation.z += 0.35 * bell(u, 0.5, 0.3);
      b[r.shinR]!.rotation.z -= 0.25 * bell(u, 0.5, 0.3);
    }
  } else if (attack.kind === 'melee' && r.style === 'spear') {
    const level = u < 0.3 ? ease(u / 0.3) : u < 0.75 ? 1 : 1 - ease((u - 0.75) / 0.25);
    const thrust = bell(u, 0.48, 0.16);
    armR.rotation.z = 0.55 * level + 0.5 * thrust;
    foreR.rotation.z = -1.5 * level;
    chest.rotation.z -= 0.18 * thrust;
    if (r.thighR >= 0) b[r.thighR]!.rotation.z += 0.3 * thrust;
  } else if (r.style === 'bow') {
    const draw = u < 0.5 ? ease(u / 0.5) : u < 0.62 ? 1 : 1 - ease((u - 0.62) / 0.38);
    armL.rotation.z = 1.45 * draw;
    foreL.rotation.z = -1.45 * draw;
    armR.rotation.z = 1.25 * draw;
    foreR.rotation.z = 0.9 * draw * (u < 0.55 ? 1 : 0.4);
    chest.rotation.y = 0.35 * draw;
  } else {
    // Muskets, rifles, crossbows: shoulder, fire, recoil.
    const aim = u < 0.3 ? ease(u / 0.3) : u < 0.8 ? 1 : 1 - ease((u - 0.8) / 0.2);
    armR.rotation.z = 1.2 * aim;
    foreR.rotation.z = -2.75 * aim;
    armL.rotation.z = 1.4 * aim;
    foreL.rotation.z = 0.2 * aim;
    chest.rotation.z += 0.14 * bell(u, 0.45, 0.08);
    head.rotation.z = -0.15 * aim;
  }
}

function poseMount(r: MountRig, b: readonly Bone[], t: number, walking: boolean) {
  const p = r.phase;
  const body = b[r.body]!;
  b[r.tail]!.rotation.x = 0.25 * Math.sin(1.3 * t + p);
  if (!walking) {
    b[r.neck]!.rotation.z = -0.06 + 0.05 * Math.sin(0.6 * t + p);
    b[r.head]!.rotation.z = 0.04 * Math.sin(0.9 * t + p + 1);
    body.position.y += 0.0012 * Math.sin(1.5 * t + p);
    return;
  }
  const w = (r.heavy ? 5 : 10) * t + p;
  const swing = r.heavy ? 0.28 : 0.5;
  const [fr, fl, br, bl] = r.legs;
  const legs: [[number, number], number][] = [
    [fr!, 0],
    [bl!, 0],
    [fl!, Math.PI],
    [br!, Math.PI],
  ];
  for (const [[upper, lower], off] of legs) {
    const front = upper === fr![0] || upper === fl![0];
    const s = Math.sin(w + off);
    b[upper]!.rotation.z = swing * s;
    b[lower]!.rotation.z = (front ? -1 : 1) * 0.6 * Math.max(0, Math.cos(w + off)) * swing * 1.6;
  }
  body.position.y += (r.heavy ? 0.003 : 0.006) * Math.abs(Math.sin(w));
  body.rotation.z = 0.035 * Math.sin(w);
  b[r.neck]!.rotation.z = 0.08 * Math.sin(w + 0.6);
  b[r.tail]!.rotation.z = 0.35;
}

function poseVehicle(
  r: Extract<Rig, { kind: 'vehicle' }>,
  b: readonly Bone[],
  t: number,
  attack: AttackAnim | null,
) {
  const root = b[0]!;
  if (r.motion === 'float') {
    root.rotation.x = 0.035 * Math.sin(1.1 * t);
    root.rotation.z = 0.02 * Math.sin(0.8 * t + 1);
    root.position.y += 0.004 * Math.sin(1.3 * t);
  } else if (r.motion === 'hover') {
    root.position.y += 0.012 * Math.sin(2 * t);
    root.rotation.x = 0.04 * Math.sin(1.2 * t);
  }
  if (attack) root.position.x -= 0.02 * bell(attack.u, 0.35, 0.25);
}

/** Rest positions of a skeleton's bones, relative to their parents. */
export function restOffsets(defs: readonly { parent: number; at: V3 }[]): Vector3[] {
  return defs.map((d) => {
    const at = new Vector3(...d.at);
    if (d.parent >= 0) at.sub(new Vector3(...defs[d.parent]!.at));
    return at;
  });
}
