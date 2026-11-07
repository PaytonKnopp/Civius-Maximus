import { describe, expect, it } from 'vitest';
import { appealOf } from '../map/appeal';
import { neighbors } from '../map/hex';
import type { GameState } from '../state';
import { act, addUnit, at, ctx, testState } from '../testing/world';
import { appealHappiness, placementProblem } from './districts';
import { happinessOf, tileYields } from './rules';

/** `.` grassland, `w` woods. */
const LAND = ['..........', '..w.w.....', '...w......', '..w.w.....', '..........'];

function capital(): { s: GameState; id: string } {
  let s = testState(LAND);
  const settler = addUnit(s, 'p1', 'unit_settler', at(s, 6, 2));
  s = structuredClone(act(s, { type: 'found_settlement', player: 'p1', unit: settler.id }).state);
  const id = s.players.p1!.capital!;
  for (const t of s.map.tiles) {
    t.owner = 'p1';
    t.settlement = id;
  }
  return { s, id };
}

describe('new districts (D111)', () => {
  it('a Neighborhood is happier the lovelier its tile', () => {
    const { s, id } = capital();
    const lovely = at(s, 3, 1);
    const plain = at(s, 8, 4);
    expect(appealOf(ctx, s, lovely)).toBeGreaterThan(appealOf(ctx, s, plain));
    expect(appealHappiness(ctx, s, 'district_neighborhood', plain)).toBe(1);
    const c = s.settlements[id]!;
    c.districts.push({ id: 'district_neighborhood', tile: plain });
    const line = happinessOf(ctx, s, c).lines.find((l) => l.label.startsWith('Neighborhood'))!;
    expect(line.amount).toBe(1);
    // Charming land: +2; breathtaking: +3.
    const bands = ctx.content.entities.district.district_neighborhood!.happinessByAppeal;
    const at4 = bands.find((b) => b.minAppeal <= 4)!.happiness;
    expect(at4).toBe(3);
  });

  it('a Dam goes on river floodplains; a Preserve stays in its woods and enriches its neighbors', () => {
    const { s, id } = capital();
    const c = s.settlements[id]!;
    const place = (id: string, tile: number) =>
      placementProblem(ctx, s, c, { kind: 'district', id, tile });
    const dry = at(s, 7, 2);
    expect(place('district_dam', dry)?.code).toBe('bad_placement');
    // On floodplains by a river, it fits.
    const wet = at(s, 8, 2);
    s.map.tiles[wet]!.feature = 'floodplains_grassland';
    s.map.tiles[wet]!.river = 1;
    expect(place('district_dam', wet)).toBeUndefined();
    const woods = at(s, 3, 2);
    expect(place('district_preserve', dry)?.code).toBe('bad_placement');
    expect(place('district_preserve', woods)).toBeUndefined();
    // Built, it keeps its woods; the tiles around it gain culture and faith.
    s.map.tiles[woods]!.district = 'district_preserve';
    c.districts.push({ id: 'district_preserve', tile: woods });
    const next = neighbors(s.map, woods).find((t) => s.map.tiles[t]!.district === null)!;
    const y = tileYields(ctx, s, next, 'p1').total;
    expect(y.culture).toBe(100);
    expect(y.faith).toBe(100);
  });
});
