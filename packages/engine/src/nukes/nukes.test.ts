import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { opinionOf } from '../diplomacy/rules';
import { applyAction } from '../game';
import { itemProblem, tileYields } from '../settlements/rules';
import { spaceProblem, spaceStep } from '../science/space';
import type { GameState } from '../state';
import { playAiTurn } from '../ai';
import { act, addUnit, at, ctx, testState } from '../testing/world';
import { canTraverse } from '../units/movement';
import { falloutTurn, nukeProblem } from './nukes';

const LAND = [
  '..............',
  '..m...........',
  '..............',
  '~~~~..........',
  '..............',
];

/** p1's capital in the west, p2's in the east, at war; p1 has an Atomic Bomb at home. */
function atWar(): { s: GameState; theirs: string; bomb: string } {
  let s = testState(LAND);
  const a = addUnit(s, 'p1', 'unit_settler', at(s, 1, 2));
  const b = addUnit(s, 'p2', 'unit_settler', at(s, 9, 2));
  s = act(s, { type: 'found_settlement', player: 'p1', unit: a.id }).state;
  s = act(s, { type: 'found_settlement', player: 'p2', unit: b.id }).state;
  let bomb = '';
  s = produce(s, (d) => {
    bomb = addUnit(d as GameState, 'p1', 'unit_atomic_bomb', at(s, 1, 2)).id;
    addUnit(d as GameState, 'p2', 'unit_warrior', at(s, 10, 2));
    d.settlements[d.players.p2!.capital!]!.population = 8;
  });
  return { s, theirs: s.players.p2!.capital!, bomb };
}

describe('the Atomic and Information eras', () => {
  it('flies aircraft over mountains and water', () => {
    const s = testState(LAND);
    const fighter = { id: 'u1', owner: 'p1', type: 'unit_fighter' };
    expect(canTraverse(ctx, s, fighter, at(s, 2, 1))).toBe(true);
    expect(canTraverse(ctx, s, fighter, at(s, 1, 3))).toBe(true);
    const infantry = { id: 'u2', owner: 'p1', type: 'unit_infantry' };
    expect(canTraverse(ctx, s, infantry, at(s, 2, 1))).toBe(false);
  });

  it('speeds an expedition on its way with laser relays', () => {
    const s = testState(LAND);
    expect(spaceProblem(ctx, s, 'p1', 'project_laser_relay')?.code).toBe('no_expedition');
    const flying = produce(s, (d) => {
      d.players.p1!.expeditionArrives = d.turn + 10;
    });
    expect(spaceProblem(ctx, flying, 'p1', 'project_laser_relay')).toBeUndefined();
    const sooner = produce(flying, (d) => spaceStep(d, ctx, 'p1', 'project_laser_relay', () => {}));
    expect(sooner.players.p1!.expeditionArrives).toBe(flying.turn + 8);
  });
});

describe('nukes', () => {
  it('only strike an enemy, and wreck what they hit', () => {
    const { s: start, theirs, bomb } = atWar();
    const target = start.settlements[theirs]!.tile;
    expect(nukeProblem(ctx, start, 'p1', bomb, target)?.code).toBe('not_at_war');
    let s = produce(start, (d) => {
      d.wars.push('p1|p2');
    });
    expect(nukeProblem(ctx, s, 'p1', bomb, target)).toBeUndefined();
    const before = tileYields(ctx, s, target + 1, 'p2').total;
    expect(Object.keys(before).length).toBeGreaterThan(0);
    const r = act(s, { type: 'launch_nuke', player: 'p1', unit: bomb, tile: target });
    s = r.state;
    expect(s.units[bomb]).toBeUndefined();
    expect(Object.values(s.units).some((u) => u.owner === 'p2')).toBe(false);
    expect(s.settlements[theirs]!.population).toBe(4);
    expect(tileYields(ctx, s, target + 1, 'p2').total).toEqual({});
    expect(
      opinionOf(ctx, s, 'p2', 'p1').lines.some((l) => l.label === 'Used nuclear weapons'),
    ).toBe(true);
    // The fallout clears in time.
    const later = produce(s, (d) => {
      d.turn += ctx.content.rules.nukes.falloutTurns + 1;
      falloutTurn(d);
    });
    expect(Object.keys(tileYields(ctx, later, target + 1, 'p2').total).length).toBeGreaterThan(0);
  });

  it('are out of the game with the setting off', () => {
    const { s: start, theirs, bomb } = atWar();
    const off = produce(start, (d) => {
      d.settings.nukes = false;
      d.wars.push('p1|p2');
    });
    const r = applyAction(
      off,
      { type: 'launch_nuke', player: 'p1', unit: bomb, tile: off.settlements[theirs]!.tile },
      ctx,
    );
    expect(r.ok).toBe(false);
    const capital = off.settlements[off.players.p1!.capital!]!;
    expect(itemProblem(ctx, off, capital, { kind: 'unit', id: 'unit_atomic_bomb' })?.code).not.toBe(
      undefined,
    );
  });

  it('are used by the AI on a big enemy city in range', () => {
    const { s: start, theirs } = atWar();
    let s = produce(start, (d) => {
      d.wars.push('p1|p2');
    });
    const events: string[] = [];
    s = playAiTurn(ctx, s, 'p1', (a) => {
      const r = applyAction(s, a, ctx);
      if (!r.ok) return undefined;
      s = r.state;
      events.push(...r.events.map((e) => e.type));
      return s;
    });
    expect(events).toContain('nuke_launched');
    expect(s.settlements[theirs]!.population).toBeLessThan(8);
  });
});
