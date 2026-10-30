import {
  type Action,
  type ActionResult,
  type ActionType,
  applyAction,
  type EngineContext,
  type GameEvent,
  type GameState,
  type PlayerId,
} from '@cx/engine';
import {
  applyDelta,
  type ChatLine,
  type ClientMessage,
  type HostMessage,
  type Ping,
  PROTOCOL_VERSION,
  type SeatInfo,
} from '@cx/protocol';
import type { GameHandle, OnlineSession } from './handle';
import { deepFreeze, type GameListener } from './local';
import { memorySeatKeys, type SeatKeys, seatProof } from './seatKeys';
import type { ClientTransport } from './transport';

type Line = ClientTransport<ClientMessage, HostMessage>;

export interface RemoteOptions {
  /** The seat keys this device holds, to get its seat back when rejoining (seatKeys.ts). */
  keys?: SeatKeys;
  /** Opens a new line to the same host, to get back in on its own after a drop. */
  reconnect?: () => Promise<Line>;
  /** How long to wait before each try to reconnect, in ms. */
  retryDelays?: number[];
}

/** About three minutes of tries, then the game says the host is gone. */
const RETRY_DELAYS = [1000, 2000, 4000, 8000, 15000, 30000, 30000, 30000, 30000, 30000];

/**
 * Actions not played ahead on the client: they roll dice (combat), process the turn, or wait on
 * an answer from someone else. Everything else shows at once and the host's view confirms it.
 */
const NOT_PREDICTED = new Set<ActionType>([
  'end_turn',
  'unend_turn',
  'attack',
  'strike',
  'declare_war',
  'offer_peace',
  'accept_peace',
  'propose_deal',
  'answer_deal',
  'withdraw_deal',
]);

/**
 * An online game played from this tab while someone else hosts it. It only ever holds this
 * player's view. Actions are sent to the host and, where safe, played ahead on that view so the
 * screen answers at once; the host's next view replaces the guess. If the line drops during the
 * game, it reconnects by itself and the host gives the seat back (its key proves it's ours).
 */
export class RemoteGame implements GameHandle {
  readonly saves = false;
  readonly online: OnlineSession;
  /** What the screen shows: the host's last view plus actions it hasn't answered yet. */
  state: GameState;
  busy = false;
  you: PlayerId | null = null;
  started = false;
  /** Why the host turned us away, or the connection closed. */
  ended: string | null = null;
  /** The line dropped and it's trying to get back in. */
  reconnecting = false;
  /** The host refused an action (shown as a notice). */
  onRefused?: (message: string) => void;
  private confirmed: GameState | null = null;
  private seatList: SeatInfo[] = [];
  private pending: { id: number; action: Action; events: GameEvent[] }[] = [];
  private nextId = 1;
  private listeners = new Set<GameListener>();
  private watchers = new Set<() => void>();
  private chatLog: ChatLine[] = [];
  private chatFns = new Set<(line: ChatLine) => void>();
  private pingFns = new Set<(ping: Ping) => void>();
  private deadlineAt: number | null = null;
  private net!: Line;
  private readonly keys: SeatKeys;
  private leaving = false;

  constructor(
    net: Line,
    readonly ctx: EngineContext,
    private readonly code: string,
    private readonly name: string,
    private readonly options: RemoteOptions = {},
  ) {
    this.state = undefined as unknown as GameState;
    this.keys = options.keys ?? memorySeatKeys();
    this.attach(net);
    this.online = {
      code,
      seats: () => this.seatList,
      onChange: (fn) => {
        this.watchers.add(fn);
        return () => this.watchers.delete(fn);
      },
      chat: () => this.chatLog,
      say: (text) => this.net.send({ t: 'chat', text }),
      ping: (tile) => {
        this.net.send({ t: 'ping', tile });
      },
      onChat: (fn) => {
        this.chatFns.add(fn);
        return () => this.chatFns.delete(fn);
      },
      onPing: (fn) => {
        this.pingFns.add(fn);
        return () => this.pingFns.delete(fn);
      },
      deadline: () => this.deadlineAt,
      pick: (leader) => this.net.send({ t: 'pick', leader }),
      leave: () => {
        this.leaving = true;
        this.net.close();
      },
      reconnecting: () => this.reconnecting,
    };
  }

  /** Talks to the host over `net`: says hello (with this device's seat proofs) and listens. */
  private attach(net: Line) {
    this.net = net;
    const off = [
      net.onMessage((m) => this.receive(m)),
      net.onClose(() => {
        for (const f of off) f();
        this.dropped();
      }),
    ];
    net.send({
      t: 'hello',
      protocol: PROTOCOL_VERSION,
      contentHash: this.ctx.content.hash,
      name: this.name,
      proofs: this.keys.all().map((key) => seatProof(key, this.code)),
    });
  }

  private dropped() {
    if (this.ended || this.leaving || !this.started || !this.options.reconnect) {
      this.ended ??= 'The connection to the host was lost.';
      this.changed();
      return;
    }
    void this.retry();
  }

  private async retry() {
    this.reconnecting = true;
    this.changed();
    for (const wait of this.options.retryDelays ?? RETRY_DELAYS) {
      await new Promise((r) => setTimeout(r, wait));
      if (this.leaving) break;
      try {
        const line = await this.options.reconnect!();
        if (this.leaving) {
          line.close();
          break;
        }
        // The host sends the whole view again, and it's the truth: actions it never answered
        // are dropped rather than sent twice.
        this.pending = [];
        this.busy = false;
        this.reconnecting = false;
        this.attach(line);
        this.changed();
        return;
      } catch {
        // The host isn't back yet: wait and try again.
      }
    }
    this.reconnecting = false;
    this.ended ??= 'The connection to the host was lost.';
    this.changed();
  }

  /** The first view arrived: the game screen can open. */
  get ready() {
    return this.confirmed !== null && this.you !== null;
  }

  act(action: Action): ActionResult {
    if (!this.confirmed)
      return { ok: false, error: { code: 'not_ready', message: 'Not connected yet' } };
    if (this.ended) return { ok: false, error: { code: 'disconnected', message: this.ended } };
    if (this.reconnecting)
      return { ok: false, error: { code: 'disconnected', message: 'Reconnecting to the host…' } };
    if (this.busy)
      return { ok: false, error: { code: 'busy', message: 'Your rivals are still moving' } };
    const id = this.nextId++;
    const guess = NOT_PREDICTED.has(action.type) ? null : applyAction(this.state, action, this.ctx);
    const events = guess?.ok ? guess.events : [];
    this.pending.push({ id, action, events: [...events] });
    this.net.send({ t: 'act', id, action });
    if (guess?.ok) {
      this.state = guess.state;
      this.tell(events);
      return guess;
    }
    // The host decides (an unexplored tile may be passable, say); a refusal comes back.
    return { ok: true, state: this.state, events: [] };
  }

  subscribe(listener: GameListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  humans(): PlayerId[] {
    return this.you ? [this.you] : [];
  }

  nextHuman(): PlayerId | undefined {
    return this.you && !this.state.players[this.you]?.turnEnded ? this.you : undefined;
  }

  load(state: GameState) {
    this.state = state;
    this.tell([]);
  }

  private receive(m: HostMessage) {
    switch (m.t) {
      case 'seats':
        this.seatList = m.seats;
        this.started = m.started;
        this.you = m.you;
        this.changed();
        break;
      case 'view': {
        this.confirmed = deepFreeze(applyDelta(this.confirmed, m.delta));
        this.busy = m.busy;
        // Events this tab already showed when it played its actions ahead aren't shown twice.
        const fresh = m.events.filter((e) => !this.alreadyShown(e));
        this.pending = this.pending.filter((p) => p.id > m.ack);
        this.replay();
        this.tell(fresh);
        if (m.delta.full) this.changed();
        break;
      }
      case 'result': {
        this.pending = this.pending.filter((p) => p.id !== m.id);
        if (m.error) this.onRefused?.(m.error.message);
        this.replay();
        this.tell([]);
        break;
      }
      case 'refused':
        this.ended = m.reason;
        this.changed();
        break;
      case 'chat':
        this.chatLog = [...this.chatLog, m.line].slice(-200);
        for (const fn of this.chatFns) fn(m.line);
        this.changed();
        break;
      case 'ping':
        for (const fn of this.pingFns) fn(m.ping);
        break;
      case 'timer':
        this.deadlineAt = m.seconds === null ? null : Date.now() + m.seconds * 1000;
        this.changed();
        break;
      case 'key':
        if (typeof m.gameId === 'string' && typeof m.key === 'string')
          this.keys.save(m.gameId, m.key);
        break;
    }
  }

  /** The host's view with the actions still on their way played on top. */
  private replay() {
    let s = this.confirmed!;
    for (const p of this.pending) {
      if (NOT_PREDICTED.has(p.action.type)) continue;
      const r = applyAction(s, p.action, this.ctx);
      if (r.ok) s = r.state;
    }
    this.state = s;
  }

  private alreadyShown(e: GameEvent): boolean {
    const text = JSON.stringify(e);
    for (const p of this.pending) {
      const i = p.events.findIndex((x) => JSON.stringify(x) === text);
      if (i >= 0) {
        p.events.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  private tell(events: GameEvent[]) {
    if (!this.confirmed) return;
    for (const fn of this.listeners) fn(this.state, events);
  }

  private changed() {
    for (const fn of this.watchers) fn();
  }
}
