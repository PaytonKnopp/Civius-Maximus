import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { EngineContext } from '../context';
import type { GameEvent } from '../events';
import { opinionOf } from '../diplomacy/rules';
import type { GameState } from '../state';
import { act, addUnit, at, ctx, testState } from '../testing/world';
import { playerView } from '../view';
import { espionageTurn, missionChance, missionProblem, spiesOf } from './espionage';

const PLAINS = [
  '................',
  '................',
  '................',
  '................',
  '................',
];

/** A context whose missions always work (or always fail and get caught). */
function rigged(works: boolean): EngineContext {
  const r = ctx.content.rules.espionage;
  return {
    content: {
      ...ctx.content,
      rules: {
        ...ctx.content.rules,
        espionage: {
          ...r,
          minChance: works ? 100 : 0,
          maxChance: works ? 100 : 0,
          seenChance: 0,
          caughtChance: 100,
        },
      },
    },
  };
}

/** p1 and p2 each with a capital; p1 knows Diplomatic Service (one spy). */
function twoCapitals(): { s: GameState; mine: string; theirs: string } {
  let s = testState(PLAINS);
  const a = addUnit(s, 'p1', 'unit_settler', at(s, 2, 2));
  const b = addUnit(s, 'p2', 'unit_settler', at(s, 13, 2));
  s = act(s, { type: 'found_settlement', player: 'p1', unit: a.id }).state;
  s = act(s, { type: 'found_settlement', player: 'p2', unit: b.id }).state;
  s = produce(s, (d) => {
    d.players.p1!.civics.done.push('civic_diplomatic_service');
    d.players.p2!.gold = 100_000;
  });
  return { s, mine: s.players.p1!.capital!, theirs: s.players.p2!.capital! };
}

function turns(s: GameState, n: number, c: EngineContext = ctx) {
  const events: GameEvent[] = [];
  for (let i = 0; i < n; i++) {
    s = produce(s, (d) => {
      espionageTurn(d, c, (e) => events.push(e));
      d.turn++;
    });
  }
  return { s, events };
}

describe('espionage', () => {
  it('gives a spy per capacity civic, which travels and steals gold', () => {
    const { s: start, theirs } = twoCapitals();
    let { s, events } = turns(start, 1);
    expect(events.some((e) => e.type === 'spy_recruited' && e.name === 'Ash')).toBe(true);
    expect(spiesOf(s, 'p2')).toHaveLength(0);
    const [spy] = spiesOf(s, 'p1')[0]!;
    s = act(s, { type: 'send_spy', player: 'p1', spy, settlement: theirs }).state;
    expect(missionProblem(ctx, s, 'p1', spy, 'mission_skim_treasury')?.code).toBe('travelling');
    s = turns(s, 3).s;
    expect(missionProblem(ctx, s, 'p1', spy, 'mission_skim_treasury')).toBeUndefined();
    // A counterspy is only for your own settlements.
    expect(missionProblem(ctx, s, 'p1', spy, 'mission_watch_gates')?.code).toBe('not_own');
    s = act(s, {
      type: 'start_spy_mission',
      player: 'p1',
      spy,
      mission: 'mission_skim_treasury',
    }).state;
    const gold = s.players.p1!.gold;
    const sure = rigged(true);
    ({ s, events } = turns(s, 6, sure));
    // 15% of 1000 gold, up to 300.
    expect(s.players.p1!.gold - gold).toBe(15_000);
    expect(events.find((e) => e.type === 'spy_mission')).toMatchObject({ outcome: 'success' });
    expect(events.find((e) => e.type === 'spy_noticed')).toMatchObject({ by: null });
    expect(s.espionage!.spies[spy]!.rank).toBe(2);
  });

  it('is harder against a counterspy, and a caught spy sours the victim', () => {
    const { s: start, theirs } = twoCapitals();
    let s = produce(turns(start, 1).s, (d) => {
      d.players.p2!.civics.done.push('civic_diplomatic_service');
    });
    s = turns(s, 1).s;
    const [ours] = spiesOf(s, 'p1')[0]!;
    const [guard] = spiesOf(s, 'p2')[0]!;
    s = act(s, { type: 'send_spy', player: 'p1', spy: ours, settlement: theirs }).state;
    s = act(s, { type: 'send_spy', player: 'p2', spy: guard, settlement: theirs }).state;
    s = turns(s, 3).s;
    const def = ctx.content.entities.spyMission.mission_skim_treasury!;
    const before = missionChance(ctx, s, s.espionage!.spies[ours]!, def, s.settlements[theirs]!);
    s = act(s, {
      type: 'start_spy_mission',
      player: 'p2',
      spy: guard,
      mission: 'mission_watch_gates',
    }).state;
    const after = missionChance(ctx, s, s.espionage!.spies[ours]!, def, s.settlements[theirs]!);
    expect(before - after).toBe(ctx.content.rules.espionage.counterspy);

    s = act(s, {
      type: 'start_spy_mission',
      player: 'p1',
      spy: ours,
      mission: 'mission_skim_treasury',
    }).state;
    const r = turns(s, 6, rigged(false));
    expect(r.s.espionage!.spies[ours]).toBeUndefined();
    expect(r.events.find((e) => e.type === 'spy_noticed')).toMatchObject({
      by: 'p1',
      outcome: 'caught',
    });
    const opinion = opinionOf(ctx, r.s, 'p2', 'p1');
    expect(opinion.lines.some((l) => l.label === 'Caught spying on us')).toBe(true);
  });

  it("hides other players' spies from a player's view", () => {
    const { s: start } = twoCapitals();
    const s = turns(start, 1).s;
    expect(Object.keys(playerView(ctx, s, 'p1').espionage!.spies)).toHaveLength(1);
    expect(Object.keys(playerView(ctx, s, 'p2').espionage!.spies)).toHaveLength(0);
    // With the setting off, nobody gets spies.
    const off = produce(start, (d) => {
      d.settings.espionage = false;
    });
    expect(spiesOf(turns(off, 2).s, 'p1')).toHaveLength(0);
  });
});
