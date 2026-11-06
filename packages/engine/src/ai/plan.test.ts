import { describe, expect, it } from 'vitest';
import type { GameState, SettlementState } from '../state';
import { act, addUnit, at, ctx, testState } from '../testing/world';
import { SCHOLARS_AT, scholars, wonderAppetite, wonderLead } from './cities';
import { victoryPlan, withPlan } from './plan';
import { personalityOf, Turn } from './turn';
import { yieldWeight } from './values';

/** `.` grassland, `p` plains, `h` hills, `w` woods, `m` mountain, `~` coast. */
const MAP = [
  '~~~~~~~~~~~~~~~~~~',
  '~..p.h.w..p.....p~',
  '~.p..m..p..h..p..~',
  '~..h..w...p......~',
  '~.w..p..h..w..p..~',
  '~..p...m..p......~',
  '~~~~~~~~~~~~~~~~~~',
];

/** p1's capital at (4, 3) and p2's at (13, 3), every tile explored. Mutable. */
function world(): { s: GameState; city: SettlementState } {
  let s = testState(MAP, { explored: true });
  const a = addUnit(s, 'p1', 'unit_settler', at(s, 4, 3));
  s = act(s, { type: 'found_settlement', player: 'p1', unit: a.id }).state;
  s = structuredClone(s);
  const b = addUnit(s, 'p2', 'unit_settler', at(s, 13, 3));
  s = act(s, { type: 'found_settlement', player: 'p2', unit: b.id }).state;
  s = structuredClone(s);
  return { s, city: s.settlements[s.players.p1!.capital!]! };
}

const turn = (s: GameState) => new Turn(ctx, s, 'p1', () => undefined);

/** A leader by temperament, from the base content. */
function leaderWhere(pick: (p: { culture: number; science: number; faith: number }) => boolean) {
  const id = ctx.content.ids.leader.find((l) => pick(ctx.content.entities.leader[l]!.personality));
  expect(id).toBeDefined();
  return id!;
}

describe('victory plans (D121)', () => {
  it('a leader who loves culture plays for it; one of faith once it has a religion', () => {
    const { s } = world();
    const plan = () => victoryPlan(ctx, s, 'p1', personalityOf(ctx, s, 'p1'));
    s.players.p1!.leader = leaderWhere((p) => p.culture >= 8 && p.culture >= p.science);
    expect(plan()).toBe('culture');
    expect(turn(s).plan).toBe('culture');
    s.settings.culture = false;
    expect(plan()).toBeNull();

    s.players.p1!.leader = leaderWhere((p) => p.faith >= 7 && p.culture < 8);
    expect(plan()).toBeNull();
    s.players.p1!.religion = 'religion_test';
    expect(plan()).toBe('religion');
    s.settings.religion = false;
    expect(plan()).toBeNull();
  });

  it('a culture plan wants tourism four times as much, and culture and wonders more', () => {
    const { s } = world();
    const me = personalityOf(ctx, s, 'p1');
    const planned = withPlan(me, 'culture');
    expect(planned.culture).toBe(Math.min(10, me.culture + 2));
    expect(planned.wonders).toBe(Math.min(10, me.wonders + 2));
    const plain = { ...planned, tourismFocus: undefined };
    expect(yieldWeight(planned, 'tourism')).toBe(4 * yieldWeight(plain, 'tourism'));
    expect(yieldWeight(planned, 'science')).toBe(yieldWeight(plain, 'science'));
    expect(withPlan(me, null)).toBe(me);
  });
});

describe('AI builds (D121)', () => {
  it('a big city keeps a Campus, then a Library', () => {
    const { s, city } = world();
    s.players.p1!.techs.done.push('tech_writing');
    city.population = SCHOLARS_AT - 1;
    expect(scholars(turn(s), city)).toBeUndefined();
    city.population = SCHOLARS_AT;
    const campus = scholars(turn(s), city);
    expect(campus).toMatchObject({ kind: 'district', id: 'district_campus' });
    expect(campus?.tile).toBeDefined();
    // Built: the Library is next, then nothing more.
    const tile = campus!.tile!;
    s.map.tiles[tile]!.district = 'district_campus';
    s.map.tiles[tile]!.settlement = city.id;
    s.map.tiles[tile]!.owner = 'p1';
    city.districts.push({ id: 'district_campus', tile });
    expect(scholars(turn(s), city)).toEqual({ kind: 'building', id: 'building_library' });
    city.buildings.push('building_library');
    expect(scholars(turn(s), city)).toBeUndefined();
  });

  it('counts wonders against the civs it has met, and eases off past a fair share', () => {
    const { s, city } = world();
    expect(wonderLead(turn(s))).toBe(0);
    city.wonders.push('wonder_pyramids', 'wonder_oracle', 'wonder_stonehenge', 'wonder_petra');
    const rival = s.settlements[s.players.p2!.capital!]!;
    rival.wonders.push('wonder_colossus');
    expect(wonderLead(turn(s))).toBe(3);

    // Up to two more than the average: as keen as ever; past it, quicker and less tempting.
    expect(wonderAppetite(5, 2)).toEqual({ turns: 30, percent: 100 });
    expect(wonderAppetite(5, 3)).toEqual({ turns: 26, percent: 75 });
    expect(wonderAppetite(5, 10)).toEqual({ turns: 10, percent: 27 });
  });
});
