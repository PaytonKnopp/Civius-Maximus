import { compileFromDirs } from '@cx/content/node';
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { applyAction, createGame, type GameSetup } from '../game';
import { settlementYields } from '../settlements/rules';
import type { GameState } from '../state';
import { governorOf, titlesAvailable } from './governors';
import { governorsTurn } from './governors';

const ctx = { content: compileFromDirs().content! };
const setup: GameSetup = {
  gameId: 'governors',
  settings: {
    seed: 'governors',
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

function founded(): GameState {
  const s = createGame(setup, ctx);
  const settler = Object.values(s.units).find(
    (u) => u.owner === 'p1' && u.type === 'unit_settler',
  )!;
  const r = applyAction(s, { type: 'found_settlement', player: 'p1', unit: settler.id }, ctx);
  if (!r.ok) throw new Error(r.error.message);
  // Two title civics done: two titles.
  return produce(r.state, (d) => {
    d.players.p1!.civics.done.push(...ctx.content.rules.governors.titleCivics.slice(0, 2));
  });
}

const ok = (s: GameState, a: Parameters<typeof applyAction>[1]) => {
  const r = applyAction(s, a, ctx);
  if (!r.ok) throw new Error(r.error.message);
  return r.state;
};

describe('governors', () => {
  it('appoints with a title, promotes with another, and refuses without', () => {
    let s = founded();
    expect(titlesAvailable(ctx, s.players.p1!)).toBe(2);
    s = ok(s, { type: 'appoint_governor', player: 'p1', governor: 'gov_scholar' });
    s = ok(s, {
      type: 'promote_governor',
      player: 'p1',
      governor: 'gov_scholar',
      promotion: 'scholar_library',
    });
    expect(titlesAvailable(ctx, s.players.p1!)).toBe(0);
    const r = applyAction(
      s,
      { type: 'appoint_governor', player: 'p1', governor: 'gov_steward' },
      ctx,
    );
    expect(r.ok).toBe(false);
    const locked = applyAction(
      produce(s, (d) => {
        d.players.p1!.civics.done.push(ctx.content.rules.governors.titleCivics[2]!);
      }),
      {
        type: 'promote_governor',
        player: 'p1',
        governor: 'gov_scholar',
        promotion: 'scholar_muses',
      },
      ctx,
    );
    expect(locked.ok).toBe(false);
  });

  it('applies its bonus only in its settlement, once established', () => {
    let s = founded();
    const city = Object.values(s.settlements).find((x) => x.owner === 'p1')!;
    const science = (st: GameState) =>
      settlementYields(ctx, st, st.settlements[city.id]!).total.science ?? 0;
    const before = science(s);
    s = ok(s, { type: 'appoint_governor', player: 'p1', governor: 'gov_scholar' });
    s = ok(s, {
      type: 'promote_governor',
      player: 'p1',
      governor: 'gov_scholar',
      promotion: 'scholar_library',
    });
    s = ok(s, {
      type: 'assign_governor',
      player: 'p1',
      governor: 'gov_scholar',
      settlement: city.id,
    });
    expect(governorOf(s, city.id)).toBeUndefined();
    expect(science(s)).toBe(before);
    s = produce(s, (d) => {
      d.turn += ctx.content.rules.governors.establishTurns;
      governorsTurn(d, ctx, () => {});
    });
    expect(governorOf(s, city.id)).toBe('gov_scholar');
    expect(science(s)).toBeGreaterThan(before);
  });
});
