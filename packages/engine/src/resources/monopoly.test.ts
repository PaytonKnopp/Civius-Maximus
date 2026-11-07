import { describe, expect, it } from 'vitest';
import { neighbors } from '../map/hex';
import { sourcesFor } from '../progress/sources';
import { settlementYields } from '../settlements/rules';
import type { GameState } from '../state';
import { act, addUnit, at, ctx, testState } from '../testing/world';
import { monopolies, monopolyShare } from './monopoly';

const LAND = ['..............', '..............', '..............', '..............'];

/** p1's capital at (3, 1) with silk on `mine` of its tiles (improved) and `wild` far away. */
function silk(mine: number, wild: number): { s: GameState; capital: string } {
  let s = testState(LAND);
  const settler = addUnit(s, 'p1', 'unit_settler', at(s, 3, 1));
  s = structuredClone(act(s, { type: 'found_settlement', player: 'p1', unit: settler.id }).state);
  const capital = s.players.p1!.capital!;
  for (const t of neighbors(s.map, s.settlements[capital]!.tile).slice(0, mine)) {
    s.map.tiles[t]!.resource = 'silk';
    s.map.tiles[t]!.improvement = 'improvement_plantation';
  }
  for (let i = 0; i < wild; i++) s.map.tiles[at(s, 12, i)]!.resource = 'silk';
  return { s, capital };
}

describe('monopolies (D118)', () => {
  it('most of the map’s improved tiles of a luxury give its empire bonus', () => {
    const { s, capital } = silk(3, 1);
    expect(monopolyShare(ctx, s, 'p1', 'silk')).toEqual({ held: 3, total: 4 });
    expect(monopolies(ctx, s).get('p1')).toEqual(['silk']);
    expect(sourcesFor(ctx, s, 'p1').map((x) => x.label)).toContain('Silk monopoly');
    const culture = settlementYields(ctx, s, s.settlements[capital]!).lines.culture ?? [];
    expect(culture.map((l) => l.label)).toContain('Silk monopoly (+10%)');
  });

  it('needs more than half of them, and at least three', () => {
    expect(monopolies(ctx, silk(3, 3).s).get('p1')).toBeUndefined();
    expect(monopolies(ctx, silk(2, 0).s).get('p1')).toBeUndefined();
    // Unimproved tiles in your land don't count.
    const { s } = silk(3, 1);
    s.map.tiles[neighbors(s.map, s.settlements[s.players.p1!.capital!]!.tile)[0]!]!.improvement =
      null;
    expect(monopolies(ctx, s).get('p1')).toBeUndefined();
  });
});
