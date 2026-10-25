/**
 * How an online host and its clients exchange messages (docs/01-architecture.md, "Multiplayer
 * data flow"). Implementations: WebRTC through a free broker and a same-browser channel (both in
 * the client package), and the in-memory one below for tests. Messages are plain JSON.
 */

/** The host's side: one line to each connected client. */
export interface HostTransport<Out, In> {
  send(to: string, message: Out): void;
  onMessage(handler: (from: string, message: In) => void): () => void;
  /** A client connected (true) or dropped (false). */
  onPeer(handler: (peer: string, connected: boolean) => void): () => void;
  /** Drops one client. */
  kick(peer: string): void;
  close(): void;
}

/** A client's side: one line to the host. */
export interface ClientTransport<Out, In> {
  send(message: Out): void;
  onMessage(handler: (message: In) => void): () => void;
  /** The line to the host is gone. */
  onClose(handler: () => void): () => void;
  close(): void;
}

/**
 * A host and any number of clients in one process, for tests. Delivery is asynchronous (like a
 * network) and every message is copied, so nothing is shared by accident; `flush()` waits until
 * everything sent so far has arrived.
 */
export function memoryNetwork<HostOut, ClientOut>() {
  const hostMessage = new Set<(from: string, m: ClientOut) => void>();
  const hostPeer = new Set<(peer: string, connected: boolean) => void>();
  const clients = new Map<
    string,
    { message: Set<(m: HostOut) => void>; close: Set<() => void>; open: boolean }
  >();
  let pending = 0;
  let next = 0;
  const later = (fn: () => void) => {
    pending++;
    setTimeout(() => {
      pending--;
      fn();
    }, 0);
  };
  // Closing waits for what was already sent (a refusal arrives before the line drops).
  const drop = (peer: string) => {
    const c = clients.get(peer);
    if (!c?.open) return;
    later(() => {
      if (!c.open) return;
      c.open = false;
      for (const h of c.close) h();
      for (const h of hostPeer) h(peer, false);
    });
  };

  const host: HostTransport<HostOut, ClientOut> = {
    send(to, message) {
      const c = clients.get(to);
      if (!c?.open) return;
      const copy = structuredClone(message);
      later(() => c.open && c.message.forEach((h) => h(copy)));
    },
    onMessage(handler) {
      hostMessage.add(handler);
      return () => hostMessage.delete(handler);
    },
    onPeer(handler) {
      hostPeer.add(handler);
      return () => hostPeer.delete(handler);
    },
    kick: drop,
    close() {
      for (const peer of clients.keys()) drop(peer);
    },
  };

  /** A new client connecting; `peer` is the id the host knows it by. */
  const connect = (): ClientTransport<ClientOut, HostOut> & { peer: string } => {
    const peer = `c${++next}`;
    const c = {
      message: new Set<(m: HostOut) => void>(),
      close: new Set<() => void>(),
      open: true,
    };
    clients.set(peer, c);
    later(() => hostPeer.forEach((h) => h(peer, true)));
    return {
      peer,
      send(message) {
        if (!c.open) return;
        const copy = structuredClone(message);
        later(() => c.open && hostMessage.forEach((h) => h(peer, copy)));
      },
      onMessage(handler) {
        c.message.add(handler);
        return () => c.message.delete(handler);
      },
      onClose(handler) {
        c.close.add(handler);
        return () => c.close.delete(handler);
      },
      close: () => drop(peer),
    };
  };

  /** Waits until every message sent so far (and those they caused) has been delivered. */
  const flush = async () => {
    while (pending > 0) await new Promise((r) => setTimeout(r, 0));
  };

  return { host, connect, flush };
}
