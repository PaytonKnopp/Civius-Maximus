import {
  type EngineContext,
  eventsFor,
  type GameEvent,
  type GameSetup,
  type GameState,
  parseAction,
  type PlayerId,
  playerView,
} from '@cx/engine';
import {
  type ClientMessage,
  diffView,
  type HostMessage,
  PROTOCOL_VERSION,
  type SeatInfo,
} from '@cx/protocol';
import type { GameHandle, OnlineSession } from './handle';
import { type AiRunner, LocalGame } from './local';
import type { HostTransport } from './transport';

/**
 * An online game hosted in this tab (docs/01-architecture.md, "Multiplayer data flow"): the
 * real game runs here, friends join by code, and each of them is only ever sent their own view
 * of it (`playerView`) and the events they may see. Before the game starts, the lobby collects
 * who's playing; after, anyone who drops can rejoin their seat (by name, or any free one).
 */
export class OnlineHost {
  game: LocalGame | null = null;
  /** The player the host plays, once the game started. */
  hostPlayer: PlayerId | null = null;
  /** Friends in the lobby before the start (the host isn't listed). */
  private lobby: { name: string; peer: string }[] = [];
  /** Connected clients that said hello, and the seat each plays once the game started. */
  private peers = new Map<string, PlayerId | null>();
  /** The last view each client was sent (the next one goes as the changes from it). */
  private sent = new Map<string, GameState>();
  /** The last action each client sent that the game has handled. */
  private acked = new Map<string, number>();
  private watchers = new Set<() => void>();
  private stop: (() => void)[] = [];

  constructor(
    private readonly net: HostTransport<HostMessage, ClientMessage>,
    readonly ctx: EngineContext,
    readonly code: string,
    readonly hostName: string,
    /** Friends the lobby takes. */
    readonly openSeats: number,
  ) {
    this.stop.push(
      net.onMessage((peer, m) => this.receive(peer, m)),
      net.onPeer((peer, connected) => {
        if (!connected) this.left(peer);
      }),
    );
  }

  get started() {
    return this.game !== null;
  }

  seats(): SeatInfo[] {
    const game = this.game;
    if (!game)
      return [
        { name: this.hostName, player: null, host: true, online: true },
        ...this.lobby.map((l) => ({ name: l.name, player: null, host: false, online: true })),
      ];
    const taken = new Set(this.peers.values());
    return humanSeats(game.state).map((p) => ({
      name: game.state.players[p]!.name,
      player: p,
      host: p === this.hostPlayer,
      online: p === this.hostPlayer || taken.has(p),
    }));
  }

  onChange(fn: () => void): () => void {
    this.watchers.add(fn);
    return () => this.watchers.delete(fn);
  }

  /** Starts a new game with the lobby: `makeSetup` gets the humans' names, the host first. */
  start(makeSetup: (names: string[]) => GameSetup, runner?: AiRunner): LocalGame {
    const setup = makeSetup([this.hostName, ...this.lobby.map((l) => l.name)]);
    const humans = setup.players.filter((p) => p.kind === 'human').map((p) => p.id);
    this.begin(new LocalGame(setup, this.ctx, runner), humans[0]!);
    this.lobby.forEach((l, i) => {
      if (humans[i + 1]) this.peers.set(l.peer, humans[i + 1]!);
    });
    this.lobby = [];
    this.changed();
    for (const peer of this.peers.keys()) this.sendView(peer, []);
    return this.game!;
  }

  /** Hosts a saved game: the host takes the seat with their name (or the first); friends rejoin. */
  resume(state: GameState, runner?: AiRunner): LocalGame {
    const humans = humanSeats(state);
    const mine = humans.find((p) => state.players[p]!.name === this.hostName) ?? humans[0]!;
    this.begin(new LocalGame(state, this.ctx, runner), mine);
    this.changed();
    return this.game!;
  }

  /** The game as the host's own screen plays it: only the host's seat is played here. */
  handle(): GameHandle {
    const game = this.game!;
    const me = this.hostPlayer!;
    const session: OnlineSession = {
      code: this.code,
      seats: () => this.seats(),
      onChange: (fn) => this.onChange(fn),
      endTurnFor: (player) => {
        if (player !== me && !game.state.players[player]?.turnEnded)
          game.act({ type: 'end_turn', player });
      },
      leave: () => this.close(),
    };
    return {
      ctx: this.ctx,
      get state() {
        return game.state;
      },
      get busy() {
        return game.busy;
      },
      act: (action) => game.act(action),
      subscribe: (listener) => game.subscribe(listener),
      humans: () => [me],
      nextHuman: () => (game.state.players[me]!.turnEnded ? undefined : me),
      load: (state) => game.load(state),
      saves: true,
      online: session,
    };
  }

  close() {
    for (const off of this.stop) off();
    this.net.close();
  }

  private begin(game: LocalGame, hostPlayer: PlayerId) {
    this.game = game;
    this.hostPlayer = hostPlayer;
    this.stop.push(
      game.subscribe((_, events) => {
        for (const [peer, player] of this.peers) if (player) this.sendView(peer, events);
      }),
    );
  }

  private receive(peer: string, m: ClientMessage) {
    if (m.t === 'hello') this.join(peer, m);
    else if (m.t === 'act') this.clientAct(peer, m.id, m.action);
  }

  private join(peer: string, m: Extract<ClientMessage, { t: 'hello' }>) {
    if (m.protocol !== PROTOCOL_VERSION)
      return this.refuse(peer, 'The host runs a different version of the game. Reload the page.');
    if (m.contentHash !== this.ctx.content.hash)
      return this.refuse(peer, 'The host plays with different game content (version or mods).');
    const name = m.name.trim().slice(0, 24) || 'Friend';
    const game = this.game;
    if (!game) {
      if (this.lobby.length >= this.openSeats) return this.refuse(peer, 'The game is full.');
      this.lobby.push({ name, peer });
      this.peers.set(peer, null);
    } else {
      // Rejoining: their own seat if the name matches, else the first one nobody plays.
      const taken = new Set(this.peers.values());
      const free = humanSeats(game.state).filter((p) => p !== this.hostPlayer && !taken.has(p));
      const seat =
        free.find((p) => game.state.players[p]!.name === name) ??
        free.find((p) => game.state.players[p]!.alive);
      if (!seat) return this.refuse(peer, 'Every seat in this game is taken.');
      this.peers.set(peer, seat);
      this.sendView(peer, []);
    }
    this.changed();
  }

  private clientAct(peer: string, id: number, input: unknown) {
    const player = this.peers.get(peer);
    const game = this.game;
    const reply = (code: string, message: string) =>
      this.net.send(peer, { t: 'result', id, error: { code, message } });
    if (!game || !player) return reply('not_playing', 'You are not in the game');
    const parsed = parseAction(input);
    if (!parsed.ok) return reply('bad_action', parsed.message);
    if (parsed.action.player !== player) return reply('not_your_seat', 'That is not your civ');
    this.acked.set(peer, id);
    const r = game.act(parsed.action);
    this.net.send(peer, { t: 'result', id, error: r.ok ? null : r.error });
  }

  private sendView(peer: string, events: GameEvent[]) {
    const player = this.peers.get(peer);
    if (!this.game || !player) return;
    const view = playerView(this.ctx, this.game.state, player);
    const delta = diffView(this.sent.get(peer) ?? null, view);
    this.sent.set(peer, view);
    this.net.send(peer, {
      t: 'view',
      delta,
      events: eventsFor(events, player),
      busy: this.game.busy,
      ack: this.acked.get(peer) ?? 0,
    });
  }

  private refuse(peer: string, reason: string) {
    this.net.send(peer, { t: 'refused', reason });
    this.net.kick(peer);
  }

  private left(peer: string) {
    this.peers.delete(peer);
    this.sent.delete(peer);
    this.acked.delete(peer);
    this.lobby = this.lobby.filter((l) => l.peer !== peer);
    this.changed();
  }

  private changed() {
    for (const [peer, player] of this.peers)
      this.net.send(peer, {
        t: 'seats',
        seats: this.seats(),
        started: this.started,
        you: player,
      });
    for (const fn of this.watchers) fn();
  }
}

/** Every human seat, in turn order. */
function humanSeats(state: GameState): PlayerId[] {
  return state.playerOrder.filter((p) => state.players[p]!.kind === 'human');
}
