import { compileFromDirs } from '@cx/content/node';
import { type GameSetup, type GameState, playerView } from '@cx/engine';
import type { ClientMessage, HostMessage } from '@cx/protocol';
import { describe, expect, it } from 'vitest';
import { OnlineHost } from './online';
import { RemoteGame } from './remote';
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

/** A host (Ann) with two friends (Bo, Cy) in the lobby. */
async function lobby() {
  const net = memoryNetwork<HostMessage, ClientMessage>();
  const host = new OnlineHost(net.host, ctx, 'ABCDEF', 'Ann', 2);
  const bo = new RemoteGame(net.connect(), ctx, 'ABCDEF', 'Bo');
  const cy = new RemoteGame(net.connect(), ctx, 'ABCDEF', 'Cy');
  await net.flush();
  return { net, host, bo, cy };
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

  it('lets a player who dropped take their seat back', async () => {
    const { net, host, bo } = await lobby();
    host.start(makeSetup);
    await net.flush();
    bo.online.leave();
    await net.flush();
    expect(host.seats().find((s) => s.name === 'Bo')).toMatchObject({ online: false });
    // The host can end their turn so the game isn't stuck.
    host.handle().online!.endTurnFor!('p2');
    expect(host.game!.state.players.p2!.turnEnded).toBe(true);

    const back = new RemoteGame(net.connect(), ctx, 'ABCDEF', 'Bo');
    await net.flush();
    expect(back.you).toBe('p2');
    expectOnlyItsView(host, back);
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
