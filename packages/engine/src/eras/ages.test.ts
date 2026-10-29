import { compileFromDirs } from '@cx/content/node';
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { applyAction, createGame, type GameSetup } from '../game';
import { activeSources } from '../progress/sources';
import type { GameState } from '../state';
import { agesTurn, awardMoments, thresholds } from './ages';

const ctx = { content: compileFromDirs().content! };
const setup: GameSetup = {
  gameId: 'ages',
  settings: {
    seed: 'ages',
    turnLimit: null,
    map: {
      script: 'continents',
      size: 'tiny',
      wrapX: true,
      resources: 'standard',
      startBalance: 'normal',
    },
  },
  players: [
    { id: 'p1', name: 'One', kind: 'human' },
    { id: 'p2', name: 'Two', kind: 'ai' },
  ],
};

/** Finishes every Ancient tech and civic for p1, so its era moves on. */
function intoClassical(s: GameState): GameState {
  return produce(s, (d) => {
    const p = d.players.p1!;
    const ancient = (era: string) => ctx.content.entities.era[era]!.order <= 2;
    p.techs.done = ctx.content.ids.tech.filter((t) => ancient(ctx.content.entities.tech[t]!.era));
    p.civics.done = ctx.content.ids.civic.filter((c) =>
      ancient(ctx.content.entities.civic[c]!.era),
    );
  });
}

describe('eras and ages', () => {
  it('earns era score for historic moments, within caps', () => {
    const s = createGame(setup, ctx);
    const events: { type: string }[] = [];
    const next = produce(s, (d) => {
      awardMoments(
        d,
        ctx,
        [
          {
            type: 'wonder_completed',
            settlement: 's1',
            owner: 'p1',
            wonder: 'x',
            tile: 0,
            visibleTo: 'all',
          },
          ...Array.from({ length: 9 }, () => ({
            type: 'unit_killed' as const,
            unit: 'u',
            owner: 'p2',
            unitType: 'unit_warrior',
            tile: 0,
            by: 'p1',
            visibleTo: 'all' as const,
          })),
        ],
        (e) => events.push(e),
      );
    });
    const wonder = ctx.content.entities.moment.moment_wonder!.score;
    const kill = ctx.content.entities.moment.moment_kill!;
    expect(next.players.p1!.ages!.score).toBe(wonder + kill.score * kill.cap!);
    expect(events.filter((e) => e.type === 'historic_moment')).toHaveLength(1 + kill.cap!);
  });

  it('starts a dark, golden or heroic age from the last era score', () => {
    const base = intoClassical(createGame(setup, ctx));
    const { dark, golden } = thresholds(ctx, 1);
    const ageAfter = (score: number, before = 'age_normal') =>
      produce(base, (d) => {
        d.players.p1!.ages!.score = score;
        d.players.p1!.ages!.age = before;
        agesTurn(d, ctx, () => {});
      }).players.p1!.ages!;
    expect(ageAfter(dark - 1).age).toBe('age_dark');
    expect(ageAfter(dark).age).toBe('age_normal');
    expect(ageAfter(golden).age).toBe('age_golden');
    expect(ageAfter(golden, 'age_dark').age).toBe('age_heroic');
    expect(ageAfter(golden, 'age_dark').pending).toBe(3);
    // The first civ into an era gets the world-first moment.
    expect(ageAfter(0).score).toBe(ctx.content.entities.moment.moment_era_first!.score);
  });

  it('lets the player pick dedications, whose effects then apply', () => {
    const s = produce(intoClassical(createGame(setup, ctx)), (d) => agesTurn(d, ctx, () => {}));
    const r = applyAction(
      s,
      { type: 'choose_dedications', player: 'p1', dedications: ['ded_learning'] },
      ctx,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.players.p1!.ages!.pending).toBe(0);
    expect(activeSources(ctx, r.state.players.p1!).map((x) => x.id)).toContain('ded_learning');
    const again = applyAction(
      r.state,
      { type: 'choose_dedications', player: 'p1', dedications: ['ded_muses'] },
      ctx,
    );
    expect(again.ok).toBe(false);
  });
});
