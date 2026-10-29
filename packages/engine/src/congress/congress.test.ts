import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../events';
import { applyAction } from '../game';
import { activeSources } from '../progress/sources';
import type { GameState } from '../state';
import { act, addUnit, at, ctx, testState } from '../testing/world';
import { playerView } from '../view';
import { congressTurn, diplomaticPoints, voteCost } from './congress';

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
