/**
 * How the host and clients exchange messages. Supabase Realtime is the first implementation, with
 * WebRTC and an in-memory transport (for tests) behind the same interface.
 * See docs/01-architecture.md, "Multiplayer data flow".
 */
export interface Transport<Outgoing, Incoming> {
  send(to: string, message: Outgoing): void;
  onMessage(handler: (from: string, message: Incoming) => void): () => void;
  close(): void;
}
