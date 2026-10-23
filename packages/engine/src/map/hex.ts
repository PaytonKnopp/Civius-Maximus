/**
 * Hex grid math. Tiles are pointy-top hexes stored row by row ("odd-r" offset layout: odd rows
 * are shifted half a tile right). Maps can wrap east-west. Tile index = row * width + col.
 *
 * Directions, clockwise from east: 0 E, 1 NE, 2 NW, 3 W, 4 SW, 5 SE.
 */

export interface Grid {
  width: number;
  height: number;
  wrapX: boolean;
}

export type Direction = 0 | 1 | 2 | 3 | 4 | 5;
export const DIRECTIONS: readonly Direction[] = [0, 1, 2, 3, 4, 5];
export const NO_TILE = -1;

const EVEN_ROW: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, -1],
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];
const ODD_ROW: readonly (readonly [number, number])[] = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [0, 1],
  [1, 1],
];

export const opposite = (d: Direction): Direction => ((d + 3) % 6) as Direction;

export function colRow(grid: Grid, index: number): [number, number] {
  return [index % grid.width, Math.floor(index / grid.width)];
}

export function tileIndex(grid: Grid, col: number, row: number): number {
  if (row < 0 || row >= grid.height) return NO_TILE;
  if (grid.wrapX) col = ((col % grid.width) + grid.width) % grid.width;
  else if (col < 0 || col >= grid.width) return NO_TILE;
  return row * grid.width + col;
}

/** The neighbor in a direction, or NO_TILE past the top/bottom (or the sides, if not wrapping). */
export function neighbor(grid: Grid, index: number, dir: Direction): number {
  const [col, row] = colRow(grid, index);
  const [dc, dr] = (row & 1 ? ODD_ROW : EVEN_ROW)[dir]!;
  return tileIndex(grid, col + dc, row + dr);
}

/** All existing neighbors, in direction order. */
export function neighbors(grid: Grid, index: number): number[] {
  const out: number[] = [];
  for (const d of DIRECTIONS) {
    const n = neighbor(grid, index, d);
    if (n !== NO_TILE) out.push(n);
  }
  return out;
}

/** The direction from `a` to adjacent tile `b`, or undefined if they aren't adjacent. */
export function directionTo(grid: Grid, a: number, b: number): Direction | undefined {
  return DIRECTIONS.find((d) => neighbor(grid, a, d) === b);
}

function axial(grid: Grid, index: number): [number, number] {
  const [col, row] = colRow(grid, index);
  return [col - (row - (row & 1)) / 2, row];
}

/** Steps between two tiles, taking the short way around on wrapping maps. */
export function distance(grid: Grid, a: number, b: number): number {
  const [aq, ar] = axial(grid, a);
  const [bq, br] = axial(grid, b);
  const dr = br - ar;
  let best = Infinity;
  for (const shift of grid.wrapX ? [-grid.width, 0, grid.width] : [0]) {
    const dq = bq + shift - aq;
    best = Math.min(best, (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2);
  }
  return best;
}

/**
 * Tiles on the straight line from `a` to `b` (both included), taking the short way around on
 * wrapping maps. `nudge` shifts the line slightly to one side; lines that pass exactly between two
 * tiles are checked with both nudges by line-of-sight.
 */
export function hexLine(grid: Grid, a: number, b: number, nudge: 1 | -1 = 1): number[] {
  const [aq, ar] = axial(grid, a);
  const [bq0, br] = axial(grid, b);
  let bq = bq0;
  if (grid.wrapX) {
    let best = Infinity;
    let bestQ = bq;
    for (const shift of [-grid.width, 0, grid.width]) {
      const dq = bq + shift - aq;
      const dr = br - ar;
      const d = (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
      if (d < best) {
        best = d;
        bestQ = bq + shift;
      }
    }
    bq = bestQ;
  }
  const n = (Math.abs(bq - aq) + Math.abs(br - ar) + Math.abs(bq - aq + br - ar)) / 2;
  const out: number[] = [];
  const eps = 1e-6 * nudge;
  for (let i = 0; i <= n; i++) {
    const t = n === 0 ? 0 : i / n;
    // Cube lerp + rounding (basic arithmetic only, so every engine agrees).
    const x = aq + eps + (bq - aq) * t;
    const z = ar + eps + (br - ar) * t;
    const y = -x - z;
    let rx = Math.round(x);
    let rz = Math.round(z);
    const ry = Math.round(y);
    const dx = Math.abs(rx - x);
    const dy = Math.abs(ry - y);
    const dz = Math.abs(rz - z);
    if (dx > dy && dx > dz) rx = -ry - rz;
    else if (dy <= dz) rz = -rx - ry;
    const tile = tileIndex(grid, rx + (rz - (rz & 1)) / 2, rz);
    if (tile !== NO_TILE && out[out.length - 1] !== tile) out.push(tile);
  }
  return out;
}

/** Every tile within `radius` steps (the tile itself included), nearest first. */
export function tilesWithin(grid: Grid, center: number, radius: number): number[] {
  const seen = new Set([center]);
  const out = [center];
  let frontier = [center];
  for (let r = 0; r < radius; r++) {
    const next: number[] = [];
    for (const t of frontier) {
      for (const n of neighbors(grid, t)) {
        if (seen.has(n)) continue;
        seen.add(n);
        next.push(n);
      }
    }
    out.push(...next);
    frontier = next;
  }
  return out;
}

// --- Rivers run along tile edges -------------------------------------------------------------
//
// Each edge is stored once, on the tile that "owns" it: every tile owns its E, SW and SE edges
// (bits 0, 1, 2 of `river`). The other three edges belong to the neighbors on those sides.

const OWNED_BIT: Partial<Record<Direction, number>> = { 0: 1, 4: 2, 5: 4 };

function edgeSlot(
  grid: Grid,
  index: number,
  dir: Direction,
): { tile: number; bit: number } | undefined {
  const own = OWNED_BIT[dir];
  if (own !== undefined)
    return neighbor(grid, index, dir) === NO_TILE ? undefined : { tile: index, bit: own };
  const other = neighbor(grid, index, dir);
  if (other === NO_TILE) return undefined;
  return { tile: other, bit: OWNED_BIT[opposite(dir)]! };
}

export function hasRiverEdge(
  grid: Grid,
  rivers: ArrayLike<number>,
  index: number,
  dir: Direction,
): boolean {
  const slot = edgeSlot(grid, index, dir);
  return slot !== undefined && (rivers[slot.tile]! & slot.bit) !== 0;
}

export function setRiverEdge(grid: Grid, rivers: number[], index: number, dir: Direction): void {
  const slot = edgeSlot(grid, index, dir);
  if (slot) rivers[slot.tile] = rivers[slot.tile]! | slot.bit;
}

export function isOnRiver(grid: Grid, rivers: ArrayLike<number>, index: number): boolean {
  return DIRECTIONS.some((d) => hasRiverEdge(grid, rivers, index, d));
}

// --- Vertices (hex corners) ------------------------------------------------------------------
//
// Rivers flow from corner to corner. Every corner is either the top (N) corner of exactly one
// tile, or the bottom (S) corner of exactly one tile, so corner id = tile * 2 + (0 for N, 1 for S).

export type Vertex = number;
const N = 0;
const S = 1;

/** The (up to 3) tiles touching a corner. */
export function vertexTiles(grid: Grid, v: Vertex): number[] {
  const tile = v >> 1;
  const sides: Direction[] = (v & 1) === N ? [2, 1] : [4, 5];
  return [tile, ...sides.map((d) => neighbor(grid, tile, d))].filter((t) => t !== NO_TILE);
}

/** Corners one edge away, with the two tiles that edge separates. */
export function vertexNeighbors(
  grid: Grid,
  v: Vertex,
): { vertex: Vertex; between: [number, number] }[] {
  const tile = v >> 1;
  const out: { vertex: Vertex; between: [number, number] }[] = [];
  const push = (vertexTile: number, kind: number, a: number, b: number) => {
    if (vertexTile !== NO_TILE && a !== NO_TILE && b !== NO_TILE) {
      out.push({ vertex: vertexTile * 2 + kind, between: [a, b] });
    }
  };
  if ((v & 1) === N) {
    const nw = neighbor(grid, tile, 2);
    const ne = neighbor(grid, tile, 1);
    push(nw, S, tile, nw);
    push(ne, S, tile, ne);
    push(nw === NO_TILE ? NO_TILE : neighbor(grid, nw, 1), S, nw, ne);
  } else {
    const sw = neighbor(grid, tile, 4);
    const se = neighbor(grid, tile, 5);
    push(sw, N, tile, sw);
    push(se, N, tile, se);
    push(sw === NO_TILE ? NO_TILE : neighbor(grid, sw, 5), N, sw, se);
  }
  return out;
}
