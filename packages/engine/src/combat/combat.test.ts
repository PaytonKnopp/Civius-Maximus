import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { Action } from '../actions';
import type { GameEvent } from '../events';
import { applyAction } from '../game';
import { neighbors } from '../map/hex';
import { foundSettlement } from '../settlements/handlers';
import type { GameState } from '../state';
import { act, addUnit, at, ctx, endTurn, testState } from '../testing/world';
import { damageFor, damageRange, damageTable, MAX_DIFFERENCE } from './damage';
import { attackTargets, defenseStrength, previewAttack, settlementStrength } from './strength';

const err = (s: GameState, action: Action) => {
  const r = applyAction(s, action, ctx);
  return r.ok ? undefined : r.error.code;
};
const war = (s: GameState) => act(s, { type: 'declare_war', player: 'p1', target: 'p2' }).state;
const event = <T extends GameEvent['type']>(events: GameEvent[], type: T) =>
  events.find((e) => e.type === type) as Extract<GameEvent, { type: T }> | undefined;
const labels = (lines: { label: string; amount: number }[]) =>
  Object.fromEntries(lines.map((l) => [l.label, l.amount]));

const FIELD = ['.........', '.........', '.........', '.........', '.........'];

describe('damage', () => {
  it('follows 30 × e^(0.04 × difference), computed with integers only', () => {
    expect(damageFor(ctx, 0, 100)).toBe(30);
    expect(damageFor(ctx, 10, 100)).toBe(44); // 44.75
    expect(damageFor(ctx, -10, 100)).toBe(20); // 20.11
    expect(damageFor(ctx, 30, 100)).toBe(99); // 99.6
    expect(damageRange(ctx, 0)).toEqual([24, 36]);
    const t = damageTable(ctx);
    expect(t).toHaveLength(2 * MAX_DIFFERENCE + 1);
    for (let i = 1; i < t.length; i++) expect(t[i]!).toBeGreaterThan(t[i - 1]!);
  });
});

describe('attacks', () => {
  it('need a war, and melee needs to be next to the target', () => {
    const s = testState(FIELD);
    const a = addUnit(s, 'p1', 'unit_warrior', at(s, 2, 2));
    const b = addUnit(s, 'p2', 'unit_warrior', at(s, 3, 2));
    const far = addUnit(s, 'p2', 'unit_warrior', at(s, 4, 2));
    expect(err(s, { type: 'attack', player: 'p1', unit: a.id, tile: b.tile })).toBe('not_at_war');
    const w = war(s);
    expect(err(w, { type: 'attack', player: 'p1', unit: a.id, tile: far.tile })).toBe('too_far');
    expect(attackTargets(ctx, w, w.units[a.id]!)).toEqual([b.tile]);
    expect(err(w, { type: 'declare_war', player: 'p1', target: 'p2' })).toBe('already_at_war');
  });

  it('melee: both sides take damage; the attacker is done for the turn and gains XP', () => {
    const s = testState(FIELD);
    const a = addUnit(s, 'p1', 'unit_warrior', at(s, 2, 2));
    const b = addUnit(s, 'p2', 'unit_warrior', at(s, 3, 2));
    const r = act(war(s), { type: 'attack', player: 'p1', unit: a.id, tile: b.tile });
    const fight = event(r.events, 'combat')!;
    expect(fight.dealt).toBeGreaterThanOrEqual(24);
    expect(fight.dealt).toBeLessThanOrEqual(36);
    expect(fight.taken).toBeGreaterThanOrEqual(24);
    expect(r.state.units[a.id]).toMatchObject({ moves: 0, xp: 4, health: 100 - fight.taken });
    expect(r.state.units[b.id]).toMatchObject({ xp: 3, health: 100 - fight.dealt });
  });

  it('count terrain, fortifying, support, flanking, wounds, rivers and class bonuses', () => {
    const s = testState(['.........', '...H.....', '.........', '.........']);
    const target = at(s, 3, 1);
    const [n1, n2, n3] = neighbors(s.map, target);
    const d = addUnit(s, 'p2', 'unit_warrior', target);
    d.orders = { kind: 'fortify', turns: 2 };
    addUnit(s, 'p2', 'unit_warrior', n1!);
    const a = addUnit(s, 'p1', 'unit_warrior', n2!);
    a.health = 75;
    addUnit(s, 'p1', 'unit_warrior', n3!);
    const p = previewAttack(ctx, war(s), a, target)!;
    expect(labels(p.defender.lines)).toEqual({
      Warrior: 20,
      Hills: 3,
      Woods: 3,
      Fortified: 6,
      'Support (1)': 2,
    });
    expect(labels(p.attacker.lines)).toEqual({ Warrior: 20, Wounded: -2, 'Flanking (1)': 2 });
    expect(p.toDefender).toEqual(damageRange(ctx, 20 - 34));

    const spear = addUnit(s, 'p2', 'unit_spearman', at(s, 7, 3));
    const horse = addUnit(s, 'p1', 'unit_horseman', at(s, 6, 3));
    expect(labels(defenseStrength(ctx, s, spear, horse).lines)).toMatchObject({
      'Against cavalry': 10,
    });
  });

  it('ranged: no damage back, within range and line of sight', () => {
    const s = testState(['.........', '.A.w.T...', '.........']);
    const archer = addUnit(s, 'p1', 'unit_archer', at(s, 1, 1));
    const target = addUnit(s, 'p2', 'unit_warrior', at(s, 3, 1));
    const r = act(war(s), { type: 'attack', player: 'p1', unit: archer.id, tile: target.tile });
    expect(event(r.events, 'combat')).toMatchObject({ mode: 'ranged', taken: 0 });
    expect(r.state.units[archer.id]!.health).toBe(100);

    const blocked = testState(['.........', '.A.w.....', '.........']);
    const shooter = addUnit(blocked, 'p1', 'unit_archer', at(blocked, 2, 1));
    const hidden = addUnit(blocked, 'p2', 'unit_warrior', at(blocked, 4, 1));
    addUnit(blocked, 'p1', 'unit_scout', at(blocked, 5, 1)); // someone sees the target
    expect(
      err(war(blocked), { type: 'attack', player: 'p1', unit: shooter.id, tile: hidden.tile }),
    ).toBe('no_line_of_sight');
  });

  it('kill: the loser is removed and a melee winner moves into its tile', () => {
    const s = testState(FIELD);
    const a = addUnit(s, 'p1', 'unit_swordsman', at(s, 2, 2));
    const b = addUnit(s, 'p2', 'unit_warrior', at(s, 3, 2));
    b.health = 5;
    const r = act(war(s), { type: 'attack', player: 'p1', unit: a.id, tile: b.tile });
    expect(r.state.units[b.id]).toBeUndefined();
    expect(event(r.events, 'unit_killed')).toMatchObject({ unit: b.id, by: 'p1' });
    expect(r.state.units[a.id]!.tile).toBe(b.tile);
  });

  it('capture lone civilians by moving onto them', () => {
    const s = testState(FIELD);
    const a = addUnit(s, 'p1', 'unit_warrior', at(s, 2, 2));
    const settler = addUnit(s, 'p2', 'unit_settler', at(s, 3, 2));
    const r = act(war(s), { type: 'attack', player: 'p1', unit: a.id, tile: settler.tile });
    expect(r.state.units[settler.id]!.owner).toBe('p1');
    expect(r.state.units[a.id]!.tile).toBe(settler.tile);
    expect(event(r.events, 'civilian_captured')).toMatchObject({ from: 'p2', by: 'p1' });
  });
});

/** p2's capital at (4, 2) (and a town at (8, 2) if `town`), at war with p1. */
function siege(town = false): { s: GameState; capital: string; town?: string } {
  let s = testState(['............', '............', '............', '............']);
  s = produce(s, (d) => {
    foundSettlement(d, ctx, 'p2', at(s, 4, 2), () => {});
    if (town) foundSettlement(d, ctx, 'p2', at(s, 9, 2), () => {});
  });
  s = structuredClone(war(s));
  const ids = Object.keys(s.settlements);
  return { s, capital: ids[0]!, ...(town ? { town: ids[1]! } : {}) };
}

describe('settlements at war', () => {
  it('are defended by walls, which soak up most melee damage', () => {
    const { s, capital } = siege();
    const c = s.settlements[capital]!;
    c.buildings.push('building_walls');
    c.walls = 100;
    expect(labels(settlementStrength(ctx, s, c).lines)).toMatchObject({ Walls: 5, City: 3 });
    const a = addUnit(s, 'p1', 'unit_warrior', at(s, 3, 2));
    const r = act(s, { type: 'attack', player: 'p1', unit: a.id, tile: c.tile });
    const after = r.state.settlements[capital]!;
    expect(after.health).toBe(200);
    expect(after.walls).toBeGreaterThan(90);
    expect(after.walls).toBeLessThan(100);
  });

  it('fall to a melee unit at 0 health; the captor keeps, razes or liberates', () => {
    const { s, capital, town } = siege(true);
    s.settlements[capital]!.health = 1;
    s.settlements[capital]!.population = 4;
    const a = addUnit(s, 'p1', 'unit_swordsman', at(s, 3, 2));
    const r = act(s, { type: 'attack', player: 'p1', unit: a.id, tile: at(s, 4, 2) });
    const taken = r.state.settlements[capital]!;
    expect(taken).toMatchObject({
      owner: 'p1',
      captureChoice: true,
      capital: false,
      population: 3,
      capturedFrom: 'p2',
    });
    expect(taken.buildings).not.toContain('building_palace');
    expect(r.state.units[a.id]!.tile).toBe(taken.tile);
    // p2's capital moves to its town.
    expect(r.state.players.p2!.capital).toBe(town);
    expect(r.state.settlements[town!]!.buildings).toContain('building_palace');
    const choose = (choice: 'keep' | 'raze' | 'liberate') =>
      err(r.state, { type: 'capture_choice', player: 'p1', settlement: capital, choice });
    expect(choose('raze')).toBe('original_capital');
    expect(choose('liberate')).toBe('founder_is_enemy');
    expect(choose('keep')).toBeUndefined();
    // Unanswered, the choice is "keep" at the end of the turn.
    expect(endTurn(r.state).settlements[capital]!.captureChoice).toBe(false);
  });

  it('can be razed if it was never a capital', () => {
    const { s, town } = siege(true);
    s.settlements[town!]!.health = 1;
    const a = addUnit(s, 'p1', 'unit_swordsman', at(s, 8, 2));
    let next = act(s, { type: 'attack', player: 'p1', unit: a.id, tile: at(s, 9, 2) }).state;
    next = act(next, {
      type: 'capture_choice',
      player: 'p1',
      settlement: town!,
      choice: 'raze',
    }).state;
    expect(next.settlements[town!]).toBeUndefined();
    expect(next.map.tiles[at(s, 9, 2)]!.owner).toBeNull();
  });

  it('a player who loses its last settlement is out, and the last one standing wins', () => {
    const { s, capital } = siege();
    s.settlements[capital]!.health = 1;
    const a = addUnit(s, 'p1', 'unit_swordsman', at(s, 3, 2));
    const r = act(s, { type: 'attack', player: 'p1', unit: a.id, tile: at(s, 4, 2) });
    expect(r.state.players.p2!.alive).toBe(false);
    expect(event(r.events, 'player_defeated')).toMatchObject({ player: 'p2', by: 'p1' });
    expect(event(r.events, 'game_ended')).toMatchObject({ reason: 'conquest', winner: 'p1' });
    expect(r.state.status).toBe('ended');
  });

  it('strike a unit in range once a turn', () => {
    const { s, capital } = siege();
    const u = addUnit(s, 'p1', 'unit_warrior', at(s, 6, 2));
    const strike = { type: 'strike' as const, player: 'p2', settlement: capital, tile: u.tile };
    const r = act(s, strike);
    expect(r.state.units[u.id]!.health).toBeLessThan(100);
    expect(err(r.state, strike)).toBe('already_struck');
    expect(err(s, { ...strike, tile: at(s, 8, 2) })).toBe('no_target');
  });

  it('heal when left alone, and so do units that rest', () => {
    const { s, capital } = siege();
    s.settlements[capital]!.health = 100;
    const u = addUnit(s, 'p1', 'unit_warrior', at(s, 0, 0));
    u.health = 50;
    const next = endTurn(s);
    expect(next.settlements[capital]!.health).toBe(120);
    expect(next.units[u.id]!.health).toBe(60); // neutral land
  });
});

describe('war and peace', () => {
  it('peace can be offered after the minimum war, and taken', () => {
    let s = war(testState(FIELD));
    expect(err(s, { type: 'offer_peace', player: 'p1', target: 'p2' })).toBe('too_soon');
    s = { ...s, turn: s.turn + ctx.content.rules.combat.minWarTurns };
    s = act(s, { type: 'offer_peace', player: 'p1', target: 'p2' }).state;
    expect(s.peaceOffers).toEqual(['p1>p2']);
    expect(err(s, { type: 'accept_peace', player: 'p1', from: 'p2' })).toBe('no_offer');
    const r = act(s, { type: 'accept_peace', player: 'p2', from: 'p1' });
    expect(r.state.wars).toEqual([]);
    expect(r.state.peaceOffers).toEqual([]);
    expect(event(r.events, 'peace_made')).toBeDefined();
  });
});
