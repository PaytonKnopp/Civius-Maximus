import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { GameEvent } from './events';
import { foundSettlement } from './settlements/handlers';
import { act, addUnit, at, ctx, testState } from './testing/world';
import { decodeOwners, dominationProgress, encodeOwners, scoreOf } from './victory';

describe('score', () => {
  it('counts citizens, settlements, progress, wonders and battles', () => {
    let s = testState(['..........', '..........', '..........']);
    s = produce(s, (d) => {
      foundSettlement(d, ctx, 'p1', at(s, 2, 1), () => {});
    });
    s = structuredClone(s);
    s.players.p1!.techs.done.push('tech_pottery', 'tech_mining');
    s.players.p1!.kills = 3;
    const r = ctx.content.rules.score;
    const score = scoreOf(ctx, s, 'p1');
    expect(score.total).toBe(r.perCitizen + r.perCity + 2 * r.perTech + 3 * r.perKill);
    expect(score.lines.map((l) => l.label)).toContain('Technologies');
    expect(scoreOf(ctx, s, 'p2').total).toBe(0);
  });

  it('decides the game at the turn limit', () => {
    let s = testState(['..........', '..........', '..........']);
    s = produce(s, (d) => {
      foundSettlement(d, ctx, 'p2', at(s, 6, 1), () => {});
    });
    s = { ...s, settings: { ...s.settings, turnLimit: 1 } };
    let events: GameEvent[] = [];
    for (const p of s.playerOrder) {
      const r = act(s, { type: 'end_turn', player: p });
      s = r.state;
      events = r.events;
    }
    expect(s.status).toBe('ended');
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'game_ended', reason: 'score', winner: 'p2' }),
    );
  });
});

describe('domination', () => {
  it("counts rivals' original capitals held", () => {
    let s = testState(['..........', '..........', '..........']);
    s = produce(s, (d) => {
      foundSettlement(d, ctx, 'p1', at(s, 2, 1), () => {});
      foundSettlement(d, ctx, 'p2', at(s, 7, 1), () => {});
    });
    expect(dominationProgress(s, 'p1')).toEqual({ held: 0, needed: 1 });
  });
});

describe('replay frames', () => {
  it('round-trip who owns each tile', () => {
    let s = testState(Array.from({ length: 4 }, () => '.'.repeat(12)));
    const u = addUnit(s, 'p1', 'unit_settler', at(s, 2, 1));
    s = act(s, { type: 'found_settlement', player: 'p1', unit: u.id }).state;
    const frame = decodeOwners(encodeOwners(s));
    expect(frame).toHaveLength(s.map.tiles.length);
    expect(frame[at(s, 2, 1)]).toBe('A');
    expect(frame[at(s, 3, 1)]).toBe('a');
    expect(frame[at(s, 9, 3)]).toBe('.');
    expect(encodeOwners(s).length).toBeLessThan(s.map.tiles.length);
  });
});
