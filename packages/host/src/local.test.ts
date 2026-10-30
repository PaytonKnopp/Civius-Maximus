import { compileFromDirs } from '@cx/content/node';
import { describe, expect, it } from 'vitest';
import { stateHash } from '@cx/engine';
import { type AiRunner, LocalGame, runTurn } from './local';
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
