import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../events';
import { applyAction } from '../game';
import { activeSources } from '../progress/sources';
import type { GameState } from '../state';
import { act, addUnit, at, ctx, testState } from '../testing/world';
import { playerView } from '../view';
import { voteInCongress } from '../ai/congress';
import { Turn } from '../ai/turn';
import { congressTurn, diplomaticPoints, favorPerTurn, voteCost } from './congress';
import { victoryProgress } from './containment';

const PLAINS = ['................', '................', '................', '................'];

/** Two capitals, and a session meeting this turn on naming a world leader and sanctions. */
function inSession(): GameState {
  let s = testState(PLAINS);
  const a = addUnit(s, 'p1', 'unit_settler', at(s, 2, 1));
  const b = addUnit(s, 'p2', 'unit_settler', at(s, 13, 1));
  s = act(s, { type: 'found_settlement', player: 'p1', unit: a.id }).state;
  s = act(s, { type: 'found_settlement', player: 'p2', unit: b.id }).state;
  return produce(s, (d) => {
    d.players.p1!.favor = 100;
    d.players.p2!.favor = 0;
    d.congress = {
      nextSession: d.turn,
      session: { turn: d.turn, agenda: ['res_world_leader', 'res_trade_sanctions'] },
      votes: {},
      passed: [],
    };
  });
}

function close(s: GameState) {
  const events: GameEvent[] = [];
  const next = produce(s, (d) => congressTurn(d, ctx, (e) => events.push(e)));
  return { s: next, events };
}

describe('World Congress', () => {
  it('prices extra votes in favor and checks ballots', () => {
    expect(voteCost(ctx, 1)).toBe(0);
    expect(voteCost(ctx, 3)).toBe(10 + 30);
    const s = inSession();
    const vote = (ballots: Parameters<typeof applyAction>[1] & { type: 'cast_votes' }) =>
      applyAction(s, ballots, ctx);
    expect(
      vote({
        type: 'cast_votes',
        player: 'p2',
        ballots: [{ resolution: 'res_world_leader', option: 'leader', target: 'p2', votes: 2 }],
      }).ok,
    ).toBe(false);
    expect(
      vote({
        type: 'cast_votes',
        player: 'p1',
        ballots: [{ resolution: 'res_world_leader', option: 'leader', target: null, votes: 1 }],
      }).ok,
    ).toBe(false);
    expect(
      vote({
        type: 'cast_votes',
        player: 'p1',
        ballots: [{ resolution: 'res_patronage', option: 'fund', target: null, votes: 1 }],
      }).ok,
    ).toBe(false);
  });

  it('counts the votes, spends favor, names a world leader and puts what passed in force', () => {
    let s = inSession();
    s = act(s, {
      type: 'cast_votes',
      player: 'p1',
      ballots: [
        { resolution: 'res_world_leader', option: 'leader', target: 'p1', votes: 3 },
        { resolution: 'res_trade_sanctions', option: 'sanction', target: 'p2', votes: 2 },
      ],
    }).state;
    s = act(s, {
      type: 'cast_votes',
      player: 'p2',
      ballots: [
        { resolution: 'res_world_leader', option: 'leader', target: 'p2', votes: 1 },
        { resolution: 'res_trade_sanctions', option: 'favor', target: 'p2', votes: 1 },
      ],
    }).state;
    // Each player sees only their own ballots.
    expect(Object.keys(playerView(ctx, s, 'p1').congress!.votes)).toEqual(['p1']);
    const r = close(s);
    s = r.s;
    expect(diplomaticPoints(ctx, s, 'p1')).toBe(2 + ctx.content.rules.congress.agendaPoints);
    // 100 favor + this turn's income − (10 + 30) − 10.
    expect(s.players.p1!.favor).toBe(100 + 1 - 40 - 10);
    expect(
      r.events.find(
        (e) => e.type === 'resolution_passed' && e.resolution === 'res_trade_sanctions',
      ),
    ).toMatchObject({ option: 'sanction', target: 'p2' });
    expect(
      activeSources(ctx, s.players.p2!).some((x) => x.id === 'res_trade_sanctions:sanction'),
    ).toBe(true);
    expect(
      activeSources(ctx, s.players.p1!).some((x) => x.id === 'res_trade_sanctions:sanction'),
    ).toBe(false);
    expect(s.congress!.session).toBeNull();
    expect(s.congress!.nextSession).toBeGreaterThan(s.turn);
  });

  it('ends the game when a civ reaches the diplomatic victory points', () => {
    let s = produce(inSession(), (d) => {
      d.players.p1!.diploPoints = ctx.content.rules.congress.victoryPoints - 2;
    });
    s = act(s, {
      type: 'cast_votes',
      player: 'p1',
      ballots: [{ resolution: 'res_world_leader', option: 'leader', target: 'p1', votes: 1 }],
    }).state;
    const r = close(s);
    expect(r.s.status).toBe('ended');
    expect(r.s.result).toEqual({ reason: 'diplomatic', winner: 'p1' });
  });

  it('does nothing with the setting off', () => {
    const s = produce(inSession(), (d) => {
      d.settings.congress = false;
    });
    expect(close(s).events).toHaveLength(0);
  });
});

describe('containment (D120)', () => {
  /** The congress formed, no session soon, and p1 three of four space projects in. */
  function nearSpace(): GameState {
    return produce(inSession(), (d) => {
      d.congress!.session = null;
      d.congress!.nextSession = d.turn + 50;
      d.players.p1!.spaceProjects = ctx.content.rules.science.projects.slice(0, 3);
      d.players.p1!.favor = 0;
      d.players.p2!.favor = 100;
    });
  }

  it('reads how far each civ is toward each victory', () => {
    const s = nearSpace();
    expect(victoryProgress(ctx, s, 'p1')).toContainEqual({ victory: 'science', percent: 75 });
    expect(victoryProgress(ctx, s, 'p2')).toContainEqual({ victory: 'science', percent: 0 });
  });

  it('calls an emergency session, and containment holds for its turns', () => {
    let { s, events } = close(nearSpace());
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'containment_called', target: 'p1', victory: 'science' }),
    );
    expect(s.congress!.session).toEqual({
      turn: s.turn + 1,
      agenda: ['res_contain_science'],
      emergency: { target: 'p1', victory: 'science' },
    });
    s = produce(s, (d) => {
      d.turn += 1;
    });
    const ballot = (option: string, votes: number, target = 'p1') => ({
      resolution: 'res_contain_science',
      option,
      target,
      votes,
    });
    // The target is fixed.
    expect(
      applyAction(
        s,
        { type: 'cast_votes', player: 'p2', ballots: [ballot('contain', 1, 'p2')] },
        ctx,
      ).ok,
    ).toBe(false);
    s = act(s, { type: 'cast_votes', player: 'p1', ballots: [ballot('decline', 1)] }).state;
    s = act(s, { type: 'cast_votes', player: 'p2', ballots: [ballot('contain', 2)] }).state;
    const favor = s.players.p2!.favor! + favorPerTurn(ctx, s, 'p2').total;
    ({ s } = close(s));
    const until = s.turn + ctx.content.rules.congress.containment.turns - 1;
    expect(s.players.p1!.contained).toEqual({
      resolution: 'res_contain_science',
      option: 'contain',
      until,
    });
    expect(s.players.p2!.favor).toBe(favor - voteCost(ctx, 2));
    expect(s.congress!.session).toBeNull();
    expect(activeSources(ctx, s.players.p1!).map((x) => x.label)).toContain(
      'Emergency: Space Race: Contain',
    );
    // Not called again while contained, nor during the cooldown.
    ({ s } = close(s));
    expect(s.congress!.session).toBeNull();
    s = produce(s, (d) => {
      d.turn = until + 1;
    });
    ({ s, events } = close(s));
    expect(s.players.p1!.contained).toBeUndefined();
    expect(events).toContainEqual(expect.objectContaining({ type: 'containment_ended' }));
    expect(s.congress!.session).toBeNull();
  });

  it('a tie leaves things as they are, and the AI votes by its side', () => {
    let { s } = close(nearSpace());
    s = produce(s, (d) => {
      d.turn += 1;
    });
    const vote = (player: string) => {
      const t = new Turn(ctx, s, player, (a) => {
        const r = applyAction(t.state, a, ctx);
        return r.ok ? r.state : undefined;
      });
      voteInCongress(t);
      s = t.state;
    };
    vote('p1');
    vote('p2');
    expect(s.congress!.votes.p1).toEqual([
      { resolution: 'res_contain_science', option: 'decline', target: 'p1', votes: 1 },
    ]);
    expect(s.congress!.votes.p2![0]!.option).toBe('contain');
    // p2 spends what it can spare on containing p1.
    expect(s.congress!.votes.p2![0]!.votes).toBeGreaterThan(1);
    s = produce(s, (d) => {
      d.congress!.votes.p2![0]!.votes = 1;
    });
    ({ s } = close(s));
    expect(s.players.p1!.contained).toBeUndefined();
  });

  it('never puts an emergency resolution on a regular agenda', () => {
    let s = nearSpace();
    s = produce(s, (d) => {
      d.players.p1!.spaceProjects = [];
    });
    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      s = produce(s, (d) => {
        d.congress!.session = null;
        d.congress!.nextSession = d.turn + 1;
      });
      ({ s } = close(s));
      for (const r of s.congress!.session!.agenda) seen.add(r);
    }
    expect(seen.size).toBeGreaterThan(3);
    expect([...seen].filter((r) => r.startsWith('res_contain'))).toEqual([]);
  });
});
