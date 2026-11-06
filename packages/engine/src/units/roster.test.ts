import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { roleOf } from '../ai/turn';
import { defenseStrength, previewAttack } from '../combat/strength';
import { foundSettlement } from '../settlements/handlers';
import type { GameState } from '../state';
import { act, addUnit, at, ctx, endTurn, testState } from '../testing/world';

const FIELD = ['............', '............', '............', '............'];
const war = (s: GameState) => act(s, { type: 'declare_war', player: 'p1', target: 'p2' }).state;

/** p2's walled capital at (4, 2), at war with p1, and a p1 swordsman next to it. */
function walled(): { s: GameState; capital: string; sword: string } {
  let s = testState(FIELD);
  s = produce(s, (d) => {
    foundSettlement(d, ctx, 'p2', at(s, 4, 2), () => {});
  });
  s = structuredClone(war(s));
  const capital = Object.keys(s.settlements)[0]!;
  const c = s.settlements[capital]!;
  c.buildings.push('building_walls');
  c.walls = 100;
  const sword = addUnit(s, 'p1', 'unit_swordsman', at(s, 3, 2)).id;
  return { s, capital, sword };
}

describe('the unit roster (D112)', () => {
  it('a battering ram puts melee damage into the walls; a siege tower skips them', () => {
    const { s, capital, sword } = walled();
    const tile = s.settlements[capital]!.tile;
    const plain = previewAttack(ctx, s, s.units[sword]!, tile)!;
    expect(plain.split!.walls[1]).toBeLessThan(10);
    const ram = structuredClone(s);
    addUnit(ram, 'p1', 'unit_battering_ram', at(s, 3, 1));
    const rammed = previewAttack(ctx, ram, ram.units[sword]!, tile)!;
    expect(rammed.split!.walls[1]).toBeGreaterThan(plain.split!.walls[1]);
    expect(rammed.split!.health).toEqual([0, 0]);
    const tower = structuredClone(s);
    addUnit(tower, 'p1', 'unit_siege_tower', at(s, 3, 2));
    const over = previewAttack(ctx, tower, tower.units[sword]!, tile)!;
    expect(over.split!.walls).toEqual([0, 0]);
    expect(over.split!.health[1]).toBeGreaterThan(0);
    // It helps melee, not archers.
    const archer = addUnit(tower, 'p1', 'unit_archer', at(s, 2, 2));
    const shot = previewAttack(ctx, tower, tower.units[archer.id]!, tile)!;
    expect(shot.split!.walls[1]).toBeGreaterThan(0);
  });

  it('a medic heals the units around it faster', () => {
    let s = testState(FIELD);
    const a = addUnit(s, 'p1', 'unit_warrior', at(s, 2, 2));
    const b = addUnit(s, 'p1', 'unit_warrior', at(s, 8, 2));
    addUnit(s, 'p1', 'unit_medic', at(s, 2, 1));
    s.units[a.id]!.health = 40;
    s.units[b.id]!.health = 40;
    // Enough gold that no unit is disbanded for upkeep.
    s.players.p1!.gold = 100_000;
    s = endTurn(s);
    expect(s.units[a.id]!.health - s.units[b.id]!.health).toBe(20);
  });

  it('anti-air guns stand up to aircraft; old lines upgrade into the new units', () => {
    const s = testState(FIELD);
    const gun = addUnit(s, 'p1', 'unit_anti_air_gun', at(s, 2, 2));
    const plane = addUnit(s, 'p2', 'unit_bomber', at(s, 5, 2));
    const lines = defenseStrength(ctx, s, gun, plane).lines;
    expect(lines).toContainEqual({ label: 'Against aircraft', amount: 25 });
    const u = ctx.content.entities.unit;
    expect(u.unit_scout!.upgradesTo).toBe('unit_ranger');
    expect(u.unit_ranger!.upgradesTo).toBe('unit_spec_ops');
    expect(u.unit_battleship!.upgradesTo).toBe('unit_missile_cruiser');
    expect(u.unit_submarine!.upgradesTo).toBe('unit_nuclear_submarine');
    expect(u.unit_cavalry!.upgradesTo).toBe('unit_helicopter');
    // A fleet commander commands ships; the AI's land armies don't take it along.
    const fleet = u.unit_fleet_commander!;
    expect(roleOf(fleet, ctx.content.entities.unitClass[fleet.class]!)).toBe('civilian');
  });
});
