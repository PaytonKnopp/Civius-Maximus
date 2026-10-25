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
  type ClientMessage,
  type HostMessage,
  PROTOCOL_VERSION,
  type SeatInfo,
} from '@cx/protocol';
import type { GameHandle, OnlineSession } from './handle';
import { deepFreeze, type GameListener } from './local';
import type { ClientTransport } from './transport';

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
 * screen answers at once; the host's next view replaces the guess.
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
  /** The host refused an action (shown as a notice). */
  onRefused?: (message: string) => void;
  private confirmed: GameState | null = null;
  private seatList: SeatInfo[] = [];
  private pending: { id: number; action: Action; events: GameEvent[] }[] = [];
  private nextId = 1;
  private listeners = new Set<GameListener>();
  private watchers = new Set<() => void>();

  constructor(
    private readonly net: ClientTransport<ClientMessage, HostMessage>,
    readonly ctx: EngineContext,
    code: string,
    name: string,
  ) {
    this.state = undefined as unknown as GameState;
    net.onMessage((m) => this.receive(m));
    net.onClose(() => {
      this.ended ??= 'The connection to the host was lost.';
      this.changed();
    });
    net.send({ t: 'hello', protocol: PROTOCOL_VERSION, contentHash: ctx.content.hash, name });
    this.online = {
      code,
      seats: () => this.seatList,
      onChange: (fn) => {
        this.watchers.add(fn);
        return () => this.watchers.delete(fn);
      },
      leave: () => net.close(),
    };
  }

  /** The first view arrived: the game screen can open. */
  get ready() {
    return this.confirmed !== null && this.you !== null;
  }

  act(action: Action): ActionResult {
    if (!this.confirmed)
      return { ok: false, error: { code: 'not_ready', message: 'Not connected yet' } };
    if (this.ended) return { ok: false, error: { code: 'disconnected', message: this.ended } };
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
