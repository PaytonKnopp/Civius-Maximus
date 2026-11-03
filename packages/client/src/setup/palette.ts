/**
 * Player colors: what a seat can be painted in instead of its civilization's own colors. The
 * picked color replaces the civ's main color on the map, borders and lists (the civ's second
 * color stays as its trim). Sixteen are enough for the largest game and all read on every terrain.
 */
export const PALETTE: { id: string; name: string; color: string }[] = [
  { id: 'crimson', name: 'Crimson', color: '#b82e3a' },
  { id: 'orange', name: 'Orange', color: '#dd7a2a' },
  { id: 'gold', name: 'Gold', color: '#d9b232' },
  { id: 'lime', name: 'Lime', color: '#93bd3b' },
  { id: 'green', name: 'Green', color: '#2f9a55' },
  { id: 'teal', name: 'Teal', color: '#1fa39a' },
  { id: 'sky', name: 'Sky', color: '#3f9fdc' },
  { id: 'blue', name: 'Blue', color: '#2f5fc4' },
  { id: 'indigo', name: 'Indigo', color: '#4b40b4' },
  { id: 'purple', name: 'Purple', color: '#8c42b4' },
  { id: 'magenta', name: 'Magenta', color: '#c4429d' },
  { id: 'pink', name: 'Rose', color: '#e888ad' },
  { id: 'brown', name: 'Brown', color: '#8c5c36' },
  { id: 'slate', name: 'Slate', color: '#6d7e90' },
  { id: 'ivory', name: 'Ivory', color: '#e6dfcb' },
  { id: 'ink', name: 'Ink', color: '#2d3139' },
];

const rgb = (hex: string): [number, number, number] => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

/** How far apart two colors look (0 identical, ~441 black to white), weighting green and red. */
export function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  const rm = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

/** Colors closer than this are hard to tell apart on the map. */
export const CLASH = 110;

/** The palette color name for a `#rrggbb`, or the code itself. */
export const colorName = (color: string) =>
  PALETTE.find((p) => p.color.toLowerCase() === color.toLowerCase())?.name ?? color;
