import { bar, circle, ellipse, gear, poly, rect, ring, star } from './geometry';

/**
 * The game's icon set (docs/10-art-direction.md, "Icons"): round colored badges with a white
 * glyph, like the yield icons of the Civ games. Glyphs are path data on a 24×24 grid; `Icon`
 * draws them as SVG and `drawIcon` on a canvas (the map), from the same data.
 */
export interface Shape {
  d: string;
  /** Holes cut by inner paths (even-odd). */
  holes?: boolean;
  /** A second tone (defaults to the glyph color). */
  tone?: 'dark' | 'light';
}

export interface IconDef {
  /** Badge color. */
  bg: string;
  glyph: Shape[];
}

const s = (d: string, holes = false): Shape => ({ d, holes });
const dark = (d: string): Shape => ({ d, tone: 'dark' });

// --- Shapes reused by several icons -----------------------------------------------------------

const WHEAT = [
  s(bar(12, 19.5, 12, 6.5, 1.3)),
  s(ellipse(12, 6.2, 1.2, 2.2)),
  ...[8.5, 11.5, 14.5].flatMap((y) => [
    s(ellipse(10.2, y, 2.2, 1.15, -35)),
    s(ellipse(13.8, y, 2.2, 1.15, 35)),
  ]),
];
const GEAR = [s(gear(12, 12, 7.6, 5.7, 8, 2.6), true)];
const COIN = [s(ring(12, 12, 7, 5.6), true), s(star(12, 12, 3.8, 1.7, 5))];
const FLASK = [
  s(
    'M9.8 4.6h4.4v1.4h-.7v4.1l4.6 7.3c.6 1.1-.1 2.1-1.3 2.1H7.2c-1.2 0-1.9-1-1.3-2.1l4.6-7.3V6h-.7Z' +
      'M8.2 15.6h7.6l-1.6-2.6H9.8Z',
    true,
  ),
];
const MASK = [
  s(
    'M5.6 5.8Q12 3.8 18.4 5.8Q18.6 14.8 12 19.4Q5.4 14.8 5.6 5.8Z' +
      ellipse(9.4, 9.8, 1.7, 1.05, -12) +
      ellipse(14.6, 9.8, 1.7, 1.05, 12) +
      'M8.8 13.6Q12 16.6 15.2 13.6Q12 15 8.8 13.6Z',
    true,
  ),
];
const FLAME = [
  s(
    'M12 3.8C14.2 7.6 18.2 9.9 17.4 14.5C16.8 17.7 14.4 19.6 12 19.6C9.6 19.6 7.2 17.7 6.6 14.5' +
      'C6 11.2 8.6 9.6 9.3 7C10.4 9 11 10 12 10.6C12.8 8.6 12.8 6.2 12 3.8Z' +
      'M12 13C13.2 14.3 14.2 15.4 13.9 16.7C13.6 17.7 12.8 18.2 12 18.2C11.2 18.2 10.4 17.7 10.1 16.7' +
      'C9.8 15.4 10.8 14.3 12 13Z',
    true,
  ),
];
const SWORDS = [
  s(bar(6.5, 6.5, 17, 17, 1.6)),
  s(bar(17.5, 6.5, 7, 17, 1.6)),
  s(bar(5.6, 14.6, 9.4, 18.4, 1.4)),
  s(bar(18.4, 14.6, 14.6, 18.4, 1.4)),
  s(circle(5.6, 18.4, 1.1)),
  s(circle(18.4, 18.4, 1.1)),
];
const ANCHOR = [
  s(ring(12, 6.3, 1.9, 0.9), true),
  s(rect(11.2, 8, 1.6, 10.5)),
  s(rect(8.6, 9.6, 6.8, 1.4, 0.6)),
  s(
    'M5.6 13.2l2.2-.9c.3 2.6 1.8 4.4 4.2 4.8c2.4-.4 3.9-2.2 4.2-4.8l2.2.9c-.5 3.6-3 6.1-6.4 6.4c-3.4-.3-5.9-2.8-6.4-6.4Z',
  ),
];
const COLUMNS = [
  s(poly(12, 4.4, 19, 8.2, 5, 8.2)),
  s(rect(5.6, 8.8, 12.8, 1.2)),
  ...[7, 10.6, 14.2].map((x) => s(rect(x, 10.6, 2.2, 6))),
  s(rect(5, 17.2, 14, 1.6)),
];
const SCROLL = [
  s(
    'M7 5.5h8.6c1.4 0 2.4 1 2.4 2.3v9.6c0 1.6-1.2 2.6-2.6 2.6H8.2c1 0 1.8-.9 1.8-2v-10.2c0-1.3-1.2-2.3-3-2.3Z' +
      rect(11.4, 9, 4.6, 1) +
      rect(11.4, 11.6, 4.6, 1) +
      rect(11.4, 14.2, 3.4, 1),
    true,
  ),
  s('M5 7.8c0-1.3 1-2.3 2.2-2.3s2.2 1 2.2 2.3v1.4H5Z'),
];
const ROCKET = [
  s('M12 3.6c2.6 2 3.7 5 3.7 8.6v3.6h-7.4v-3.6c0-3.6 1.1-6.6 3.7-8.6Z' + circle(12, 10, 1.4), true),
  s(poly(8.3, 12.6, 5.8, 15.6, 5.8, 17.6, 8.3, 16.2)),
  s(poly(15.7, 12.6, 18.2, 15.6, 18.2, 17.6, 15.7, 16.2)),
  s(poly(10.4, 16.4, 13.6, 16.4, 12, 20.4)),
];
const HORSE = [
  s(
    'M6.8 19.6c-.4-3.4.2-6.6 1.6-9.2l.6-4.8 1.6 2.6c.8-.4 1.6-.6 2.6-.6c1.6 0 2.8.8 3.6 2l2.4 3.6' +
      'c.4.6.2 1.4-.4 1.8l-1 .6c-.6.4-1.4.2-1.8-.4l-1.2-1.6-1.4.4c-.2 2.4.4 4.4 1.6 5.6Z' +
      circle(13.4, 10.4, 0.8),
    true,
  ),
  s('M8.6 9.6c-1.6.6-2.6 2.2-3.2 4.2c1.2-.6 2.2-1.6 3-2.6Z'),
];
const SHIELD = [s('M12 4.4l6.2 2.2v4.8c0 4.1-2.6 6.8-6.2 8.2c-3.6-1.4-6.2-4.1-6.2-8.2V6.6Z')];
const TENT = [s(poly(12, 4.6, 19.4, 18.6, 4.6, 18.6) + poly(12, 11, 14.8, 18.6, 9.2, 18.6), true)];
const BOOK = [
  s('M4.8 7.2c2.6-1 5-.8 6.6.4v11c-1.6-1.1-4-1.3-6.6-.3Z'),
  s('M19.2 7.2c-2.6-1-5-.8-6.6.4v11c1.6-1.1 4-1.3 6.6-.3Z'),
];
const ARCHES = [
  s(
    rect(4.6, 7, 14.8, 11.6) +
      'M6.6 18.6v-4.6a1.8 1.8 0 0 1 3.6 0v4.6Z' +
      'M10.2 18.6v-4.6a1.8 1.8 0 0 1 3.6 0v4.6Z' +
      'M13.8 18.6v-4.6a1.8 1.8 0 0 1 3.6 0v4.6Z' +
      'M6.6 12v-2.2a1.2 1.2 0 0 1 2.4 0v2.2Z' +
      'M10.8 12v-2.2a1.2 1.2 0 0 1 2.4 0v2.2Z' +
      'M15 12v-2.2a1.2 1.2 0 0 1 2.4 0v2.2Z',
    true,
  ),
];
const FACTORY = [
  s(
    'M4.6 18.8V11l4.4-2.6v2.6l4.4-2.6v2.6l4.4-2.6V5h2v13.8Z' +
      rect(7, 13.6, 2, 2) +
      rect(11.4, 13.6, 2, 2),
    true,
  ),
];
const PERSON = [s(circle(12, 7.6, 3)), s('M6 19.2c0-3.6 2.7-6.2 6-6.2s6 2.6 6 6.2Z')];
const DROP = [s('M12 4.2c2.8 4 5.4 6.9 5.4 10a5.4 5.4 0 0 1-10.8 0c0-3.1 2.6-6 5.4-10Z')];
const WAVES = [
  s(
    'M4.6 14.4c1.8-1.4 3.6-1.4 5.4 0s3.6 1.4 5.4 0 3.6-1.4 4 0v1.8c-.4-1.4-2.2-1.4-4 0s-3.6 1.4-5.4 0-3.6-1.4-5.4 0Z',
  ),
];
const CHECK = [s(poly(6, 12.4, 8, 10.4, 10.6, 13, 16.4, 7.2, 18.4, 9.2, 10.6, 17))];

// --- The set -----------------------------------------------------------------------------------

/** Badge colors by job (yields follow the Civ games' color language). */
const C = {
  food: '#5f9b33',
  production: '#b05f2a',
  gold: '#c79a1d',
  science: '#2f77c0',
  culture: '#8b4cb4',
  faith: '#3b9c95',
  happiness: '#d08a1f',
  influence: '#8a6a3a',
  tourism: '#c4538a',
  bonus: '#5d8742',
  luxury: '#8956b6',
  strategic: '#ad4b34',
  military: '#a8382f',
  civilian: '#5b6b7a',
  naval: '#25608f',
  ui: '#3a4f61',
  brass: '#a67d2e',
};

export const ICONS: Record<string, IconDef> = {
  // Yields
  food: { bg: C.food, glyph: WHEAT },
  production: { bg: C.production, glyph: GEAR },
  gold: { bg: C.gold, glyph: COIN },
  science: { bg: C.science, glyph: FLASK },
  culture: { bg: C.culture, glyph: MASK },
  faith: { bg: C.faith, glyph: FLAME },
  happiness: {
    bg: C.happiness,
    glyph: [
      s(
        circle(12, 12, 7.2) +
          circle(9.4, 10.2, 1.1) +
          circle(14.6, 10.2, 1.1) +
          'M8.6 13.4Q12 17.4 15.4 13.4Q12 15.2 8.6 13.4Z',
        true,
      ),
    ],
  },
  influence: {
    bg: C.influence,
    glyph: [
      s(star(12, 10.6, 6.6, 5.4, 14) + circle(12, 10.6, 3.2), true),
      s(poly(8.6, 15.4, 7, 20, 9.4, 18.8, 10.6, 16.4)),
      s(poly(15.4, 15.4, 17, 20, 14.6, 18.8, 13.4, 16.4)),
    ],
  },
  tourism: {
    bg: C.tourism,
    glyph: [
      s(rect(5, 9, 14, 9.6, 1.6) + rect(11.4, 11, 1.2, 5.6), true),
      s('M9.4 9V6.8c0-.8.6-1.4 1.4-1.4h2.4c.8 0 1.4.6 1.4 1.4V9h-1.4V6.8h-2.4V9Z'),
    ],
  },

  // Resources
  wheat: { bg: C.bonus, glyph: WHEAT },
  rice: {
    bg: C.bonus,
    glyph: [
      s('M5 12.6h14c0 3.6-3.1 6.4-7 6.4s-7-2.8-7-6.4Z'),
      ...[
        [8.6, 10.6],
        [11, 9.4],
        [13.4, 10.6],
        [15.6, 9.6],
        [10, 7.6],
        [12.6, 7.4],
      ].map(([x, y]) => s(ellipse(x!, y!, 1.3, 0.75, -20))),
    ],
  },
  cattle: {
    bg: C.bonus,
    glyph: [
      s(
        'M8.6 8.6h6.8c.8 2.6.6 5.6-.6 8.2c-.4.9-1.2 1.4-2.2 1.4h-1.2c-1 0-1.8-.5-2.2-1.4c-1.2-2.6-1.4-5.6-.6-8.2Z' +
          circle(10.2, 11.6, 0.8) +
          circle(13.8, 11.6, 0.8) +
          ellipse(12, 16.4, 1.8, 1.1),
        true,
      ),
      s('M8.8 9.2C6.4 9 4.8 7.6 4.6 5.6c1.2 1.2 2.8 1.6 4.8 1.4Z'),
      s('M15.2 9.2c2.4-.2 4-1.6 4.2-3.6c-1.2 1.2-2.8 1.6-4.8 1.4Z'),
    ],
  },
  sheep: {
    bg: C.bonus,
    glyph: [
      s(
        circle(9, 11, 3) +
          circle(12.4, 9.6, 3.2) +
          circle(15.4, 11.4, 2.8) +
          circle(11.6, 13.2, 3.2),
      ),
      s(ellipse(17.6, 9.6, 1.9, 1.4, -20)),
      s(rect(9, 15, 1.3, 4) + rect(13.6, 15, 1.3, 4)),
    ],
  },
  deer: {
    bg: C.bonus,
    glyph: [
      s('M10.2 11.4h3.6l.8 3.6c.2 1.6-.9 3.6-2.6 3.6s-2.8-2-2.6-3.6Z'),
      s(
        'M10.6 11.6C8.2 10.6 6.6 8.6 6.6 5.6l1.2.4c0 1 .3 1.9.8 2.6L8.4 6l1 .2.2 3.2c.5.4 1 .7 1.6.9Z',
      ),
      s('M13.4 11.6c2.4-1 4-3 4-6l-1.2.4c0 1-.3 1.9-.8 2.6L15.6 6l-1 .2-.2 3.2c-.5.4-1 .7-1.6.9Z'),
    ],
  },
  bananas: {
    bg: C.bonus,
    glyph: [
      s('M6.4 7.6c.4 6.2 4.6 10.2 11.2 10.4l.4-1.6C12.8 15.8 9.2 12.6 8.2 7Z'),
      s('M8.8 6.2c1.4 5.4 4.8 8.6 9.8 9.2l.2-1.6c-4-.8-6.6-3.6-8.2-8Z'),
      s(rect(6, 5.2, 4, 1.6, 0.6)),
    ],
  },
  fish: {
    bg: C.bonus,
    glyph: [
      s(
        'M4.8 12c2.2-3.4 5.2-4.8 8.4-4.8c2.4 0 4.2 1 5.4 2.4l1.8-2v8.8l-1.8-2c-1.2 1.4-3 2.4-5.4 2.4' +
          'c-3.2 0-6.2-1.4-8.4-4.8Z' +
          circle(8.6, 11.2, 0.9),
        true,
      ),
    ],
  },
  crabs: {
    bg: C.bonus,
    glyph: [
      s(ellipse(12, 13.6, 4.6, 3.4)),
      s('M6.4 6.2c-1.6 1.4-1.6 3.4 0 4.6l1.2-1.6c-.6-.4-.6-1 0-1.6l1 1.2.6-2.4c-1-.6-2-.6-2.8-.2Z'),
      s('M17.6 6.2c1.6 1.4 1.6 3.4 0 4.6l-1.2-1.6c.6-.4.6-1 0-1.6l-1 1.2-.6-2.4c1-.6 2-.6 2.8-.2Z'),
      s(
        bar(8, 15, 5, 18, 1) +
          bar(16, 15, 19, 18, 1) +
          bar(8.6, 12, 7.6, 10.2, 1) +
          bar(15.4, 12, 16.4, 10.2, 1),
      ),
    ],
  },
  stone: {
    bg: C.bonus,
    glyph: [
      s(
        rect(4.8, 13.4, 6.8, 4.8, 0.6) +
          rect(12.4, 13.4, 6.8, 4.8, 0.6) +
          rect(8.6, 7.8, 6.8, 4.8, 0.6),
      ),
    ],
  },
  copper: {
    bg: C.bonus,
    glyph: [
      s(poly(4.8, 18.4, 6.4, 14.2, 11.2, 14.2, 12.8, 18.4)),
      s(poly(11.2, 18.4, 12.8, 14.2, 17.6, 14.2, 19.2, 18.4)),
      s(poly(8, 13.4, 9.6, 9.2, 14.4, 9.2, 16, 13.4)),
    ],
  },
  silk: {
    bg: C.luxury,
    glyph: [
      s(rect(6.4, 5, 11.2, 2.2, 0.8) + rect(6.4, 16.8, 11.2, 2.2, 0.8)),
      s(rect(8, 7.2, 8, 9.6)),
      dark(rect(8, 9, 8, 0.7) + rect(8, 11.2, 8, 0.7) + rect(8, 13.4, 8, 0.7)),
    ],
  },
  spices: {
    bg: C.luxury,
    glyph: [
      s('M5.4 11.8h13.2c0 3.8-2.9 6.8-6.6 6.8s-6.6-3-6.6-6.8Z'),
      s(bar(13.2, 11, 17.6, 4.8, 1.6)),
      s(rect(9.4, 18.6, 5.2, 1.2, 0.5)),
    ],
  },
  wine: {
    bg: C.luxury,
    glyph: [
      ...[
        [9.6, 9.6],
        [12.4, 9.6],
        [15.2, 9.6],
        [11, 12.2],
        [13.8, 12.2],
        [12.4, 14.8],
        [10.4, 14.6],
        [12.4, 17.4],
      ].map(([x, y]) => s(circle(x!, y!, 1.5))),
      s('M12.6 7.6c0-1.6.6-2.6 2.2-3.2c1.6-.6 3-.2 3.6.6c-1.6.2-3 .8-4.4 2.6Z'),
    ],
  },
  incense: {
    bg: C.luxury,
    glyph: [
      s('M6.4 13.2h11.2c0 3-2.5 5.4-5.6 5.4s-5.6-2.4-5.6-5.4Z'),
      s(rect(9.8, 18.4, 4.4, 1.4, 0.5)),
      s('M11.2 12c-1.6-1.8-1.4-3.4 0-4.8s1.4-2.6.4-3.6c2 .8 2.6 2.6 1.2 4.4s-1.2 2.6 0 4Z'),
    ],
  },
  diamonds: {
    bg: C.luxury,
    glyph: [
      s(
        poly(7, 6.6, 17, 6.6, 20, 10.4, 12, 19.6, 4, 10.4) +
          poly(9, 10.4, 15, 10.4, 12, 16.4) +
          poly(5.6, 10, 8.2, 7.6, 9.6, 10),
        true,
      ),
    ],
  },
  pearls: {
    bg: C.luxury,
    glyph: [
      s('M4.6 13.2c1.4-4.6 4.2-7 7.4-7s6 2.4 7.4 7c-2 1.6-4.4 2.4-7.4 2.4s-5.4-.8-7.4-2.4Z'),
      s('M4.6 14.6c2 1.6 4.4 2.4 7.4 2.4s5.4-.8 7.4-2.4c-.8 2.6-3.6 4.6-7.4 4.6s-6.6-2-7.4-4.6Z'),
      dark(circle(12, 12.2, 2.2)),
    ],
  },
  whales: {
    bg: C.luxury,
    glyph: [
      s(
        'M3.8 13.2c0-3.4 3.4-5 7.2-5c3 0 4.8 1.2 5.8 3l2.6-2.6 1 .8-1.8 3.2 1.8 3.2-1 .8-2.6-2.6' +
          'c-1.2 2.2-3.6 3.2-6.6 3.2c-3.4 0-6.4-1.4-6.4-4Z' +
          circle(7.4, 12, 0.8),
        true,
      ),
      s('M9.6 7.4c-.2-1.4.4-2.6 1.4-3.2c.2 1 .2 2-.2 3Z'),
    ],
  },
  horses: { bg: C.strategic, glyph: HORSE },
  iron: {
    bg: C.strategic,
    glyph: [
      s(
        'M4.6 8.6h12.6c1.2 0 2.2.8 2.2 2h-4.6c-.8 1.2-1.6 2.2-1.6 3.4h-4.2c0-1.4-.8-2.6-2.4-3.2c-1 .1-1.8-.6-2-1.4Z',
      ),
      s(rect(9.6, 14, 4.2, 2.6)),
      s(rect(7.4, 16.4, 8.6, 2, 0.4)),
    ],
  },
  niter: {
    bg: C.strategic,
    glyph: [
      s(poly(8.4, 18.6, 10.2, 7.2, 12, 18.6)),
      s(poly(11.4, 18.6, 13.6, 5, 15.6, 18.6)),
      s(poly(5.6, 18.6, 7, 11, 8.6, 18.6)),
      s(poly(15.2, 18.6, 16.8, 10.6, 18.6, 18.6)),
    ],
  },
  coal: {
    bg: C.strategic,
    glyph: [
      s(poly(5.2, 16, 7.4, 11.6, 11.4, 11, 12.8, 14.6, 11, 18.6, 6.6, 18.6)),
      s(poly(11.6, 10.4, 13.8, 6.4, 17.6, 7, 18.8, 11.2, 16.4, 13.8, 13.2, 13.4)),
      s(poly(13.6, 18.6, 14.4, 15.2, 17.6, 14.6, 19, 17.6, 17.4, 19)),
    ],
  },
  oil: { bg: C.strategic, glyph: DROP },
  aluminum: {
    bg: C.strategic,
    glyph: [
      s(poly(5, 14.6, 8.4, 9, 19, 9, 15.6, 14.6)),
      s(poly(5, 15.6, 15.6, 15.6, 19, 10, 19, 11.4, 16, 17, 5, 17)),
    ],
  },
  uranium: {
    bg: C.strategic,
    glyph: [
      s(circle(12, 12, 1.8)),
      ...[-90, 30, 150].map((deg) => {
        const a1 = ((deg - 30) * Math.PI) / 180;
        const a2 = ((deg + 30) * Math.PI) / 180;
        const p = (r: number, a: number) => [12 + r * Math.cos(a), 12 + r * Math.sin(a)];
        const [x1, y1] = p(3, a1);
        const [x2, y2] = p(7.4, a1);
        const [x3, y3] = p(7.4, a2);
        const [x4, y4] = p(3, a2);
        return s(
          `M${x1!.toFixed(2)} ${y1!.toFixed(2)}L${x2!.toFixed(2)} ${y2!.toFixed(2)}A7.4 7.4 0 0 1 ${x3!.toFixed(2)} ${y3!.toFixed(2)}L${x4!.toFixed(2)} ${y4!.toFixed(2)}A3 3 0 0 0 ${x1!.toFixed(2)} ${y1!.toFixed(2)}Z`,
        );
      }),
    ],
  },

  // Units (by model family)
  settler: {
    bg: C.civilian,
    glyph: [
      s('M5.6 13.8V9.6c0-2.6 2.8-4.4 6.4-4.4s6.4 1.8 6.4 4.4v4.2Z'),
      s(rect(4.6, 13.2, 14.8, 2.2, 0.6)),
      s(ring(8.2, 17.4, 2.1, 0.9) + ring(15.8, 17.4, 2.1, 0.9), true),
    ],
  },
  scout: {
    bg: C.military,
    glyph: [
      s(
        'M3.8 12c2.2-3.8 5-5.6 8.2-5.6s6 1.8 8.2 5.6c-2.2 3.8-5 5.6-8.2 5.6S6 15.8 3.8 12Z' +
          circle(12, 12, 3.2),
        true,
      ),
      s(circle(12, 12, 1.6)),
    ],
  },
  warrior: {
    bg: C.military,
    glyph: [...SHIELD, dark(rect(11.3, 6.6, 1.4, 10.4) + rect(9, 9.4, 6, 1.2))],
  },
  archer: {
    bg: C.military,
    glyph: [
      s(
        'M8 4.6c4.6 2 6.8 4.6 6.8 7.4S12.6 17.4 8 19.4l-.4-1.2c3.8-1.8 5.6-3.8 5.6-6.2S11.4 7.6 7.6 5.8Z',
      ),
      s(bar(8, 5.4, 8, 18.6, 0.6)),
      s(bar(5, 12, 18.4, 12, 1)),
      s(poly(18.4, 10.2, 20.4, 12, 18.4, 13.8)),
    ],
  },
  cavalry: { bg: C.military, glyph: HORSE },
  ship: {
    bg: C.naval,
    glyph: [
      s(poly(11.4, 4.6, 11.4, 14.2, 5.6, 14.2)),
      s(poly(12.6, 6.2, 17.8, 14.2, 12.6, 14.2)),
      s('M4.6 15.4h14.8l-2 3.4H6.6Z'),
    ],
  },
  rifle: {
    bg: C.military,
    glyph: [
      s(bar(5.2, 18.8, 17.6, 6.4, 1.6)),
      s(bar(17.4, 6.6, 19.4, 4.6, 0.8)),
      s(poly(5, 16.4, 8.8, 20, 6.2, 20.6, 4, 18.4)),
    ],
  },
  siege: {
    bg: C.military,
    glyph: [
      s(rect(4.8, 14.4, 14.4, 2, 0.5)),
      s(bar(7.6, 14.8, 16, 6.2, 1.4)),
      s(circle(16.4, 5.8, 1.8)),
      s(ring(7.6, 17.6, 1.8, 0.8) + ring(16.4, 17.6, 1.8, 0.8), true),
    ],
  },
  cannon: {
    bg: C.military,
    glyph: [s(bar(5.6, 14.6, 18.6, 8.4, 3)), s(ring(9.6, 15.8, 3, 1.2), true)],
  },
  tank: {
    bg: C.military,
    glyph: [
      s(rect(4.4, 13, 15.2, 5.6, 2.8)),
      dark(circle(7.6, 15.8, 1.2) + circle(12, 15.8, 1.2) + circle(16.4, 15.8, 1.2)),
      s(rect(7.4, 9.4, 7.6, 3.2, 1)),
      s(rect(14.6, 10.2, 5.6, 1.2)),
    ],
  },
  steamship: {
    bg: C.naval,
    glyph: [
      s('M3.8 14h16.4l-2.2 4.4H6.2Z'),
      s(rect(7.6, 10.2, 8, 3.4)),
      s(rect(11, 6, 2.4, 4.4)),
      s(circle(13.6, 4.6, 1.2) + circle(15.6, 3.8, 0.9)),
    ],
  },
  commander: {
    bg: C.brass,
    glyph: [
      s(rect(6.6, 4.2, 1.4, 15.6)),
      s('M8 5h10.4l-2.4 3.4 2.4 3.4H8Z'),
      s(star(12.6, 8.4, 1.5, 0.7, 5)),
    ],
  },
  robed: {
    bg: C.civilian,
    glyph: [s(circle(12, 6.8, 2.6)), s('M7 19.4L9.4 10.4h5.2L17 19.4Z'), s(rect(16.4, 6, 1, 13.6))],
  },
  spear: {
    bg: C.military,
    glyph: [
      s(bar(6, 19, 16.6, 6.4, 1.1)),
      s(poly(15.6, 5.2, 19.6, 3.6, 18, 7.6)),
      s(ring(9.4, 13.4, 3.6, 2.4), true),
    ],
  },
  pike: {
    bg: C.military,
    glyph: [
      s(bar(5, 20, 17.4, 5.2, 1)),
      s(poly(16.4, 4.2, 20.4, 2.8, 18.8, 6.8)),
      s(bar(9, 20, 20.6, 7.4, 1)),
      s(poly(19.8, 6.4, 21.4, 4.8, 21.2, 7.6)),
    ],
  },
  sword: {
    bg: C.military,
    glyph: [
      s(poly(16.8, 4.2, 19.8, 4.2, 19.8, 7.2, 10.6, 16.4, 7.6, 13.4)),
      s(bar(6.2, 12.2, 11.8, 17.8, 1.4)),
      s(bar(5, 19, 8.2, 15.8, 1.6)),
    ],
  },
  crossbow: {
    bg: C.military,
    glyph: [
      s(bar(6, 18, 18, 6, 1.4)),
      s('M5.6 9.8c3.6-.6 6.4 0 8.6 2.2s2.8 5 2.2 8.6l-1.4-.2c.4-3-.1-5.2-1.8-7s-4-2.2-7-1.8Z'),
    ],
  },
  horseman: { bg: C.military, glyph: [...HORSE, s(bar(15.4, 3.2, 20.4, 8.2, 0.8))] },
  knight: {
    bg: C.military,
    glyph: [
      s('M7 9.6c0-3 2.2-5.2 5-5.2s5 2.2 5 5.2V14c0 1-.8 1.8-1.8 1.8H8.8C7.8 15.8 7 15 7 14Z'),
      dark(rect(8.6, 9, 6.8, 1.2) + rect(11.4, 10.2, 1.2, 4)),
      s(poly(12, 1.8, 13.4, 4.6, 10.6, 4.6)),
      s(rect(6.4, 17, 11.2, 2.4, 1)),
    ],
  },
  chariot: {
    bg: C.military,
    glyph: [
      s(ring(9, 15.6, 3.8, 2.6), true),
      s(rect(8.4, 8.4, 6.6, 4.6, 1)),
      s(bar(15, 12.6, 20.4, 12.6, 1.2)),
      s(circle(9, 15.6, 0.9)),
    ],
  },
  musket: {
    bg: C.military,
    glyph: [
      s(bar(5.2, 18.8, 18.2, 5.8, 1.4)),
      s(poly(17.6, 3.6, 20.4, 2.8, 19.6, 5.8)),
      s(poly(5, 16.2, 8.8, 20, 6, 20.8, 3.6, 18.4)),
      s(circle(17.4, 15.4, 2.4)),
    ],
  },
  infantry: {
    bg: C.military,
    glyph: [
      s('M5.4 11.6c0-3.8 3-6.4 6.6-6.4s6.6 2.6 6.6 6.4Z'),
      s(rect(3.8, 11.4, 16.4, 1.6, 0.8)),
      s(bar(6.2, 19.8, 17.8, 14.6, 1.4)),
    ],
  },
  artillery: {
    bg: C.military,
    glyph: [
      s(bar(6, 15.4, 20.2, 7, 2)),
      s(rect(7, 10.4, 2, 6.2)),
      s(ring(9.6, 17, 2.8, 1.2), true),
      s(bar(4, 19.4, 9.6, 17, 1.2)),
    ],
  },
  trader: {
    bg: C.gold,
    glyph: [s('M8.4 8.6h7.2l2.6 10.2H5.8Z'), s(rect(9.6, 5, 4.8, 3, 1)), dark(circle(12, 13.6, 2))],
  },
  frigate: {
    bg: C.naval,
    glyph: [
      s(poly(7.2, 3.8, 7.2, 13.6, 3.8, 13.6)),
      s(poly(12, 2.8, 12, 13.6, 8.2, 13.6)),
      s(poly(12.8, 4.4, 17.6, 13.6, 12.8, 13.6)),
      s('M3.4 14.8h17.2l-2.6 4H6Z'),
    ],
  },
  destroyer: {
    bg: C.naval,
    glyph: [
      s('M2.8 14.4h18.4l-2.6 3.8H5.4Z'),
      s(rect(8.4, 10.6, 6.6, 3.2)),
      s(rect(10.2, 7.8, 2.8, 2.6)),
      s(bar(15, 12.6, 19.6, 10.6, 0.9)),
      s(rect(6.6, 8.6, 1.4, 2.4)),
    ],
  },
  plane: {
    bg: C.military,
    glyph: [
      s(rect(10.8, 3.6, 2.4, 16.4, 1.2)),
      s(poly(3.4, 12.6, 20.6, 12.6, 20.6, 10.2, 13, 8.4, 11, 8.4, 3.4, 10.2)),
      s(poly(7.8, 19.6, 16.2, 19.6, 16.2, 18, 7.8, 18)),
    ],
  },
  bomber: {
    bg: C.military,
    glyph: [
      s(rect(10.6, 3.2, 2.8, 17.2, 1.4)),
      s(poly(2.6, 13.4, 21.4, 13.4, 21.4, 11, 12, 7.8, 2.6, 11)),
      s(poly(7.4, 20.2, 16.6, 20.2, 16.6, 18.6, 7.4, 18.6)),
      dark(circle(6.6, 12, 0.9) + circle(17.4, 12, 0.9)),
    ],
  },
  helicopter: {
    bg: C.military,
    glyph: [
      s(rect(3, 5.6, 18, 1.2, 0.6)),
      s(rect(11.4, 6.6, 1.2, 2.4)),
      s(
        'M7.6 12c0-2 1.6-3.2 3.6-3.2h2.4c2.4 0 4 1.6 4 3.8v.8c0 1.2-1 2.2-2.2 2.2H9.8c-1.2 0-2.2-1-2.2-2.2Z',
      ),
      s(bar(17.4, 12, 21.4, 10.6, 0.9)),
      s(rect(8.2, 17.4, 8.8, 1, 0.5)),
    ],
  },
  generic: { bg: C.military, glyph: SHIELD },

  // Districts
  district_campus: { bg: C.science, glyph: BOOK },
  district_holy_site: {
    bg: C.faith,
    glyph: [
      s('M6.4 12.6c0-3.4 2.6-6 5.6-6s5.6 2.6 5.6 6Z'),
      s(rect(11.4, 3.4, 1.2, 3.4)),
      s(rect(5.4, 13.2, 13.2, 1.4)),
      s(rect(6.6, 14.6, 10.8, 4.4)),
    ],
  },
  district_theater: { bg: C.culture, glyph: MASK },
  district_commercial_hub: {
    bg: C.gold,
    glyph: [
      s(ellipse(12, 16.6, 6, 1.9)),
      s(rect(6, 12.4, 12, 4.2)),
      s(ellipse(12, 12.4, 6, 1.9)),
      dark(ellipse(12, 12.4, 3.6, 0.9)),
      s(rect(8.6, 6, 6.8, 4.4, 1)),
    ],
  },
  district_harbor: { bg: C.naval, glyph: ANCHOR },
  district_industrial_zone: { bg: C.production, glyph: FACTORY },
  district_encampment: { bg: C.military, glyph: TENT },
  district_entertainment: { bg: '#4b8a3c', glyph: ARCHES },
  district_aqueduct: { bg: '#3f88a8', glyph: ARCHES },
  district_government_plaza: { bg: '#6b7280', glyph: COLUMNS },
  district_suguba: { bg: C.gold, glyph: COIN },
  district_spaceport: { bg: '#4b5563', glyph: ROCKET },

  // Improvements
  improvement_farm: {
    bg: C.food,
    glyph: [
      s(
        poly(4, 18.4, 8.4, 9.4, 15.6, 9.4, 20, 18.4) +
          poly(7, 16.6, 9.8, 11, 11.2, 11, 10.2, 16.6) +
          poly(12.8, 16.6, 12.6, 11, 14, 11, 17, 16.6),
        true,
      ),
      s(circle(17.4, 6.2, 1.8)),
    ],
  },
  improvement_mine: {
    bg: C.production,
    glyph: [
      s(
        'M4.6 9.4c3.8-3.6 10.6-3.6 14.8 0l-.8 1c-1.8-1-3.6-1.6-5.6-1.8l-.4 1-.8 9.6h-1.6L9.8 9.6l-.4-1c-2 .2-3.8.8-5.6 1.8Z',
      ),
    ],
  },
  improvement_quarry: {
    bg: C.production,
    glyph: [
      s(
        rect(4.8, 13.4, 6.8, 4.8, 0.6) +
          rect(12.4, 13.4, 6.8, 4.8, 0.6) +
          rect(8.6, 7.8, 6.8, 4.8, 0.6),
      ),
    ],
  },
  improvement_pasture: {
    bg: C.food,
    glyph: [
      s(
        rect(5.4, 7, 1.6, 12) +
          rect(11.2, 7, 1.6, 12) +
          rect(17, 7, 1.6, 12) +
          rect(4.4, 9.6, 15.2, 1.4) +
          rect(4.4, 14, 15.2, 1.4),
      ),
    ],
  },
  improvement_plantation: {
    bg: C.food,
    glyph: [
      s(circle(12, 9.4, 4.6) + circle(8.6, 11.6, 3) + circle(15.4, 11.6, 3)),
      s(rect(11.2, 12.4, 1.6, 6.6)),
    ],
  },
  improvement_camp: { bg: C.food, glyph: TENT },
  improvement_fishing_boats: {
    bg: C.naval,
    glyph: [
      s(poly(11.4, 4.6, 11.4, 12.2, 6, 12.2)),
      s('M4.6 13.4h14.8l-2 3.4H6.6Z'),
      ...WAVES.map((w) => ({ ...w, d: w.d.replace('M4.6 14.4', 'M4.6 18.4') })),
    ],
  },
  improvement_woodcutter: {
    bg: C.production,
    glyph: [
      s(bar(8, 18.6, 15.2, 6.8, 1.4)),
      s('M13.6 5.6c2-.8 4.2-.2 5.4 1.6c-1.8.4-3.4 1.6-4 3.4l-3-1.8Z'),
    ],
  },
  improvement_obelisk: {
    bg: C.culture,
    glyph: [s(poly(10.6, 7, 12, 3.8, 13.4, 7, 14, 17.4, 10, 17.4)), s(rect(8.4, 17.4, 7.2, 1.8))],
  },
  improvement_chateau: {
    bg: C.culture,
    glyph: [
      s(
        'M5 19V10.4h2.2V8h1.6v2.4h2V6.4L12 4l1.2 2.4v4h2V8h1.6v2.4H19V19h-4.4v-3.4a2.6 2.6 0 0 0-5.2 0V19Z',
      ),
    ],
  },
  improvement_great_wall: {
    bg: C.production,
    glyph: [s('M3.8 19v-8h2v2h2v-2h2v2h2v-4h2v2h2v-2h2v2h2v8Z')],
  },

  // Great people
  gp_scientist: { bg: C.science, glyph: FLASK },
  gp_engineer: { bg: C.production, glyph: GEAR },
  gp_merchant: { bg: C.gold, glyph: COIN },
  gp_prophet: { bg: C.faith, glyph: FLAME },
  gp_general: { bg: C.military, glyph: SWORDS },
  gp_writer: { bg: C.culture, glyph: SCROLL },
  gp_admiral: { bg: C.naval, glyph: ANCHOR },

  // Buildings and wonders (generic until each gets its own)
  palace: {
    bg: C.brass,
    glyph: [
      s('M4.6 17.2l1.6-9 3.4 3.6L12 5.4l2.4 6.4 3.4-3.6 1.6 9Z'),
      s(rect(4.6, 17.8, 14.8, 1.6, 0.5)),
    ],
  },
  monument: {
    bg: C.culture,
    glyph: [s(poly(10.6, 7, 12, 3.8, 13.4, 7, 14, 17.4, 10, 17.4)), s(rect(8.4, 17.4, 7.2, 1.8))],
  },
  granary: { bg: C.food, glyph: WHEAT },
  walls: {
    bg: C.military,
    glyph: [
      s('M4.6 19V7.4h2.6v2h2v-2h2.6v2h2v-2h2.6v2h2v-2h2.6V19h-5.2v-3.6a2.6 2.6 0 0 0-5.2 0V19Z'),
    ],
  },
  water: { bg: '#3f88a8', glyph: DROP },
  hospital: { bg: '#b8423a', glyph: [s(rect(10, 5, 4, 14, 0.6) + rect(5, 10, 14, 4, 0.6))] },
  building: { bg: C.ui, glyph: COLUMNS },
  wonder: {
    bg: C.brass,
    glyph: [
      s(star(12, 5.6, 2.2, 1, 5)),
      s(poly(12, 8, 19, 11.2, 5, 11.2)),
      s(rect(6.4, 11.8, 1.8, 5) + rect(11.1, 11.8, 1.8, 5) + rect(15.8, 11.8, 1.8, 5)),
      s(rect(5, 17.4, 14, 1.6)),
    ],
  },
  project: { bg: C.production, glyph: GEAR },
  rocket: { bg: '#4b5563', glyph: ROCKET },

  // Interface
  research: { bg: C.science, glyph: FLASK },
  civic: { bg: C.culture, glyph: SCROLL },
  government: { bg: C.brass, glyph: COLUMNS },
  greatPeople: { bg: C.brass, glyph: [s(star(12, 12, 7.6, 3.4, 5))] },
  religion: { bg: C.faith, glyph: FLAME },
  cityStates: {
    bg: '#4c6b8a',
    glyph: [s(rect(6.6, 4.2, 1.4, 15.6)), s('M8 5h10.4l-2.4 3.4 2.4 3.4H8Z')],
  },
  victory: {
    bg: C.brass,
    glyph: [
      s(
        'M7.6 4.6h8.8v2.6h2.6c0 3-1.6 5-4 5.4c-.6 1.4-1.6 2.2-2.8 2.6v2.2h3v2h-8.4v-2h3v-2.2c-1.2-.4-2.2-1.2-2.8-2.6c-2.4-.4-4-2.4-4-5.4h2.6Zm-1 4.2c.2 1.2.8 2 1.6 2.4c-.4-.8-.6-1.6-.6-2.4Zm10.8 0h-1c0 .8-.2 1.6-.6 2.4c.8-.4 1.4-1.2 1.6-2.4Z',
        true,
      ),
    ],
  },
  graphs: {
    bg: C.ui,
    glyph: [s(rect(5.4, 12.6, 3, 6.4) + rect(10.5, 8.6, 3, 10.4) + rect(15.6, 5.4, 3, 13.6))],
  },
  lens: {
    bg: C.ui,
    glyph: [s(ring(10.6, 10.6, 5.2, 3.6), true), s(bar(14.2, 14.2, 18.8, 18.8, 2.2))],
  },
  pedia: {
    bg: C.ui,
    glyph: [
      s('M4 6.6c2.6-1 5.2-.8 7.4.6v11.4c-2.2-1.3-4.8-1.5-7.4-.6Z'),
      s('M20 6.6c-2.6-1-5.2-.8-7.4.6v11.4c2.2-1.3 4.8-1.5 7.4-.6Z'),
    ],
  },
  help: {
    bg: C.ui,
    glyph: [
      s(
        'M9 9.4c0-2 1.4-3.4 3.2-3.4c2 0 3.2 1.4 3.2 3c0 2.6-2.6 2.6-2.6 4.8h-1.8c0-3.2 2.6-3.2 2.6-4.8c0-.8-.6-1.4-1.4-1.4s-1.4.6-1.4 1.8Z',
      ),
      s(circle(12, 16.8, 1.2)),
    ],
  },
  settings: { bg: C.ui, glyph: GEAR },
  diplomacy: {
    bg: C.influence,
    glyph: [
      s(
        'M3.8 11.2l3-3.2 3.6 1.4 2.2-1.6c.8-.5 1.8-.5 2.6 0l2.2 1.6 3-1.4.4 4.6-2.2 1.4-4.6 4c-.6.5-1.4.5-2 0l-4.4-3.6-2.6-.8Z',
      ),
    ],
  },
  trade: {
    bg: C.gold,
    glyph: [
      s('M4.6 15.6h14.8v1.6H4.6Z'),
      s(ring(8, 17.8, 1.6, 0.6) + ring(16, 17.8, 1.6, 0.6), true),
      s('M6.2 15V9.4c0-1.6 1.4-2.8 3-2.8h5.6c1.6 0 3 1.2 3 2.8V15Z'),
    ],
  },
  envoy: { bg: C.influence, glyph: SCROLL },
  // A thermometer.
  climate: {
    bg: '#b5562d',
    glyph: [
      s(
        'M10.4 5.6a1.6 1.6 0 0 1 3.2 0v7.6a3.6 3.6 0 1 1-3.2 0Z' +
          'M11.6 6.2v7.8a2.2 2.2 0 1 0 .8 0V6.2Z',
        true,
      ),
      s('M15.2 6.4h2.6v1.2h-2.6ZM15.2 9h2v1.2h-2ZM15.2 11.6h2.6v1.2h-2.6Z'),
    ],
  },
  // A domed hall with columns.
  congress: {
    bg: '#2f6f8f',
    glyph: [
      s('M5.4 9.6Q5.8 4.4 12 4.4Q18.2 4.4 18.6 9.6Z'),
      s('M4.6 10.4h14.8v1.6H4.6Z'),
      s('M6 12.8h1.8v4.6H6ZM9.4 12.8h1.8v4.6H9.4ZM12.8 12.8h1.8v4.6h-1.8ZM16.2 12.8H18v4.6h-1.8Z'),
      s('M4 18.2h16v1.8H4Z'),
    ],
  },
  // A brimmed hat over an eye mask.
  spy: {
    bg: '#4a3f5c',
    glyph: [
      s(ellipse(12, 10.2, 8.2, 1.6)),
      s('M7.6 9.6Q8 5.2 12 5.2Q16 5.2 16.4 9.6Z'),
      s(
        'M6.6 13.2Q12 11.6 17.4 13.2L16.8 16.2Q14.6 15.2 12 16.6Q9.4 15.2 7.2 16.2Z' +
          ellipse(9.6, 14.3, 1.3, 0.8) +
          ellipse(14.4, 14.3, 1.3, 0.8),
        true,
      ),
    ],
  },
  war: { bg: C.military, glyph: SWORDS },
  peace: {
    bg: '#4f8f5a',
    glyph: [
      s(
        'M12 19.6C7.4 16 5 13 5 9.6C5 7 7 5.2 9.2 5.2c1.2 0 2.2.6 2.8 1.6c.6-1 1.6-1.6 2.8-1.6C17 5.2 19 7 19 9.6c0 3.4-2.4 6.4-7 10Z',
      ),
    ],
  },
  strength: { bg: C.military, glyph: SHIELD },
  ranged: {
    bg: C.military,
    glyph: [
      s(bar(5, 19, 17.4, 6.6, 1.2)),
      s(poly(14.8, 5.2, 19, 5, 18.8, 9.2)),
      s(poly(4.4, 15.6, 8.4, 19.6, 6.6, 20, 4, 17.4)),
    ],
  },
  movement: { bg: '#4f7a5a', glyph: [s('M18 12l-6.6 6.6v-4.2H6V9.6h5.4V5.4Z')] },
  health: {
    bg: '#b8423a',
    glyph: [
      s(
        'M12 19.6C7.4 16 5 13 5 9.6C5 7 7 5.2 9.2 5.2c1.2 0 2.2.6 2.8 1.6c.6-1 1.6-1.6 2.8-1.6C17 5.2 19 7 19 9.6c0 3.4-2.4 6.4-7 10Z',
      ),
    ],
  },
  promote: {
    bg: C.brass,
    glyph: [
      s(poly(5.6, 12.6, 12, 7.4, 18.4, 12.6, 18.4, 15.4, 12, 10.2, 5.6, 15.4)),
      s(poly(5.6, 17.4, 12, 12.2, 18.4, 17.4, 18.4, 20, 12, 14.8, 5.6, 20)),
    ],
  },
  sleep: {
    bg: C.ui,
    glyph: [
      s('M6.6 7h6.4v1.6l-4.2 5.2H13v1.6H6.4v-1.6l4.2-5.2H6.6Z'),
      s('M13.6 13.2h4v1l-2.4 3h2.4v1h-4v-1l2.4-3h-2.4Z'),
    ],
  },
  fortify: {
    bg: C.military,
    glyph: [...SHIELD, dark(poly(8.6, 11.8, 10.4, 10, 11.8, 11.4, 15.2, 8, 17, 9.8, 11.8, 15))],
  },
  skip: {
    bg: C.ui,
    glyph: [s(poly(5.4, 6.6, 12, 12, 5.4, 17.4) + poly(12, 6.6, 18.6, 12, 12, 17.4))],
  },
  found: {
    bg: C.brass,
    glyph: [
      s('M4.8 19v-6.6l3-2.6 3 2.6V19Z'),
      s('M11.6 19V9.6l3.6-3.4 3.6 3.4V19Z'),
      s(rect(14.4, 3, 1, 3.6)),
    ],
  },
  upgrade: {
    bg: '#4f8f5a',
    glyph: [s(poly(12, 4.6, 18.4, 11.4, 14.4, 11.4, 14.4, 19, 9.6, 19, 9.6, 11.4, 5.6, 11.4))],
  },
  attack: {
    bg: C.military,
    glyph: [
      s(bar(6, 18, 16.6, 7.4, 1.8)),
      s(poly(15, 5.2, 19, 5, 18.8, 9)),
      s(bar(6.4, 13.6, 10.4, 17.6, 1.4)),
    ],
  },
  buy: { bg: C.gold, glyph: COIN },
  menu: {
    bg: C.ui,
    glyph: [
      s(
        rect(5.6, 7, 12.8, 1.8, 0.8) +
          rect(5.6, 11.1, 12.8, 1.8, 0.8) +
          rect(5.6, 15.2, 12.8, 1.8, 0.8),
      ),
    ],
  },
  next: { bg: C.brass, glyph: [s(poly(7.4, 5.6, 17.8, 12, 7.4, 18.4))] },
  population: { bg: C.ui, glyph: PERSON },
  capital: { bg: C.brass, glyph: [s(star(12, 12, 7.6, 3.4, 5))] },
  check: { bg: '#4f8f5a', glyph: CHECK },
  trophy: { bg: C.brass, glyph: [] },
  water_drop: { bg: '#3f88a8', glyph: DROP },
};
ICONS.trophy = ICONS.victory!;

/** Content yield emoji, so text written with them can show the icons instead. */
export const EMOJI_ICONS: Record<string, string> = {
  '🍞': 'food',
  '⚙️': 'production',
  '⚙': 'production',
  '💰': 'gold',
  '🔬': 'science',
  '🎭': 'culture',
  '🙏': 'faith',
  '😊': 'happiness',
  '🤝': 'influence',
  '✈️': 'tourism',
  '✈': 'tourism',
  '⚔': 'war',
  '⚔️': 'war',
  '📜': 'civic',
  '⚓': 'gp_admiral',
  '🏆': 'victory',
  '🏛': 'cityStates',
  '★': 'greatPeople',
  '❤': 'health',
  '🛡': 'strength',
};

/** The icon for a building, by what it is or the district it belongs to. */
export function buildingIcon(id: string, district: string | undefined): string {
  const special: Record<string, string> = {
    building_palace: 'palace',
    building_monument: 'monument',
    building_granary: 'granary',
    building_walls: 'walls',
    building_castle: 'walls',
    building_star_fort: 'walls',
    building_baths: 'water',
    building_thermae: 'water',
    building_water_mill: 'water',
    building_hospital: 'hospital',
    building_forum: 'government',
  };
  return special[id] ?? (district && ICONS[district] ? district : 'building');
}
