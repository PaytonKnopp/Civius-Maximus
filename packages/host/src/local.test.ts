import { compileFromDirs } from '@cx/content/node';
import { describe, expect, it } from 'vitest';
import { encodeBits, type GameState, neighbors, stateHash } from '@cx/engine';
import { type AiRunner, LocalGame, runTurn, type TurnProgress } from './local';
import { makeSave, readSave } from './saves';

const ctx = { content: compileFromDirs().content! };

const setup = (kinds: ('human' | 'ai')[]) => ({
  gameId: 'local',
  settings: {
    seed: 'local',
    turnLimit: null,
    map: {
      script: 'continents',
      size: 'tiny',
      wrapX: true,
      resources: 'standard' as const,
      startBalance: 'normal' as const,
    },
  },
  players: kinds.map((kind, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, kind })),
});

describe('LocalGame', () => {
  it('lets one human play against AI seats that end their turns', () => {
    const game = new LocalGame(setup(['human', 'ai', 'ai', 'ai']), ctx);
    const seen: string[] = [];
    game.subscribe((_s, events) => seen.push(...events.map((e) => e.type)));
    expect(game.state.players.p2!.turnEnded).toBe(true);
    const r = game.act({ type: 'end_turn', player: 'p1' });
    expect(r.ok).toBe(true);
    expect(game.state.turn).toBe(2);
    expect(game.state.players.p2!.turnEnded).toBe(true);
    expect(seen).toContain('turn_started');
  });

  it('reports progress while the world turns and each rival seat plays', async () => {
    const reports: TurnProgress[] = [];
    const game = new LocalGame(setup(['human', 'ai', 'ai', 'ai']), ctx);
    const from = game.state;
    runTurn(ctx, from, { type: 'end_turn', player: 'p1' }, (p) => reports.push({ ...p }));
    expect(reports[0]).toEqual({ phase: 'world', done: 0, total: 0 });
    const rivals = reports.filter((r) => r.phase === 'rivals');
    // Three rival seats, counted one by one.
    expect(rivals.map((r) => `${r.done}/${r.total}`)).toEqual(['0/3', '1/3', '2/3']);
  });

  it('keeps the latest progress on the game while the runner works, and clears it after', async () => {
    const seen: (TurnProgress | null)[] = [];
    // Like a worker, answers on a later tick, after the screen has subscribed.
    const runner: AiRunner = async (state, action, onProgress) => {
      await new Promise((r) => setTimeout(r, 0));
      return runTurn(ctx, structuredClone(state), action, onProgress);
    };
    const game = new LocalGame(setup(['human', 'ai', 'ai']), ctx, runner);
    await new Promise<void>((done) => {
      const off = game.subscribe(() => {
        seen.push(game.progress);
        if (!game.busy) {
          off();
          done();
        }
      });
    });
    expect(seen.some((p) => p?.phase === 'rivals' && p.total === 2)).toBe(true);
    expect(game.progress).toBeNull();
  });

  it('can run End Turn and the AI turns in a runner, refusing actions meanwhile', async () => {
    let calls = 0;
    const runner: AiRunner = async (state, action) => {
      calls++;
      return runTurn(ctx, structuredClone(state), action);
    };
    const settled = (g: LocalGame) =>
      new Promise<void>((done) => {
        const off = g.subscribe(() => {
          if (!g.busy) {
            off();
            done();
          }
        });
      });
    const sync = new LocalGame(setup(['human', 'ai']), ctx);
    const game = new LocalGame(setup(['human', 'ai']), ctx, runner);
    // The AI's first turn runs in the runner too.
    expect(game.busy).toBe(true);
    await settled(game);
    expect(stateHash(game.state)).toBe(stateHash(sync.state));
    expect(game.act({ type: 'end_turn', player: 'p1' }).ok).toBe(true);
    expect(game.busy).toBe(true);
    const refused = game.act({ type: 'unend_turn', player: 'p1' });
    expect(!refused.ok && refused.error.code).toBe('busy');
    await settled(game);
    sync.act({ type: 'end_turn', player: 'p1' });
    expect(game.state.turn).toBe(2);
    expect(stateHash(game.state)).toBe(stateHash(sync.state));
    expect(Object.isFrozen(game.state.players)).toBe(true);
    expect(calls).toBe(2);
  });

  it('gives AI seats settlements that keep building', () => {
    const game = new LocalGame(setup(['human', 'ai', 'ai']), ctx);
    for (let i = 0; i < 12; i++) game.act({ type: 'end_turn', player: 'p1' });
    for (const p of ['p2', 'p3']) {
      const mine = Object.values(game.state.settlements).filter((s) => s.owner === p);
      expect(mine.length).toBeGreaterThanOrEqual(1);
      expect(
        Object.values(game.state.units).some((u) => u.owner === p && u.type === 'unit_warrior'),
      ).toBe(true);
      const player = game.state.players[p]!;
      expect(player.techs.done.length + player.civics.done.length).toBeGreaterThan(0);
      expect(player.policies.military.length + player.policies.economic.length).toBeGreaterThan(0);
    }
  });

  it('waits for every human in hotseat', () => {
    const game = new LocalGame(setup(['human', 'human']), ctx);
    game.act({ type: 'end_turn', player: 'p1' });
    expect(game.state.turn).toBe(1);
    game.act({ type: 'end_turn', player: 'p2' });
    expect(game.state.turn).toBe(2);
  });

  it('returns rule errors without changing state', () => {
    const game = new LocalGame(setup(['human', 'ai']), ctx);
    const before = game.state;
    const r = game.act({ type: 'end_turn', player: 'p9' });
    expect(r.ok).toBe(false);
    expect(game.state).toBe(before);
  });
});

describe('when the rules themselves fail (a bug)', () => {
  /** A few turns in, with one thing broken that the engine doesn't expect. */
  const broken = (damage: (s: GameState) => void) => {
    const game = new LocalGame(setup(['human', 'ai', 'ai']), ctx);
    for (let i = 0; i < 6; i++) game.act({ type: 'end_turn', player: 'p1' });
    const state = structuredClone(game.state) as GameState;
    damage(state);
    return state;
  };
  /** The world can't take its turn: research has nothing to read. */
  const noResearch = (s: GameState) => {
    (s.players.p1 as unknown as Record<string, unknown>).techs = null;
  };
  /** Only p2's AI trips over this: it looks up a government that doesn't exist. */
  const lostGovernment = (s: GameState) => {
    s.players.p2!.government = 'government_gone';
  };

  it('refuses the action, keeps the game as it was and says what happened', () => {
    const game = new LocalGame(broken(noResearch), ctx);
    const before = game.state;
    const told: number[] = [];
    game.subscribe(() => told.push(game.state.turn));
    const r = game.act({ type: 'end_turn', player: 'p1' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('game_error');
    expect(game.state).toBe(before);
    expect(game.busy).toBe(false);
    expect(told.length).toBeGreaterThan(0);
    expect(game.takeProblem()).toMatch(/^That couldn't be done \(.+\)$/);
    // Asked once: the screen shows it until dismissed.
    expect(game.takeProblem()).toBeNull();
    // The game is still there: it can be saved to send with a report, and the rules still
    // answer other actions in the normal way.
    expect(JSON.stringify(makeSave(game.state, 'report')).length).toBeGreaterThan(1000);
    const other = game.act({ type: 'move_unit', player: 'p1', unit: 'u999999', to: 0 });
    expect(!other.ok && other.error.code).not.toBe('game_error');
    expect(game.takeProblem()).toBeNull();
  });

  it('never leaves the game waiting for rivals when the runner and the page both fail', async () => {
    const start = broken(noResearch);
    let calls = 0;
    // Like the worker: it reports the engine's error, and the page then fails the same way.
    const runner: AiRunner = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 0));
      throw new Error('the worker says no');
    };
    const game = new LocalGame(start, ctx, runner);
    const before = game.state;
    const r = game.act({ type: 'end_turn', player: 'p1' });
    // Handed to the runner: accepted for now, and the game is busy.
    expect(r.ok).toBe(true);
    expect(game.busy).toBe(true);
    await new Promise<void>((done) => {
      const off = game.subscribe(() => {
        if (game.busy) return;
        off();
        done();
      });
    });
    expect(calls).toBe(1);
    expect(game.busy).toBe(false);
    expect(game.progress).toBeNull();
    expect(game.state).toBe(before);
    expect(game.takeProblem()).toMatch(/^This turn couldn't be played \(.+\)$/);
  });

  it('lets an AI seat that fails pass its turn, and the game goes on', () => {
    const start = broken(lostGovernment);
    const work = runTurn(ctx, start, { type: 'end_turn', player: 'p1' });
    expect(work.state.turn).toBe(start.turn + 1);
    expect(work.problems).toHaveLength(1);
    expect(work.problems![0]).toMatch(/^P2 couldn't play its turn \(.+\)$/);
    // The same on the page and in a worker: both end on the same state.
    const again = runTurn(ctx, structuredClone(start), { type: 'end_turn', player: 'p1' });
    expect(stateHash(again.state)).toBe(stateHash(work.state));
    // Through the game: the turn advances and the player is told once.
    const game = new LocalGame(start, ctx);
    expect(game.act({ type: 'end_turn', player: 'p1' }).ok).toBe(true);
    expect(game.state.turn).toBe(start.turn + 1);
    expect(game.takeProblem()).toMatch(/P2 couldn't play its turn/);
    // A healthy game has nothing to report.
    const fine = new LocalGame(setup(['human', 'ai']), ctx);
    fine.act({ type: 'end_turn', player: 'p1' });
    expect(fine.takeProblem()).toBeNull();
  });
});

describe('a long game with raiders', () => {
  it('plays 40 turns without a rules error', { timeout: 60_000 }, () => {
    const s = setup(['human', 'ai', 'ai', 'ai']);
    const game = new LocalGame({ ...s, settings: { ...s.settings, seed: 'raiders' } }, ctx);
    expect(Object.keys(game.state.camps).length).toBeGreaterThan(0);
    for (let i = 0; i < 40; i++) {
      const r = game.act({ type: 'end_turn', player: 'p1' });
      expect(r.ok).toBe(true);
    }
    expect(game.state.turn).toBe(41);
  });
});

describe('saves', () => {
  it('round-trip through JSON and play on', () => {
    const game = new LocalGame(setup(['human', 'ai']), ctx);
    game.act({ type: 'end_turn', player: 'p1' });
    const text = JSON.stringify(makeSave(game.state, 'Test'));
    const read = readSave(text, ctx);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    const loaded = new LocalGame(read.save.state, ctx);
    expect(stateHash(loaded.state)).toBe(stateHash(game.state));
    expect(loaded.act({ type: 'end_turn', player: 'p1' }).ok).toBe(true);
    expect(loaded.state.turn).toBe(3);
  });

  it('refuse non-saves', () => {
    expect(readSave('{"hello":1}', ctx).ok).toBe(false);
    expect(readSave('not json', ctx).ok).toBe(false);
  });

  it('load after an update, with the current rules, while their content still exists', () => {
    const game = new LocalGame(setup(['human', 'ai']), ctx);
    game.act({ type: 'end_turn', player: 'p1' });
    const old = makeSave({ ...game.state, contentHash: 'an earlier version' }, 'Old');
    old.contentHash = 'an earlier version';
    const read = readSave(JSON.stringify(old), ctx);
    expect(read.ok && read.updated).toBe(true);
    if (!read.ok) return;
    expect(read.save.state.contentHash).toBe(ctx.content.hash);
    const loaded = new LocalGame(read.save.state, ctx);
    expect(loaded.act({ type: 'end_turn', player: 'p1' }).ok).toBe(true);
    expect(loaded.state.turn).toBe(3);
  });

  it('refuse saves that need content this version lacks, and say what', () => {
    const game = new LocalGame(setup(['human', 'ai']), ctx);
    const state = JSON.parse(JSON.stringify(game.state)) as typeof game.state;
    state.contentHash = 'a mod';
    Object.values(state.units)[0]!.type = 'unit_sky_whale';
    state.map.tiles[0]!.terrain = 'moon_dust';
    const read = readSave(JSON.stringify(makeSave(state, 'Modded')), ctx);
    expect(!read.ok && read.message).toMatch(/moon_dust, unit_sky_whale\): a mod that's off/);
  });
});

describe('hotseat', () => {
  it('passes the turn from human to human, then advances', () => {
    const game = new LocalGame(setup(['human', 'human', 'ai']), ctx);
    expect(game.humans()).toEqual(['p1', 'p2']);
    expect(game.nextHuman()).toBe('p1');
    game.act({ type: 'end_turn', player: 'p1' });
    expect(game.nextHuman()).toBe('p2');
    expect(game.state.turn).toBe(1);
    game.act({ type: 'end_turn', player: 'p2' });
    expect(game.state.turn).toBe(2);
    expect(game.nextHuman()).toBe('p1');
  });
});

describe('undo for moves (D118)', () => {
  /** A one-human game where p1 already knows the whole map and sees no one else. */
  function alone(kinds: ('human' | 'ai')[] = ['human', 'ai']) {
    const game = new LocalGame(setup(kinds), ctx);
    const s: GameState = structuredClone(game.state);
    const all = encodeBits(new Uint8Array(Math.ceil(s.map.tiles.length / 8)).fill(255));
    for (const id of s.playerOrder) s.players[id]!.explored = all;
    for (const [id, u] of Object.entries(s.units)) if (u.owner !== 'p1') delete s.units[id];
    for (const [id, x] of Object.entries(s.settlements))
      if (x.owner !== 'p1') delete s.settlements[id];
    // No natural wonders to discover (finding one is news).
    for (const t of s.map.tiles)
      if (t.feature && ctx.content.entities.feature[t.feature]?.naturalWonder) t.feature = null;
    game.load(s);
    const warrior = Object.values(s.units).find(
      (u) => u.owner === 'p1' && u.type === 'unit_warrior',
    )!;
    const to = neighbors(s.map, warrior.tile).find(
      (t) => game.act({ type: 'move_unit', player: 'p1', unit: warrior.id, to: t }).ok,
    );
    return { game, before: s, warrior: warrior.id, to };
  }

  it('takes back a move that revealed nothing, and only that', () => {
    const { game, before, warrior, to } = alone();
    expect(to).toBeDefined();
    expect(game.state.units[warrior]!.tile).toBe(to);
    expect(game.canUndo()).toBe(true);
    expect(game.undo()).toBe(true);
    expect(stateHash(game.state)).toBe(stateHash(before));
    expect(game.canUndo()).toBe(false);
    // Anything other than a move closes the door.
    game.act({ type: 'move_unit', player: 'p1', unit: warrior, to: to! });
    expect(game.canUndo()).toBe(true);
    game.act({ type: 'skip_unit', player: 'p1', unit: warrior });
    expect(game.canUndo()).toBe(false);
  });

  it('never in hotseat, nor after a move that explored new land', () => {
    expect(alone(['human', 'human']).game.canUndo()).toBe(false);
    const game = new LocalGame(setup(['human', 'ai']), ctx);
    const s: GameState = structuredClone(game.state);
    const scout = Object.values(s.units).find((u) => u.owner === 'p1' && u.type === 'unit_scout')!;
    // p1 knows only the scout's tile and the ring around it: any step shows something new.
    const known = new Uint8Array(Math.ceil(s.map.tiles.length / 8));
    for (const t of [scout.tile, ...neighbors(s.map, scout.tile)]) known[t >> 3]! |= 1 << (t & 7);
    s.players.p1!.explored = encodeBits(known);
    game.load(s);
    const moved = neighbors(s.map, scout.tile).some(
      (t) => game.act({ type: 'move_unit', player: 'p1', unit: scout.id, to: t }).ok,
    );
    expect(moved).toBe(true);
    expect(game.canUndo()).toBe(false);
  });
});
