import { compileContent } from '@cx/content';
import { compileFromDirs, readPackageDir } from '@cx/content/node';
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { type Action, parseAction } from './actions';
import { applyAction, createGame, type EngineContext, type GameSetup, MAX_PLAYERS } from './game';
import { stateHash } from './hash';
import { type Replay, runReplay } from './replay';
import { availableNodes, availablePolicies } from './progress/rules';
import { policySlots } from './progress/sources';
import { settlementIds } from './settlements/rules';
import { bestDevelopChoice } from './settlements/handlers';
import type { GameState } from './state';

const ctx: EngineContext = { content: compileFromDirs().content! };

function setup(
  playerCount: number,
  turnLimit: number | null = null,
  camps = false,
  cityStates = camps,
): GameSetup {
  return {
    gameId: 'test-game',
    settings: {
      seed: 'seed-1',
      turnLimit,
      camps,
      cityStates,
      map: {
        script: 'continents',
        size:
          playerCount <= 2
            ? 'duel'
            : playerCount <= 4
              ? 'tiny'
              : playerCount <= 8
                ? 'standard'
                : 'huge',
        wrapX: true,
        resources: 'standard',
        startBalance: 'normal',
      },
    },
    players: Array.from({ length: playerCount }, (_, i) => ({
      id: `p${i + 1}`,
      name: `Player ${i + 1}`,
      kind: i % 3 === 2 ? ('ai' as const) : ('human' as const),
    })),
  };
}

function apply(state: GameState, ...actions: Action[]): GameState {
  for (const action of actions) {
    const result = applyAction(state, action, ctx);
    if (!result.ok) throw new Error(`${action.type} by ${action.player}: ${result.error.message}`);
    state = result.state;
  }
  return state;
}

const endAll = (state: GameState): Action[] =>
  state.playerOrder
    .filter((id) => state.players[id]!.alive)
    .map((player) => ({ type: 'end_turn', player }));

describe('createGame', () => {
  it('supports 1 to MAX_PLAYERS players with no 2-player assumptions', () => {
    for (const n of [1, 2, 4, 8, MAX_PLAYERS]) {
      const state = createGame(setup(n), ctx);
      expect(state.playerOrder).toHaveLength(n);
      expect(state.turn).toBe(1);
    }
    expect(() => createGame(setup(0), ctx)).toThrow(RangeError);
    expect(() => createGame(setup(MAX_PLAYERS + 1), ctx)).toThrow(RangeError);
  });

  it('rejects duplicate player ids', () => {
    const s = setup(2);
    s.players[1]!.id = 'p1';
    expect(() => createGame(s, ctx)).toThrow('unique');
  });

  it('orders players by id regardless of setup order', () => {
    const s = setup(3);
    s.players.reverse();
    expect(createGame(s, ctx).playerOrder).toEqual(['p1', 'p2', 'p3']);
  });

  it('is deterministic, and the seed matters', () => {
    expect(stateHash(createGame(setup(8), ctx))).toBe(stateHash(createGame(setup(8), ctx)));
    const other = setup(8);
    other.settings.seed = 'seed-2';
    expect(createGame(other, ctx).rng).not.toEqual(createGame(setup(8), ctx).rng);
  });

  it('records the content it was created with', () => {
    expect(createGame(setup(2), ctx).contentHash).toBe(ctx.content.hash);
  });
});

describe('simultaneous turns', () => {
  it('advances only when every living player has ended their turn (8 players)', () => {
    let state = createGame(setup(8), ctx);
    const actions = endAll(state);
    state = apply(state, ...actions.slice(0, 7));
    expect(state.turn).toBe(1);
    expect(state.playerOrder.filter((id) => state.players[id]!.turnEnded)).toHaveLength(7);

    const last = applyAction(state, actions[7]!, ctx);
    expect(last.ok && last.state.turn).toBe(2);
    expect(last.ok && last.events.map((e) => e.type)).toEqual([
      'turn_ended_by_player',
      'turn_started',
    ]);
    expect(
      last.ok && last.state.playerOrder.every((id) => !last.state.players[id]!.turnEnded),
    ).toBe(true);
  });

  it('lets a player take back End Turn before the turn advances', () => {
    let state = createGame(setup(3), ctx);
    state = apply(state, { type: 'end_turn', player: 'p1' }, { type: 'unend_turn', player: 'p1' });
    state = apply(state, { type: 'end_turn', player: 'p2' }, { type: 'end_turn', player: 'p3' });
    expect(state.turn).toBe(1);
    expect(apply(state, { type: 'end_turn', player: 'p1' }).turn).toBe(2);
  });

  it('rejects ending twice, un-ending without ending, and unknown players', () => {
    const state = apply(createGame(setup(2), ctx), { type: 'end_turn', player: 'p1' });
    const twice = applyAction(state, { type: 'end_turn', player: 'p1' }, ctx);
    expect(!twice.ok && twice.error.code).toBe('already_ended');
    const unend = applyAction(state, { type: 'unend_turn', player: 'p2' }, ctx);
    expect(!unend.ok && unend.error.code).toBe('not_ended');
    const ghost = applyAction(state, { type: 'end_turn', player: 'p9' }, ctx);
    expect(!ghost.ok && ghost.error.code).toBe('not_playing');
  });

  it('does not wait for eliminated players', () => {
    const state = produce(createGame(setup(3), ctx), (d) => {
      d.players.p2!.alive = false;
    });
    const next = apply(
      state,
      { type: 'end_turn', player: 'p1' },
      { type: 'end_turn', player: 'p3' },
    );
    expect(next.turn).toBe(2);
    const dead = applyAction(next, { type: 'end_turn', player: 'p2' }, ctx);
    expect(!dead.ok && dead.error.code).toBe('not_playing');
  });

  it('ends the game at the turn limit', () => {
    let state = createGame(setup(2, 3), ctx);
    for (let t = 0; t < 3; t++) state = apply(state, ...endAll(state));
    expect(state.status).toBe('ended');
    expect(state.turn).toBe(3);
    const after = applyAction(state, { type: 'end_turn', player: 'p1' }, ctx);
    expect(!after.ok && after.error.code).toBe('game_over');
  });

  it('refuses to run a game with different content than it started with', () => {
    const modded: EngineContext = {
      content: compileFromDirs([
        new URL('../../content/test-fixtures/good-mod', import.meta.url).pathname,
      ]).content!,
    };
    const result = applyAction(
      createGame(setup(2), ctx),
      { type: 'end_turn', player: 'p1' },
      modded,
    );
    expect(!result.ok && result.error.code).toBe('content_mismatch');
  });

  it('never mutates the previous state', () => {
    const before = createGame(setup(2), ctx);
    const hash = stateHash(before);
    apply(before, { type: 'end_turn', player: 'p1' }, { type: 'end_turn', player: 'p2' });
    expect(stateHash(before)).toBe(hash);
    expect(before.turn).toBe(1);
  });
});

describe('parseAction', () => {
  it('accepts valid actions and rejects anything else', () => {
    expect(parseAction({ type: 'end_turn', player: 'p1' })).toEqual({
      ok: true,
      action: { type: 'end_turn', player: 'p1' },
    });
    expect(parseAction({ type: 'nuke_everyone', player: 'p1' }).ok).toBe(false);
    expect(parseAction({ type: 'end_turn', player: 'p1', extra: 1 }).ok).toBe(false);
    expect(parseAction('end_turn').ok).toBe(false);
  });
});

describe('replays', () => {
  /**
   * A scripted 8-player game: 25 turns. Everyone founds a capital on turn 1, builds, and develops
   * tiles as they grow, with players changing their minds about ending turns along the way.
   */
  function scriptedReplay(): { replay: Replay; state: GameState } {
    // With hostile camps: raiders move and fight, and must replay exactly too.
    const s = setup(8, 25, true);
    let state = createGame(s, ctx);
    const actions: Action[] = [];
    const play = (...more: Action[]) => {
      state = apply(state, ...more);
      actions.push(...more);
    };
    for (const player of state.playerOrder) {
      const settler = Object.values(state.units).find(
        (u) => u.owner === player && u.type === 'unit_settler',
      )!;
      play({ type: 'found_settlement', player, unit: settler.id });
      const capital = state.players[player]!.capital!;
      play({
        type: 'set_queue',
        player,
        settlement: capital,
        queue: [
          { kind: 'unit', id: 'unit_warrior' },
          { kind: 'building', id: 'building_monument' },
          { kind: 'unit', id: 'unit_settler' },
        ],
      });
    }
    for (let turn = 1; turn <= 25; turn++) {
      for (const player of state.playerOrder) {
        const p = state.players[player]!;
        // Keep both trees busy, cheapest available first.
        if (!p.techs.current) {
          const tech = availableNodes(ctx, p, 'tech')[0];
          if (tech) play({ type: 'set_research', player, tech });
        }
        if (!p.civics.current) {
          const civic = availableNodes(ctx, p, 'civic')[0];
          if (civic) play({ type: 'set_civic', player, civic });
        }
        // Fill empty policy slots while changes are free.
        if (state.players[player]!.policyWindow) {
          const slots = policySlots(ctx, state, player);
          const fill = {
            military: [] as string[],
            economic: [] as string[],
            diplomatic: [] as string[],
            wildcard: [] as string[],
          };
          for (const id of availablePolicies(ctx, state.players[player]!)) {
            const kind = ctx.content.entities.policy[id]!.slot;
            if (fill[kind].length < slots[kind]) fill[kind].push(id);
          }
          play({ type: 'set_policies', player, policies: fill });
        }
      }
      for (const id of settlementIds(state)) {
        const settlement = state.settlements[id]!;
        const choice = bestDevelopChoice(ctx, state, settlement);
        if (settlement.pendingDevelop > 0 && choice) {
          play({ type: 'develop_tile', player: settlement.owner, settlement: id, ...choice });
        }
      }
      const order = endAll(state);
      // Rotate who ends first each turn, and have someone un-end and re-end.
      const rotated = [...order.slice(turn % 8), ...order.slice(0, turn % 8)];
      const changesMind = rotated[0]!.player;
      const turnActions: Action[] = [
        rotated[0]!,
        { type: 'unend_turn', player: changesMind },
        ...rotated.slice(1),
        { type: 'end_turn', player: changesMind },
      ];
      state = apply(state, ...turnActions);
      actions.push(...turnActions);
    }
    return { replay: { setup: s, actions }, state };
  }

  // Playing the scripted game is the slow part (8 players, 25 turns): do it once for all three.
  let scripted: ReturnType<typeof scriptedReplay> | undefined;
  const played = () => (scripted ??= scriptedReplay());
  // These play whole games, so they get more time than ordinary tests.
  const LONG = 30_000;

  it('rebuild the exact same game every time', { timeout: LONG }, () => {
    const { replay, state } = played();
    const a = runReplay(structuredClone(replay), ctx);
    expect(a.hash).toBe(stateHash(state));
    expect(a.state.status).toBe('ended');
    const civs = Object.values(a.state.settlements).filter((x) =>
      a.state.playerOrder.includes(x.owner),
    );
    expect(civs).toHaveLength(8);
    expect(civs.every((x) => x.population > 1)).toBe(true);
    expect(Object.keys(a.state.cityStates).length).toBeGreaterThan(0);
    const players = a.state.playerOrder.map((id) => a.state.players[id]!);
    expect(players.every((p) => p.techs.done.length >= 1)).toBe(true);
    expect(players.every((p) => p.civics.done.length >= 2)).toBe(true);
    expect(Object.keys(a.state.camps).length).toBeGreaterThan(0);
  });

  it(
    'match a recorded golden hash (fails if a rules change would break old saves)',
    {
      timeout: LONG,
    },
    () => {
      // Uses a frozen copy of the content so balance changes to base data don't trip it;
      // only changes to the engine's rules or state shape do. If you change those on purpose,
      // update this hash and note it in the changelog: older saves and replays will need migrating.
      const frozen = compileContent([
        readPackageDir(new URL('../test-fixtures/frozen-content', import.meta.url).pathname),
      ]).content!;
      expect(runReplay(played().replay, { content: frozen }).hash).toMatchInlineSnapshot(
        `"89edf118631480c2fcc7884093"`,
      );
    },
  );

  it('report where a replay diverges', { timeout: LONG }, () => {
    const replay = structuredClone(played().replay);
    // Drop an unend_turn, so a later end_turn becomes illegal.
    replay.actions.splice(
      replay.actions.findIndex((a) => a.type === 'unend_turn'),
      1,
    );
    expect(() => runReplay(replay, ctx)).toThrow(/Replay diverged at action \d+ \(end_turn\)/);
  });
});
