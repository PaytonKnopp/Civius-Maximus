import { compileFromDirs } from '@cx/content/node';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Action, parseAction } from './actions';
import { playAiTurn } from './ai';
import { turnOrder } from './context';
import { applyAction, createGame, type EngineContext, type GameSetup } from './game';
import { checkInvariants } from './invariants';
import type { GameState } from './state';

/**
 * Fuzzing the engine's front door (docs/01-architecture.md, "Security": every action is
 * validated by the engine, clients are never trusted). Whatever arrives, well-formed or not,
 * the engine either refuses it with a reason or applies it and leaves a sound state. It never
 * throws, and a refused action never changes anything.
 *
 * Actions are generated from the action schema itself, so a new action type is fuzzed the day
 * it is added. A fixed seed keeps a failure reproducible.
 */

const ctx: EngineContext = { content: compileFromDirs().content! };

/** A small seeded generator (mulberry32): the same run every time. */
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
  const pick = <T>(list: readonly T[]): T => list[int(0, list.length - 1)]!;
  return { next, int, pick, chance: (p: number) => next() < p };
}
type Rand = ReturnType<typeof prng>;

const setup: GameSetup = {
  gameId: 'fuzz',
  settings: {
    seed: 'fuzz',
    turnLimit: 200,
    speed: 'speed_online',
    map: {
      script: 'continents',
      size: 'tiny',
      wrapX: true,
      resources: 'standard',
      startBalance: 'normal',
    },
  },
  players: [
    { id: 'p1', name: 'One', kind: 'ai' },
    { id: 'p2', name: 'Two', kind: 'ai' },
    { id: 'p3', name: 'Three', kind: 'ai' },
  ],
};

/** Every seat's AI plays `turns` turns. */
function play(start: GameState, turns: number): GameState {
  let state = start;
  const until = state.turn + turns;
  while (state.status === 'playing' && state.turn < until) {
    const turn = state.turn;
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
    if (state.turn === turn) break;
  }
  return state;
}

interface JsonSchema {
  type?: string;
  const?: unknown;
  enum?: unknown[];
  pattern?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: JsonSchema | boolean;
  propertyNames?: JsonSchema;
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  minimum?: number;
  maximum?: number;
  maxItems?: number;
  default?: unknown;
  $ref?: string;
  $defs?: Record<string, JsonSchema>;
}

/** Ids worth trying where a schema asks for a string: real ones from the game, and nonsense. */
function pools(state: GameState) {
  const content = ctx.content;
  const all = Object.values(content.ids).flat();
  return {
    units: [...Object.keys(state.units), 'u0', 'u999999'],
    settlements: [...Object.keys(state.settlements), 's0', 's999999'],
    deals: [...state.diplomacy.proposals.map((d) => d.id), 'd0', 'd1', 'd42'],
    players: [...Object.keys(state.players), 'p9', 'hostile', 'free', 'nobody', '__proto__'],
    content: [...all, 'no_such_thing', 'constructor', 'toString'],
    tiles: state.map.tiles.length,
  };
}

/** A value the schema accepts (mostly), built from the game's own ids so many are plausible. */
function sample(schema: JsonSchema, rand: Rand, pool: ReturnType<typeof pools>, key = ''): unknown {
  if (schema.$ref) {
    const target = actionSchema.$defs?.[schema.$ref.replace('#/$defs/', '')];
    return target ? sample(target, rand, pool, key) : null;
  }
  if (schema.const !== undefined) return schema.const;
  if (schema.enum) return rand.pick(schema.enum);
  const options = schema.anyOf ?? schema.oneOf;
  if (options) return sample(rand.pick(options), rand, pool, key);
  switch (schema.type) {
    case 'string': {
      const p = schema.pattern ?? '';
      if (p.startsWith('^u')) return rand.pick(pool.units);
      if (p.startsWith('^s')) return rand.pick(pool.settlements);
      if (p.startsWith('^d')) return rand.pick(pool.deals);
      if (p.startsWith('^[a-z]')) return rand.pick(pool.content);
      if (/player|target|from|to|by|cityState|other/i.test(key)) return rand.pick(pool.players);
      return rand.chance(0.7) ? rand.pick(pool.players) : 'A name someone typed';
    }
    case 'integer':
    case 'number': {
      const lo = schema.minimum ?? -5;
      const hi = schema.maximum ?? 1000;
      // Mostly real tiles and small amounts; sometimes the edges of what the schema allows.
      if (rand.chance(0.1)) return rand.pick([lo, hi]);
      return Math.max(lo, Math.min(hi, rand.int(0, Math.min(hi, pool.tiles))));
    }
    case 'boolean':
      return rand.chance(0.5);
    case 'array': {
      const n = rand.int(0, Math.min(schema.maxItems ?? 4, 4));
      return Array.from({ length: n }, () => sample(schema.items ?? {}, rand, pool, key));
    }
    case 'object': {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(schema.properties ?? {})) {
        if (schema.required?.includes(k) || rand.chance(0.6)) out[k] = sample(v, rand, pool, k);
      }
      if (typeof schema.additionalProperties === 'object' && rand.chance(0.6)) {
        for (let i = rand.int(0, 2); i > 0; i--)
          out[String(sample(schema.propertyNames ?? { type: 'string' }, rand, pool, key))] = sample(
            schema.additionalProperties,
            rand,
            pool,
            key,
          );
      }
      return out;
    }
    default:
      return null;
  }
}

const actionSchema = z.toJSONSchema(Action, { io: 'input' }) as JsonSchema;
const actionSchemas = actionSchema.oneOf ?? actionSchema.anyOf ?? [];

describe('fuzz: the action schema', () => {
  it('knows every action type', () => {
    expect(actionSchemas.length).toBeGreaterThan(50);
  });

  it('refuses malformed input with a message, never by throwing', () => {
    const rand = prng(7);
    const junk = (depth = 0): unknown => {
      const kind = rand.int(0, depth > 2 ? 5 : 8);
      if (kind === 0) return null;
      if (kind === 1) return rand.int(-1e9, 1e9);
      if (kind === 2) return rand.chance(0.5);
      if (kind === 3)
        return rand.pick(['', 'end_turn', 'x'.repeat(rand.int(1, 5000)), '🙂', '\u0000']);
      if (kind === 4) return undefined;
      if (kind === 5) return rand.pick([NaN, Infinity, -0, 1.5, 2 ** 53]);
      if (kind === 6) return Array.from({ length: rand.int(0, 4) }, () => junk(depth + 1));
      const out: Record<string, unknown> = {};
      for (let i = rand.int(0, 5); i > 0; i--)
        out[rand.pick(['type', 'player', 'unit', 'to', 'tile', '__proto__', 'constructor', 'x'])] =
          junk(depth + 1);
      return out;
    };
    for (let i = 0; i < 3000; i++) {
      const input = junk();
      const r = parseAction(input);
      if (!r.ok) expect(r.message.length).toBeGreaterThan(0);
    }
    // A real action with one field broken, extra or missing.
    const state = createGame(setup, ctx);
    const pool = pools(state);
    for (let i = 0; i < 3000; i++) {
      const action = sample(rand.pick(actionSchemas), rand, pool) as Record<string, unknown>;
      const keys = Object.keys(action);
      const how = rand.int(0, 3);
      if (how === 0 && keys.length > 0) delete action[rand.pick(keys)];
      else if (how === 1) action[rand.pick(['extra', 'admin', 'state'])] = junk();
      else if (how === 2 && keys.length > 0) action[rand.pick(keys)] = junk();
      else action.type = rand.pick(['', 'cheat', 'END_TURN', 42, null]);
      const r = parseAction(action);
      if (!r.ok) expect(r.message.length).toBeGreaterThan(0);
    }
  });
});

describe('fuzz: applying actions', () => {
  // The start of a game, the early game and the middle of one (with wars, deals, religions).
  const start = createGame(setup, ctx);
  const early = play(start, 10);
  const middle = play(early, 32);

  const run = (name: string, from: GameState, seed: number, count: number) =>
    it(`${name}: ${count} random actions are refused with a reason or leave a sound state`, () => {
      const rand = prng(seed);
      let state = from;
      let applied = 0;
      const refused = new Map<string, number>();
      expect(checkInvariants(ctx, state)).toEqual([]);
      for (let i = 0; i < count; i++) {
        const pool = pools(state);
        const parsed = parseAction(sample(rand.pick(actionSchemas), rand, pool));
        if (!parsed.ok) continue;
        const before = state;
        let r: ReturnType<typeof applyAction>;
        try {
          r = applyAction(state, parsed.action, ctx);
        } catch (e) {
          throw new Error(
            `the engine threw on ${JSON.stringify(parsed.action)} (turn ${state.turn}): ${(e as Error).stack}`,
            { cause: e },
          );
        }
        if (!r.ok) {
          // A refusal says why and changes nothing.
          expect(r.error.code.length, JSON.stringify(parsed.action)).toBeGreaterThan(0);
          expect(r.error.message.length, JSON.stringify(parsed.action)).toBeGreaterThan(0);
          expect(state).toBe(before);
          refused.set(r.error.code, (refused.get(r.error.code) ?? 0) + 1);
          continue;
        }
        applied++;
        const broken = checkInvariants(ctx, r.state);
        if (broken.length > 0)
          throw new Error(
            `after ${JSON.stringify(parsed.action)} (turn ${state.turn}): ${broken.slice(0, 5).join('; ')}`,
          );
        state = r.state;
        if (state.status !== 'playing') break;
      }
      // The generator must reach real rules, not only "no such unit".
      expect(applied).toBeGreaterThan(count / 200);
      expect(refused.size).toBeGreaterThan(10);
    }, 120_000);

  run('turn 1', start, 11, 1000);
  run('the early game', early, 12, 2000);
  run('the middle game', middle, 13, 3000);
});
