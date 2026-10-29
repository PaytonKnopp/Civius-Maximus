import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { FREE } from '../context';
import type { GameEvent } from '../events';
import { settlementYields } from '../settlements/rules';
import type { GameState } from '../state';
import { act, addUnit, at, ctx, testState } from '../testing/world';
import { loyaltyOf, loyaltyTurn, turnsToFlip } from './loyalty';

const PLAINS = [
  '................',
  '................',
  '................',
  '................',
  '................',
];

/** p1's capital in the west, an outpost of p1's right next to p2's big capital in the east. */
function frontier(): { s: GameState; outpost: string; rival: string } {
  let s = testState(PLAINS);
  const settlers = (
    [
      ['p1', 1],
      ['p2', 14],
      ['p1', 10],
    ] as const
  ).map(([owner, col]) => ({
    owner,
    col,
    id: addUnit(s, owner, 'unit_settler', at(s, col, 2)).id,
  }));
  for (const u of settlers)
    s = act(s, { type: 'found_settlement', player: u.owner, unit: u.id }).state;
  const rival = s.map.tiles[at(s, 14, 2)]!.settlement!;
  const outpost = s.map.tiles[at(s, 10, 2)]!.settlement!;
  s = produce(s, (d) => {
    d.settlements[rival]!.population = 12;
  });
  return { s, outpost, rival };
}

function turn(s: GameState): { s: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const next = produce(s, (d) => loyaltyTurn(d, ctx, (e) => events.push(e)));
  return { s: next, events };
}

describe('loyalty', () => {
  it('drains an outpost next to a bigger rival, which breaks away as a free city', () => {
    const { s: start, outpost } = frontier();
    const report = loyaltyOf(ctx, start, start.settlements[outpost]!);
    expect(report.change).toBeLessThan(0);
    expect(report.strongest).toBe('p2');
    expect(turnsToFlip(report)).toBeGreaterThan(0);
    // Capitals never waver.
    const capital = start.settlements[start.players.p1!.capital!]!;
    expect(loyaltyOf(ctx, start, capital).steadfast).toBe(true);

    let s = produce(start, (d) => {
      d.settlements[outpost]!.loyalty = 5;
    });
    const r = turn(s);
    s = r.s;
    expect(s.settlements[outpost]!.owner).toBe(FREE);
    expect(s.players[FREE]?.name).toBe('Free Cities');
    expect(r.events.some((e) => e.type === 'settlement_flipped' && e.to === FREE)).toBe(true);
    // It raised defenders.
    expect(Object.values(s.units).filter((u) => u.owner === FREE).length).toBeGreaterThan(0);
    expect(s.settlements[outpost]!.loyalty).toBe(ctx.content.rules.loyalty.freeCity);
  });

  it('lets a free city join the civ that pulls on it hardest', () => {
    const { s: start, outpost } = frontier();
    let s = produce(start, (d) => {
      d.settlements[outpost]!.loyalty = 1;
    });
    s = turn(s).s;
    expect(s.settlements[outpost]!.owner).toBe(FREE);
    let joined: GameEvent | undefined;
    for (let i = 0; i < 40 && s.settlements[outpost]!.owner === FREE; i++) {
      const r = turn(s);
      s = r.s;
      joined ??= r.events.find((e) => e.type === 'settlement_flipped');
    }
    expect(s.settlements[outpost]!.owner).toBe('p2');
    expect(joined).toMatchObject({ from: FREE, to: 'p2' });
    expect(s.settlements[outpost]!.loyalty).toBe(ctx.content.rules.loyalty.afterCapture);
  });

  it('counts a governor, and costs yields while loyalty is low', () => {
    const { s: start, outpost } = frontier();
    const base = loyaltyOf(ctx, start, start.settlements[outpost]!).change;
    const governed = produce(start, (d) => {
      d.players.p1!.governors = {
        gov_envoy: { promotions: [], settlement: outpost, activeOn: 0, established: true },
      };
    });
    const withGov = loyaltyOf(ctx, governed, governed.settlements[outpost]!);
    // +8 for any governor, +4 more from the Envoy's own ability.
    expect(withGov.change - base).toBe(12);
    expect(withGov.lines.some((l) => l.label.startsWith('Governor'))).toBe(true);

    const low = produce(start, (d) => {
      d.settlements[outpost]!.loyalty = 40;
    });
    const lines = Object.values(settlementYields(ctx, low, low.settlements[outpost]!).lines).flat();
    expect(lines.some((l) => l.label.startsWith('Disloyal'))).toBe(true);
  });

  it('counts a Monument only in its own settlement', () => {
    const { s: start, outpost } = frontier();
    const base = loyaltyOf(ctx, start, start.settlements[outpost]!).change;
    const elsewhere = produce(start, (d) => {
      d.settlements[d.players.p1!.capital!]!.buildings.push('building_monument');
    });
    expect(loyaltyOf(ctx, elsewhere, elsewhere.settlements[outpost]!).change).toBe(base);
    const here = produce(start, (d) => {
      d.settlements[outpost]!.buildings.push('building_monument');
    });
    expect(loyaltyOf(ctx, here, here.settlements[outpost]!).change).toBe(base + 1);
  });

  it('does nothing with the loyalty setting off', () => {
    const { s: start, outpost } = frontier();
    const off = produce(start, (d) => {
      d.settings.loyalty = false;
      d.settlements[outpost]!.loyalty = 1;
    });
    const r = turn(off);
    expect(r.s.settlements[outpost]!.owner).toBe('p1');
    expect(r.events).toHaveLength(0);
  });
});
