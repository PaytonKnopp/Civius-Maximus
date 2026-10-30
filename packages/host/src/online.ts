import {
  type EngineContext,
  eventsFor,
  type GameEvent,
  type GameSetup,
  type GameState,
  parseAction,
  playAiTurn,
  type PlayerId,
  playerView,
} from '@cx/engine';
import {
  type ChatLine,
  type ClientMessage,
  diffView,
  type HostMessage,
  type Ping,
  PROTOCOL_VERSION,
  type SeatInfo,
} from '@cx/protocol';
import type { GameHandle, OnlineSession } from './handle';
import { type AiRunner, LocalGame } from './local';
import { newSeatKey, seatProof } from './seatKeys';
import type { HostTransport } from './transport';

/**
 * An online game hosted in this tab (docs/01-architecture.md, "Multiplayer data flow"): the
 * real game runs here, friends join by code, and each of them is only ever sent their own view
 * of it (`playerView`) and the events they may see. Before the game starts, the lobby collects
 * who's playing; after, each friend's seat is theirs: it has a secret key (seatKeys.ts) and only
 * that key gets it back after a drop, until the host frees the seat for someone else.
 */
export class OnlineHost {
  game: LocalGame | null = null;
  /** The player the host plays, once the game started. */
  hostPlayer: PlayerId | null = null;
  /** Friends in the lobby before the start (the host isn't listed), with their leader picks. */
  private lobby: { name: string; peer: string; leader: string | null }[] = [];
  /** The host's own leader pick in the lobby. */
  private hostLeader: string | null = null;
  /** Seconds each turn lasts before everyone still playing is ended (null: no timer). */
  turnSeconds: number | null = null;
  /** An AI plays the seat of a friend who dropped, until they rejoin (otherwise the host waits). */
  aiTakeover = false;
  private chatLog: ChatLine[] = [];
  private chatFns = new Set<(line: ChatLine) => void>();
  private pingFns = new Set<(ping: Ping) => void>();
  private timerTurn = -1;
  private deadlineAt: number | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private playingAbsent = false;
  /** Connected clients that said hello, and the seat each plays once the game started. */
  private peers = new Map<string, PlayerId | null>();
  /** The last view each client was sent (the next one goes as the changes from it). */
  private sent = new Map<string, GameState>();
  /** The last action each client sent that the game has handled. */
  private acked = new Map<string, number>();
  /** Each friend's seat key, once they've had one. Seats without a key are free to take. */
  private keys = new Map<PlayerId, string>();
  /** The seat keys changed: keep them with the game, to host it again later. */
  onKeys?: (gameId: string, keys: Record<PlayerId, string>) => void;
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
        { name: this.hostName, player: null, host: true, online: true, leader: this.hostLeader },
        ...this.lobby.map((l) => ({
          name: l.name,
          player: null,
          host: false,
          online: true,
          leader: l.leader,
        })),
      ];
    const taken = new Set(this.peers.values());
    return humanSeats(game.state).map((p) => ({
      name: game.state.players[p]!.name,
      player: p,
      host: p === this.hostPlayer,
      online: p === this.hostPlayer || taken.has(p),
      reserved: this.keys.has(p),
    }));
  }

  onChange(fn: () => void): () => void {
    this.watchers.add(fn);
    return () => this.watchers.delete(fn);
  }

  /**
   * Starts a new game with the lobby: `makeSetup` gets the humans' names and leader picks (null:
   * random), the host first.
   */
  start(
    makeSetup: (names: string[], leaders: (string | null)[]) => GameSetup,
    runner?: AiRunner,
  ): LocalGame {
    const setup = makeSetup(
      [this.hostName, ...this.lobby.map((l) => l.name)],
      [this.hostLeader, ...this.lobby.map((l) => l.leader)],
    );
    const humans = setup.players.filter((p) => p.kind === 'human').map((p) => p.id);
    this.begin(new LocalGame(setup, this.ctx, runner), humans[0]!);
    this.lobby.forEach((l, i) => {
      if (humans[i + 1]) this.peers.set(l.peer, humans[i + 1]!);
    });
    this.lobby = [];
    for (const [peer, player] of this.peers) if (player) this.giveKey(peer, player);
    this.changed();
    for (const peer of this.peers.keys()) this.sendView(peer, []);
    return this.game!;
  }

  /**
   * Hosts a saved game: the host takes the seat with their name (or the first); friends rejoin.
   * `keys` are the seat keys from when it was hosted before (seats without one are free).
   */
  resume(state: GameState, runner?: AiRunner, keys: Record<PlayerId, string> = {}): LocalGame {
    const humans = humanSeats(state);
    const mine = humans.find((p) => state.players[p]!.name === this.hostName) ?? humans[0]!;
    for (const p of humans)
      if (p !== mine && typeof keys[p] === 'string') this.keys.set(p, keys[p]!);
    this.begin(new LocalGame(state, this.ctx, runner), mine);
    this.changed();
    return this.game!;
  }

  /**
   * The host frees an away friend's seat: their key no longer counts, and the next person to
   * join takes it (the same friend on a new device, or someone else).
   */
  freeSeat(player: PlayerId) {
    if (!this.game || player === this.hostPlayer || !this.keys.has(player)) return;
    if ([...this.peers.values()].includes(player)) return;
    this.keys.delete(player);
    this.keysChanged();
    this.changed();
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
      freeSeat: (player) => this.freeSeat(player),
      chat: () => this.chatLog,
      say: (text) => this.say(this.hostName, me, text),
      ping: (tile) => this.broadcastPing({ from: this.hostName, player: me, tile }),
      onChat: (fn) => {
        this.chatFns.add(fn);
        return () => this.chatFns.delete(fn);
      },
      onPing: (fn) => {
        this.pingFns.add(fn);
        return () => this.pingFns.delete(fn);
      },
      deadline: () => this.deadlineAt,
      pick: (leader) => this.pickForHost(leader),
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
    if (this.timer) clearTimeout(this.timer);
    this.net.close();
  }

  /** The lobby: the host picks a leader (null: random). */
  pickForHost(leader: string | null) {
    this.hostLeader = leader;
    this.changed();
  }

  /**
   * The lobby: the host sends away the friend at `index` in the lobby (the host is seat 0, so
   * friends start at 1), e.g. a stranger who found a public game. (Someone who keeps coming back
   * gets a fresh lobby: the host opens a new one, with a new code.)
   */
  removeFromLobby(index: number) {
    const l = this.game ? undefined : this.lobby[index - 1];
    if (!l) return;
    this.lobby = this.lobby.filter((x) => x !== l);
    this.peers.delete(l.peer);
    this.refuse(l.peer, 'The host removed you from the lobby.');
    this.changed();
  }

  /** Lobby chat for the host's own screen, before there's a game handle. */
  lobbyChat(): ChatLine[] {
    return this.chatLog;
  }

  sayInLobby(text: string) {
    this.say(this.hostName, null, text);
  }

  private say(from: string, player: PlayerId | null, input: string) {
    const text = input.trim().slice(0, 300);
    if (!text) return;
    const line: ChatLine = { from, player, text, turn: this.game?.state.turn ?? 0 };
    this.chatLog = [...this.chatLog, line].slice(-200);
    for (const peer of this.peers.keys()) this.net.send(peer, { t: 'chat', line });
    for (const fn of this.chatFns) fn(line);
    this.changed();
  }

  private broadcastPing(ping: Ping) {
    const size = this.game?.state.map.tiles.length ?? 0;
    if (!Number.isInteger(ping.tile) || ping.tile < 0 || ping.tile >= size) return;
    for (const peer of this.peers.keys()) this.net.send(peer, { t: 'ping', ping });
    for (const fn of this.pingFns) fn(ping);
  }

  /** The name a connected client goes by: their seat's, or the one they gave in the lobby. */
  private nameOf(peer: string): { name: string; player: PlayerId | null } {
    const player = this.peers.get(peer) ?? null;
    if (player && this.game) return { name: this.game.state.players[player]!.name, player };
    return { name: this.lobby.find((l) => l.peer === peer)?.name ?? 'Friend', player: null };
  }

  /** After every change: start this turn's timer, and let the AI play dropped seats. */
  private tick() {
    const game = this.game;
    if (!game) return;
    const state = game.state;
    if (this.turnSeconds && state.status === 'playing' && state.turn !== this.timerTurn) {
      this.timerTurn = state.turn;
      this.deadlineAt = Date.now() + this.turnSeconds * 1000;
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => this.expire(), this.turnSeconds * 1000);
      for (const peer of this.peers.keys())
        this.net.send(peer, { t: 'timer', seconds: this.turnSeconds });
      this.changed();
    }
    if (this.aiTakeover) setTimeout(() => this.playAbsent(), 0);
  }

  /** Time's up: everyone still playing this turn ends it. */
  private expire() {
    const game = this.game;
    if (!game || game.state.status !== 'playing') return;
    if (game.busy) {
      this.timer = setTimeout(() => this.expire(), 500);
      return;
    }
    this.deadlineAt = null;
    for (const p of humanSeats(game.state)) {
      const pl = game.state.players[p]!;
      if (pl.alive && !pl.turnEnded) game.act({ type: 'end_turn', player: p });
    }
  }

  /** Seats whose player dropped are played by the AI until they rejoin (`aiTakeover`). */
  private playAbsent() {
    const game = this.game;
    if (!game || this.playingAbsent || game.busy || game.state.status !== 'playing') return;
    const here = new Set(this.peers.values());
    const absent = humanSeats(game.state).filter((p) => {
      const pl = game.state.players[p]!;
      return p !== this.hostPlayer && !here.has(p) && pl.alive && !pl.turnEnded;
    });
    if (absent.length === 0) return;
    this.playingAbsent = true;
    try {
      for (const p of absent) {
        if (game.busy) break;
        playAiTurn(this.ctx, game.state, p, (a) => {
          const r = game.act(a);
          return r.ok ? game.state : undefined;
        });
      }
    } finally {
      this.playingAbsent = false;
    }
  }

  private begin(game: LocalGame, hostPlayer: PlayerId) {
    this.game = game;
    this.hostPlayer = hostPlayer;
    this.stop.push(
      game.subscribe((_, events) => {
        for (const [peer, player] of this.peers) if (player) this.sendView(peer, events);
        this.tick();
      }),
    );
    this.tick();
  }

  private receive(peer: string, m: ClientMessage) {
    if (m.t === 'hello') this.join(peer, m);
    else if (m.t === 'act') this.clientAct(peer, m.id, m.action);
    else if (!this.peers.has(peer)) return;
    else if (m.t === 'chat') {
      const who = this.nameOf(peer);
      this.say(who.name, who.player, String(m.text));
    } else if (m.t === 'ping') {
      const who = this.nameOf(peer);
      if (who.player) this.broadcastPing({ from: who.name, player: who.player, tile: m.tile });
    } else if (m.t === 'pick') {
      const l = this.lobby.find((x) => x.peer === peer);
      const leader = typeof m.leader === 'string' ? m.leader : null;
      if (l && !this.game) {
        l.leader = leader && this.ctx.content.entities.leader[leader] ? leader : null;
        this.changed();
      }
    }
  }

  private join(peer: string, m: Extract<ClientMessage, { t: 'hello' }>) {
    // An update came out between the two of you opening the game (or the mods differ).
    const update =
      'both of you reload the page, then the host picks "Host your online game again" on the home screen (everyone keeps their seat).';
    if (m.protocol !== PROTOCOL_VERSION)
      return this.refuse(peer, `The host is on a different version of the game: ${update}`);
    if (m.contentHash !== this.ctx.content.hash)
      return this.refuse(
        peer,
        `The host plays with different game content (a newer or older version, or other mods): ${update}`,
      );
    const name = m.name.trim().slice(0, 24) || 'Friend';
    const game = this.game;
    if (!game) {
      if (this.lobby.length >= this.openSeats) return this.refuse(peer, 'The game is full.');
      this.lobby.push({ name, peer, leader: null });
      this.peers.set(peer, null);
    } else {
      const seat = this.seatFor(peer, name, m.proofs);
      if (!seat)
        return this.refuse(
          peer,
          'Every seat in this game is taken. Rejoining from another device or browser? Ask the host to free your seat.',
        );
      this.peers.set(peer, seat);
      this.giveKey(peer, seat);
      this.sendView(peer, []);
      if (this.deadlineAt !== null)
        this.net.send(peer, {
          t: 'timer',
          seconds: Math.max(0, Math.round((this.deadlineAt - Date.now()) / 1000)),
        });
    }
    // Catch up on the chat.
    for (const line of this.chatLog.slice(-30)) this.net.send(peer, { t: 'chat', line });
    this.changed();
  }

  /**
   * The seat a client joining a started game gets: the one whose key it proves it holds (the
   * same player coming back, even on a new connection before the old one has timed out), else
   * a free one (no key yet, or freed by the host), the one with their name first.
   */
  private seatFor(peer: string, name: string, proofs: unknown): PlayerId | undefined {
    const state = this.game!.state;
    const friends = humanSeats(state).filter((p) => p !== this.hostPlayer);
    const held = new Set(
      Array.isArray(proofs) ? proofs.filter((x) => typeof x === 'string').slice(0, 64) : [],
    );
    const mine = friends.find((p) => {
      const key = this.keys.get(p);
      return key !== undefined && held.has(seatProof(key, this.code));
    });
    if (mine) {
      for (const [other, p] of this.peers)
        if (p === mine && other !== peer) {
          this.peers.delete(other);
          this.sent.delete(other);
          this.refuse(other, 'You joined this game again from another window.');
        }
      return mine;
    }
    const taken = new Set(this.peers.values());
    const free = friends.filter((p) => !this.keys.has(p) && !taken.has(p));
    return (
      free.find((p) => state.players[p]!.name === name) ?? free.find((p) => state.players[p]!.alive)
    );
  }

  /** Sends a client its seat's key (a new one if the seat has none). */
  private giveKey(peer: string, player: PlayerId) {
    let key = this.keys.get(player);
    if (!key) {
      key = newSeatKey();
      this.keys.set(player, key);
      this.keysChanged();
    }
    this.net.send(peer, { t: 'key', gameId: this.game!.state.gameId, key });
  }

  private keysChanged() {
    if (this.game) this.onKeys?.(this.game.state.gameId, Object.fromEntries(this.keys));
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
    if (this.aiTakeover) setTimeout(() => this.playAbsent(), 0);
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
