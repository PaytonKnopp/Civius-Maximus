import { compileFromDirs } from '@cx/content/node';
import {
  applyAction,
  createGame,
  type EngineContext,
  type GameSetup,
  type GameState,
  playAiTurn,
  stateHash,
  turnOrder,
} from '@cx/engine';
import { describe, expect, it } from 'vitest';
import { LocalGame } from './local';
import { makeSave, readSave, SAVE_FORMAT } from './saves';

/**
 * Fuzzing save loading (docs/02-multiplayer.md, "Saving"): a save file comes from disk, from the
 * cloud or from a friend, and may be cut short, edited or from another version. Loading it
 * either gives a game that plays on, or a message a player can act on. It never throws, and a
 * damaged file is never handed to the game screen.
 */

const ctx: EngineContext = { content: compileFromDirs().content! };
const setup: GameSetup = {
  gameId: 'save-fuzz',
  settings: {
    seed: 'save-fuzz',
    turnLimit: 200,
    speed: 'speed_online',
    map: {
      script: 'continents',
      size: 'duel',
      wrapX: true,
      resources: 'standard',
      startBalance: 'normal',
    },
  },
  players: [
    { id: 'p1', name: 'One', kind: 'human' },
    { id: 'p2', name: 'Two', kind: 'ai' },
  ],
};

function playRound(start: GameState): GameState {
  let state = start;
  for (const player of turnOrder(state)) {
    const p = state.players[player]!;
    if (!p.alive || p.turnEnded) continue;
    state = playAiTurn(ctx, state, player, (action) => {
      const r = applyAction(state, action, ctx);
      if (!r.ok) return undefined;
      state = r.state;
      return state;
    });
  }
  return state;
}

function prng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1));
  return { next, int, pick: <T>(list: readonly T[]): T => list[int(0, list.length - 1)]! };
}

let game = createGame(setup, ctx);
for (let i = 0; i < 25; i++) game = playRound(game);
const text = JSON.stringify(makeSave(game, 'Fuzz'));

describe('fuzz: loading saves', () => {
  it('loads what it saved, and the loaded game plays on exactly like the live one', () => {
    const read = readSave(text, ctx);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.updated).toBe(false);
    expect(stateHash(read.save.state)).toBe(stateHash(game));
    let a = game;
    let b = read.save.state;
    for (let i = 0; i < 3; i++) {
      a = playRound(a);
      b = playRound(b);
    }
    expect(stateHash(b)).toBe(stateHash(a));
  });

  it('says what is wrong with files that are not saves', () => {
    const cases: [string, RegExp][] = [
      ['', /isn't a saved game/],
      ['not json at all', /isn't a saved game/],
      ['null', /isn't a saved game/],
      ['[]', /isn't a saved game/],
      ['42', /isn't a saved game/],
      ['{"format":"something-else","state":{}}', /isn't a saved game/],
      [text.slice(0, Math.floor(text.length / 2)), /isn't a saved game/],
      [text.slice(0, text.length - 1), /isn't a saved game/],
      [JSON.stringify({ format: SAVE_FORMAT, version: 99, state: game }), /newer version/],
      [
        JSON.stringify({ format: SAVE_FORMAT, version: 1, state: { stateVersion: 0 } }),
        /older version/,
      ],
      [JSON.stringify({ format: SAVE_FORMAT, version: 1, state: { stateVersion: 1 } }), /damaged/],
      [JSON.stringify({ format: SAVE_FORMAT, version: 1, state: 'a string' }), /older version/],
      [`${text} trailing rubbish`, /isn't a saved game/],
    ];
    for (const [input, message] of cases) {
      const read = readSave(input, ctx);
      expect(read.ok, input.slice(0, 60)).toBe(false);
      if (!read.ok) expect(read.message, input.slice(0, 60)).toMatch(message);
    }
  });

  it('refuses a file too big to be a save without trying to read it', () => {
    const started = performance.now();
    const read = readSave(' '.repeat(65 * 1024 * 1024), ctx);
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.message).toMatch(/too big/);
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it('names content a save needs that this version lacks', () => {
    const other = JSON.parse(text) as { state: GameState };
    other.state.contentHash = 'another-version';
    const unit = Object.values(other.state.units)[0]!;
    unit.type = 'unit_from_a_mod_that_is_off';
    const read = readSave(JSON.stringify(other), ctx);
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.message).toMatch(/doesn't have \(unit_from_a_mod_that_is_off\)/);
  });

  it('survives 400 damaged copies: each is refused with a reason, or loads and plays a turn', () => {
    const rand = prng(99);
    const junk = () =>
      rand.pick<unknown>([
        null,
        undefined,
        -1,
        0,
        1e12,
        1.5,
        '',
        'x',
        [],
        {},
        true,
        'unit_no_such',
        'constructor',
        ['a', 1, null],
        { a: { b: {} } },
      ]);
    /** Every object and array in the save, to pick a place to break. */
    const places = (
      root: unknown,
    ): { parent: Record<string, unknown> | unknown[]; key: string | number }[] => {
      const out: { parent: Record<string, unknown> | unknown[]; key: string | number }[] = [];
      const walk = (v: unknown, depth: number) => {
        if (depth > 5 || !v || typeof v !== 'object') return;
        if (Array.isArray(v)) {
          // A few entries of a long array (the map's tiles) are enough.
          for (let i = 0; i < v.length; i += Math.max(1, Math.floor(v.length / 6))) {
            out.push({ parent: v, key: i });
            walk(v[i], depth + 1);
          }
        } else {
          for (const k of Object.keys(v)) {
            out.push({ parent: v as Record<string, unknown>, key: k });
            walk((v as Record<string, unknown>)[k], depth + 1);
          }
        }
      };
      walk(root, 0);
      return out;
    };
    let refused = 0;
    let loaded = 0;
    let stopped = 0;
    for (let i = 0; i < 400; i++) {
      const copy = JSON.parse(text) as { state: GameState };
      const spots = places(copy);
      // One to three breaks: a field removed, replaced by junk, or an array cut or emptied.
      for (let n = rand.int(1, 3); n > 0; n--) {
        const { parent, key } = rand.pick(spots);
        const how = rand.int(0, 3);
        const box = parent as Record<string | number, unknown>;
        if (how === 0) delete box[key];
        else if (how === 1) box[key] = junk();
        else if (how === 2 && Array.isArray(box[key])) (box[key] as unknown[]).length = 0;
        else if (typeof box[key] === 'number')
          box[key] = rand.pick([NaN, -(box[key] as number), 1e9]);
        else box[key] = junk();
      }
      const broken = JSON.stringify(copy);
      let read: ReturnType<typeof readSave>;
      try {
        read = readSave(broken, ctx);
      } catch (e) {
        throw new Error(`readSave threw on damaged copy ${i}: ${(e as Error).stack}`, {
          cause: e,
        });
      }
      if (!read.ok) {
        expect(read.message.length).toBeGreaterThan(10);
        refused++;
        continue;
      }
      loaded++;
      // What loads must not take the game down: the host starts on it, and the player's End
      // Turn either works or is refused with the problem kept for them to read. The game is
      // never left waiting, and nothing is thrown at the screen.
      let game: LocalGame;
      try {
        game = new LocalGame(read.save.state, ctx);
      } catch (e) {
        throw new Error(
          `damaged copy ${i} loaded but the game couldn't start: ${(e as Error).stack?.split('\n').slice(0, 6).join('\n')}`,
          { cause: e },
        );
      }
      try {
        const before = game.state;
        const r = game.act({ type: 'end_turn', player: 'p1' });
        if (!r.ok) {
          expect(r.error.message.length).toBeGreaterThan(0);
          expect(game.state).toBe(before);
          if (r.error.code === 'game_error') {
            expect(game.takeProblem()).toMatch(/couldn't be done/);
            stopped++;
          }
        }
        expect(game.busy).toBe(false);
      } catch (e) {
        throw new Error(
          `damaged copy ${i} loaded but then failed: ${(e as Error).stack?.split('\n').slice(0, 6).join('\n')}`,
          { cause: e },
        );
      }
    }
    // Most damage is caught at the door; what gets past it rarely stops a turn.
    expect(stopped).toBeLessThan(loaded / 4 + 1);
    expect(refused).toBeGreaterThan(50);
    expect(refused + loaded).toBe(400);
  }, 180_000);
});
