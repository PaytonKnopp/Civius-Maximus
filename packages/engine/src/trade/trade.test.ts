import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { Action } from '../actions';
import { applyAction } from '../game';
import { foundSettlement } from '../settlements/handlers';
import { settlementYields } from '../settlements/rules';
import type { GameState } from '../state';
import { act, addUnit, at, ctx, endTurn, testState } from '../testing/world';
import { MP, stepMoves } from '../units/movement';
import { hasRoad, tradeCapacity } from './rules';

const FIELD = [
  '..............',
  '..............',
  '..............',
  '..............',
  '..............',
];
const err = (s: GameState, a: Action) => {
  const r = applyAction(s, a, ctx);
  return r.ok ? undefined : r.error.code;
};

/** Rome (p1) with Foreign Trade, two settlements of its own and one of Egypt's (p2). */
function world() {
  let s = testState(FIELD);
  s = produce(s, (d) => {
    d.players.p1!.civics.done.push('civic_foreign_trade');
    foundSettlement(d, ctx, 'p1', at(s, 1, 2), () => {});
    foundSettlement(d, ctx, 'p1', at(s, 6, 2), () => {});
    foundSettlement(d, ctx, 'p2', at(s, 11, 2), () => {});
  });
  s = structuredClone(s);
  const [home, town, egypt] = Object.keys(s.settlements);
  const trader = addUnit(s, 'p1', 'unit_trader', at(s, 1, 2));
  return { s, home: home!, town: town!, egypt: egypt!, trader };
}

describe('trade routes', () => {
  it('need capacity, which Foreign Trade gives', () => {
    const { s, town, trader } = world();
    expect(tradeCapacity(ctx, s, 'p1')).toBe(1);
    const none = produce(s, (d) => {
      d.players.p1!.civics.done = [];
    });
    expect(err(none, { type: 'start_trade_route', player: 'p1', unit: trader.id, to: town })).toBe(
      'no_capacity',
    );
  });

  it('run domestic routes for food and production, building a road', () => {
    const { s, home, town, trader } = world();
    const before = settlementYields(ctx, s, s.settlements[home]!).total;
    const next = act(s, {
      type: 'start_trade_route',
      player: 'p1',
      unit: trader.id,
      to: town,
    }).state;
    expect(next.units[trader.id]).toBeUndefined();
    expect(next.routes).toHaveLength(1);
    const after = settlementYields(ctx, next, next.settlements[home]!).total;
    expect((after.food ?? 0) - (before.food ?? 0)).toBe(200);
    expect((after.production ?? 0) - (before.production ?? 0)).toBe(200);
    for (let c = 1; c <= 6; c++) expect(hasRoad(next, at(s, c, 2))).toBe(true);
    // A second route needs a second slot.
    const again = addUnit(structuredClone(next), 'p1', 'unit_trader', at(s, 1, 2));
    const s2 = structuredClone(next);
    s2.units[again.id] = again;
    expect(err(s2, { type: 'start_trade_route', player: 'p1', unit: again.id, to: town })).toBe(
      'no_capacity',
    );
  });

  it('pay gold both ways on international routes, and end with war', () => {
    const { s, home, egypt, trader } = world();
    let next = act(s, {
      type: 'start_trade_route',
      player: 'p1',
      unit: trader.id,
      to: egypt,
    }).state;
    const lines = (id: string) =>
      Object.values(settlementYields(ctx, next, next.settlements[id]!).lines)
        .flat()
        .map((l) => l.label);
    expect(lines(home)).toContain(`Trade route to ${next.settlements[egypt]!.name}`);
    expect(lines(egypt)).toContain(`Trade route from ${next.settlements[home]!.name}`);
    next = act(next, { type: 'declare_war', player: 'p1', target: 'p2' }).state;
    expect(next.routes).toEqual([]);
    expect(Object.values(next.units).some((u) => u.type === 'unit_trader')).toBe(true);
  });

  it('end after their turns, and the trader comes home', () => {
    const { s, home, town, trader } = world();
    let next = act(s, { type: 'start_trade_route', player: 'p1', unit: trader.id, to: town }).state;
    for (let i = 0; i < ctx.content.rules.trade.routeTurns; i++) next = endTurn(next);
    expect(next.routes).toEqual([]);
    const back = Object.values(next.units).find((u) => u.type === 'unit_trader')!;
    expect(back.tile).toBe(next.settlements[home]!.tile);
  });

  it('roads make every step cheap', () => {
    const { s, town, trader } = world();
    const next = act(s, {
      type: 'start_trade_route',
      player: 'p1',
      unit: trader.id,
      to: town,
    }).state;
    const w = addUnit(structuredClone(next), 'p1', 'unit_warrior', at(s, 2, 2));
    const left = stepMoves(ctx, next, w, at(s, 2, 2), at(s, 3, 2), 2 * MP);
    expect(left).toBe(2 * MP - MP / 2);
  });
});
