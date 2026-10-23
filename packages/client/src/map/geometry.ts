/**
 * Pixel geometry for pointy-top hexes in the engine's odd-r layout. Rendering only: floats are
 * fine here because nothing drawn feeds back into the rules.
 */

/** Hex radius in world pixels (center to corner). */
export const HEX = 32;
export const HEX_W = Math.sqrt(3) * HEX;
export const ROW_H = 1.5 * HEX;

export function tileCenter(col: number, row: number): [number, number] {
  return [HEX_W * (col + 0.5 * (row & 1)) + HEX_W / 2, HEX + row * ROW_H];
}

/** Corner i (0..5) of a hex, clockwise from the upper-right corner. */
export function corner(cx: number, cy: number, i: number, radius = HEX): [number, number] {
  const angle = (Math.PI / 180) * (60 * i - 30);
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
}

export function hexPoints(cx: number, cy: number, radius = HEX): number[] {
  const out: number[] = [];
  for (let i = 0; i < 6; i++) out.push(...corner(cx, cy, i, radius));
  return out;
}

/**
 * The two corners bounding the edge in an engine direction (0 E, 1 NE, 2 NW, 3 W, 4 SW, 5 SE).
 * Corner 0 is upper-right, then clockwise: 1 lower-right, 2 bottom, 3 lower-left, 4 upper-left, 5 top.
 */
export const EDGE_CORNERS: readonly (readonly [number, number])[] = [
  [0, 1], // E
  [5, 0], // NE
  [4, 5], // NW
  [3, 4], // W
  [2, 3], // SW
  [1, 2], // SE
];

export function worldSize(width: number, height: number): [number, number] {
  return [HEX_W * width, ROW_H * (height - 1) + 2 * HEX];
}

/** The tile under a world-space point, or undefined outside the map. Handles east-west wrap. */
export function tileAt(
  x: number,
  y: number,
  map: { width: number; height: number; wrapX: boolean },
): { col: number; row: number } | undefined {
  // Pixel → fractional axial (pointy-top), relative to the center of tile (0, 0).
  const px = x - HEX_W / 2;
  const py = y - HEX;
  const q = ((Math.sqrt(3) / 3) * px - py / 3) / HEX;
  const r = ((2 / 3) * py) / HEX;
  // Cube rounding.
  let rx = Math.round(q);
  let rz = Math.round(r);
  const ry = Math.round(-q - r);
  const dx = Math.abs(rx - q);
  const dy = Math.abs(ry - (-q - r));
  const dz = Math.abs(rz - r);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy <= dz) rz = -rx - ry;
  const row = rz;
  let col = rx + (row - (row & 1)) / 2;
  if (row < 0 || row >= map.height) return undefined;
  if (map.wrapX) col = ((col % map.width) + map.width) % map.width;
  else if (col < 0 || col >= map.width) return undefined;
  return { col, row };
}
