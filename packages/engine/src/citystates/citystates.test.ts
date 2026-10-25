import { castDraft, produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { Action } from '../actions';
import { setBit, decodeBits, encodeBits } from '../bitset';
import { toFixed } from '../fixed';
import { applyAction, createGame } from '../game';
import { distance } from '../map/hex';
import { advance } from '../progress/handlers';
import { foundSettlement } from '../settlements/handlers';
import { settlementYields } from '../settlements/rules';
import type { GameState } from '../state';
import { act, at, ctx, endTurn, testState } from '../testing/world';
import { tradeCapacity } from '../trade/rules';
import { cityStatePlayer } from './handlers';
import { cityStateIds, questsOf } from './rules';

const R = ctx.content.rules.cityStates;
const FIELD = Array.from({ length: 7 }, () => '.'.repeat(24));
const err = (s: GameState, a: Action) => {
  const r = applyAction(s, a, ctx);
  return r.ok ? undefined : r.error.code;
};

/** p1 at (2,3), p2 at (20,3), and Ugarit (a Trade city-state) between them at (11,3). */
function world() {
  let s = testState(FIELD, { explored: false });
  s = produce(s, (d) => {
    foundSettlement(d, ctx, 'p1', at(s, 2, 3), () => {});
    foundSettlement(d, ctx, 'p2', at(s, 20, 3), () => {});
    d.players.cs1 = castDraft(cityStatePlayer(ctx, s, 'cs1', 'Ugarit', at(s, 11, 3)));
    d.cityStates.cs1 = { def: 'cs_ugarit', envoys: {}, suzerain: null, met: [], quests: {} };
    const id = foundSettlement(d, ctx, 'cs1', at(s, 11, 3), () => {});
    d.settlements[id]!.name = 'Ugarit';
  });
  const [p1, p2, cs] = Object.keys(s.settlements) as [string, string, string];
  return { s, p1, p2, cs };
}

/** Marks a tile explored for a player. */
const explore = (s: GameState, player: string, tile: number) =>
  produce(s, (d) => {
    const bits = decodeBits(d.players[player]!.explored, d.map.tiles.length);
    setBit(bits, tile);
    d.players[player]!.explored = encodeBits(bits);
  });

const send = (player: string): Action => ({ type: 'send_envoy', player, cityState: 'cs1' });

describe('city-states', () => {
  it('are placed at the start, apart from every start and each other', () => {
    const s = createGame(
      {
        gameId: 'cs',
        settings: {
          seed: 'city-states',
          turnLimit: null,
          map: {
            script: 'continents',
            size: 'tiny',
            wrapX: true,
            resources: 'standard',
            startBalance: 'normal',
          },
        },
        players: ['p1', 'p2', 'p3', 'p4'].map((id) => ({ id, name: id, kind: 'ai' as const })),
      },
      ctx,
    );
    const ids = cityStateIds(s);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.length).toBeLessThanOrEqual(ctx.content.entities.mapSize.tiny!.cityStates);
    const homes = ids.map((id) => s.settlements[s.players[id]!.capital!]!);
    for (const h of homes) {
      const def = ctx.content.entities.cityState[s.cityStates[h.owner]!.def]!;
      expect(h.name).toBe(def.name);
      expect(h.population).toBe(R.startingPopulation);
      expect(Object.values(s.units).some((u) => u.owner === h.owner)).toBe(true);
      for (const p of s.playerOrder)
        expect(distance(s.map, h.tile, s.players[p]!.startTile)).toBeGreaterThanOrEqual(
          R.minDistance,
        );
      for (const o of homes)
        if (o !== h) expect(distance(s.map, h.tile, o.tile)).toBeGreaterThanOrEqual(R.minDistance);
    }
    // City-states aren't in the turn order, and their capitals don't count for domination.
    expect(ids.every((id) => !s.playerOrder.includes(id))).toBe(true);
  });

  it('are met by exploring them; the first to do so gets a free envoy', () => {
    const w = world();
    let s = w.s;
    const { cs } = w;
    expect(err(s, send('p1'))).toBe('not_met');
    s = explore(s, 'p1', s.settlements[cs]!.tile);
    s = endTurn(s);
    expect(s.cityStates.cs1!.met).toEqual(['p1']);
    expect(s.cityStates.cs1!.envoys).toEqual({ p1: R.firstMeetEnvoys });
    s = explore(s, 'p2', s.settlements[cs]!.tile);
    s = endTurn(s);
    expect(s.cityStates.cs1!.met).toEqual(['p1', 'p2']);
    expect(s.cityStates.cs1!.envoys.p2).toBeUndefined();
  });

  it('take free envoys first, then influence; the most (at least 3) leads them', () => {
    let { s } = world();
    s = produce(s, (d) => {
      d.cityStates.cs1!.met = ['p1', 'p2'];
      d.players.p1!.envoys = 2;
      d.players.p2!.influence = toFixed(R.envoyInfluence * 4);
    });
    expect(err(s, send('p1'))).toBeUndefined();
    s = act(s, send('p1')).state;
    s = act(s, send('p1')).state;
    expect(s.players.p1!.envoys).toBe(0);
    expect(err(s, send('p1'))).toBe('no_influence');
    for (let i = 0; i < 3; i++) s = act(s, send('p2')).state;
    expect(s.players.p2!.influence).toBe(toFixed(R.envoyInfluence));
    expect(s.cityStates.cs1!.suzerain).toBe('p2');
    // A tie keeps the current suzerain.
    s = produce(s, (d) => {
      d.players.p1!.envoys = 1;
    });
    const r = act(s, send('p1'));
    expect(r.state.cityStates.cs1!.envoys).toEqual({ p1: 3, p2: 3 });
    expect(r.state.cityStates.cs1!.suzerain).toBe('p2');
  });

  it('give their kind’s bonuses by envoys, and their own to the suzerain', () => {
    const w = world();
    let s = w.s;
    const { p1 } = w;
    const gold = (st: GameState) => settlementYields(ctx, st, st.settlements[p1]!).total.gold ?? 0;
    const before = gold(s);
    const routes = tradeCapacity(ctx, s, 'p1');
    s = produce(s, (d) => {
      d.cityStates.cs1!.met = ['p1'];
      d.players.p1!.envoys = 3;
    });
    s = act(s, send('p1')).state;
    // Trade, 1 envoy: +4 gold in the capital.
    expect(gold(s)).toBe(before + toFixed(4));
    s = act(act(s, send('p1')).state, send('p1')).state;
    // Ugarit's suzerain: +1 trade route.
    expect(s.cityStates.cs1!.suzerain).toBe('p1');
    expect(tradeCapacity(ctx, s, 'p1')).toBe(routes + 1);
  });

  it('pay envoys for their quests', () => {
    const w = world();
    let s = w.s;
    const { p1 } = w;
    expect(questsOf(ctx, s, 'cs1').map((q) => q.id)).toEqual(['district', 'route']);
    s = produce(s, (d) => {
      d.cityStates.cs1!.met = ['p1'];
      const tile = at(s, 3, 3);
      d.map.tiles[tile]!.district = 'district_commercial_hub';
      d.settlements[p1]!.districts.push({ id: 'district_commercial_hub', tile });
    });
    s = endTurn(s);
    expect(s.cityStates.cs1!.quests.p1).toEqual(['district']);
    expect(s.cityStates.cs1!.envoys.p1).toBe(R.questEnvoys);
    // Only once.
    s = endTurn(s);
    expect(s.cityStates.cs1!.envoys.p1).toBe(R.questEnvoys);
  });

  it('cost your envoys when you go to war with them, and take peace at once', () => {
    let { s } = world();
    s = produce(s, (d) => {
      d.cityStates.cs1!.met = ['p1'];
      d.cityStates.cs1!.envoys = { p1: 3 };
      d.cityStates.cs1!.suzerain = 'p1';
    });
    s = act(s, { type: 'declare_war', player: 'p1', target: 'cs1' }).state;
    expect(s.cityStates.cs1!.envoys).toEqual({});
    expect(s.cityStates.cs1!.suzerain).toBeNull();
    expect(err(s, send('p1'))).toBe('at_war');
    for (let i = 0; i < ctx.content.rules.combat.minWarTurns; i++) s = endTurn(s);
    s = act(s, { type: 'offer_peace', player: 'p1', target: 'cs1' }).state;
    expect(s.wars).toEqual([]);
  });

  it('come back when a captured one is freed, and owe their liberator', () => {
    const w = world();
    let s = w.s;
    const { cs } = w;
    s = produce(s, (d) => {
      // p2 took Ugarit; p1 took it from p2.
      const c = d.settlements[cs]!;
      c.owner = 'p1';
      c.capturedFrom = 'p2';
      c.captureChoice = true;
      d.players.cs1!.alive = false;
      d.players.cs1!.capital = null;
    });
    s = act(s, { type: 'capture_choice', player: 'p1', settlement: cs, choice: 'liberate' }).state;
    expect(s.players.cs1!.alive).toBe(true);
    expect(s.settlements[cs]!.owner).toBe('cs1');
    expect(s.cityStates.cs1!.envoys.p1).toBe(R.liberateEnvoys);
    expect(s.cityStates.cs1!.suzerain).toBe('p1');
  });

  it('build soldiers to defend themselves, and keep up with the world', () => {
    let { s } = world();
    s = produce(s, (d) => {
      for (const p of ['p1', 'p2']) d.players[p]!.techs.done.push('tech_bronze_working');
    });
    s = endTurn(s);
    expect(s.players.cs1!.techs.done).toContain('tech_bronze_working');
    const home = s.settlements[s.players.cs1!.capital!]!;
    expect(home.queue).toEqual([{ kind: 'unit', id: 'unit_spearman' }]);
    for (let i = 0; i < 30 && !Object.values(s.units).some((u) => u.owner === 'cs1'); i++)
      s = endTurn(s);
    expect(Object.values(s.units).filter((u) => u.owner === 'cs1')).toHaveLength(1);
  });

  it('get envoys from civics that grant them', () => {
    const { s } = world();
    const next = produce(s, (d) => {
      d.players.p1!.civics.current = 'civic_mysticism';
      advance(d, ctx, 'p1', 'civic', toFixed(10_000), () => {});
    });
    expect(next.players.p1!.envoys).toBe(1);
  });
});
