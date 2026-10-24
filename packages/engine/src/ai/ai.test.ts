import { compileFromDirs } from '@cx/content/node';
import { describe, expect, it } from 'vitest';
import type { Action } from '../actions';
import { applyAction, createGame, type EngineContext, type GameSetup } from '../game';
import { stateHash } from '../hash';
import { settlementsOf } from '../settlements/rules';
import type { GameState } from '../state';
import { playAiTurn } from './index';
import { militaryStrength, personalityOf, roleOf } from './turn';

const ctx: EngineContext = { content: compileFromDirs().content! };

function setup(
  players: number,
  seed: string,
  size: string,
  script: string,
  afk = false,
): GameSetup {
  return {
    gameId: `ai-${seed}`,
    settings: {
      seed,
      turnLimit: null,
      map: { script, size, wrapX: true, resources: 'standard', startBalance: 'normal' },
    },
    players: Array.from({ length: players }, (_, i) => ({
      id: `p${i + 1}`,
      name: `Player ${i + 1}`,
      kind: afk && i === 0 ? ('human' as const) : ('ai' as const),
    })),
  };
}

/** Plays until `turns` or the end; human seats found their capital and then only end turns. */
function play(state: GameState, turns: number) {
  const refused: string[] = [];
  const act = (action: Action) => {
    const r = applyAction(state, action, ctx);
    if (!r.ok) {
      refused.push(`${action.type}:${r.error.code}`);
      return undefined;
    }
    state = r.state;
    return state;
  };
  while (state.status === 'playing' && state.turn <= turns) {
    const turn = state.turn;
    for (const player of state.playerOrder) {
      const p = state.players[player]!;
      if (!p.alive || p.turnEnded) continue;
      if (p.kind === 'human') {
        const settler = Object.values(state.units).find(
          (u) => u.owner === player && u.type === 'unit_settler',
        );
        if (settler && settlementsOf(state, player).length === 0)
          act({ type: 'found_settlement', player, unit: settler.id });
        act({ type: 'end_turn', player });
      } else state = playAiTurn(ctx, state, player, act);
    }
    if (state.status === 'playing' && state.turn === turn)
      throw new Error(`turn ${turn} never ended`);
  }
  return { state, refused };
}

describe('AI', () => {
  it('reads personalities from leaders and roles from unit stats', () => {
    const state = createGame(setup(2, '1', 'duel', 'pangaea'), ctx);
    const leader = ctx.content.entities.leader[state.players.p1!.leader]!;
    expect(personalityOf(ctx, state, 'p1')).toEqual(leader.personality);
    const role = (id: string) => {
      const def = ctx.content.entities.unit[id]!;
      return roleOf(def, ctx.content.entities.unitClass[def.class]!);
    };
    expect(role('unit_settler')).toBe('settler');
    expect(role('unit_scout')).toBe('explorer');
    expect(role('unit_warrior')).toBe('melee');
    expect(role('unit_archer')).toBe('ranged');
    expect(role('unit_catapult')).toBe('siege');
    expect(role('unit_galley')).toBe('naval');
  });

  it('plays a 4-player game: expands, builds, researches, and is deterministic', () => {
    const start = createGame(setup(4, '7', 'tiny', 'continents'), ctx);
    const a = play(start, 80);
    for (const id of a.state.playerOrder) {
      const p = a.state.players[id]!;
      if (!p.alive) continue;
      expect(settlementsOf(a.state, id).length, `${id} settlements`).toBeGreaterThanOrEqual(2);
      expect(p.techs.done.length, `${id} techs`).toBeGreaterThanOrEqual(8);
      expect(p.civics.done.length, `${id} civics`).toBeGreaterThanOrEqual(4);
      expect(militaryStrength(ctx, a.state, id), `${id} army`).toBeGreaterThan(0);
    }
    // The AI only sends actions the engine accepts, give or take blocked paths.
    expect(a.refused.filter((r) => !r.startsWith('move_unit:no_path'))).toEqual([]);
    // Same game, same moves.
    expect(stateHash(play(start, 80).state)).toBe(stateHash(a.state));
  }, 180_000);

  it('beats a player who does nothing', () => {
    const { state } = play(createGame(setup(2, '2', 'duel', 'pangaea', true), ctx), 200);
    expect(state.result).toEqual({ reason: 'conquest', winner: 'p2' });
  }, 180_000);
});
