import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { Action } from '../actions';
import { cultureProgress, domesticTourists, tourismBonus } from '../culture/tourism';
import { toFixed } from '../fixed';
import { applyAction } from '../game';
import { foundSettlement } from '../settlements/handlers';
import { itemCost, itemProblem } from '../settlements/rules';
import type { BuildItem, GameState } from '../state';
import { act, addUnit, at, ctx, endTurn, kitCtx, testState } from '../testing/world';
import { defenseStrength } from '../combat/strength';
import { obsoletedBy, upgradeCost } from '../units/upgrades';

const FIELD = Array.from({ length: 7 }, () => '.'.repeat(20));
const err = (s: GameState, a: Action) => {
  const r = applyAction(s, a, ctx);
  return r.ok ? undefined : r.error.code;
};

/** p1 at (2,3) and p2 at (14,3), each with a city. */
function world() {
  let s = testState(FIELD);
  s = produce(s, (d) => {
    foundSettlement(d, ctx, 'p1', at(s, 2, 3), () => {});
    foundSettlement(d, ctx, 'p2', at(s, 14, 3), () => {});
  });
  const [p1, p2] = Object.keys(s.settlements) as [string, string];
  return { s, p1, p2 };
}

const learn = (s: GameState, player: string, ...techs: string[]) =>
  produce(s, (d) => {
    for (const t of techs)
      if (!d.players[player]!.techs.done.includes(t)) d.players[player]!.techs.done.push(t);
  });

describe('unit upgrades', () => {
  it('make old units unbuildable once their upgrade is', () => {
    const w = world();
    let s = w.s;
    const warrior: BuildItem = { kind: 'unit', id: 'unit_warrior' };
    expect(itemProblem(ctx, s, s.settlements[w.p1]!, warrior)).toBeUndefined();
    s = learn(s, 'p1', 'tech_mining', 'tech_bronze_working', 'tech_iron_working');
    // Rome's own Legionary takes the Swordsman's place.
    expect(obsoletedBy(ctx, s, 'p1', 'unit_warrior')).toBe('unit_legionary');
    expect(obsoletedBy(ctx, s, 'p2', 'unit_warrior')).toBeUndefined();
    expect(itemProblem(ctx, s, s.settlements[w.p1]!, warrior)?.code).toBe('obsolete');
    // Further along the chain: straight to the newest one.
    s = learn(s, 'p1', 'tech_military_tactics', 'tech_apprenticeship', 'tech_gunpowder');
    expect(obsoletedBy(ctx, s, 'p1', 'unit_warrior')).toBe('unit_musketman');
  });

  it('carry a queued old unit and its progress over to the new one', () => {
    const w = world();
    let s = produce(w.s, (d) => {
      d.settlements[w.p1]!.queue = [{ kind: 'unit', id: 'unit_warrior' }];
      d.settlements[w.p1]!.progress = { 'unit:unit_warrior': toFixed(10) };
    });
    s = learn(s, 'p1', 'tech_mining', 'tech_bronze_working', 'tech_iron_working');
    s = endTurn(s);
    const c = s.settlements[w.p1]!;
    expect(c.queue[0]).toEqual({ kind: 'unit', id: 'unit_legionary' });
    expect(c.progress['unit:unit_legionary']).toBeGreaterThan(toFixed(10));
  });

  it('cost gold, in your own territory, and keep the unit’s experience', () => {
    const w = world();
    let s = structuredClone(
      learn(w.s, 'p1', 'tech_mining', 'tech_bronze_working', 'tech_iron_working'),
    ) as GameState;
    const home = addUnit(s, 'p1', 'unit_warrior', at(s, 3, 3));
    const away = addUnit(s, 'p1', 'unit_warrior', at(s, 8, 3));
    s.units[home.id]!.xp = 7;
    const up = (unit: string): Action => ({ type: 'upgrade_unit', player: 'p1', unit });
    expect(err(s, up(home.id))).toBe('no_gold');
    const cost = upgradeCost(ctx, s, 'unit_warrior', 'unit_legionary');
    expect(cost).toBe(toFixed((90 - 40) * ctx.content.rules.units.upgradeGoldPerProduction));
    s = produce(s, (d) => {
      d.players.p1!.gold = cost * 3;
    });
    expect(err(s, up(away.id))).toBe('not_home');
    s = act(s, up(home.id)).state;
    expect(s.units[home.id]).toMatchObject({ type: 'unit_legionary', xp: 7, moves: 0 });
    expect(s.players.p1!.gold).toBe(cost * 2);
  });
});

describe('the space race', () => {
  /** p1 knows everything for space and has a Spaceport next to its city. */
  function spacefaring() {
    const w = world();
    let s = learn(w.s, 'p1', 'tech_rocketry', 'tech_satellites', 'tech_space_flight');
    const tile = at(s, 3, 3);
    s = produce(s, (d) => {
      d.map.tiles[tile]!.district = 'district_spaceport';
      d.settlements[w.p1]!.districts.push({ id: 'district_spaceport', tile });
    });
    return { ...w, s, tile };
  }
  const project = (id: string, tile: number): BuildItem => ({ kind: 'project', id, tile });

  it('needs a Spaceport, and each step after the one before', () => {
    const { s, p1, tile } = spacefaring();
    const city = s.settlements[p1]!;
    expect(itemProblem(ctx, s, city, project('project_satellite', tile))).toBeUndefined();
    expect(itemProblem(ctx, s, city, project('project_satellite', at(s, 1, 3)))?.code).toBe(
      'bad_placement',
    );
    expect(itemProblem(ctx, s, city, project('project_moon_landing', tile))?.code).toBe('locked');
  });

  it('launches an expedition with the last step, and its arrival wins', () => {
    const { p1, tile, s: start } = spacefaring();
    const chain = ctx.content.rules.science.projects;
    let s = produce(start, (d) => {
      d.players.p1!.spaceProjects = chain.slice(0, -1);
      const last = project(chain[chain.length - 1]!, tile);
      d.settlements[p1]!.queue = [last];
      d.settlements[p1]!.progress = {
        [`project:${last.id}@${tile}`]: itemCost(ctx, start, 'p1', last),
      };
    });
    const r = applyAction(s, { type: 'end_turn', player: 'p1' }, ctx);
    s = act(r.ok ? r.state : s, { type: 'end_turn', player: 'p2' }).state;
    const arrives = s.players.p1!.expeditionArrives!;
    expect(arrives).toBe(s.turn - 1 + ctx.content.rules.science.travelTurns);
    expect(s.players.p1!.spaceProjects).toEqual(chain);
    while (s.status === 'playing' && s.turn <= arrives + 1) s = endTurn(s);
    expect(s.result).toEqual({ reason: 'science', winner: 'p1' });
  });

  it('is off when the game turns science victories off', () => {
    const { s, p1, tile } = spacefaring();
    const off = produce(s, (d) => {
      d.settings.science = false;
    });
    expect(
      itemProblem(ctx, off, off.settlements[p1]!, project('project_satellite', tile))?.code,
    ).toBe('off');
  });
});

describe('tourism and the culture victory', () => {
  it('counts culture ever earned as domestic tourists', () => {
    let { s } = world();
    s = produce(s, (d) => {
      d.players.p2!.lifetimeCulture = toFixed(ctx.content.rules.culture.culturePerTourist * 3 + 5);
    });
    expect(domesticTourists(ctx, s, 'p2')).toBe(3);
  });

  it('sends tourism to civs you have met, with bonuses, and wins when visitors outnumber', () => {
    const w = world();
    let s = produce(w.s, (d) => {
      // A Broadway in p1's city: tourism.
      d.settlements[w.p1]!.wonders.push('wonder_broadway');
      d.diplomacy.friends['p1|p2'] = 100;
    });
    expect(tourismBonus(ctx, s, 'p1', 'p2').map((l) => l.label)).toEqual(['Friends']);
    // Tourism made in a turn goes out at the end of the same turn.
    s = endTurn(s);
    const rate = s.players.p1!.tourismRate;
    expect(rate).toBeGreaterThan(0);
    expect(s.tourism.p1!.p2).toBe(
      Math.floor((rate * (100 + ctx.content.rules.culture.friendsPercent)) / 100),
    );
    // Enough visitors from p2 (who has no culture banked) wins.
    s = produce(s, (d) => {
      d.players.p2!.lifetimeCulture = 0;
      d.tourism.p1 = { p2: toFixed(ctx.content.rules.culture.tourismPerTourist * 5) };
    });
    expect(cultureProgress(ctx, s, 'p1')).toEqual([{ player: 'p2', visiting: 5, domestic: 0 }]);
    s = endTurn(s);
    expect(s.result).toEqual({ reason: 'culture', winner: 'p1' });
  });
});

describe('later-era kits', () => {
  it('Oda’s gunpowder units get +3 strength', () => {
    const s = structuredClone(
      produce(world().s, (d) => {
        d.players.p1!.leader = 'leader_nobunaga';
        d.players.p1!.civ = 'civ_japan';
      }),
    ) as GameState;
    const musket = addUnit(s, 'p1', 'unit_musketman', at(s, 4, 3));
    const lines = defenseStrength(kitCtx, s, s.units[musket.id]!, null).lines;
    expect(lines.find((l) => l.label === 'The Demon King')?.amount).toBe(3);
  });
});

describe('history for the graphs', () => {
  it('records every living civ’s numbers at the end of each turn', () => {
    let { s } = world();
    s = endTurn(endTurn(s));
    expect(s.history.map((h) => h.turn)).toEqual([1, 2]);
    const p1 = s.history[1]!.stats.p1!;
    expect(p1.settlements).toBe(1);
    expect(p1.citizens).toBeGreaterThan(0);
    expect(p1.science).toBeGreaterThan(0);
    expect(Object.keys(s.history[1]!.stats).sort()).toEqual(['p1', 'p2']);
  });
});
