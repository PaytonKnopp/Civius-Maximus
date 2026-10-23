import { getBit } from '../bitset';
import type { EngineContext } from '../context';
import { neighbors } from '../map/hex';
import type { GameState, UnitState } from '../state';
import { fullMoves, hasForeignUnit, hasRoom, stepMoves } from './movement';
import { exploredBits } from './vision';

export interface PathStep {
  tile: number;
  /** Which turn the unit arrives on this tile: 0 = this turn, 1 = next turn, ... */
  turn: number;
  /** Moves left on arrival (hundredths). */
  moves: number;
}

interface Label {
  turn: number;
  moves: number;
  prev: number;
}

/** Binary min-heap keyed by (turn, -moves, tile) for deterministic order. */
class Queue {
  private items: [number, number, number][] = [];
  get size() {
    return this.items.length;
  }
  private less(a: [number, number, number], b: [number, number, number]) {
    return a[0] !== b[0] ? a[0] < b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] < b[2];
  }
  push(item: [number, number, number]) {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(a[i]!, a[p]!)) break;
      [a[i], a[p]] = [a[p]!, a[i]!];
      i = p;
    }
  }
  pop(): [number, number, number] {
    const a = this.items;
    const top = a[0]!;
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.less(a[l]!, a[m]!)) m = l;
        if (r < a.length && this.less(a[r]!, a[m]!)) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m]!, a[i]!];
        i = m;
      }
    }
    return top;
  }
}

/**
 * The best path for a unit to a tile: fewest turns, then most moves left. Only explored tiles are
 * used (so paths never leak what's under the fog). A unit may pass through tiles holding its own
 * player's units but may not stop on one that's full, including where a turn ends mid-path.
 * Returns the steps after the start tile, or null if the target can't be reached.
 */
export function findPath(
  ctx: EngineContext,
  state: GameState,
  unit: UnitState,
  target: number,
  maxTurns = 40,
): PathStep[] | null {
  if (target === unit.tile) return null;
  const explored = exploredBits(state, unit.owner);
  if (!getBit(explored, target) || hasForeignUnit(state, unit, target)) return null;
  if (!hasRoom(ctx, state, unit, target)) return null;
  const full = fullMoves(ctx, unit);
  if (full <= 0) return null;

  const best = new Map<number, Label>();
  best.set(unit.tile, { turn: 0, moves: unit.moves, prev: -1 });
  const queue = new Queue();
  queue.push([0, unit.moves, unit.tile]);
  const better = (a: Label, b: Label | undefined) =>
    !b || a.turn < b.turn || (a.turn === b.turn && a.moves > b.moves);

  while (queue.size > 0) {
    const [turn, moves, tile] = queue.pop();
    const label = best.get(tile)!;
    if (label.turn !== turn || label.moves !== moves) continue; // stale entry
    if (tile === target) break;
    // Out of moves: the unit waits here and continues next turn with full moves.
    const startTurn = moves > 0 ? turn : turn + 1;
    const startMoves = moves > 0 ? moves : full;
    if (startTurn > maxTurns) continue;
    for (const next of neighbors(state.map, tile)) {
      if (!getBit(explored, next) || hasForeignUnit(state, unit, next)) continue;
      const left = stepMoves(ctx, state, unit, tile, next, startMoves);
      if (left === null) continue;
      // Ending a turn on a full tile isn't allowed (passing through is).
      if (left === 0 && next !== target && !hasRoom(ctx, state, unit, next)) continue;
      const candidate: Label = { turn: startTurn, moves: left, prev: tile };
      if (better(candidate, best.get(next))) {
        best.set(next, candidate);
        queue.push([candidate.turn, candidate.moves, next]);
      }
    }
  }

  if (!best.has(target)) return null;
  const steps: PathStep[] = [];
  for (let t = target; t !== unit.tile;) {
    const l = best.get(t)!;
    steps.push({ tile: t, turn: l.turn, moves: l.moves });
    t = l.prev;
  }
  return steps.reverse();
}
