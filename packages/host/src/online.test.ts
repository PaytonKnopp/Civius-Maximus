import { compileFromDirs } from '@cx/content/node';
import { type GameSetup, type GameState, playerView } from '@cx/engine';
import type { ClientMessage, HostMessage } from '@cx/protocol';
import { describe, expect, it } from 'vitest';
import { OnlineHost } from './online';
import { RemoteGame } from './remote';
import { memorySeatKeys, seatProof, sha256hex } from './seatKeys';
import { memoryNetwork } from './transport';

const ctx = { content: compileFromDirs().content! };

const makeSetup = (names: string[]): GameSetup => ({
  gameId: 'online',
  settings: {
    seed: 'online',
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
    ...names.map((name, i) => ({ id: `p${i + 1}`, name, kind: 'human' as const })),
    { id: `p${names.length + 1}`, name: 'Rival', kind: 'ai' as const },
  ],
});

/** A host (Ann) with two friends (Bo, Cy) in the lobby; each friend's device keeps its keys. */
async function lobby() {
  const net = memoryNetwork<HostMessage, ClientMessage>();
  const host = new OnlineHost(net.host, ctx, 'ABCDEF', 'Ann', 2);
  const boKeys = memorySeatKeys();
  const boLine = net.connect();
  const bo = new RemoteGame(boLine, ctx, 'ABCDEF', 'Bo', {
    keys: boKeys,
    reconnect: async () => net.connect(),
    retryDelays: [0, 0],
  });
  const cy = new RemoteGame(net.connect(), ctx, 'ABCDEF', 'Cy');
  await net.flush();
  return { net, host, bo, boKeys, boLine, cy };
}

/** Lets the network and the timers and promises it starts run out. */
async function settle(net: { flush(): Promise<void> }) {
  for (let i = 0; i < 6; i++) {
    await net.flush();
    await new Promise((r) => setTimeout(r, 0));
  }
}

/** What a client holds must be exactly its view of the real game: nothing more. */
const expectOnlyItsView = (host: OnlineHost, client: RemoteGame) =>
  expect(JSON.parse(JSON.stringify(client.state)) as GameState).toEqual(
    JSON.parse(JSON.stringify(playerView(ctx, host.game!.state, client.you!))),
  );

describe('online play', () => {
  it('fills the lobby, starts, and sends each player only their own view', async () => {
    const { net, host, bo, cy } = await lobby();
    expect(host.seats().map((s) => s.name)).toEqual(['Ann', 'Bo', 'Cy']);
    expect(bo.online.seats().map((s) => s.name)).toEqual(['Ann', 'Bo', 'Cy']);

    host.start(makeSetup);
    await net.flush();
    expect([bo.you, cy.you]).toEqual(['p2', 'p3']);
    expect(bo.ready && cy.ready).toBe(true);
    expectOnlyItsView(host, bo);
    expectOnlyItsView(host, cy);
    // The real game's seed and dice never leave the host.
    expect(JSON.stringify(bo.state)).not.toContain('"seed":"online"');
    expect(bo.state.rng).toEqual([0, 0, 0, 0]);
    expect(Object.values(bo.state.units).every((u) => u.owner === 'p2' || u.orders === null)).toBe(
      true,
    );
  });

  it('plays actions ahead, confirms them, and turns the page when everyone is done', async () => {
    const { net, host, bo, cy } = await lobby();
    host.start(makeSetup);
    await net.flush();
    const me = host.handle();

    // Bo founds a capital: it shows at once, and the host's game has it after the round trip.
    const settler = Object.values(bo.state.units).find(
      (u) => u.owner === 'p2' && u.type === 'unit_settler',
    )!;
    expect(bo.act({ type: 'found_settlement', player: 'p2', unit: settler.id }).ok).toBe(true);
    expect(Object.values(bo.state.settlements).some((s) => s.owner === 'p2')).toBe(true);
    await net.flush();
    expect(Object.values(host.game!.state.settlements).some((s) => s.owner === 'p2')).toBe(true);
    expectOnlyItsView(host, bo);

    // Everyone ends the turn; the next one starts for all.
    me.act({ type: 'end_turn', player: 'p1' });
    bo.act({ type: 'end_turn', player: 'p2' });
    cy.act({ type: 'end_turn', player: 'p3' });
    await net.flush();
    expect(host.game!.state.turn).toBe(2);
    expect([bo.state.turn, cy.state.turn]).toEqual([2, 2]);
    expectOnlyItsView(host, bo);
    expectOnlyItsView(host, cy);
  });

  it('refuses actions for someone else’s civ', async () => {
    const { net, host, bo } = await lobby();
    host.start(makeSetup);
    await net.flush();
    const refused: string[] = [];
    bo.onRefused = (m) => refused.push(m);
    bo.act({ type: 'end_turn', player: 'p1' });
    await net.flush();
    expect(refused).toEqual(['That is not your civ']);
    expect(host.game!.state.players.p1!.turnEnded).toBe(false);
  });

  it('lets a player who dropped take their seat back, and nobody else', async () => {
    const { net, host, bo, boKeys } = await lobby();
    host.start(makeSetup);
    await net.flush();
    expect(boKeys.all()).toHaveLength(1);
    bo.online.leave();
    await net.flush();
    expect(host.seats().find((s) => s.name === 'Bo')).toMatchObject({
      online: false,
      reserved: true,
    });
    // The host can end their turn so the game isn't stuck.
    host.handle().online!.endTurnFor!('p2');
    expect(host.game!.state.players.p2!.turnEnded).toBe(true);

    // Someone with the code but not Bo's key can't take his seat, even with his name.
    const stranger = new RemoteGame(net.connect(), ctx, 'ABCDEF', 'Bo');
    await net.flush();
    expect(stranger.ended).toMatch(/Every seat in this game is taken/);

    const back = new RemoteGame(net.connect(), ctx, 'ABCDEF', 'Bo', { keys: boKeys });
    await net.flush();
    expect(back.you).toBe('p2');
    expectOnlyItsView(host, back);
  });

  it('lets the host free an away seat for a new device', async () => {
    const { net, host, bo } = await lobby();
    host.start(makeSetup);
    await net.flush();
    bo.online.leave();
    await net.flush();
    // Seats of people still connected (and the host's own) can't be freed.
    host.freeSeat('p3');
    host.freeSeat('p1');
    expect(host.seats().map((s) => s.reserved)).toEqual([false, true, true]);
    host.handle().online!.freeSeat!('p2');
    expect(host.seats().find((s) => s.player === 'p2')).toMatchObject({ reserved: false });

    const phone = memorySeatKeys();
    const back = new RemoteGame(net.connect(), ctx, 'ABCDEF', 'Bo', { keys: phone });
    await net.flush();
    expect(back.you).toBe('p2');
    // The seat has a new key, on the new device.
    expect(phone.all()).toHaveLength(1);
    expect(host.seats().find((s) => s.player === 'p2')).toMatchObject({ reserved: true });
  });

  it('reconnects by itself after the line drops, and the old line gives way', async () => {
    const { net, host, bo, boLine } = await lobby();
    host.start(makeSetup);
    await net.flush();
    net.host.kick(boLine.peer);
    await settle(net);
    expect(bo.ended).toBeNull();
    expect(bo.reconnecting).toBe(false);
    expect(bo.you).toBe('p2');
    expectOnlyItsView(host, bo);
    const settler = Object.values(bo.state.units).find(
      (u) => u.owner === 'p2' && u.type === 'unit_settler',
    )!;
    expect(bo.act({ type: 'found_settlement', player: 'p2', unit: settler.id }).ok).toBe(true);
    await net.flush();
    expect(Object.values(host.game!.state.settlements).some((s) => s.owner === 'p2')).toBe(true);
  });

  it('gives the seat to a new window of the same player, before the old one times out', async () => {
    const { net, host, bo, boKeys } = await lobby();
    host.start(makeSetup);
    await net.flush();
    const again = new RemoteGame(net.connect(), ctx, 'ABCDEF', 'Bo', { keys: boKeys });
    await settle(net);
    expect(again.you).toBe('p2');
    expect(bo.ended).toMatch(/another window/);
    expect(host.seats().filter((s) => s.player === 'p2')).toHaveLength(1);
  });

  it('keeps seat keys when the game is hosted again, under a new code', async () => {
    const { net, host, boKeys } = await lobby();
    let saved: Record<string, string> = {};
    host.onKeys = (gameId, keys) => {
      expect(gameId).toBe('online');
      saved = keys;
    };
    host.start(makeSetup);
    await net.flush();
    expect(Object.keys(saved)).toEqual(['p2', 'p3']);
    const state = host.game!.state;
    host.close();
    await net.flush();

    const net2 = memoryNetwork<HostMessage, ClientMessage>();
    const again = new OnlineHost(net2.host, ctx, 'GHJKMN', 'Ann', 7);
    again.resume(state, undefined, saved);
    const stranger = new RemoteGame(net2.connect(), ctx, 'GHJKMN', 'Bo');
    const bo = new RemoteGame(net2.connect(), ctx, 'GHJKMN', 'Bo', { keys: boKeys });
    await net2.flush();
    expect(stranger.ended).toMatch(/taken/);
    expect(bo.you).toBe('p2');
  });

  it('proves a key without sending it, differently for each hosting', () => {
    expect(sha256hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(sha256hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    const proof = seatProof('0123456789abcdef', 'ABCDEF');
    expect(proof).not.toContain('0123456789abcdef');
    expect(proof).not.toBe(seatProof('0123456789abcdef', 'GHJKMN'));
  });

  it('lets the host send someone away from the lobby', async () => {
    const { net, host, bo, cy } = await lobby();
    host.removeFromLobby(2);
    await net.flush();
    expect(cy.ended).toMatch(/removed you/);
    expect(host.seats().map((x) => x.name)).toEqual(['Ann', 'Bo']);
    expect(bo.online.seats().map((x) => x.name)).toEqual(['Ann', 'Bo']);
    host.start(makeSetup);
    await net.flush();
    expect(host.game!.state.players.p3?.kind).toBe('ai');
  });

  it('turns away a different version or a full game', async () => {
    const { net, host } = await lobby();
    const late = new RemoteGame(net.connect(), ctx, 'ABCDEF', 'Di');
    const odd = new RemoteGame(
      net.connect(),
      { content: { ...ctx.content, hash: 'something else' } },
      'ABCDEF',
      'Ed',
    );
    await net.flush();
    expect(late.ended).toBe('The game is full.');
    expect(odd.ended).toMatch(/different game content/);
    expect(host.seats()).toHaveLength(3);
  });

  it('relays chat and map pings, and keeps lobby leader picks', async () => {
    const { net, host, bo, cy } = await lobby();
    bo.online.pick('leader_caesar');
    bo.online.say('hello all');
    await net.flush();
    expect(host.seats().find((x) => x.name === 'Bo')).toMatchObject({ leader: 'leader_caesar' });
    expect(cy.online.chat().map((l) => `${l.from}: ${l.text}`)).toEqual(['Bo: hello all']);
    expect(host.lobbyChat()).toHaveLength(1);

    let leaders: (string | null)[] = [];
    host.start((names, picks) => {
      leaders = picks;
      return makeSetup(names);
    });
    await net.flush();
    expect(leaders).toEqual([null, 'leader_caesar', null]);
    const me = host.handle().online!;
    const pings: number[] = [];
    me.onPing((p) => pings.push(p.tile));
    const cyPings: string[] = [];
    cy.online.onPing((p) => cyPings.push(`${p.from}@${p.tile}`));
    bo.online.ping(7);
    me.say('gg');
    await net.flush();
    expect(pings).toEqual([7]);
    expect(cyPings).toEqual(['Bo@7']);
    expect(bo.online.chat().at(-1)).toMatchObject({ from: 'Ann', player: 'p1', text: 'gg' });
  });

  it('ends everyone’s turn when the turn timer runs out', async () => {
    const { net, host, bo } = await lobby();
    host.turnSeconds = 0.05;
    host.start(makeSetup);
    await net.flush();
    expect(host.handle().online!.deadline()).not.toBeNull();
    expect(bo.online.deadline()).not.toBeNull();
    await new Promise((r) => setTimeout(r, 120));
    await net.flush();
    expect(host.game!.state.turn).toBe(2);
    host.close();
  });

  it('lets the AI play the seat of a friend who dropped, when the host chose that', async () => {
    const { net, host, bo } = await lobby();
    host.aiTakeover = true;
    host.start(makeSetup);
    await net.flush();
    bo.online.leave();
    await net.flush();
    await new Promise((r) => setTimeout(r, 0));
    expect(host.game!.state.players.p2!.turnEnded).toBe(true);
    expect(host.game!.state.players.p3!.turnEnded).toBe(false);
  });
});
