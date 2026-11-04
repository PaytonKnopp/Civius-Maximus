import { gzipSync } from 'node:zlib';
import type { CompiledContent } from '@cx/content';
import {
  type Action,
  applyAction,
  createGame,
  type EngineContext,
  type GameState,
  playAiTurn,
  stateHash,
} from '@cx/engine';
import { simulationSetup } from './simulate';

/**
 * Performance profile of a long all-AI game (docs/01-architecture.md, "Performance targets").
 *
 * Long games must stay smooth, so this plays one and reports, every few turns: how long the world
 * took to process the turn (the wait after everyone ends their turn), how long all the AIs took
 * to think, how big a save is (raw and gzipped), how big the action log is and how much memory
 * is in use. Times are averages over the window since the last row, so one noisy turn doesn't
 * mislead. `checkProfile` turns the numbers into pass/fail for CI.
 */

export interface ProfileOptions {
  players: number;
  /** Turns to play (counted from the saved state when `from` is given). */
  turns: number;
  seed: string;
  size?: string;
  script?: string;
  /** Report a row every N turns. */
  every: number;
  /** Continue a saved game instead of starting one. */
  from?: GameState;
}

export interface ProfileRow {
  turn: number;
  /** Average ms to process a turn (the last `end_turn` of a round), over the window. */
  processMs: number;
  /** Average ms all AI seats spent choosing their moves per turn, over the window. */
  aiMs: number;
  stateKB: number;
  gzipKB: number;
  /** Everything every seat did, so far, as the game's actions (what a replay by actions would hold). */
  logKB: number;
  heapMB: number;
  settlements: number;
  units: number;
}

export interface ProfileResult {
  rows: ProfileRow[];
  state: GameState;
  /** `stateHash` of the final state: equal hashes mean the games played out identically. */
  hash: string;
  slowestProcessMs: number;
}

export function runProfile(
  content: CompiledContent,
  o: ProfileOptions,
  clock: () => number = () => performance.now(),
  onRow?: (row: ProfileRow) => void,
): ProfileResult {
  const ctx: EngineContext = { content };
  let state =
    o.from ??
    createGame(
      simulationSetup({
        players: o.players,
        // The game's own limit is a normal Standard game's, not the turns we choose to play, so a
        // saved state keeps going and the AIs don't change how they play near our stopping point.
        turns: 500,
        seed: o.seed,
        ...(o.size ? { size: o.size } : {}),
        ...(o.script ? { script: o.script } : {}),
      }),
      ctx,
    );
  const stopAt = state.turn + o.turns;
  let logBytes = 0;
  let processTotal = 0;
  let processCount = 0;
  let aiTotal = 0;
  let windowTurns = 0;
  let slowestProcess = 0;
  let lastProcess: number;
  let maxHeap = 0;
  const rows: ProfileRow[] = [];

  const act = (action: Action) => {
    const start = clock();
    const r = applyAction(state, action, ctx);
    if (!r.ok) return undefined;
    if (r.state.turn !== state.turn) lastProcess = clock() - start;
    state = r.state;
    logBytes += JSON.stringify(action).length + 1;
    return state;
  };

  while (state.status === 'playing' && state.turn < stopAt) {
    const turn = state.turn;
    lastProcess = 0;
    const roundStart = clock();
    for (const player of state.playerOrder) {
      const p = state.players[player]!;
      if (!p.alive || p.turnEnded) continue;
      state = playAiTurn(ctx, state, player, act);
    }
    if (state.turn === turn) break; // nobody could end the turn
    const round = clock() - roundStart;
    processTotal += lastProcess;
    processCount++;
    slowestProcess = Math.max(slowestProcess, lastProcess);
    aiTotal += Math.max(0, round - lastProcess);
    windowTurns++;
    maxHeap = Math.max(maxHeap, process.memoryUsage().heapUsed / 1048576);
    // A row every `every` turns, and one at the end unless it would average only a turn or two.
    const ending = state.status !== 'playing' || state.turn >= stopAt;
    if (state.turn % o.every === 0 || (ending && (rows.length === 0 || windowTurns >= 3))) {
      const json = JSON.stringify(state);
      const row: ProfileRow = {
        turn: state.turn,
        processMs: processCount ? processTotal / processCount : 0,
        aiMs: windowTurns ? aiTotal / windowTurns : 0,
        stateKB: json.length / 1024,
        gzipKB: gzipSync(json).length / 1024,
        logKB: logBytes / 1024,
        heapMB: maxHeap,
        settlements: Object.keys(state.settlements).length,
        units: Object.keys(state.units).length,
      };
      rows.push(row);
      onRow?.(row);
      processTotal = processCount = aiTotal = windowTurns = 0;
      maxHeap = 0;
    }
  }
  return { rows, state, hash: stateHash(state), slowestProcessMs: slowestProcess };
}

/** The columns of `formatRow`, for a header line. */
export const PROFILE_HEADER =
  'turn  process(ms)  ai(ms)  save(KB)  gzip(KB)  actions(KB)  heap(MB)  settlements  units';

export function formatRow(r: ProfileRow): string {
  const n = (v: number, w: number) => v.toFixed(0).padStart(w);
  return `${String(r.turn).padStart(4)}  ${n(r.processMs, 11)}  ${n(r.aiMs, 6)}  ${n(r.stateKB, 8)}  ${n(r.gzipKB, 8)}  ${n(r.logKB, 11)}  ${n(r.heapMB, 8)}  ${n(r.settlements, 11)}  ${n(r.units, 5)}`;
}

/**
 * Limits for `cx profile --check`. Times are generous (a slow CI machine runs about 2-3 times
 * slower than a laptop), so the absolute ones only catch gross regressions, such as something
 * that scans the whole map for every tile. The growth limit is the one that matters for "late
 * games get laggy": it compares the last window with the first, so it doesn't depend on the
 * machine. Sizes don't depend on the machine either.
 */
export interface ProfileBudget {
  /** Average ms to process a turn in the last window. */
  processMs: number;
  /** Average ms for all AI seats in the last window. */
  aiMs: number;
  /** How many times slower turn processing may be in the last window than in the first. */
  growth: number;
  /** Raw save size at the end (the database refuses saves over 8 MB). */
  saveKB: number;
  /** Gzipped save size at the end. */
  gzipKB: number;
  /** Highest memory use seen in a window. */
  heapMB: number;
}

export function checkProfile(rows: ProfileRow[], budget: ProfileBudget): string[] {
  const problems: string[] = [];
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (!first || !last) return ['no turns were played'];
  if (last.processMs > budget.processMs)
    problems.push(
      `turn processing averaged ${last.processMs.toFixed(0)} ms (limit ${budget.processMs} ms)`,
    );
  if (last.aiMs > budget.aiMs)
    problems.push(`the AIs averaged ${last.aiMs.toFixed(0)} ms (limit ${budget.aiMs} ms)`);
  if (rows.length >= 2 && first.processMs > 0) {
    const growth = last.processMs / first.processMs;
    if (growth > budget.growth)
      problems.push(
        `turn ${last.turn} takes ${growth.toFixed(1)}x as long to process as turn ${first.turn} (limit ${budget.growth}x)`,
      );
  }
  if (last.stateKB > budget.saveKB)
    problems.push(`a save is ${last.stateKB.toFixed(0)} KB (limit ${budget.saveKB} KB)`);
  if (last.gzipKB > budget.gzipKB)
    problems.push(`a save is ${last.gzipKB.toFixed(0)} KB gzipped (limit ${budget.gzipKB} KB)`);
  const heap = Math.max(...rows.map((r) => r.heapMB));
  if (heap > budget.heapMB)
    problems.push(`memory reached ${heap.toFixed(0)} MB (limit ${budget.heapMB} MB)`);
  return problems;
}

/**
 * What CI checks: an 8-player Standard game to turn 120, which a laptop plays with turn processing
 * around 0.7 s, the AIs 0.3 s, a 1 MB save (45 KB gzipped) and under 250 MB of memory. See
 * docs/01-architecture.md, "Performance targets", for where the game stands against its goals.
 */
export const DEFAULT_BUDGET: ProfileBudget = {
  processMs: 2500,
  aiMs: 1500,
  growth: 5,
  saveKB: 2500,
  gzipKB: 150,
  heapMB: 700,
};
