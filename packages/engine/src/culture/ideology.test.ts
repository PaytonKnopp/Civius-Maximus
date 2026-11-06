import { describe, expect, it } from 'vitest';
import { happinessOf } from '../settlements/rules';
import type { GameState } from '../state';
import { act, addUnit, at, ctx, testState } from '../testing/world';
import { campOf, ideologyHappinessUnder, ideologyPressure } from './ideology';

const LAND = ['..............', '..............', '..............', '..............'];
const r = ctx.content.rules.culture;

/** p1 (100 domestic tourists) and p2, with `visitors` of p2's tourists visiting p1. */
function pressed(p1Gov: string, p2Gov: string, visitors: number): GameState {
  let s = testState(LAND);
  const a = addUnit(s, 'p1', 'unit_settler', at(s, 2, 1));
  s = structuredClone(act(s, { type: 'found_settlement', player: 'p1', unit: a.id }).state);
  const b = addUnit(s, 'p2', 'unit_settler', at(s, 11, 2));
  s = structuredClone(act(s, { type: 'found_settlement', player: 'p2', unit: b.id }).state);
  s.players.p1!.government = p1Gov;
  s.players.p2!.government = p2Gov;
  s.players.p1!.lifetimeCulture = 100 * r.culturePerTourist * 100;
  s.tourism = { p2: { p1: visitors * r.tourismPerTourist * 100 } };
  return s;
}

const lines = (s: GameState) => happinessOf(ctx, s, s.settlements[s.players.p1!.capital!]!).lines;

describe('ideologies (D118)', () => {
  it('late governments fall into camps', () => {
    const s = pressed('government_democracy', 'government_militarism', 0);
    expect(campOf(ctx, s, 'p1')?.name).toBe('Liberty');
    expect(campOf(ctx, s, 'p2')?.name).toBe('Dominion');
    s.players.p1!.government = 'government_chiefdom';
    expect(campOf(ctx, s, 'p1')).toBeUndefined();
  });

  it('visitors from a rival camp cost happiness, step by step, up to a cap', () => {
    expect(lines(pressed('government_democracy', 'government_militarism', 30))).toContainEqual({
      label: 'Ideological pressure (p2)',
      amount: -1,
    });
    expect(
      ideologyPressure(ctx, pressed('government_democracy', 'government_militarism', 60), 'p1')
        ?.happiness,
    ).toBe(-2);
    expect(
      ideologyPressure(ctx, pressed('government_democracy', 'government_militarism', 1000), 'p1')
        ?.happiness,
    ).toBe(-ctx.content.rules.ideology.maxUnhappiness);
    // Too few to matter, or no camp of your own: nothing.
    expect(
      ideologyPressure(ctx, pressed('government_democracy', 'government_militarism', 20), 'p1')
        ?.happiness,
    ).toBe(0);
    expect(
      lines(pressed('government_chiefdom', 'government_militarism', 60)).map((l) => l.label),
    ).not.toContain('Ideological pressure (p2)');
  });

  it('the same camp as a strong culture is a small comfort, and the AI can see it coming', () => {
    const s = pressed('government_democracy', 'government_digital_republic', 30);
    expect(lines(s)).toContainEqual({ label: 'Shared ideology (Liberty)', amount: 1 });
    const rival = pressed('government_democracy', 'government_militarism', 30);
    expect(ideologyHappinessUnder(ctx, rival, 'p1', 'government_corporate_federation')).toBe(1);
    expect(ideologyHappinessUnder(ctx, rival, 'p1', 'government_technocracy')).toBe(-1);
    expect(ideologyHappinessUnder(ctx, rival, 'p1', 'government_monarchy')).toBe(0);
  });
});
