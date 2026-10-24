import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { Action } from '../actions';
import { toFixed } from '../fixed';
import { applyAction } from '../game';
import { foundSettlement } from '../settlements/handlers';
import { settlementYields, tileYields } from '../settlements/rules';
import type { GameState } from '../state';
import { act, addUnit, at, ctx, endTurn, testState } from '../testing/world';
import { playAiTurn } from '../ai';
import { hasReligiousVictory, maxReligions, pantheonOf, religiousProgress } from './rules';

// 24 wide: p1 at column 2, p2 at 9 (7 tiles: in range of p1's holy city) and 20 (out of range).
const FIELD = Array.from({ length: 5 }, () => '.'.repeat(24));
const err = (s: GameState, a: Action) => {
  const r = applyAction(s, a, ctx);
  return r.ok ? undefined : r.error.code;
};
const R = ctx.content.rules.religion;

/** p1's capital with a Holy Site at (2,2); p2's settlements at (9,2) and (20,2). */
function world() {
  let s = testState(FIELD);
  s = produce(s, (d) => {
    foundSettlement(d, ctx, 'p1', at(s, 2, 2), () => {});
    foundSettlement(d, ctx, 'p2', at(s, 9, 2), () => {});
    foundSettlement(d, ctx, 'p2', at(s, 20, 2), () => {});
    const holy = Object.keys(d.settlements)[0]!;
    const tile = at(s, 3, 2);
    d.map.tiles[tile]!.district = 'district_holy_site';
    d.settlements[holy]!.districts.push({ id: 'district_holy_site', tile });
  });
  const [holy, near, far] = Object.keys(s.settlements) as [string, string, string];
  return { s, holy, near, far };
}

/** p1's great prophet, standing in the holy city. */
function withProphet(s: GameState) {
  const u = addUnit(s, 'p1', 'unit_great_person', at(s, 2, 2));
  s.units[u.id]!.person = 'gp_zoroaster';
  return u.id;
}

const found = (unit: string, extra: Partial<Extract<Action, { type: 'found_religion' }>> = {}) =>
  ({
    type: 'found_religion',
    player: 'p1',
    unit,
    name: 'The Way',
    founder: 'bel_tithe',
    follower: 'bel_almsgiving',
    ...extra,
  }) as const;

function founded() {
  const w = world();
  const s = structuredClone(w.s) as GameState;
  const prophet = withProphet(s);
  return { ...w, s: act(s, found(prophet)).state };
}

describe('pantheons', () => {
  it('cost faith, and each belief can only be taken once', () => {
    let { s } = world();
    const pick: Action = { type: 'found_pantheon', player: 'p1', belief: 'bel_desert_mysteries' };
    expect(err(s, pick)).toBe('no_faith');
    s = produce(s, (d) => {
      d.players.p1!.faith = toFixed(R.pantheonFaith);
      d.players.p2!.faith = toFixed(R.pantheonFaith);
    });
    s = act(s, pick).state;
    expect(s.players.p1!.beliefs).toEqual(['bel_desert_mysteries']);
    expect(s.players.p1!.faith).toBe(0);
    expect(err(s, { ...pick, player: 'p2' })).toBe('belief_taken');
    expect(err(s, { ...pick, belief: 'bel_river_gods' })).toBe('has_pantheon');
    // Not a founder belief.
    expect(err(s, { ...pick, player: 'p2', belief: 'bel_tithe' })).toBe('unknown');
  });

  it("apply the belief's effects to the player's tiles", () => {
    let { s } = world();
    const desert = at(s, 1, 1);
    s = produce(s, (d) => {
      d.map.tiles[desert]!.terrain = 'desert';
      d.players.p1!.faith = toFixed(R.pantheonFaith);
    });
    const before = tileYields(ctx, s, desert).total.faith ?? 0;
    s = act(s, { type: 'found_pantheon', player: 'p1', belief: 'bel_desert_mysteries' }).state;
    expect(tileYields(ctx, s, desert).total.faith ?? 0).toBe(before + toFixed(1));
  });
});

describe('founding a religion', () => {
  it('takes a great prophet in a settlement with a holy site', () => {
    const w = world();
    const s = structuredClone(w.s) as GameState;
    const prophet = withProphet(s);
    // Not elsewhere.
    const away = structuredClone(s);
    away.units[prophet]!.tile = at(s, 5, 4);
    expect(err(away, found(prophet))).toBe('needs_holy_site');
    // Only great prophets.
    const scientist = structuredClone(s);
    scientist.units[prophet]!.person = 'gp_euclid';
    expect(err(scientist, found(prophet))).toBe('not_prophet');
    // The right kinds of belief.
    expect(err(s, found(prophet, { founder: 'bel_feasts' }))).toBe('unknown');
    expect(err(s, found(prophet, { follower: 'bel_tithe' }))).toBe('unknown');

    const r = act(s, found(prophet));
    const after = r.state;
    const religion = Object.values(after.religions)[0]!;
    expect(religion).toMatchObject({ name: 'The Way', founder: 'p1', holyCity: w.holy });
    expect(after.players.p1!.religion).toBe(religion.id);
    expect(after.players.p1!.beliefs).toContain('bel_tithe');
    expect(after.settlements[w.holy]!.religion).toBe(religion.id);
    expect(after.units[prophet]).toBeUndefined();
    expect(r.events.map((e) => e.type)).toContain('religion_founded');
  });

  it('allows one per player, unique beliefs and names, and only so many per game', () => {
    const { s } = founded();
    expect(maxReligions(ctx, s)).toBe(1 + R.extraReligions);
    const again = structuredClone(s);
    expect(err(again, found(withProphet(again)))).toBe('has_religion');

    // p2 tries with the same beliefs and name, in their own holy site.
    const p2 = structuredClone(
      produce(s, (d) => {
        const id = Object.keys(d.settlements)[1]!;
        const tile = at(s, 10, 2);
        d.map.tiles[tile]!.district = 'district_holy_site';
        d.settlements[id]!.districts.push({ id: 'district_holy_site', tile });
      }),
    ) as GameState;
    const u = addUnit(p2, 'p2', 'unit_great_person', at(s, 9, 2));
    p2.units[u.id]!.person = 'gp_siddhartha';
    const theirs = (extra: object) => ({ ...found(u.id), player: 'p2', ...extra }) as Action;
    expect(err(p2, theirs({ name: 'New Way' }))).toBe('belief_taken');
    expect(
      err(p2, theirs({ name: 'the way', founder: 'bel_pilgrimage', follower: 'bel_feasts' })),
    ).toBe('name_taken');
    const ok = theirs({ name: 'New Way', founder: 'bel_pilgrimage', follower: 'bel_feasts' });
    expect(err(p2, ok)).toBeUndefined();
    // With only two players, a third player couldn't found one after that.
    const full = act(p2, ok).state;
    expect(Object.keys(full.religions)).toHaveLength(maxReligions(ctx, full));
  });
});

describe('spreading', () => {
  it('converts settlements in range of followers over time, and not those out of range', () => {
    const w = founded();
    let s = w.s;
    const { near, far } = w;
    let turns = 0;
    while (s.settlements[near]!.religion === null && turns < 40) {
      s = endTurn(s);
      turns++;
    }
    expect(s.settlements[near]!.religion).toBe(s.players.p1!.religion);
    expect(turns).toBeGreaterThan(5);
    expect(s.settlements[far]!.religion).toBeNull();
    expect(s.settlements[far]!.pressure).toEqual({});
  });

  it('pressure settles where followers keep it: it decays, but not below what comes in', () => {
    const w = founded();
    let s = w.s;
    const { near } = w;
    for (let i = 0; i < 80; i++) s = endTurn(s);
    const religion = s.players.p1!.religion!;
    const before = s.settlements[near]!.pressure[religion]!;
    s = endTurn(s);
    expect(s.settlements[near]!.pressure[religion]).toBe(before);
  });

  it('missionaries are bought with faith and preach in settlements next to them', () => {
    const w = founded();
    let s = w.s;
    const { holy, far } = w;
    const religion = s.players.p1!.religion!;
    const buy: Action = {
      type: 'buy_faith_unit',
      player: 'p1',
      settlement: holy,
      unit: 'unit_missionary',
    };
    expect(err(s, buy)).toBe('no_faith');
    s = produce(s, (d) => {
      d.players.p1!.faith = toFixed(500);
    });
    // Only where a religion is followed.
    expect(err(s, { ...buy, settlement: far })).toBe('not_your_settlement');
    s = act(s, buy).state;
    const m = Object.values(s.units).find((u) => u.type === 'unit_missionary')!;
    expect(m).toMatchObject({ religion, charges: R.missionaryCharges });
    expect(s.players.p1!.faith).toBe(toFixed(500 - 100));

    const preach: Action = { type: 'spread_religion', player: 'p1', unit: m.id, settlement: far };
    expect(err(s, preach)).toBe('too_far');
    s = produce(s, (d) => {
      d.units[m.id]!.tile = at(s, 19, 2);
      d.units[m.id]!.moves = 300;
    });
    const r = act(s, preach);
    s = r.state;
    expect(s.settlements[far]!.religion).toBe(religion);
    expect(s.units[m.id]!.charges).toBe(R.missionaryCharges - 1);
    expect(r.events.map((e) => e.type)).toContain('settlement_converted');
    expect(err(s, preach)).toBe('already_follows');
    // The last charge uses it up.
    s = produce(s, (d) => {
      d.units[m.id]!.charges = 1;
      d.units[m.id]!.moves = 300;
      d.settlements[far]!.religion = null;
      d.settlements[far]!.pressure = {};
    });
    s = act(s, preach).state;
    expect(s.units[m.id]).toBeUndefined();
  });
});

describe('beliefs', () => {
  it('follower beliefs apply in every settlement that follows; founder yields grow with them', () => {
    const w = founded();
    let s = w.s;
    const { holy, near } = w;
    const religion = s.players.p1!.religion!;
    const goldIn = (st: GameState, id: string) =>
      settlementYields(ctx, st, st.settlements[id]!).total.gold ?? 0;
    const nearBefore = goldIn(s, near);
    const holyBefore = goldIn(s, holy);
    s = produce(s, (d) => {
      d.settlements[near]!.religion = religion;
    });
    // Almsgiving: +2 gold in p2's settlement, which follows p1's religion.
    expect(goldIn(s, near)).toBe(nearBefore + toFixed(2));
    // Tithe: +2 gold in the holy city for each settlement following (now 2).
    expect(goldIn(s, holy)).toBe(holyBefore + toFixed(2));
  });
});

describe('religious victory', () => {
  it('comes when the religion is followed in more than half of every other civ', () => {
    const w = founded();
    let s = w.s;
    const { near, far } = w;
    const religion = s.players.p1!.religion!;
    expect(religiousProgress(s, religion)).toEqual([
      { player: 'p2', following: 0, needed: 2, total: 2 },
    ]);
    s = produce(s, (d) => {
      d.settlements[near]!.religion = religion;
      d.settlements[near]!.pressure = { [religion]: 200 };
    });
    // Half isn't more than half.
    expect(hasReligiousVictory(s, religion)).toBe(false);
    s = produce(s, (d) => {
      d.settlements[far]!.religion = religion;
      d.settlements[far]!.pressure = { [religion]: 200 };
    });
    expect(hasReligiousVictory(s, religion)).toBe(true);
    const off = produce(s, (d) => {
      d.settings.religion = false;
    });
    expect(endTurn(off).status).toBe('playing');
    const ended = endTurn(s);
    expect(ended.status).toBe('ended');
    expect(ended.result).toEqual({ reason: 'religion', winner: 'p1' });
  });
});

describe('the AI', () => {
  it('takes a pantheon and founds a religion with its prophet', () => {
    let s = structuredClone(world().s) as GameState;
    s.players.p1!.faith = toFixed(R.pantheonFaith);
    withProphet(s);
    s = playAiTurn(ctx, s, 'p1', (a) => {
      const r = applyAction(s, a, ctx);
      if (!r.ok) return undefined;
      s = r.state;
      return s;
    });
    expect(pantheonOf(ctx, s, 'p1')).toBeDefined();
    const religion = s.players.p1!.religion!;
    expect(s.religions[religion]!.name).toBe('Roman Faith');
  });
});
