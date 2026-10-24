import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { Action } from '../actions';
import { previewAttack } from '../combat/strength';
import { applyAction } from '../game';
import { foundSettlement } from '../settlements/handlers';
import { unitUpkeep } from '../settlements/rules';
import type { GameState } from '../state';
import { act, addUnit, at, ctx, endTurn, testState } from '../testing/world';
import { packableUnits } from './commanders';

const FIELD = ['.........', '.........', '.........', '.........', '.........'];
const err = (s: GameState, a: Action) => {
  const r = applyAction(s, a, ctx);
  return r.ok ? undefined : r.error.code;
};
const labels = (lines: { label: string; amount: number }[]) =>
  Object.fromEntries(lines.map((l) => [l.label, l.amount]));

describe('commanders', () => {
  it('pack nearby soldiers, carry them, and unpack them ready to act', () => {
    const s = testState(FIELD);
    const c = addUnit(s, 'p1', 'unit_army_commander', at(s, 2, 2));
    const a = addUnit(s, 'p1', 'unit_warrior', at(s, 3, 2));
    const b = addUnit(s, 'p1', 'unit_warrior', at(s, 2, 2));
    const far = addUnit(s, 'p1', 'unit_warrior', at(s, 6, 2));
    expect(packableUnits(ctx, s, c)).toEqual([a.id, b.id]);
    expect(err(s, { type: 'pack_units', player: 'p1', commander: c.id, units: [far.id] })).toBe(
      'too_far',
    );
    const upkeep = unitUpkeep(ctx, s, 'p1');
    let next = act(s, {
      type: 'pack_units',
      player: 'p1',
      commander: c.id,
      units: [a.id, b.id],
    }).state;
    expect(next.units[a.id]).toBeUndefined();
    expect(next.units[c.id]!.cargo!.map((u) => u.id)).toEqual([a.id, b.id]);
    expect(unitUpkeep(ctx, next, 'p1')).toBe(upkeep);
    next = act(next, { type: 'move_unit', player: 'p1', unit: c.id, to: at(s, 3, 2) }).state;
    next = act(next, { type: 'unpack_units', player: 'p1', commander: c.id }).state;
    expect(next.units[c.id]!.cargo).toBeUndefined();
    const back = [next.units[a.id]!, next.units[b.id]!];
    expect(back.every((u) => u.moves > 0)).toBe(true);
    expect(new Set(back.map((u) => u.tile)).size).toBe(2);
  });

  it('give units in their radius extra strength', () => {
    let s = testState(FIELD);
    addUnit(s, 'p1', 'unit_army_commander', at(s, 2, 2));
    const w = addUnit(s, 'p1', 'unit_warrior', at(s, 3, 2));
    const foe = addUnit(s, 'p2', 'unit_warrior', at(s, 4, 2));
    s = act(s, { type: 'declare_war', player: 'p1', target: 'p2' }).state;
    expect(labels(previewAttack(ctx, s, s.units[w.id]!, foe.tile)!.attacker.lines).Commander).toBe(
      2,
    );
    const xp = Object.values(s.units).find((u) => u.type === 'unit_army_commander')!.xp;
    s = act(s, { type: 'attack', player: 'p1', unit: w.id, tile: foe.tile }).state;
    const after = Object.values(s.units).find((u) => u.type === 'unit_army_commander')!.xp;
    expect(after - xp).toBe(ctx.content.rules.combat.xp.commander);
  });

  it('retreat to a settlement instead of being captured, and sit out a few turns', () => {
    let s = testState(FIELD);
    s = produce(s, (d) => {
      foundSettlement(d, ctx, 'p1', at(s, 0, 0), () => {});
    });
    s = structuredClone(s);
    const c = addUnit(s, 'p1', 'unit_army_commander', at(s, 4, 2));
    const packed = addUnit(s, 'p1', 'unit_warrior', at(s, 4, 3));
    const foe = addUnit(s, 'p2', 'unit_warrior', at(s, 5, 2));
    s = act(s, { type: 'pack_units', player: 'p1', commander: c.id, units: [packed.id] }).state;
    s = act(s, { type: 'declare_war', player: 'p2', target: 'p1' }).state;
    const r = act(s, { type: 'attack', player: 'p2', unit: foe.id, tile: c.tile });
    s = r.state;
    expect(r.events.some((e) => e.type === 'commander_retreated')).toBe(true);
    const back = s.units[c.id]!;
    expect(back.owner).toBe('p1');
    expect(back.tile).toBe(at(s, 0, 0));
    expect(back.cargo).toBeUndefined();
    // Its warrior was put back on the map, next to where the commander was caught.
    expect(s.units[packed.id]!.owner).toBe('p1');
    expect(err(s, { type: 'move_unit', player: 'p1', unit: c.id, to: at(s, 1, 0) })).toBe(
      'recovering',
    );
    s = endTurn(s);
    expect(s.units[c.id]!.moves).toBe(0);
  });
});
