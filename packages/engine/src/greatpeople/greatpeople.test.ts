import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { Action } from '../actions';
import { applyAction } from '../game';
import { foundSettlement } from '../settlements/handlers';
import { settlementYields } from '../settlements/rules';
import type { GameState } from '../state';
import { act, addUnit, at, ctx, endTurn, testState } from '../testing/world';
import { greatPersonCost, greatPersonRates, nextGreatPerson, recruitCost } from './greatpeople';

const FIELD = ['.........', '.........', '.........', '.........', '.........'];
const err = (s: GameState, a: Action) => {
  const r = applyAction(s, a, ctx);
  return r.ok ? undefined : r.error.code;
};

/** p1 with a capital that has a Campus (great scientist points). */
function world() {
  let s = testState(FIELD);
  s = produce(s, (d) => {
    foundSettlement(d, ctx, 'p1', at(s, 2, 2), () => {});
    const id = Object.keys(d.settlements)[0]!;
    const tile = at(s, 3, 2);
    d.map.tiles[tile]!.district = 'district_campus';
    d.settlements[id]!.districts.push({ id: 'district_campus', tile });
  });
  return { s, capital: Object.keys(s.settlements)[0]! };
}

const person = (s: GameState) => Object.values(s.units).find((u) => u.person);

describe('great people', () => {
  it('earn points from districts; the first to the cost gets the next one', () => {
    let { s } = world();
    expect(greatPersonRates(ctx, s, 'p1').gp_scientist).toBe(1);
    const cost = greatPersonCost(ctx, s, 'gp_scientist');
    expect(nextGreatPerson(ctx, s, 'gp_scientist')!.id).toBe('gp_euclid');
    s = produce(s, (d) => {
      d.greatPeople.points.p1 = { gp_scientist: cost - 1 };
    });
    s = endTurn(s);
    expect(s.greatPeople.claimed.gp_euclid).toBe('p1');
    expect(s.greatPeople.points.p1!.gp_scientist).toBe(0);
    expect(person(s)!.person).toBe('gp_euclid');
    // The next one costs more.
    expect(greatPersonCost(ctx, s, 'gp_scientist')).toBeGreaterThan(cost);
  });

  it('can be bought with gold for the points still missing', () => {
    let { s } = world();
    s = produce(s, (d) => {
      d.players.p1!.gold = 100_000;
      d.greatPeople.points.p1 = { gp_scientist: 20 };
    });
    const cost = recruitCost(ctx, s, 'p1', 'gp_scientist');
    expect(cost).toBe((greatPersonCost(ctx, s, 'gp_scientist') - 20) * 300);
    s = act(s, {
      type: 'recruit_great_person',
      player: 'p1',
      class: 'gp_scientist',
      currency: 'gold',
    }).state;
    expect(s.players.p1!.gold).toBe(100_000 - cost);
    expect(person(s)!.person).toBe('gp_euclid');
  });

  it('are activated in your settlements, once, with lasting effects for some', () => {
    const w = world();
    const capital = w.capital;
    let s = w.s;
    s = produce(s, (d) => {
      d.players.p1!.gold = 100_000;
      d.players.p1!.techs.current = 'tech_pottery';
      d.greatPeople.claimed.gp_euclid = 'p2';
      d.greatPeople.claimed.gp_aryabhata = 'p2';
      d.settlements[capital]!.buildings.push('building_library');
    });
    s = act(s, {
      type: 'recruit_great_person',
      player: 'p1',
      class: 'gp_scientist',
      currency: 'gold',
    }).state;
    const hypatia = person(s)!;
    expect(hypatia.person).toBe('gp_hypatia');
    // Not outside a settlement.
    const away = structuredClone(s);
    away.units[hypatia.id]!.tile = at(s, 6, 4);
    expect(err(away, { type: 'activate_great_person', player: 'p1', unit: hypatia.id })).toBe(
      'not_in_settlement',
    );
    const before = settlementYields(ctx, s, s.settlements[capital]!).total.science ?? 0;
    s = act(s, { type: 'activate_great_person', player: 'p1', unit: hypatia.id }).state;
    expect(s.units[hypatia.id]).toBeUndefined();
    expect(s.players.p1!.greatPeople).toEqual(['gp_hypatia']);
    // 100 science finishes Pottery (25).
    expect(s.players.p1!.techs.done).toContain('tech_pottery');
    const after = settlementYields(ctx, s, s.settlements[capital]!).total.science ?? 0;
    expect(after - before).toBe(100);
  });

  it('generals inspire nearby soldiers', () => {
    let { s } = world();
    s = structuredClone(
      produce(s, (d) => {
        d.players.p1!.gold = 100_000;
      }),
    );
    const near = addUnit(s, 'p1', 'unit_warrior', at(s, 3, 3));
    const far = addUnit(s, 'p1', 'unit_warrior', at(s, 8, 0));
    s = act(s, {
      type: 'recruit_great_person',
      player: 'p1',
      class: 'gp_general',
      currency: 'gold',
    }).state;
    const sunTzu = person(s)!;
    s = act(s, { type: 'activate_great_person', player: 'p1', unit: sunTzu.id }).state;
    expect(s.units[near.id]!.promotions).toContain('promo_inspired');
    expect(s.units[far.id]!.promotions).not.toContain('promo_inspired');
  });
});
