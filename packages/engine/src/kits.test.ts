import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { applyAction } from './game';
import { previewAttack } from './combat/strength';
import { foundSettlement } from './settlements/handlers';
import {
  availableItems,
  itemCost,
  itemProblem,
  improvementsFor,
  tileYields,
} from './settlements/rules';
import type { GameState } from './state';
import {
  act as baseAct,
  addUnit,
  at,
  endTurn as baseEnd,
  kitCtx as ctx,
  testState,
} from './testing/world';
import { nextPromotionXp } from './units/promotions';

/** Civ and leader kits (docs/09-base-roster.md). p1 is Rome (Caesar), p2 Egypt (Cleopatra). */

const act = (s: GameState, a: Parameters<typeof baseAct>[1]) => baseAct(s, a, ctx);
const endTurn = (s: GameState) => baseEnd(s, ctx);

const FIELD = ['.........', '.........', '.........', '.........', '.........'];
const labels = (lines: { label: string; amount: number }[]) =>
  Object.fromEntries(lines.map((l) => [l.label, l.amount]));

/** A state where `player` leads `civ` with `leader`, with techs and civics finished. */
function as(s: GameState, player: string, civ: string, leader: string, techs: string[] = []) {
  // A plain copy, so tests can keep adding units to it.
  return structuredClone(
    produce(s, (d) => {
      const p = d.players[player]!;
      p.civ = civ;
      p.leader = leader;
      p.techs.done.push(...techs);
    }),
  );
}

function settle(s: GameState, player: string, tile: number): { s: GameState; id: string } {
  const next = produce(s, (d) => {
    foundSettlement(d, ctx, player, tile, () => {});
  });
  const id = Object.keys(next.settlements).find((k) => !s.settlements[k])!;
  return { s: next, id };
}

describe('civ uniques', () => {
  it('replace the standard item for their civ only', () => {
    let s = testState(FIELD);
    s = as(s, 'p1', 'civ_rome', 'leader_caesar', ['tech_bronze_working', 'tech_iron_working']);
    s = as(s, 'p2', 'civ_egypt', 'leader_cleopatra', ['tech_bronze_working', 'tech_iron_working']);
    const rome = settle(s, 'p1', at(s, 2, 2));
    const egypt = settle(rome.s, 'p2', at(s, 6, 2));
    s = egypt.s;
    const romeItems = availableItems(ctx, s, s.settlements[rome.id]!).map((i) => i.id);
    const egyptItems = availableItems(ctx, s, s.settlements[egypt.id]!).map((i) => i.id);
    expect(romeItems).toContain('unit_legionary');
    expect(romeItems).not.toContain('unit_swordsman');
    expect(egyptItems).toContain('unit_swordsman');
    expect(egyptItems).not.toContain('unit_legionary');
    const why = itemProblem(ctx, s, s.settlements[rome.id]!, {
      kind: 'unit',
      id: 'unit_swordsman',
    });
    expect(why?.message).toMatch(/Replaced by Legionary/);
  });

  it('give every Roman settlement a free Forum', () => {
    const s = testState(FIELD);
    const { s: after, id } = settle(s, 'p1', at(s, 2, 2));
    expect(after.settlements[id]!.buildings).toContain('building_forum');
    const { s: other, id: egypt } = settle(after, 'p2', at(s, 6, 2));
    expect(other.settlements[egypt]!.buildings).not.toContain('building_forum');
  });

  it('offer unique improvements only to their civ', () => {
    const s = testState(['ddddd', 'ddddd', 'ddddd']);
    const tile = at(s, 2, 1);
    expect(improvementsFor(ctx, s, tile, 'p2')).toContain('improvement_obelisk');
    expect(improvementsFor(ctx, s, tile, 'p1')).not.toContain('improvement_obelisk');
  });

  it('count as the item they replace for districts and buildings', () => {
    let s = testState(FIELD);
    s = as(s, 'p1', 'civ_mali', 'leader_mansa', ['tech_currency', 'tech_writing']);
    const { s: after, id } = settle(s, 'p1', at(s, 4, 2));
    const hub = produce(after, (d) => {
      const tile = at(s, 5, 2);
      d.map.tiles[tile]!.district = 'district_suguba';
      d.settlements[id]!.districts.push({ id: 'district_suguba', tile });
    });
    const market = { kind: 'building' as const, id: 'building_marketplace' };
    expect(itemProblem(ctx, hub, hub.settlements[id]!, market)).toBeUndefined();
  });
});

describe('leader and civ abilities', () => {
  it('Crossing the Rubicon: +5 strength for 10 turns after declaring war', () => {
    let s = testState(FIELD);
    const a = addUnit(s, 'p1', 'unit_warrior', at(s, 2, 2));
    const b = addUnit(s, 'p2', 'unit_warrior', at(s, 3, 2));
    s = act(s, { type: 'declare_war', player: 'p1', target: 'p2' }).state;
    const early = previewAttack(ctx, s, s.units[a.id]!, b.tile)!;
    expect(labels(early.attacker.lines)['Crossing the Rubicon']).toBe(5);
    const later = produce(s, (d) => {
      d.turn += 10;
    });
    const late = previewAttack(ctx, later, later.units[a.id]!, b.tile)!;
    expect(labels(late.attacker.lines)['Crossing the Rubicon']).toBeUndefined();
  });

  it('Khan of the Steppe: cavalry +3; The Demon King: +5 against the wounded', () => {
    let s = testState(FIELD);
    s = as(s, 'p1', 'civ_mongols', 'leader_genghis');
    const horse = addUnit(s, 'p1', 'unit_horseman', at(s, 2, 2));
    const foe = addUnit(s, 'p2', 'unit_warrior', at(s, 3, 2));
    s = act(s, { type: 'declare_war', player: 'p1', target: 'p2' }).state;
    const p = previewAttack(ctx, s, s.units[horse.id]!, foe.tile)!;
    expect(labels(p.attacker.lines)['Khan of the Steppe']).toBe(3);

    let j = as(testState(FIELD), 'p1', 'civ_japan', 'leader_nobunaga');
    const w = addUnit(j, 'p1', 'unit_warrior', at(j, 2, 2));
    const hurt = addUnit(j, 'p2', 'unit_warrior', at(j, 3, 2));
    j = act(j, { type: 'declare_war', player: 'p1', target: 'p2' }).state;
    const healthy = previewAttack(ctx, j, j.units[w.id]!, hurt.tile)!;
    expect(labels(healthy.attacker.lines)['The Demon King']).toBeUndefined();
    j = produce(j, (d) => {
      d.units[hurt.id]!.health = 60;
    });
    const vsHurt = previewAttack(ctx, j, j.units[w.id]!, hurt.tile)!;
    expect(labels(vsHurt.attacker.lines)['The Demon King']).toBe(5);
  });

  it('The First Emperor: the first soldier in each city is free', () => {
    let s = as(testState(FIELD), 'p1', 'civ_china', 'leader_qin');
    const { s: after, id } = settle(s, 'p1', at(s, 4, 2));
    s = after;
    const warrior = { kind: 'unit' as const, id: 'unit_warrior' };
    expect(itemCost(ctx, s, 'p1', warrior, s.settlements[id]!)).toBe(0);
    s = act(s, { type: 'set_queue', player: 'p1', settlement: id, queue: [warrior] }).state;
    s = endTurn(s);
    expect(Object.values(s.units).some((u) => u.owner === 'p1' && u.type === 'unit_warrior')).toBe(
      true,
    );
    expect(s.settlements[id]!.unitsTrained).toBe(1);
    expect(itemCost(ctx, s, 'p1', warrior, s.settlements[id]!)).toBe(4000);
  });

  it('Ordu: cavalry trained there get a promotion that costs no XP', () => {
    let s = as(testState(FIELD), 'p1', 'civ_mongols', 'leader_genghis', ['tech_horseback_riding']);
    const { s: after, id } = settle(s, 'p1', at(s, 4, 2));
    s = produce(after, (d) => {
      d.settlements[id]!.buildings.push('building_ordu');
      d.players.p1!.gold = 100_000;
    });
    s = act(s, {
      type: 'buy_item',
      player: 'p1',
      settlement: id,
      item: { kind: 'unit', id: 'unit_horseman' },
    }).state;
    const horse = Object.values(s.units).find((u) => u.type === 'unit_horseman')!;
    expect(horse.promotions).toEqual(['promo_ordu_trained']);
    expect(nextPromotionXp(ctx, horse)).toBe(ctx.content.rules.combat.promotionXp[0]);
  });

  it('Road of Salt and Gold: buildings can be bought with faith', () => {
    let s = as(testState(FIELD), 'p1', 'civ_mali', 'leader_mansa');
    const { s: after, id } = settle(s, 'p1', at(s, 4, 2));
    s = produce(after, (d) => {
      d.players.p1!.faith = 100_000;
    });
    const monument = { kind: 'building' as const, id: 'building_monument' };
    s = act(s, {
      type: 'buy_item',
      player: 'p1',
      settlement: id,
      item: monument,
      currency: 'faith',
    }).state;
    expect(s.settlements[id]!.buildings).toContain('building_monument');
    expect(s.players.p1!.faith).toBeLessThan(100_000);
    // Egypt can't.
    const e = settle(testState(FIELD), 'p2', at(s, 4, 2));
    const r = applyAction(
      produce(e.s, (d) => {
        d.players.p2!.faith = 100_000;
      }),
      { type: 'buy_item', player: 'p2', settlement: e.id, item: monument, currency: 'faith' },
      ctx,
    );
    expect(r.ok).toBe(false);
  });

  it('Bounty of the Nile: floodplains give Egypt +1 food', () => {
    const s = produce(testState(FIELD), (d) => {
      d.map.tiles[at(d as GameState, 2, 2)]!.feature = 'floodplains';
      d.map.tiles[at(d as GameState, 2, 2)]!.terrain = 'desert';
    });
    const tile = at(s, 2, 2);
    const owned = (owner: string) =>
      produce(s, (d) => {
        d.map.tiles[tile]!.owner = owner;
      });
    const egypt = tileYields(ctx, owned('p2'), tile).total.food ?? 0;
    const rome = tileYields(ctx, owned('p1'), tile).total.food ?? 0;
    expect(egypt - rome).toBe(100);
  });

  it('The Hard Ruler: pillaging also gives the Norse culture and faith', () => {
    let s = as(testState(FIELD), 'p1', 'civ_norse', 'leader_harald');
    s = settle(s, 'p2', at(s, 6, 2)).s;
    s = structuredClone(
      produce(s, (d) => {
        d.map.tiles[at(s, 5, 2)]!.improvement = 'improvement_farm';
        d.wars.push('p1|p2');
      }),
    );
    const warrior = addUnit(s, 'p1', 'unit_warrior', at(s, 5, 2)).id;
    const faith = s.players.p1!.faith;
    const after = act(s, { type: 'pillage', player: 'p1', unit: warrior }).state;
    expect(after.players.p1!.faith - faith).toBe(1500);
  });

  it('Roads of the Four Quarters: Inca hills +1 food, and terrace farms for the Inca only', () => {
    const s = produce(testState(FIELD), (d) => {
      d.map.tiles[at(d as GameState, 2, 2)]!.elevation = 'hills';
    });
    const tile = at(s, 2, 2);
    const owned = (st: GameState, owner: string) =>
      produce(st, (d) => {
        d.map.tiles[tile]!.owner = owner;
      });
    const inca = as(s, 'p1', 'civ_inca', 'leader_pachacuti');
    const food = (st: GameState) => tileYields(ctx, st, tile).total.food ?? 0;
    expect(food(owned(inca, 'p1')) - food(owned(s, 'p1'))).toBe(100);
    const terrace = (st: GameState) =>
      improvementsFor(ctx, owned(st, 'p1'), tile, 'p1').includes('improvement_terrace_farm');
    expect(terrace(inca)).toBe(true);
    expect(terrace(s)).toBe(false);
  });
});
