import { compileFromDirs } from '@cx/content/node';
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { Action } from '../actions';
import { toFixed } from '../fixed';
import { applyAction, createGame, type GameSetup } from '../game';
import { checkInvariants } from '../invariants';
import { distance } from '../map/hex';
import { foundSettlement } from '../settlements/handlers';
import { unitUpkeep } from '../settlements/rules';
import type { GameState } from '../state';
import { act, addUnit, at, ctx, testState } from '../testing/world';
import { leviesTurn, levyCost } from './befriend';

const FIELD = Array.from({ length: 7 }, () => '.'.repeat(24));
/** The base content with every civ's and leader's abilities (the shared test content has none). */
const full = { content: compileFromDirs().content! };
const R = ctx.content.rules.cityStates;
const err = (s: GameState, a: Action) => {
  const r = applyAction(s, a, ctx);
  return r.ok ? undefined : r.error.code;
};

/** p1 at (2,3), p2 at (21,3), and a hostile camp at (12,3) with one raider. */
function world() {
  let s = testState(FIELD);
  s = produce(s, (d) => {
    foundSettlement(d, ctx, 'p1', at(s, 2, 3), () => {});
    foundSettlement(d, ctx, 'p2', at(s, 21, 3), () => {});
    d.players.p1!.influence = toFixed(1000);
    d.players.p2!.influence = toFixed(1000);
  });
  s = structuredClone(s) as GameState;
  const raider = addUnit(s, 'hostile', 'unit_warrior', at(s, 12, 3)).id;
  s.camps.c1 = { id: 'c1', tile: at(s, 12, 3), units: [raider], nextUnit: 99 };
  return { s, raider, tile: at(s, 12, 3) };
}

const befriend = (player: string): Action => ({ type: 'befriend_camp', player, camp: 'c1' });
const nextTurn = (s: GameState) =>
  produce(s, (d) => {
    d.turn++;
  });

describe('befriending camps', () => {
  it('takes influence over a few turns; the first to finish makes it a city-state', () => {
    const w = world();
    let s = act(w.s, befriend('p1')).state;
    expect(s.players.p1!.influence).toBe(toFixed(1000 - R.befriendInfluence));
    expect(err(s, befriend('p1'))).toBe('done_this_turn');
    // p2 competes, a turn behind.
    for (let i = 1; i < R.befriendTurns; i++) {
      s = nextTurn(s);
      s = act(s, befriend('p1')).state;
      if (i < R.befriendTurns - 1) s = act(s, befriend('p2')).state;
    }
    expect(s.camps.c1).toBeUndefined();
    expect(s.units[w.raider]).toBeUndefined();
    const [id, cs] = Object.entries(s.cityStates)[0]!;
    expect(cs.suzerain).toBe('p1');
    expect(cs.envoys.p1).toBe(R.befriendEnvoys);
    expect(s.players[id]!.kind).toBe('cityState');
    const home = Object.values(s.settlements).find((x) => x.owner === id)!;
    expect(home.tile).toBe(w.tile);
  });

  it("can't make a city-state of a camp inside someone's land or beside a settlement", () => {
    const w = world();
    // Borders that grew around the camp: the tile is p2's.
    const p2Town = Object.values(w.s.settlements).find((x) => x.owner === 'p2')!;
    const owned = produce(w.s, (d) => {
      d.map.tiles[w.tile]!.owner = 'p2';
      d.map.tiles[w.tile]!.settlement = p2Town.id;
    });
    expect(err(owned, befriend('p1'))).toBe('no_site');
    // A camp within the distance settlements must keep from each other.
    const near = produce(w.s, (d) => {
      d.camps.c1!.tile = at(w.s, 4, 3);
    });
    expect(err(near, befriend('p1'))).toBe('no_site');
    expect(err(w.s, befriend('p1'))).toBeUndefined();
  });

  it('keeps a raider that changed sides: it leaves the roster when captured', () => {
    // Montezuma's soldiers capture what they beat; here every time.
    const content = structuredClone(full.content);
    const capture = content.entities.leader.leader_montezuma!.ability.effects.find(
      (e) => e.effect === 'capture_on_kill',
    )!;
    (capture.params as { percent: number }).percent = 100;
    const kit = { content };
    const w = world();
    const s0 = structuredClone(w.s) as GameState;
    s0.players.p1!.leader = 'leader_montezuma';
    // Raiders are a side of their own in a real game.
    s0.players.hostile = {
      ...structuredClone(s0.players.p2!),
      id: 'hostile',
      kind: 'hostile',
      capital: null,
    };
    s0.units[w.raider]!.health = 1;
    const mine = addUnit(s0, 'p1', 'unit_warrior', at(s0, 11, 3)).id;
    const r = act(s0, { type: 'attack', player: 'p1', unit: mine, tile: w.tile }, kit);
    expect(r.state.units[w.raider]).toMatchObject({ owner: 'p1' });
    expect(r.state.camps.c1!.units).toEqual([]);
    expect(checkInvariants(kit, r.state)).toEqual([]);
    // The camp is befriended later: its raiders disband, the captured soldier stays.
    let s = r.state;
    for (let i = 0; i < R.befriendTurns; i++) {
      s = act(s, befriend('p1'), kit).state;
      s = nextTurn(s);
    }
    expect(s.camps.c1).toBeUndefined();
    expect(s.units[w.raider]).toMatchObject({ owner: 'p1' });
  });

  it('needs the camp found, the influence, and city-states in the game', () => {
    const w = world();
    const poor = produce(w.s, (d) => {
      d.players.p1!.influence = 0;
    });
    expect(err(poor, befriend('p1'))).toBe('no_influence');
    const off = produce(w.s, (d) => {
      d.settings.cityStates = false;
    });
    expect(err(off, befriend('p1'))).toBe('off');
    const unseen = produce(w.s, (d) => {
      d.players.p1!.explored = '';
    });
    expect(err(unseen, befriend('p1'))).toBe('unknown');
  });
});

describe('levies', () => {
  /** A befriended camp: p1 is suzerain of the new city-state. */
  function suzerain() {
    let s = world().s;
    for (let i = 0; i < R.befriendTurns; i++) {
      s = act(s, befriend('p1')).state;
      s = nextTurn(s);
    }
    const id = Object.keys(s.cityStates)[0]!;
    return { s, id };
  }

  it("put a city-state's soldiers under its suzerain for a while, for gold", () => {
    const { s: start, id } = suzerain();
    const levy: Action = { type: 'levy_military', player: 'p1', cityState: id };
    expect(err(start, { ...levy, player: 'p2' })).toBe('not_suzerain');
    expect(err(start, levy)).toBe('no_gold');
    const cost = levyCost(ctx, start, id);
    expect(cost).toBeGreaterThan(0);
    let s = produce(start, (d) => {
      d.players.p1!.gold = cost;
    });
    const upkeep = unitUpkeep(ctx, s, 'p1');
    s = act(s, levy).state;
    const levied = Object.values(s.units).filter((u) => u.levied);
    expect(levied.length).toBeGreaterThan(0);
    expect(levied.every((u) => u.owner === 'p1' && u.levied!.from === id)).toBe(true);
    expect(s.players.p1!.gold).toBe(0);
    // The city-state keeps them.
    expect(unitUpkeep(ctx, s, 'p1')).toBe(upkeep);
    expect(err(s, levy)).toBe('levied');
    // They go back when the levy runs out.
    const back = produce(s, (d) => {
      d.turn += R.levyTurns;
      leviesTurn(d, ctx, () => {});
    });
    expect(levied.every((u) => back.units[u.id]!.owner === id && !back.units[u.id]!.levied)).toBe(
      true,
    );
  });

  it("send the soldiers home when they end, out of the suzerain's land and stacks", () => {
    const { s: start, id } = suzerain();
    let s = produce(start, (d) => {
      d.players.p1!.gold = toFixed(1000);
    });
    s = act(s, { type: 'levy_military', player: 'p1', cityState: id }).state;
    const soldier = Object.values(s.units).find((u) => u.levied)!;
    const capital = s.settlements[s.players.p1!.capital!]!;
    const home = Object.values(s.settlements).find((x) => x.owner === id)!;
    // The hired soldier garrisons p1's capital, beside one of p1's own civilians.
    s = structuredClone(s) as GameState;
    s.units[soldier.id]!.tile = capital.tile;
    addUnit(s, 'p1', 'unit_settler', capital.tile);
    expect(checkInvariants(ctx, s)).toEqual([]);
    const back = produce(s, (d) => {
      d.turn += R.levyTurns;
      leviesTurn(d, ctx, () => {});
    });
    const u = back.units[soldier.id]!;
    expect(u.owner).toBe(id);
    expect(u.levied).toBeUndefined();
    // Home: at the city-state's settlement or right beside it, and never sharing a tile with
    // another owner's units (it used to stay in p1's capital, on top of p1's settler).
    expect(distance(back.map, u.tile, home.tile)).toBeLessThanOrEqual(1);
    expect(checkInvariants(ctx, back)).toEqual([]);
  });

  it('end early if the suzerain loses the city-state', () => {
    const { s: start, id } = suzerain();
    let s = produce(start, (d) => {
      d.players.p1!.gold = toFixed(1000);
    });
    s = act(s, { type: 'levy_military', player: 'p1', cityState: id }).state;
    const lost = produce(s, (d) => {
      d.cityStates[id]!.suzerain = null;
      leviesTurn(d, ctx, () => {});
    });
    expect(Object.values(lost.units).some((u) => u.levied)).toBe(false);
  });
});

describe('tribal villages', () => {
  const setup = (huts?: boolean): GameSetup => ({
    gameId: 'huts',
    settings: {
      seed: 'huts',
      turnLimit: null,
      ...(huts === false ? { huts: false } : {}),
      map: {
        script: 'continents',
        size: 'small',
        wrapX: true,
        resources: 'standard',
        startBalance: 'normal',
      },
    },
    players: [
      { id: 'p1', name: 'Human', kind: 'human' },
      { id: 'p2', name: 'AI', kind: 'ai' },
    ],
  });
  const huts = (s: GameState) => s.map.tiles.filter((t) => t.hut).length;

  it('are placed in the wilds, unless the game turns them off', () => {
    const s = createGame(setup(), full);
    expect(huts(s)).toBeGreaterThan(5);
    s.map.tiles.forEach((t) => {
      if (t.hut) expect(t.owner).toBeNull();
    });
    expect(huts(createGame(setup(false), full))).toBe(0);
  });

  it('give the first civ unit to step on one a reward', () => {
    const rules = ctx.content.rules;
    const only = (id: string) => ({
      content: {
        ...ctx.content,
        rules: {
          ...rules,
          huts: { ...rules.huts!, rewards: rules.huts!.rewards.filter((r) => r.id === id) },
        },
      },
    });
    let s = testState(FIELD);
    s = produce(s, (d) => {
      foundSettlement(d, ctx, 'p1', at(s, 2, 3), () => {});
      d.map.tiles[at(s, 6, 3)]!.hut = true;
      d.map.tiles[at(s, 7, 3)]!.hut = true;
    });
    s = structuredClone(s) as GameState;
    const scout = addUnit(s, 'p1', 'unit_scout', at(s, 5, 3)).id;
    const gold = s.players.p1!.gold;
    const r = act(
      s,
      { type: 'move_unit', player: 'p1', unit: scout, to: at(s, 6, 3) },
      only('hut_gold'),
    );
    expect(r.state.map.tiles[at(s, 6, 3)]!.hut).toBeUndefined();
    expect(r.state.players.p1!.gold).toBe(gold + toFixed(40));
    expect(r.events.find((e) => e.type === 'hut_found')).toMatchObject({ reward: 'hut_gold' });
    const pop = r.state.settlements[Object.keys(r.state.settlements)[0]!]!.population;
    const r2 = act(
      produce(r.state, (d) => {
        d.turn = 20;
      }),
      { type: 'move_unit', player: 'p1', unit: scout, to: at(s, 7, 3) },
      only('hut_families'),
    );
    expect(r2.state.settlements[Object.keys(r2.state.settlements)[0]!]!.population).toBe(pop + 1);
  });
});
