import type { CompiledContent } from '@cx/content';
import {
  type Action,
  applyAction,
  createGame,
  type EngineContext,
  type GameEvent,
  type GameSetup,
  type GameState,
  militaryStrength,
  playAiTurn,
  scoreOf,
  settlementsOf,
} from '@cx/engine';

/**
 * AI-vs-AI games (docs/01-architecture.md, "Testing strategy"): every seat is an AI, optionally
 * with one "AFK" seat that only ends its turn. Reports what happened, turn timings and the result.
 */

export interface SimOptions {
  players: number;
  turns: number;
  seed: string;
  size?: string;
  script?: string;
  /** Seat p1 founds its capital and then only ends turns. */
  afk?: boolean;
  /** Print a status line every N turns (0 = never). */
  every?: number;
}

export interface SimResult {
  state: GameState;
  /** Slowest AI turn (ms) and the average. */
  slowest: number;
  average: number;
  events: Record<string, number>;
  rejected: Record<string, number>;
  lines: string[];
}

export function simulationSetup(o: SimOptions): GameSetup {
  const size =
    o.size ??
    (o.players <= 2 ? 'duel' : o.players <= 4 ? 'tiny' : o.players <= 6 ? 'small' : 'standard');
  return {
    gameId: `sim-${o.seed}`,
    settings: {
      seed: o.seed,
      turnLimit: o.turns,
      map: {
        script: o.script ?? 'continents',
        size,
        wrapX: true,
        resources: 'standard',
        startBalance: 'normal',
      },
    },
    players: Array.from({ length: o.players }, (_, i) => ({
      id: `p${i + 1}`,
      name: `AI ${i + 1}`,
      kind: o.afk && i === 0 ? ('human' as const) : ('ai' as const),
    })),
  };
}

export function runSimulation(content: CompiledContent, o: SimOptions, clock = () => 0): SimResult {
  const ctx: EngineContext = { content };
  let state = createGame(simulationSetup(o), ctx);
  const events: Record<string, number> = {};
  const rejected: Record<string, number> = {};
  const lines: string[] = [];
  let slowest = 0;
  let total = 0;
  let count = 0;
  const count1 = (e: GameEvent) => (events[e.type] = (events[e.type] ?? 0) + 1);
  const act = (action: Action) => {
    const r = applyAction(state, action, ctx);
    if (!r.ok) {
      const key = `${action.type}:${r.error.code}`;
      rejected[key] = (rejected[key] ?? 0) + 1;
      return undefined;
    }
    state = r.state;
    r.events.forEach(count1);
    return state;
  };
  while (state.status === 'playing') {
    const turn = state.turn;
    for (const player of state.playerOrder) {
      const p = state.players[player]!;
      if (!p.alive || p.turnEnded) continue;
      if (p.kind === 'human') {
        // AFK: found the capital, then only end turns.
        const settler = Object.values(state.units).find(
          (u) =>
            u.owner === player &&
            content.entities.unit[u.type]!.actions.includes('found_settlement'),
        );
        if (settler && settlementsOf(state, player).length === 0)
          act({ type: 'found_settlement', player, unit: settler.id });
        act({ type: 'end_turn', player });
        continue;
      }
      const start = clock();
      state = playAiTurn(ctx, state, player, act);
      const ms = clock() - start;
      slowest = Math.max(slowest, ms);
      total += ms;
      count++;
    }
    if (state.turn === turn) break; // nobody could end the turn
    if (o.every && (state.turn % o.every === 0 || state.status !== 'playing'))
      lines.push(statusLine(ctx, state));
  }
  return { state, slowest, average: count ? total / count : 0, events, rejected, lines };
}

export function statusLine(ctx: EngineContext, state: GameState): string {
  const parts = state.playerOrder.map((id) => {
    const p = state.players[id]!;
    if (!p.alive) return `${id}: out`;
    const s = settlementsOf(state, id);
    const cities = s.filter((x) => x.kind === 'city').length;
    const pop = s.reduce((sum, x) => sum + x.population, 0);
    return `${id} ${s.length}(${cities}c) pop${pop} t${p.techs.done.length} c${p.civics.done.length} army${militaryStrength(ctx, state, id)} score${scoreOf(ctx, state, id).total}`;
  });
  return `turn ${state.turn} wars ${state.wars.length} | ${parts.join(' | ')}`;
}
