import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../events';
import { neighbors } from '../map/hex';
import { activeSources } from '../progress/sources';
import type { GameState } from '../state';
import { act, addUnit, at, ctx, endTurn, testState } from '../testing/world';
import { canBuyWithFaith, isBuyable, itemCost, itemProblem, purchaseCost } from './rules';

const LAND = ['..........', '..........', '..........', '..........', '..........'];

function capital(): { s: GameState; id: string } {
  let s = testState(LAND);
  const settler = addUnit(s, 'p1', 'unit_settler', at(s, 4, 2));
  s = structuredClone(act(s, { type: 'found_settlement', player: 'p1', unit: settler.id }).state);
  return { s, id: s.players.p1!.capital! };
}

describe('government legacies (D113)', () => {
  it('time in one government earns lasting bonuses of its kind, up to a cap', () => {
    const { s: start } = capital();
    let s = structuredClone(start);
    s.players.p1!.government = 'government_monarchy';
    s.players.p1!.legacyClock = ctx.content.rules.progress.legacy.everyTurns - 2;
    s = endTurn(s);
    expect(s.players.p1!.legacies).toBeUndefined();
    const events: GameEvent[] = [];
    for (const p of s.playerOrder) {
      const r = act(s, { type: 'end_turn', player: p });
      s = r.state;
      events.push(...r.events);
    }
    expect(s.players.p1!.legacies).toEqual({ government_monarchy: 1 });
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'legacy_earned', government: 'government_monarchy' }),
    );
    expect(activeSources(ctx, s.players.p1!).map((x) => x.label)).toContain('Monarchy legacy');
    // Kept after switching, and the count starts over in the new government.
    const civic = ctx.content.entities.government.government_autocracy!.requiresCivic;
    s = structuredClone(s);
    if (civic) s.players.p1!.civics.done.push(civic);
    s.players.p1!.gold = 100_000;
    s = act(s, { type: 'set_government', player: 'p1', government: 'government_autocracy' }).state;
    expect(s.players.p1!.legacyClock).toBe(0);
    expect(activeSources(ctx, s.players.p1!).map((x) => x.label)).toContain('Monarchy legacy');
    // Three at most, scaled into one line.
    s = structuredClone(s);
    s.players.p1!.legacies = { government_monarchy: 3 };
    const line = activeSources(ctx, s.players.p1!).find(
      (x) => x.id === 'legacy:government_monarchy',
    )!;
    expect(line.label).toBe('Monarchy legacy (×3)');
    expect(line.effects[0]!.params).toEqual({ percent: 30 });
  });
});

describe('Government Plaza buildings (D110)', () => {
  it('each tier is a choice of two: building one closes the other', () => {
    const { s: start, id } = capital();
    const s = structuredClone(start);
    const c = s.settlements[id]!;
    c.districts.push({ id: 'district_government_plaza', tile: neighbors(s.map, c.tile)[0]! });
    s.players.p1!.civics.done.push('civic_political_philosophy');
    const lodge = { kind: 'building' as const, id: 'building_builders_lodge' };
    expect(itemProblem(ctx, s, c, lodge)).toBeUndefined();
    c.buildings.push('building_envoys_hall');
    expect(itemProblem(ctx, s, c, lodge)?.code).toBe('excluded');
  });
});

describe('late-game sinks (D114)', () => {
  it('gold buys repeatable district projects, at a lower rate', () => {
    const { s, id } = capital();
    const c = s.settlements[id]!;
    const grants = { kind: 'project' as const, id: 'project_research_grants' };
    expect(isBuyable(ctx, grants)).toBe(true);
    expect(isBuyable(ctx, { kind: 'project', id: 'project_satellite' })).toBe(false);
    const rates = ctx.content.rules.settlements.purchase;
    expect(purchaseCost(ctx, s, 'p1', grants, c)).toBe(
      itemCost(ctx, s, 'p1', grants, c) * rates.projectGoldPerProduction,
    );
  });

  it('faith buys buildings where the religion you founded is followed', () => {
    const { s: start, id } = capital();
    const s = structuredClone(start);
    const c = s.settlements[id]!;
    const monument = { kind: 'building' as const, id: 'building_monument' };
    expect(canBuyWithFaith(ctx, s, 'p1', monument, c)).toBe(false);
    s.players.p1!.religion = 'religion_1';
    c.religion = 'religion_2';
    expect(canBuyWithFaith(ctx, s, 'p1', monument, c)).toBe(false);
    c.religion = 'religion_1';
    expect(canBuyWithFaith(ctx, s, 'p1', monument, c)).toBe(true);
    expect(canBuyWithFaith(ctx, s, 'p1', { kind: 'unit', id: 'unit_warrior' }, c)).toBe(false);
    expect(purchaseCost(ctx, s, 'p1', monument, c, 'faith')).toBe(
      itemCost(ctx, s, 'p1', monument, c) *
        ctx.content.rules.settlements.purchase.faithPerProduction,
    );
  });
});
