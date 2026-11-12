import { compileFromDirs } from '@cx/content/node';
import {
  type Action,
  applyAction,
  checkInvariants,
  type GameSetup,
  type GameState,
  playAiTurn,
  type PlayerId,
  playerView,
  turnOrder,
} from '@cx/engine';
import { type ClientMessage, type HostMessage, PROTOCOL_VERSION } from '@cx/protocol';
import { describe, expect, it } from 'vitest';
import { OnlineHost } from './online';
import { RemoteGame } from './remote';
import { memorySeatKeys } from './seatKeys';
import { memoryNetwork } from './transport';

/**
 * Online play under stress (docs/02-multiplayer.md): the host is authoritative, a client is
 * never trusted, and each client only ever holds its own view. Two things are tested through
 * the real host and protocol, over the in-memory network:
 *
 * - a client that sends rubbish, lies and other players' actions changes nothing but its own
 *   legal moves, and never stops the host;
 * - a whole stretch of a game played from three devices stays in step: after every seat's
 *   turn each client holds exactly its view of the host's game, and the game stays sound.
 */

const ctx = { content: compileFromDirs().content! };
const CODE = 'ABCDEF';

const makeSetup = (names: string[]): GameSetup => ({
  gameId: 'online-fuzz',
  settings: {
    seed: 'online-fuzz',
    turnLimit: null,
    speed: 'speed_online',
    map: {
      script: 'continents',
      size: 'tiny',
      wrapX: true,
      resources: 'standard',
      startBalance: 'normal',
    },
  },
  players: [
    ...names.map((name, i) => ({ id: `p${i + 1}`, name, kind: 'human' as const })),
    { id: `p${names.length + 1}`, name: 'Rival', kind: 'ai' as const },
  ],
});

const hello = (name: unknown, proofs: unknown = []) =>
  ({
    t: 'hello',
    protocol: PROTOCOL_VERSION,
    contentHash: ctx.content.hash,
    name,
    proofs,
  }) as unknown as ClientMessage;

/** What a client holds must be exactly its view of the real game: nothing more. */
const expectOnlyItsView = (host: OnlineHost, client: RemoteGame, when = '') =>
  expect(JSON.parse(JSON.stringify(client.state)) as GameState, when).toEqual(
    JSON.parse(JSON.stringify(playerView(ctx, host.game!.state, client.you!))),
  );

function prng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1));
  return { next, int, pick: <T>(list: readonly T[]): T => list[int(0, list.length - 1)]! };
}

describe('fuzz: what a client can send', () => {
  it('rubbish, lies and other seats’ actions never stop the host or touch anyone else', async () => {
    const net = memoryNetwork<HostMessage, ClientMessage>();
    const host = new OnlineHost(net.host, ctx, CODE, 'Ann', 2);
    const cy = new RemoteGame(net.connect(), ctx, CODE, 'Cy');
    // The troublemaker speaks the protocol by hand.
    const bad = net.connect();
    const heard: HostMessage[] = [];
    bad.onMessage((m) => heard.push(m));
    bad.send(hello('Mal'));
    await net.flush();
    host.start(makeSetup);
    await net.flush();
    const mine = (heard.find((m) => m.t === 'seats' && m.you) as { you: PlayerId }).you;
    const others = ['p1', 'p2', 'p3', 'p4'].filter((p) => p !== mine);
    const state = () => host.game!.state;
    const theirs = (s: GameState) =>
      JSON.stringify({
        players: others.map((p) => s.players[p]),
        units: Object.values(s.units).filter((u) => u.owner !== mine),
        settlements: Object.values(s.settlements).filter((x) => x.owner !== mine),
      });
    const before = theirs(state());

    const rand = prng(3);
    const send = (m: unknown) => bad.send(m as ClientMessage);
    // By hand: the shapes most likely to trip a handler, and the lies worth telling.
    const someUnit = Object.values(state().units).find((u) => u.owner !== mine)!;
    for (const m of [
      null,
      7,
      'hello',
      [],
      {},
      { t: 7 },
      hello(7),
      hello({ toString: 1 }, { length: 3 }),
      hello('x'.repeat(100_000), ['a', 7, null]),
      { t: 'act' },
      { t: 'act', id: null, action: null },
      { t: 'act', id: 'one', action: 'end_turn' },
      { t: 'act', id: 1, action: { type: 'end_turn', player: others[0] } },
      { t: 'act', id: 2, action: { type: 'end_turn', player: 'p4' } },
      { t: 'act', id: 3, action: { type: 'disband_unit', player: others[0], unit: someUnit.id } },
      { t: 'act', id: 4, action: { type: 'disband_unit', player: mine, unit: someUnit.id } },
      { t: 'act', id: 5, action: { type: 'set_civic', player: mine, civic: 'constructor' } },
      { t: 'act', id: 6, action: { type: 'set_research', player: mine, tech: '__proto__' } },
      { t: 'act', id: 7, action: { type: 'move_unit', player: mine, unit: someUnit.id, to: 0 } },
      { t: 'act', id: 8, action: { type: 'move_unit', player: mine, unit: 'u1', to: -1 } },
      { t: 'act', id: 9, action: { type: 'move_unit', player: mine, unit: 'u1', to: 1e12 } },
      {
        t: 'act',
        id: Infinity,
        action: { type: 'end_turn', player: mine, extra: { admin: true } },
      },
      { t: 'chat' },
      { t: 'chat', text: { length: 5 } },
      { t: 'chat', text: 'x'.repeat(200_000) },
      { t: 'ping' },
      { t: 'ping', tile: 'here' },
      { t: 'ping', tile: 1e9 },
      { t: 'ping', tile: -3 },
      { t: 'pick', leader: 'constructor', color: 7 },
      { t: 'key', gameId: 'online-fuzz', key: 'give me yours' },
      { t: 'view', delta: { full: true } },
      { t: 'seats', seats: [], started: false, you: 'p1' },
    ])
      send(m);
    await net.flush();
    // And a few thousand at random.
    const kinds = ['hello', 'act', 'chat', 'ping', 'pick', 'view', 'result', 'nope', 7, null];
    const values: unknown[] = [
      null,
      0,
      -1,
      1.5,
      1e12,
      '',
      'x',
      mine,
      others[0],
      'p4',
      'constructor',
      someUnit.id,
      [],
      {},
      true,
      { type: 'end_turn', player: others[0] },
      { type: 'end_turn', player: 'hostile' },
      { type: 'skip_unit', player: mine, unit: someUnit.id },
      { type: 'rename', player: others[0], name: 'Mine now' },
    ];
    const keys = ['id', 'action', 'text', 'tile', 'leader', 'color', 'name', 'proofs', 'player'];
    for (let i = 0; i < 3000; i++) {
      const t = rand.pick(kinds);
      // (A hello from another version is turned away for good: that comes last, below.)
      const m: Record<string, unknown> =
        t === 'hello' ? { ...(hello('x') as unknown as Record<string, unknown>) } : { t };
      for (let n = rand.int(0, 4); n > 0; n--) m[rand.pick(keys)] = rand.pick(values);
      send(m);
      if (i % 500 === 0) await net.flush();
    }
    await net.flush();

    // Nobody else's game was touched, the game is sound, and an honest client still holds
    // exactly its view.
    expect(theirs(state())).toBe(before);
    expect(checkInvariants(ctx, state())).toEqual([]);
    expectOnlyItsView(host, cy);
    expect(host.seats().map((s) => s.name)).toEqual(['Ann', 'Cy', 'Mal']);
    // Chat lines are cut to size, and only from people in the game.
    expect(
      host
        .handle()
        .online!.chat()
        .every((l) => l.text.length <= 300),
    ).toBe(true);
    // Lies about someone else's seat are refused by name.
    const refusals = heard.flatMap((m) => (m.t === 'result' && m.error ? [m.error.code] : []));
    expect(refusals).toContain('not_your_seat');
    expect(refusals).toContain('bad_action');
    // The troublemaker was never sent anything but its own view.
    const view = heard.find((m) => m.t === 'view' && m.delta.full) as
      Extract<HostMessage, { t: 'view' }> | undefined;
    expect(view).toBeDefined();
    expect(JSON.stringify(view!.delta.fields.settings)).not.toContain('"seed":"online-fuzz"');

    // A hello from another version of the game is turned away, even from a seated device;
    // its seat then waits for whoever holds its key.
    send({ t: 'hello', name: 'Mal' });
    await net.flush();
    expect(heard.at(-1)).toMatchObject({ t: 'refused' });
    expect(host.seats().find((x) => x.player === mine)).toMatchObject({
      online: false,
      reserved: true,
    });
    expect(theirs(state())).toBe(before);

    // The game goes on: everyone ends the turn (the host ends the troublemaker's).
    const me = host.handle();
    me.act({ type: 'end_turn', player: 'p1' });
    cy.act({ type: 'end_turn', player: cy.you! });
    me.online!.endTurnFor!(mine);
    await net.flush();
    expect(state().turn).toBe(2);
    expectOnlyItsView(host, cy);
  });

  it('one device holds one seat however often it says hello', async () => {
    const net = memoryNetwork<HostMessage, ClientMessage>();
    const host = new OnlineHost(net.host, ctx, CODE, 'Ann', 3);
    const greedy = net.connect();
    for (let i = 0; i < 5; i++) greedy.send(hello(`Me ${i}`));
    await net.flush();
    expect(host.seats().map((s) => s.name)).toEqual(['Ann', 'Me 0']);
    // There is still room for friends, and a started game keeps one seat per device too.
    const bo = new RemoteGame(net.connect(), ctx, CODE, 'Bo');
    const cy = new RemoteGame(net.connect(), ctx, CODE, 'Cy');
    await net.flush();
    expect(host.seats().map((s) => s.name)).toEqual(['Ann', 'Me 0', 'Bo', 'Cy']);
    host.start(makeSetup);
    await net.flush();
    greedy.send(hello('Me again'));
    greedy.send(hello('Bo'));
    await net.flush();
    expect(host.seats().map((s) => `${s.name}:${s.player}:${s.online}`)).toEqual([
      'Ann:p1:true',
      'Me 0:p2:true',
      'Bo:p3:true',
      'Cy:p4:true',
    ]);
    expect([bo.you, cy.you]).toEqual(['p3', 'p4']);
    expect(bo.ended ?? cy.ended).toBeNull();
  });

  it('someone who never joined can’t act, chat, ping or pick', async () => {
    const net = memoryNetwork<HostMessage, ClientMessage>();
    const host = new OnlineHost(net.host, ctx, CODE, 'Ann', 1);
    const bo = new RemoteGame(net.connect(), ctx, CODE, 'Bo');
    await net.flush();
    host.start(makeSetup);
    await net.flush();
    const lurker = net.connect();
    const heard: HostMessage[] = [];
    lurker.onMessage((m) => heard.push(m));
    const before = JSON.stringify(host.game!.state);
    lurker.send({ t: 'act', id: 1, action: { type: 'end_turn', player: 'p1' } });
    lurker.send({ t: 'chat', text: 'hello?' });
    lurker.send({ t: 'ping', tile: 3 });
    lurker.send({ t: 'pick', leader: null });
    await net.flush();
    expect(JSON.stringify(host.game!.state)).toBe(before);
    expect(host.handle().online!.chat()).toEqual([]);
    expect(heard).toEqual([
      { t: 'result', id: 1, error: { code: 'not_playing', message: 'You are not in the game' } },
    ]);
    // A full game turns a late hello away with a reason.
    lurker.send(hello('Late'));
    await net.flush();
    expect(heard.at(-1)).toMatchObject({ t: 'refused' });
    expect(bo.ended).toBeNull();
  });
});

describe('soak: a game played from three devices', () => {
  /**
   * What `seat`'s AI would do this turn, worked out on the host's real game (as a player
   * decides looking at their own screen), to be sent one action at a time from that seat's
   * device like clicks.
   */
  const plan = (state: GameState, seat: PlayerId): Action[] => {
    const actions: Action[] = [];
    let s = state;
    playAiTurn(ctx, s, seat, (action) => {
      const r = applyAction(s, action, ctx);
      if (!r.ok) return undefined;
      actions.push(action);
      s = r.state;
      return s;
    });
    return actions;
  };

  const TURNS = Number(process.env.CX_ONLINE_TURNS ?? 12);

  it(
    `stays in step for ${TURNS} turns: every client holds exactly its view after every seat's turn`,
    async () => {
      const net = memoryNetwork<HostMessage, ClientMessage>();
      const host = new OnlineHost(net.host, ctx, CODE, 'Ann', 2);
      const boKeys = memorySeatKeys();
      let bo = new RemoteGame(net.connect(), ctx, CODE, 'Bo', { keys: boKeys });
      const cy = new RemoteGame(net.connect(), ctx, CODE, 'Cy');
      await net.flush();
      host.start(makeSetup);
      await net.flush();
      const me = host.handle();
      const refused: string[] = [];
      cy.onRefused = (m) => refused.push(`cy: ${m}`);
      const state = () => host.game!.state;
      let sent = 0;
      let ahead = 0;

      while (state().turn <= TURNS && state().status === 'playing') {
        const turn = state().turn;
        for (const seat of turnOrder(state())) {
          const p = state().players[seat]!;
          if (p.kind !== 'human' || !p.alive || p.turnEnded) continue;
          const device = seat === 'p1' ? me : seat === bo.you ? bo : cy;
          for (const action of plan(state(), seat)) {
            const shown = device.state;
            const r = device.act(action);
            expect(r.ok, `turn ${turn} ${seat} ${JSON.stringify(action)}`).toBe(true);
            sent++;
            if (device !== me && device.state !== shown) ahead++;
            await net.flush();
          }
          const when = `after ${seat}'s turn ${turn}`;
          expect(checkInvariants(ctx, state()), when).toEqual([]);
          expectOnlyItsView(host, bo, when);
          expectOnlyItsView(host, cy, when);
        }
        // Halfway, Bo's line drops and a new device with his key takes the seat back.
        if (turn === Math.ceil(TURNS / 2)) {
          bo.online.leave();
          await net.flush();
          bo = new RemoteGame(net.connect(), ctx, CODE, 'Bo', { keys: boKeys });
          bo.onRefused = (m) => refused.push(`bo: ${m}`);
          await net.flush();
          expect(bo.you).toBe('p2');
          expectOnlyItsView(host, bo, 'after rejoining');
        }
        expect(state().turn, `the turn after ${turn}`).toBe(turn + 1);
      }
      // Everything the players did was accepted by the host, and most of it showed at once.
      expect(refused).toEqual([]);
      expect(sent).toBeGreaterThan(TURNS * 6);
      expect(ahead).toBeGreaterThan(sent / 4);
    },
    120_000 + TURNS * 5000,
  );
});
