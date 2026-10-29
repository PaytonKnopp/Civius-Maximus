import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { EngineContext } from '../context';
import type { GameEvent } from '../events';
import { generateMap } from '../map/generate';
import { makeRandom } from '../map/random';
import { createRng } from '../rng';
import { tileYields } from '../settlements/rules';
import type { GameState } from '../state';
import { act, addUnit, at, ctx, testState } from '../testing/world';
import { climateOf, disastersTurn } from './disasters';

const ISLAND = [
  '~~~~~~~~~~~~',
  '~..........~',
  '~..........~',
  '~..........~',
  '~..........~',
  '~~~~~~~~~~~~',
];

/** Only the disaster given, sure to strike and to damage what it hits. */
function only(id: string, extra: Partial<EngineContext['content']['rules']> = {}): EngineContext {
  const content = ctx.content;
  const disaster = Object.fromEntries(
    Object.entries(content.entities.disaster).map(([k, d]) => [
      k,
      k === id ? { ...d, chance: 1000, pillage: 100 } : { ...d, chance: 0 },
    ]),
  );
  return {
    content: {
      ...content,
      entities: { ...content.entities, disaster },
      rules: { ...content.rules, ...extra },
    },
  };
}

function run(s: GameState, c: EngineContext, turns = 1) {
  const events: GameEvent[] = [];
  for (let i = 0; i < turns; i++) {
    s = produce(s, (d) => {
      disastersTurn(d, c, (e) => events.push(e));
      d.turn++;
    });
  }
  return { s, events };
}

/** A capital at (2, 2) with a farmed floodplain next door and a warrior on it. */
function riverside(): { s: GameState; farm: number; unit: string } {
  let s = testState(ISLAND);
  const settler = addUnit(s, 'p1', 'unit_settler', at(s, 2, 2));
  s = act(s, { type: 'found_settlement', player: 'p1', unit: settler.id }).state;
  const farm = at(s, 3, 2);
  let unit = '';
  s = produce(s, (d) => {
    d.turn = 20;
    d.map.tiles[farm]!.feature = 'floodplains_grassland';
    d.map.tiles[farm]!.improvement = 'improvement_farm';
    unit = addUnit(d as GameState, 'p1', 'unit_warrior', farm).id;
  });
  return { s, farm, unit };
}

describe('disasters', () => {
  it('floods damage improvements and units, leave fertile silt, and are repaired in time', () => {
    const { s: start, farm, unit } = riverside();
    const before = tileYields(ctx, start, farm, 'p1').total.food ?? 0;
    const c = only('disaster_flood');
    const first = run(start, c);
    const events = first.events;
    let s = first.s;
    const e = events.find((x) => x.type === 'disaster');
    expect(e).toMatchObject({ disaster: 'disaster_flood', pillaged: 1 });
    expect(s.map.tiles[farm]!.pillaged).toBeGreaterThan(s.turn);
    expect(s.map.tiles[farm]!.fertile).toEqual({ food: 1 });
    expect(s.units[unit]!.health).toBe(ctx.content.rules.combat.maxHealth - 15);
    // While damaged, the farm gives nothing; the silt still does.
    const damaged = tileYields(ctx, s, farm, 'p1').total.food ?? 0;
    expect(damaged).toBeLessThan(before + 100);
    // No more floods; the farm comes back after the repair turns.
    ({ s } = run(s, only('none'), ctx.content.rules.disasters.repairTurns + 1));
    expect(s.map.tiles[farm]!.pillaged).toBeUndefined();
    expect(tileYields(ctx, s, farm, 'p1').total.food).toBe(before + 100);
  });

  it('raises the seas over low coastal land once emissions reach a phase', () => {
    let s = testState(ISLAND);
    const settler = addUnit(s, 'p1', 'unit_settler', at(s, 2, 2));
    s = act(s, { type: 'found_settlement', player: 'p1', unit: settler.id }).state;
    const coastLand = at(s, 1, 1);
    s = produce(s, (d) => {
      d.settlements[d.players.p1!.capital!]!.buildings.push('building_factory');
    });
    const c = only('none', {
      climate: { phases: [{ name: 'Test', at: 1, submerged: 100, disasters: 50 }] },
    });
    const { s: after, events } = run(s, c);
    expect(climateOf(c, after)).toMatchObject({ phase: 1, disasters: 50 });
    expect(events.some((e) => e.type === 'sea_level_rose')).toBe(true);
    expect(after.map.tiles[coastLand]!.terrain).toBe('coast');
    // The capital itself never goes under.
    const capital = after.settlements[after.players.p1!.capital!]!;
    expect(after.map.tiles[capital.tile]!.terrain).toBe('grassland');
  });

  it('does nothing with the setting off', () => {
    const { s: start } = riverside();
    const off = produce(start, (d) => {
      d.settings.disasters = false;
    });
    expect(run(off, only('disaster_flood')).events).toHaveLength(0);
  });

  it('puts volcanoes on some mountains, last in map generation', () => {
    const volcanoes = ['a', 'b', 'c'].flatMap((seed) => {
      const { map } = generateMap(
        {
          content: ctx.content,
          settings: {
            script: 'continents',
            size: 'standard',
            wrapX: true,
            resources: 'standard',
            startBalance: 'normal',
          },
          players: [{ id: 'p1' }, { id: 'p2' }],
        },
        makeRandom(createRng(seed)),
      );
      return map.tiles.filter((t) => t.feature === 'volcano');
    });
    expect(volcanoes.length).toBeGreaterThan(0);
    expect(volcanoes.every((t) => t.elevation === 'mountain')).toBe(true);
  });
});
