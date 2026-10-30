import type { ClientTransport, HostTransport } from '@cx/host';
import { CODE_ALPHABET, type ClientMessage, type HostMessage } from '@cx/protocol';

/**
 * How browsers reach each other for online games (docs/01-architecture.md, "Multiplayer data
 * flow"). `peer`: WebRTC data channels, introduced by PeerJS's free public broker (no accounts,
 * nothing to pay; game messages then go browser to browser). `local`: tabs of this same browser
 * (BroadcastChannel), for trying online play alone and for the test scripts (`?net=local`).
 */
export type Network = 'peer' | 'local';

export type HostLine = HostTransport<HostMessage, ClientMessage>;
export type ClientLine = ClientTransport<ClientMessage, HostMessage>;

export const networkFromUrl = (): Network =>
  new URLSearchParams(location.search).get('net') === 'local' ? 'local' : 'peer';

/** A fresh join code (not game rules, so the browser's randomness is fine). */
export function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export function openHost(net: Network, code: string): Promise<HostLine> {
  return net === 'local' ? localHost(code) : peerHost(code);
}

export function joinHost(net: Network, code: string): Promise<ClientLine> {
  return net === 'local' ? localClient(code) : peerClient(code);
}

// --- WebRTC through PeerJS ---------------------------------------------------------------------

const peerId = (code: string) => `civius-maximus-${code}`;

/**
 * How browsers find a path to each other (docs/guides/online.md). PeerJS's defaults try a
 * direct line first (Google's STUN), then PeerJS's free shared relay (TURN) for networks that
 * block direct lines. A build can add its own relay, tried first: `VITE_TURN_URLS` (comma
 * separated), `VITE_TURN_USERNAME` and `VITE_TURN_CREDENTIAL`.
 */
export function iceServers(
  env: Record<string, string | undefined> = import.meta.env,
): RTCIceServer[] {
  const defaults: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'],
      username: 'peerjs',
      credential: 'peerjsp',
    },
  ];
  const urls = (env.VITE_TURN_URLS ?? '').split(/[\s,]+/).filter((u) => /^turns?:/.test(u));
  if (urls.length === 0) return defaults;
  return [
    {
      urls,
      ...(env.VITE_TURN_USERNAME ? { username: env.VITE_TURN_USERNAME } : {}),
      ...(env.VITE_TURN_CREDENTIAL ? { credential: env.VITE_TURN_CREDENTIAL } : {}),
    },
    ...defaults,
  ];
}

/**
 * PeerJS loads when it's first needed. If the site was updated since this page opened, the old
 * file is gone: say so instead of failing strangely.
 */
const loadPeer = () =>
  import('peerjs').catch(() => {
    throw new Error('A new version of the game is out. Reload the page, then try again.');
  });

const peerOptions = () => ({ debug: 0 as const, config: { iceServers: iceServers() } });

async function peerHost(code: string): Promise<HostLine> {
  const { Peer } = await loadPeer();
  const peer = new Peer(peerId(code), peerOptions());
  const lines = new Map<string, import('peerjs').DataConnection>();
  const messages = new Set<(from: string, m: ClientMessage) => void>();
  const peers = new Set<(peer: string, connected: boolean) => void>();
  peer.on('connection', (conn) => {
    conn.on('open', () => {
      lines.set(conn.peer, conn);
      peers.forEach((h) => h(conn.peer, true));
      watchLine(conn, gone);
    });
    conn.on('data', (data) => {
      const m = parse<ClientMessage>(data);
      if (m) messages.forEach((h) => h(conn.peer, m));
    });
    const gone = () => {
      if (lines.get(conn.peer) !== conn) return;
      lines.delete(conn.peer);
      peers.forEach((h) => h(conn.peer, false));
      conn.close();
    };
    conn.on('close', gone);
    conn.on('error', gone);
  });
  let opened = false;
  await new Promise<void>((resolve, reject) => {
    peer.on('open', () => {
      opened = true;
      resolve();
    });
    peer.on('error', (e) => {
      // Later errors (a friend's line failing, the broker blinking) don't end the game.
      if (opened) return;
      peer.destroy();
      reject(
        new Error(
          e.type === 'unavailable-id'
            ? 'That code is taken. Try again.'
            : `Couldn't reach the matchmaking service (${e.type}).`,
        ),
      );
    });
  });
  // The matchmaking line can drop while friends' own lines stay up: reopen it so friends who
  // drop can still get back in.
  peer.on('disconnected', () => {
    if (!peer.destroyed) setTimeout(() => !peer.destroyed && peer.reconnect(), 1000);
  });
  return {
    send: (to, m) => lines.get(to)?.send(JSON.stringify(m)),
    onMessage: (h) => (messages.add(h), () => messages.delete(h)),
    onPeer: (h) => (peers.add(h), () => peers.delete(h)),
    // Give a refusal a moment to arrive before hanging up.
    kick: (to) => setTimeout(() => lines.get(to)?.close(), 500),
    close: () => peer.destroy(),
  };
}

async function peerClient(code: string): Promise<ClientLine> {
  const { Peer } = await loadPeer();
  const peer = new Peer(peerOptions());
  const messages = new Set<(m: HostMessage) => void>();
  const closes = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const conn = await new Promise<import('peerjs').DataConnection>((resolve, reject) => {
    peer.on('error', (e) =>
      reject(
        new Error(
          e.type === 'peer-unavailable'
            ? 'No game with that code is open right now.'
            : `Couldn't connect (${e.type}).`,
        ),
      ),
    );
    peer.on('open', () => {
      const c = peer.connect(peerId(code), { reliable: true });
      c.on('open', () => resolve(c));
    });
    timer = setTimeout(() => reject(new Error('The host didn’t answer. Check the code.')), 20000);
  }).catch((e: Error) => {
    // A failed try leaves nothing open behind it.
    peer.destroy();
    throw e;
  });
  clearTimeout(timer);
  conn.on('data', (data) => {
    const m = parse<HostMessage>(data);
    if (m) messages.forEach((h) => h(m));
  });
  let closed = false;
  const gone = () => {
    if (closed) return;
    closed = true;
    closes.forEach((h) => h());
    peer.destroy();
  };
  conn.on('close', gone);
  conn.on('error', gone);
  watchLine(conn, gone);
  return {
    send: (m) => conn.send(JSON.stringify(m)),
    onMessage: (h) => (messages.add(h), () => messages.delete(h)),
    onClose: (h) => (closes.add(h), () => closes.delete(h)),
    close: () => peer.destroy(),
  };
}

/**
 * A line whose other end vanished (a closed laptop, a lost network) may never say "close"; the
 * browser's own connection state does, within seconds.
 */
function watchLine(conn: import('peerjs').DataConnection, gone: () => void) {
  const pc = conn.peerConnection as RTCPeerConnection | undefined;
  pc?.addEventListener('connectionstatechange', () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') gone();
  });
}

function parse<T>(data: unknown): T | undefined {
  try {
    return (typeof data === 'string' ? JSON.parse(data) : data) as T;
  } catch {
    return undefined;
  }
}

// --- Tabs of one browser (BroadcastChannel) ----------------------------------------------------

type Envelope =
  | { kind: 'join' | 'bye'; from: string }
  | { kind: 'welcome' | 'kick'; to: string }
  | { kind: 'to-host'; from: string; body: ClientMessage }
  | { kind: 'to-client'; to: string; body: HostMessage }
  | { kind: 'host-gone' };

async function localHost(code: string): Promise<HostLine> {
  const channel = new BroadcastChannel(`cx-online-${code}`);
  const clients = new Set<string>();
  const messages = new Set<(from: string, m: ClientMessage) => void>();
  const peers = new Set<(peer: string, connected: boolean) => void>();
  const post = (e: Envelope) => channel.postMessage(e);
  channel.onmessage = ({ data }: MessageEvent<Envelope>) => {
    if (data.kind === 'join') {
      clients.add(data.from);
      post({ kind: 'welcome', to: data.from });
      peers.forEach((h) => h(data.from, true));
    } else if (data.kind === 'bye' && clients.delete(data.from)) {
      peers.forEach((h) => h(data.from, false));
    } else if (data.kind === 'to-host' && clients.has(data.from)) {
      messages.forEach((h) => h(data.from, data.body));
    }
  };
  let open = true;
  const gone = () => open && post({ kind: 'host-gone' });
  addEventListener('pagehide', gone);
  return {
    send: (to, body) => open && clients.has(to) && post({ kind: 'to-client', to, body }),
    onMessage: (h) => (messages.add(h), () => messages.delete(h)),
    onPeer: (h) => (peers.add(h), () => peers.delete(h)),
    kick: (to) => {
      if (!open) return;
      post({ kind: 'kick', to });
      if (clients.delete(to)) peers.forEach((h) => h(to, false));
    },
    close: () => {
      gone();
      open = false;
      removeEventListener('pagehide', gone);
      channel.close();
    },
  };
}

async function localClient(code: string): Promise<ClientLine> {
  const channel = new BroadcastChannel(`cx-online-${code}`);
  const me = `tab-${newCode()}`;
  const messages = new Set<(m: HostMessage) => void>();
  const closes = new Set<() => void>();
  const post = (e: Envelope) => channel.postMessage(e);
  let open = false;
  const close = () => {
    if (!open) return;
    open = false;
    post({ kind: 'bye', from: me });
    removeEventListener('pagehide', close);
    channel.close();
    closes.forEach((h) => h());
  };
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('No game with that code is open here.')), 3000);
    channel.onmessage = ({ data }: MessageEvent<Envelope>) => {
      if (data.kind === 'welcome' && data.to === me) {
        clearTimeout(timer);
        open = true;
        resolve();
      } else if (data.kind === 'to-client' && data.to === me) {
        messages.forEach((h) => h(data.body));
      } else if ((data.kind === 'kick' && data.to === me) || data.kind === 'host-gone') {
        close();
      }
    };
    post({ kind: 'join', from: me });
  });
  addEventListener('pagehide', close);
  return {
    send: (body) => open && post({ kind: 'to-host', from: me, body }),
    onMessage: (h) => (messages.add(h), () => messages.delete(h)),
    onClose: (h) => (closes.add(h), () => closes.delete(h)),
    close,
  };
}
