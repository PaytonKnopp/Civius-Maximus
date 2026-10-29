import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { Action } from '../actions';
import { applyAction } from '../game';
import { falloutTurn } from '../nukes/nukes';
import { foundSettlement } from '../settlements/handlers';
import { tileYields } from '../settlements/rules';
import type { GameState } from '../state';
import { routePath } from '../trade/rules';
import { act, addUnit, at, ctx, testState } from '../testing/world';
import { pillageGold, plunderGold } from './pillage';

const FIELD = Array.from({ length: 5 }, () => '.'.repeat(16));
const err = (s: GameState, a: Action) => {
  const r = applyAction(s, a, ctx);
  return r.ok ? undefined : r.error.code;
};

/** p1 at (2,2), p2 at (12,2) with a farm at (11,2) and p1's warrior on it. */
function world() {
  let s = testState(FIELD);
  s = produce(s, (d) => {
    foundSettlement(d, ctx, 'p1', at(s, 2, 2), () => {});
    foundSettlement(d, ctx, 'p2', at(s, 12, 2), () => {});
    d.map.tiles[at(s, 11, 2)]!.improvement = 'improvement_farm';
  });
  s = structuredClone(s) as GameState;
  const warrior = addUnit(s, 'p1', 'unit_warrior', at(s, 11, 2)).id;
  return { s, warrior, farm: at(s, 11, 2) };
}

describe('pillaging', () => {
  it("wrecks an enemy's improvement for a while, for gold and health", () => {
    const w = world();
    const pillage: Action = { type: 'pillage', player: 'p1', unit: w.warrior };
    expect(err(w.s, pillage)).toBe('not_enemy');
    const s = produce(w.s, (d) => {
      d.wars.push('p1|p2');
      d.units[w.warrior]!.health = 50;
    });
    const before = tileYields(ctx, s, w.farm, 'p2').total.food ?? 0;
    const gold = s.players.p1!.gold;
    const after = act(s, pillage).state;
    expect(tileYields(ctx, after, w.farm, 'p2').total.food ?? 0).toBeLessThan(before);
    expect(after.players.p1!.gold).toBe(gold + pillageGold(ctx, s, 'p1'));
    expect(after.units[w.warrior]!.health).toBe(50 + ctx.content.rules.combat.pillage.heal);
    expect(err(after, pillage)).not.toBeUndefined();
    // It comes back into use in time, whatever the settings.
    const later = produce(after, (d) => {
      d.settings.disasters = false;
      d.turn += ctx.content.rules.combat.pillage.turns + 1;
      falloutTurn(d);
    });
    expect(tileYields(ctx, later, w.farm, 'p2').total.food ?? 0).toBe(before);
  });

  it('only by soldiers, and not on your own land', () => {
    const w = world();
    const s = structuredClone(
      produce(w.s, (d) => {
        d.wars.push('p1|p2');
        d.map.tiles[at(w.s, 3, 2)]!.improvement = 'improvement_farm';
      }),
    ) as GameState;
    const settler = addUnit(s, 'p1', 'unit_settler', w.farm).id;
    expect(err(s, { type: 'pillage', player: 'p1', unit: settler })).toBe('not_military');
    s.units[w.warrior]!.tile = at(s, 3, 2);
    expect(err(s, { type: 'pillage', player: 'p1', unit: w.warrior })).toBe('not_enemy');
  });
});

describe('plundering trade routes', () => {
  it("ends an enemy's route that runs past, for gold", () => {
    const w = world();
    let s = produce(w.s, (d) => {
      d.players.p2!.civics.done.push('civic_foreign_trade');
      d.units[w.warrior]!.tile = at(w.s, 7, 2);
    });
    s = structuredClone(s) as GameState;
    // p2 sends a trader home-to-home... to a second settlement of its own, west of the warrior.
    s = produce(s, (d) => {
      foundSettlement(d, ctx, 'p2', at(s, 5, 0), () => {});
    });
    s = structuredClone(s) as GameState;
    const [, theirs, second] = Object.keys(s.settlements) as [string, string, string];
    const trader = addUnit(s, 'p2', 'unit_trader', s.settlements[theirs]!.tile).id;
    s = act(s, { type: 'start_trade_route', player: 'p2', unit: trader, to: second }).state;
    const route = s.routes[0]!;
    const onWay = route.path[Math.floor(route.path.length / 2)]!;
    s = produce(s, (d) => {
      d.units[w.warrior]!.tile = onWay;
    });
    const plunder: Action = {
      type: 'plunder_route',
      player: 'p1',
      unit: w.warrior,
      route: route.id,
    };
    expect(err(s, plunder)).toBe('not_enemy');
    s = produce(s, (d) => {
      d.wars.push('p1|p2');
    });
    const gold = s.players.p1!.gold;
    const after = act(s, plunder).state;
    expect(after.routes).toHaveLength(0);
    expect(after.players.p1!.gold).toBe(gold + plunderGold(ctx, s, 'p1'));
    // The trader is lost.
    expect(Object.values(after.units).some((u) => u.type === 'unit_trader')).toBe(false);
  });
});

describe('sea trade', () => {
  it('crosses shallow water from a settlement with a Harbor', () => {
    let s = testState(['....~~~~~~....', '....~~~~~~....', '....~~~~~~....']);
    s = produce(s, (d) => {
      foundSettlement(d, ctx, 'p1', at(s, 3, 1), () => {});
      foundSettlement(d, ctx, 'p1', at(s, 10, 1), () => {});
    });
    const [west, east] = Object.values(s.settlements);
    expect(routePath(ctx, s, west!, east!)).toBeNull();
    const harbor = produce(s, (d) => {
      const tile = at(s, 4, 1);
      d.map.tiles[tile]!.district = 'district_harbor';
      d.settlements[west!.id]!.districts.push({ id: 'district_harbor', tile });
    });
    const path = routePath(ctx, harbor, harbor.settlements[west!.id]!, east!);
    expect(path).not.toBeNull();
    expect(path!.some((t) => harbor.map.tiles[t]!.terrain === 'coast')).toBe(true);
  });
});
