import { compileFromDirs } from '@cx/content/node';
import { describe, expect, it } from 'vitest';
import { LocalGame } from './local';

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
