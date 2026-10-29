import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { applyAction } from '../game';
import { activateProblem } from '../greatpeople/greatpeople';
import { settlementYields } from '../settlements/rules';
import type { GameState } from '../state';
import { act, addUnit, at, ctx, testState } from '../testing/world';
import { greatWorksTurn, holdersIn, holderWorks, storedWorks, worksIn } from './greatworks';

const PLAINS = ['..........', '..........', '..........', '..........', '..........'];

/** p1's capital (with its Palace), and a great person of p1's standing in it. */
function capitalWith(person: string): { s: GameState; capital: string; unit: string } {
  let s = testState(PLAINS);
  const settler = addUnit(s, 'p1', 'unit_settler', at(s, 4, 2));
  s = act(s, { type: 'found_settlement', player: 'p1', unit: settler.id }).state;
  const capital = s.players.p1!.capital!;
  let unit = '';
  s = produce(s, (d) => {
    const u = addUnit(d as GameState, 'p1', ctx.content.rules.greatPeople.unit, at(s, 4, 2));
    d.units[u.id]!.person = person;
    unit = u.id;
  });
  return { s, capital, unit };
}

const activate = (s: GameState, unit: string) =>
  act(s, { type: 'activate_great_person', player: 'p1', unit }).state;

const withBuilding = (s: GameState, id: string, building: string) =>
  produce(s, (d) => {
    d.settlements[id]!.buildings.push(building);
  });

describe('great works', () => {
  it('makes one work per activation into empty slots, then the person is used up', () => {
    const start = capitalWith('gp_homer');
    const { capital, unit } = start;
    let s = start.s;
    // The Palace has one slot for any work.
    s = activate(s, unit);
    expect(s.units[unit]?.charges).toBe(1);
    expect(worksIn(s, capital).map(([, w]) => w.holder)).toEqual(['building_palace']);
    // Its one slot is full: the second needs a writing slot.
    expect(activateProblem(s, unit, 'p1', ctx)?.code).toBe('no_slot');
    s = withBuilding(s, capital, 'building_amphitheater');
    s = activate(s, unit);
    expect(s.units[unit]).toBeUndefined();
    expect(s.players.p1!.greatPeople).toContain('gp_homer');
    expect(worksIn(s, capital).map(([, w]) => [w.name, w.holder])).toEqual([
      ['The Iliad', 'building_palace'],
      ['The Odyssey', 'building_amphitheater'],
    ]);
    const lines = Object.values(settlementYields(ctx, s, s.settlements[capital]!).lines).flat();
    expect(lines.some((l) => l.label === 'Great works: Amphitheater')).toBe(true);
  });

  it('themes a building full of works by different people, and moves works', () => {
    const start = capitalWith('gp_homer');
    const { capital } = start;
    let { s, unit } = start;
    s = withBuilding(s, capital, 'building_amphitheater');
    // Homer's two works fill the Amphitheater (writing slots before the Palace's any slot).
    s = activate(activate(s, unit), unit);
    const amphitheater = holdersIn(ctx, s.settlements[capital]!).find(
      (h) => h.id === 'building_amphitheater',
    )!;
    expect(holderWorks(s, s.settlements[capital]!, amphitheater).themed).toBe(false);
    const tourism = (st: GameState) =>
      settlementYields(ctx, st, st.settlements[capital]!).total.tourism ?? 0;
    const before = tourism(s);

    // Ovid's first work goes to the Palace; swap it with one of Homer's.
    s = produce(s, (d) => {
      const u = addUnit(d as GameState, 'p1', ctx.content.rules.greatPeople.unit, at(s, 4, 2));
      d.units[u.id]!.person = 'gp_ovid';
      unit = u.id;
    });
    s = activate(s, unit);
    const [iliad, , metamorphoses] = worksIn(s, capital).map(([id]) => id);
    // Moving into a full building is refused.
    const full = applyAction(
      s,
      { type: 'move_great_work', player: 'p1', work: metamorphoses!, settlement: capital },
      ctx,
    );
    expect(full.ok).toBe(false);
    s = act(s, { type: 'swap_great_works', player: 'p1', a: iliad!, b: metamorphoses! }).state;
    expect(s.greatWorks![iliad!]!.holder).toBe('building_palace');
    expect(holderWorks(s, s.settlements[capital]!, amphitheater).themed).toBe(true);
    // Themed: the Amphitheater's two works yield double (+2 tourism each, so +4 more).
    expect(tourism(s) - before).toBe(2 * 100 + 4 * 100);
  });

  it('keeps works whose building is gone, and loses works with their settlement', () => {
    const start = capitalWith('gp_homer');
    const { capital, unit } = start;
    let s = activate(start.s, unit);
    s = produce(s, (d) => {
      const c = d.settlements[capital]!;
      c.buildings = c.buildings.filter((b) => b !== 'building_palace');
    });
    expect(storedWorks(ctx, s, 'p1')).toHaveLength(1);
    const gone = produce(s, (d) => {
      delete d.settlements[capital];
      greatWorksTurn(d);
    });
    expect(Object.keys(gone.greatWorks ?? {})).toHaveLength(0);
  });
});
