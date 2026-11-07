import { describe, expect, it } from 'vitest';
import { defenseStrength } from '../combat/strength';
import { neighbors } from '../map/hex';
import { itemProblem } from '../settlements/rules';
import type { GameState } from '../state';
import { act, addUnit, at, ctx, endTurn, testState } from '../testing/world';
import { playerView } from '../view';
import {
  isRevealed,
  resourceCostOf,
  stockpileCap,
  stockpileIncome,
  stockpileOf,
} from './strategic';

const LAND = [
  '~~~~~~~~~~~~',
  '~..h..h...p~',
  '~.p..h..p..~',
  '~..h..p..h.~',
  '~.p.....p..~',
  '~~~~~~~~~~~~',
];

/** p1's capital at (4, 2), with an iron source next to it. */
function withIron(): { s: GameState; id: string; iron: number } {
  let s = testState(LAND);
  const settler = addUnit(s, 'p1', 'unit_settler', at(s, 4, 2));
  s = structuredClone(act(s, { type: 'found_settlement', player: 'p1', unit: settler.id }).state);
  const id = s.players.p1!.capital!;
  const iron = neighbors(s.map, s.settlements[id]!.tile).find(
    (t) => s.map.tiles[t]!.elevation === 'hills',
  )!;
  s.map.tiles[iron]!.resource = 'iron';
  s.map.tiles[iron]!.improvement = 'improvement_mine';
  return { s, id, iron };
}

describe('strategic resources', () => {
  it('are hidden, unworkable and unimproved until their tech is known', () => {
    const { s, iron } = withIron();
    expect(isRevealed(ctx, s, 'p1', 'iron')).toBe(false);
    expect(stockpileIncome(ctx, s, 'p1')).toEqual({});
    expect(playerView(ctx, s, 'p1').map.tiles[iron]!.resource).toBeNull();
    s.players.p1!.techs.done.push('tech_mining', 'tech_bronze_working');
    expect(playerView(ctx, s, 'p1').map.tiles[iron]!.resource).toBe('iron');
    expect(stockpileIncome(ctx, s, 'p1')).toEqual({ iron: 2 });
  });

  it('fill a stockpile each turn, up to a cap that grows with the era', () => {
    const { s } = withIron();
    s.players.p1!.techs.done.push('tech_mining', 'tech_bronze_working');
    let next = endTurn(s);
    expect(stockpileOf(next, 'p1')).toEqual({ iron: 2 });
    next = structuredClone(next);
    next.players.p1!.resources = { iron: 29 };
    expect(stockpileCap(ctx, next, 'p1')).toBe(30);
    expect(stockpileOf(endTurn(next), 'p1')).toEqual({ iron: 30 });
  });

  it('are needed to train units: a source lets it start, the stockpile lets it finish', () => {
    const { s, id } = withIron();
    s.players.p1!.techs.done.push('tech_mining', 'tech_bronze_working', 'tech_iron_working');
    // p1 is Rome: its Legionary replaces the Swordsman and takes the same iron.
    const sword = { kind: 'unit' as const, id: 'unit_legionary' };
    expect(resourceCostOf(ctx, 'unit_swordsman')).toEqual({ iron: 10 });
    expect(resourceCostOf(ctx, 'unit_legionary')).toEqual({ iron: 10 });
    // With an improved source it can be queued; the stockpile fills before it can finish.
    expect(itemProblem(ctx, s, s.settlements[id]!, sword)).toBeUndefined();
    let next = act(s, { type: 'set_queue', player: 'p1', settlement: id, queue: [sword] }).state;
    next = structuredClone(next);
    next.settlements[id]!.progress['unit:unit_legionary'] = 100_000;
    next = endTurn(next);
    const swords = () => Object.values(next.units).filter((u) => u.type === 'unit_legionary');
    expect(swords()).toHaveLength(0);
    next = structuredClone(next);
    next.players.p1!.resources = { iron: 12 };
    next = endTurn(next);
    expect(swords()).toHaveLength(1);
    // 12 + 2 from the mine, less 10 for the swordsman.
    expect(stockpileOf(next, 'p1').iron).toBe(4);
    // Without the mine (and with nothing stockpiled) it can't even be started.
    const bare = structuredClone(s);
    bare.map.tiles.forEach((t) => {
      if (t.resource === 'iron') t.improvement = null;
    });
    expect(itemProblem(ctx, bare, bare.settlements[id]!, sword)?.code).toBe('needs_resource');
  });

  it("weaken units whose upkeep the stockpile can't cover", () => {
    const { s } = withIron();
    const tank = addUnit(s, 'p1', 'unit_tank', at(s, 8, 3));
    const before = defenseStrength(ctx, s, s.units[tank.id]!, null).total;
    const next = endTurn(s);
    expect(next.players.p1!.resourcesShort).toEqual(['oil']);
    const after = defenseStrength(ctx, next, next.units[tank.id]!, null);
    expect(after.lines).toContainEqual({ label: 'Short of Oil', amount: -20 });
    expect(after.total).toBe(before - 20);
  });
});
