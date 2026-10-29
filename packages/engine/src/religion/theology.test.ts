import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { Action } from '../actions';
import { playAiTurn } from '../ai';
import { toFixed } from '../fixed';
import { applyAction } from '../game';
import { foundSettlement } from '../settlements/handlers';
import { itemProblem } from '../settlements/rules';
import type { GameState } from '../state';
import { act, addUnit, at, ctx, testState } from '../testing/world';
import { gurusTurn, heresyProblem, theologyProblem } from './theology';

const FIELD = Array.from({ length: 5 }, () => '.'.repeat(24));
const err = (s: GameState, a: Action) => {
  const r = applyAction(s, a, ctx);
  return r.ok ? undefined : r.error.code;
};
const R = ctx.content.rules.religion;

/**
 * p1's holy city at (2,2) following p1's religion, with a Holy Site; p2's settlement at (9,2);
 * p2 has a religion of its own, founded elsewhere.
 */
function world(worship?: string) {
  let s = testState(FIELD);
  s = produce(s, (d) => {
    foundSettlement(d, ctx, 'p1', at(s, 2, 2), () => {});
    foundSettlement(d, ctx, 'p2', at(s, 9, 2), () => {});
    const holy = Object.keys(d.settlements)[0]!;
    const tile = at(s, 3, 2);
    d.map.tiles[tile]!.district = 'district_holy_site';
    d.settlements[holy]!.districts.push({ id: 'district_holy_site', tile });
  });
  const [holy, theirs] = Object.keys(s.settlements) as [string, string];
  s = structuredClone(s) as GameState;
  const prophet = addUnit(s, 'p1', 'unit_great_person', at(s, 2, 2));
  s.units[prophet.id]!.person = 'gp_zoroaster';
  s = act(s, {
    type: 'found_religion',
    player: 'p1',
    unit: prophet.id,
    name: 'The Way',
    founder: 'bel_tithe',
    follower: 'bel_almsgiving',
    ...(worship ? { worship } : {}),
  }).state;
  const mine = s.players.p1!.religion!;
  s = produce(s, (d) => {
    d.religions.r_theirs = {
      id: 'r_theirs',
      name: 'The Other Way',
      founder: 'p2',
      holyCity: theirs,
      beliefs: [],
      founded: 1,
    };
    d.players.p2!.religion = 'r_theirs';
    d.settlements[theirs]!.religion = 'r_theirs';
    d.settings.theologicalCombat = true;
  });
  return { s, holy, theirs, mine };
}

/** A religious unit of `religion` for `owner` at (x, 2). */
function preacher(s: GameState, owner: string, type: string, x: number, religion: string) {
  const u = addUnit(s, owner, type, at(s, x, 2));
  s.units[u.id]!.religion = religion;
  s.units[u.id]!.charges = ctx.content.entities.unit[type]!.religious!.charges;
  return u.id;
}

describe('theological combat', () => {
  it('is off unless the game turns it on', () => {
    const w = world();
    const s = structuredClone(
      produce(w.s, (d) => {
        delete d.settings.theologicalCombat;
        d.players.p1!.faith = toFixed(1000);
        d.players.p1!.civics.done.push('civic_theology');
      }),
    ) as GameState;
    const apostle = preacher(s, 'p1', 'unit_apostle', 5, w.mine);
    const rival = preacher(s, 'p2', 'unit_missionary', 6, 'r_theirs');
    expect(err(s, { type: 'theological_combat', player: 'p1', unit: apostle, target: rival })).toBe(
      'off',
    );
    // Gurus heal what theological combat hurts, so they're out too.
    expect(
      err(s, { type: 'buy_faith_unit', player: 'p1', settlement: w.holy, unit: 'unit_guru' }),
    ).toBe('off');
  });

  it('is between rival religions next to each other, and the winner gains ground nearby', () => {
    const w = world();
    const s = structuredClone(w.s) as GameState;
    const apostle = preacher(s, 'p1', 'unit_apostle', 5, w.mine);
    const friend = preacher(s, 'p1', 'unit_missionary', 4, w.mine);
    const rival = preacher(s, 'p2', 'unit_missionary', 6, 'r_theirs');
    const far = preacher(s, 'p2', 'unit_missionary', 12, 'r_theirs');
    const fight = (target: string): Action => ({
      type: 'theological_combat',
      player: 'p1',
      unit: apostle,
      target,
    });
    expect(err(s, fight(friend))).toBe('no_target');
    expect(theologyProblem(ctx, s, 'p1', friend, apostle)?.code).toBe('no_target');
    expect(err(s, fight(far))).toBe('too_far');
    // Soldiers aren't fought this way.
    const soldier = addUnit(s, 'p2', 'unit_warrior', at(s, 5, 3)).id;
    expect(err(s, fight(soldier))).toBe('no_target');

    s.units[rival]!.health = 5;
    const before = s.settlements[w.theirs]!.pressure[w.mine] ?? 0;
    const r = act(s, fight(rival));
    expect(r.state.units[rival]).toBeUndefined();
    expect(r.state.units[apostle]!.moves).toBe(0);
    expect(r.state.units[apostle]!.health).toBeLessThan(ctx.content.rules.combat.maxHealth);
    // p2's settlement is within the radius of the fight at (6,2).
    expect(r.state.settlements[w.theirs]!.pressure[w.mine]).toBe(before + R.combatPressure);
    expect(r.events.find((e) => e.type === 'theological_combat')).toMatchObject({
      attacker: apostle,
      defender: rival,
      lost: rival,
    });
  });
});

describe('inquisitors', () => {
  it('drive other religions out of your own settlements', () => {
    const w = world();
    let s = produce(w.s, (d) => {
      d.players.p1!.civics.done.push('civic_reformed_church');
      const h = d.settlements[w.holy]!;
      h.religion = 'r_theirs';
      h.pressure = { [w.mine]: 100, r_theirs: 400 };
    });
    s = structuredClone(s) as GameState;
    const inq = preacher(s, 'p1', 'unit_inquisitor', 2, w.mine);
    const missionary = preacher(s, 'p1', 'unit_missionary', 2, w.mine);
    const purge = (unit: string, settlement: string): Action => ({
      type: 'remove_heresy',
      player: 'p1',
      unit,
      settlement,
    });
    expect(err(s, purge(missionary, w.holy))).toBe('not_inquisitor');
    expect(err(s, purge(inq, w.theirs))).toBe('not_yours');
    // Inquisitors don't preach.
    expect(err(s, { type: 'spread_religion', player: 'p1', unit: inq, settlement: w.holy })).toBe(
      'not_missionary',
    );

    const after = act(s, purge(inq, w.holy)).state;
    const h = after.settlements[w.holy]!;
    expect(h.pressure.r_theirs).toBe((400 * (100 - R.heresyRemoved)) / 100);
    expect(h.pressure[w.mine]).toBe(100);
    expect(h.religion).toBeNull();
    expect(after.units[inq]!.charges).toBe(2);
    // Nothing left to purge once it's ours alone.
    const clean = produce(after, (d) => {
      d.settlements[w.holy]!.pressure = { [w.mine]: 100 };
      d.settlements[w.holy]!.religion = w.mine;
    });
    expect(heresyProblem(ctx, clean, 'p1', inq, w.holy)?.code).toBe('nothing');
  });

  it('are bought with faith only once the civic is done', () => {
    const w = world();
    const s = produce(w.s, (d) => {
      d.players.p1!.faith = toFixed(1000);
    });
    const buy: Action = {
      type: 'buy_faith_unit',
      player: 'p1',
      settlement: w.holy,
      unit: 'unit_inquisitor',
    };
    expect(err(s, buy)).toBe('locked');
    const later = produce(s, (d) => {
      d.players.p1!.civics.done.push('civic_reformed_church');
    });
    const r = act(later, buy).state;
    const bought = Object.values(r.units).find((u) => u.type === 'unit_inquisitor')!;
    expect(bought).toMatchObject({ religion: w.mine, charges: 3 });
  });
});

describe('gurus', () => {
  it('heal the religious units of their faith next to them', () => {
    const w = world();
    const s = structuredClone(w.s) as GameState;
    preacher(s, 'p1', 'unit_guru', 5, w.mine);
    const hurt = preacher(s, 'p1', 'unit_apostle', 6, w.mine);
    const away = preacher(s, 'p1', 'unit_apostle', 9, w.mine);
    s.units[hurt]!.health = 40;
    s.units[away]!.health = 40;
    const after = produce(s, (d) => gurusTurn(d, ctx));
    expect(after.units[hurt]!.health).toBe(70);
    expect(after.units[away]!.health).toBe(40);
  });
});

describe('worship buildings', () => {
  it("come with the religion's worship belief, where it's followed", () => {
    const w = world('bel_cathedral');
    expect(w.s.religions[w.mine]!.beliefs).toContain('bel_cathedral');
    const s = produce(w.s, (d) => {
      d.settlements[w.holy]!.buildings.push('building_temple');
    });
    const holy = s.settlements[w.holy]!;
    expect(itemProblem(ctx, s, holy, { kind: 'building', id: 'building_cathedral' })).toBe(
      undefined,
    );
    expect(itemProblem(ctx, s, holy, { kind: 'building', id: 'building_mosque' })?.code).toBe(
      'needs_worship',
    );
    const lapsed = produce(s, (d) => {
      d.settlements[w.holy]!.religion = 'r_theirs';
    });
    expect(
      itemProblem(ctx, lapsed, lapsed.settlements[w.holy]!, {
        kind: 'building',
        id: 'building_cathedral',
      })?.code,
    ).toBe('needs_worship');
  });

  it('are picked once per game, and only from worship beliefs', () => {
    const w = world('bel_cathedral');
    // p2 hasn't a religion yet here, and has a Holy Site.
    const s = structuredClone(
      produce(w.s, (d) => {
        delete d.religions.r_theirs;
        d.players.p2!.religion = null;
        d.settlements[w.theirs]!.religion = null;
        const tile = at(w.s, 10, 2);
        d.map.tiles[tile]!.district = 'district_holy_site';
        d.settlements[w.theirs]!.districts.push({ id: 'district_holy_site', tile });
      }),
    ) as GameState;
    const prophet = addUnit(s, 'p2', 'unit_great_person', at(s, 9, 2));
    s.units[prophet.id]!.person = 'gp_zoroaster';
    const found = (worship: string): Action => ({
      type: 'found_religion',
      player: 'p2',
      unit: prophet.id,
      name: 'Another Way',
      founder: 'bel_pilgrimage',
      follower: 'bel_monastic_learning',
      worship,
    });
    expect(err(s, found('bel_tithe'))).toBe('unknown');
    expect(err(s, found('bel_cathedral'))).toBe('belief_taken');
  });
});

describe('the AI', () => {
  it('fights a rival preacher it would beat', () => {
    const w = world();
    let s = structuredClone(w.s) as GameState;
    const apostle = preacher(s, 'p1', 'unit_apostle', 5, w.mine);
    const rival = preacher(s, 'p2', 'unit_missionary', 6, 'r_theirs');
    s.units[rival]!.health = 30;
    const seen: string[] = [];
    s = playAiTurn(ctx, s, 'p1', (a) => {
      seen.push(a.type);
      const r = applyAction(s, a, ctx);
      if (!r.ok) return undefined;
      s = r.state;
      return s;
    });
    expect(seen).toContain('theological_combat');
    expect(s.units[apostle]).toBeDefined();
  });
});
