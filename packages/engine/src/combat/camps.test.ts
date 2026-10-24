import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { Action } from '../actions';
import { HOSTILE } from '../context';
import type { GameEvent } from '../events';
import { applyAction, createGame } from '../game';
import { distance } from '../map/hex';
import { foundSettlement } from '../settlements/handlers';
import { foundingProblem, happinessOf } from '../settlements/rules';
import type { GameState } from '../state';
import { act, addUnit, at, ctx, endTurn, testState } from '../testing/world';
import { fullMoves } from '../units/movement';
import { availablePromotions } from '../units/promotions';
import { hostilePlayer } from './camps';
import { previewAttack } from './strength';

const err = (s: GameState, action: Action) => {
  const r = applyAction(s, action, ctx);
  return r.ok ? undefined : r.error.code;
};
const FIELD = ['............', '............', '............', '............', '............'];

/** A field with raiders: a camp at (9, 2) and the raiders' owner in the game. */
function wilds(): GameState {
  const s = testState(FIELD);
  s.players = { ...s.players, [HOSTILE]: hostilePlayer(ctx, s) };
  s.camps = { c900: { id: 'c900', tile: at(s, 9, 2), units: [], nextUnit: 99 } };
  return s;
}

describe('hostile camps', () => {
  it('are placed at the start, away from every start, each with a raider', () => {
    const s = createGame(
      {
        gameId: 'camps',
        settings: {
          seed: 'c',
          turnLimit: null,
          map: {
            script: 'continents',
            size: 'small',
            wrapX: true,
            resources: 'standard',
            startBalance: 'normal',
          },
        },
        players: [1, 2, 3, 4].map((i) => ({ id: `p${i}`, name: `P${i}`, kind: 'human' as const })),
      },
      ctx,
    );
    const camps = Object.values(s.camps);
    expect(camps.length).toBeGreaterThan(0);
    expect(s.playerOrder).not.toContain(HOSTILE);
    for (const c of camps) {
      for (const p of s.playerOrder) {
        expect(distance(s.map, c.tile, s.players[p]!.startTile)).toBeGreaterThanOrEqual(
          ctx.content.rules.camps.minDistance,
        );
      }
      expect(s.units[c.units[0]!]).toMatchObject({ owner: HOSTILE, tile: c.tile });
    }
  });

  it('raiders attack what they can reach at the start of a turn', () => {
    const s = wilds();
    const raider = addUnit(s, HOSTILE, 'unit_warrior', at(s, 5, 2));
    const mine = addUnit(s, 'p1', 'unit_warrior', at(s, 4, 2));
    const next = endTurn(s);
    expect(next.units[mine.id]?.health ?? 0).toBeLessThan(100);
    expect(next.units[raider.id]?.moves ?? 0).toBe(0);
  });

  it('raiders close in on anything nearby, and carry civilians off', () => {
    const s = wilds();
    const raider = addUnit(s, HOSTILE, 'unit_warrior', at(s, 8, 2));
    const settler = addUnit(s, 'p1', 'unit_settler', at(s, 5, 2));
    let next = endTurn(s);
    expect(distance(next.map, next.units[raider.id]!.tile, settler.tile)).toBeLessThan(3);
    next = endTurn(next);
    expect(next.units[settler.id]).toBeUndefined();
  });

  it("raiders can't take settlements", () => {
    let s = wilds();
    s = produce(s, (d) => {
      foundSettlement(d, ctx, 'p1', at(s, 3, 2), () => {});
    });
    s = structuredClone(s);
    const id = Object.keys(s.settlements)[0]!;
    s.settlements[id]!.health = 1;
    addUnit(s, HOSTILE, 'unit_warrior', at(s, 4, 2));
    const next = endTurn(s);
    expect(next.settlements[id]!.owner).toBe('p1');
  });

  it('train raiders over time, up to their limit', () => {
    const s = wilds();
    s.camps.c900!.nextUnit = s.turn + 1;
    let next = endTurn(s);
    expect(next.camps.c900!.units).toHaveLength(1);
    for (let i = 0; i < 40; i++) next = endTurn(next);
    expect(next.camps.c900!.units.length).toBeLessThanOrEqual(ctx.content.rules.camps.maxUnits);
  });

  it('are cleared for gold by moving a military unit onto them, and block founding', () => {
    const s = wilds();
    expect(foundingProblem(ctx, s, 'p1', at(s, 9, 2))).toMatchObject({ code: 'camp' });
    const u = addUnit(s, 'p1', 'unit_warrior', at(s, 8, 2));
    const r = act(s, { type: 'move_unit', player: 'p1', unit: u.id, to: at(s, 9, 2) });
    expect(r.state.camps).toEqual({});
    expect(r.state.players.p1!.gold).toBe(ctx.content.rules.camps.reward * 100);
    expect(r.events.some((e: GameEvent) => e.type === 'camp_cleared')).toBe(true);
  });
});

describe('promotions', () => {
  it('cost XP, heal fully, use the turn, and add their bonuses', () => {
    const s = testState(FIELD);
    const u = addUnit(s, 'p1', 'unit_warrior', at(s, 2, 2));
    u.health = 40;
    const promote: Action = {
      type: 'promote_unit',
      player: 'p1',
      unit: u.id,
      promotion: 'promo_vanguard',
    };
    expect(err(s, promote)).toBe('not_enough_xp');
    u.xp = 16;
    expect(availablePromotions(ctx, u).sort()).toEqual(['promo_shield_wall', 'promo_vanguard']);
    expect(err(s, { ...promote, promotion: 'promo_veteran' })).toBe('not_available');
    const next = act(s, promote).state;
    expect(next.units[u.id]).toMatchObject({
      health: 100,
      moves: 0,
      xp: 1,
      promotions: ['promo_vanguard'],
    });
    const w = structuredClone(
      act(
        { ...next, units: { ...next.units, [u.id]: { ...next.units[u.id]!, moves: 200 } } },
        { type: 'declare_war', player: 'p1', target: 'p2' },
      ).state,
    );
    addUnit(w, 'p2', 'unit_warrior', at(w, 3, 2));
    const p = previewAttack(ctx, w, w.units[u.id]!, at(w, 3, 2))!;
    expect(p.attacker.lines).toContainEqual({ label: 'Vanguard', amount: 5 });
  });

  it('can add movement and range', () => {
    const s = testState(FIELD);
    const horse = addUnit(s, 'p1', 'unit_horseman', at(s, 2, 2));
    horse.promotions = ['promo_swift'];
    expect(fullMoves(ctx, horse)).toBe(500);
  });
});

describe('war support', () => {
  it('favors the side declared on, and the side behind grows weary', () => {
    let s = testState(FIELD);
    s = produce(s, (d) => {
      foundSettlement(d, ctx, 'p1', at(s, 2, 2), () => {});
    });
    s = act(s, { type: 'declare_war', player: 'p1', target: 'p2' }).state;
    expect(s.warSupport['p1|p2']).toEqual({ p1: 0, p2: 3 });
    const city = Object.values(s.settlements)[0]!;
    expect(happinessOf(ctx, s, city).lines).toContainEqual({ label: 'War weariness', amount: -3 });
  });
});
