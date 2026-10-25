import type { Action, GameEvent, GameState, MapTile, PlayerId, RuleError } from '@cx/engine';

/** Version of the client <-> host message protocol. Clients and hosts must match. */
export const PROTOCOL_VERSION = 2;

/** Someone in an online game's lobby, or (once it started) a human seat. */
export interface SeatInfo {
  name: string;
  /** The player they play, once the game started. */
  player: PlayerId | null;
  host: boolean;
  /** Connected right now (the host always is). */
  online: boolean;
}

/** Client → host. */
export type ClientMessage =
  | { t: 'hello'; protocol: number; contentHash: string; name: string }
  /** `id`s count up; each comes back in a `result` (and as a view's `ack` if it was applied). */
  | { t: 'act'; id: number; action: Action };

/** Host → client. */
export type HostMessage =
  /** The lobby or the seats changed. `you` is this client's player once the game started. */
  | { t: 'seats'; seats: SeatInfo[]; started: boolean; you: PlayerId | null }
  /** The client's view of the game changed (the first one is whole, then only changes). */
  /** `ack`: the last of this client's actions the view includes (0 for none yet). */
  | { t: 'view'; delta: ViewDelta; events: GameEvent[]; busy: boolean; ack: number }
  | { t: 'result'; id: number; error: RuleError | null }
  /** Turned away (wrong version, the game is full...): the connection closes. */
  | { t: 'refused'; reason: string };

/**
 * A view of the game as the changes from the previous one sent (or the whole of it). Map tiles
 * go by index and the history by what was added, because they're most of the bytes.
 */
export interface ViewDelta {
  full: boolean;
  /** Top-level fields that changed (all of them when `full`), except `map` and `history`. */
  fields: Partial<GameState>;
  /** The map without its tiles, when it changed. */
  map?: Omit<GameState['map'], 'tiles'>;
  /** Tiles that changed, as [index, tile]; all of them when `full`. */
  tiles: [number, MapTile][];
  /** History entries added after the first `historyFrom`. */
  historyFrom: number;
  history: GameState['history'];
}

/** The changes from `prev` to `next` (both views made for the same player). */
export function diffView(prev: GameState | null, next: GameState): ViewDelta {
  const { map, history, ...rest } = next;
  const { tiles, ...mapRest } = map;
  if (!prev)
    return {
      full: true,
      fields: rest,
      map: mapRest,
      tiles: tiles.map((t, i) => [i, t]),
      historyFrom: 0,
      history,
    };
  const fields: Partial<GameState> = {};
  for (const key of Object.keys(rest) as (keyof typeof rest)[]) {
    if (!same(prev[key], next[key])) (fields as Record<string, unknown>)[key] = next[key];
  }
  const changed: [number, MapTile][] = [];
  const before = prev.map.tiles;
  tiles.forEach((t, i) => {
    if (t !== before[i] && !same(t, before[i])) changed.push([i, t]);
  });
  const prevMapRest: Partial<GameState['map']> = { ...prev.map };
  delete prevMapRest.tiles;
  // History only grows (a shorter one means a different game: send it all).
  const from = history.length >= prev.history.length ? prev.history.length : 0;
  return {
    full: false,
    fields,
    ...(same(prevMapRest, mapRest) ? {} : { map: mapRest }),
    tiles: changed,
    historyFrom: from,
    history: history.slice(from),
  };
}

/** The view after a delta (the previous one isn't changed). */
export function applyDelta(prev: GameState | null, delta: ViewDelta): GameState {
  if (delta.full || !prev) {
    const tiles: MapTile[] = [];
    for (const [i, t] of delta.tiles) tiles[i] = t;
    return {
      ...(delta.fields as GameState),
      map: { ...delta.map!, tiles },
      history: delta.history,
    };
  }
  let tiles = prev.map.tiles;
  if (delta.tiles.length > 0) {
    tiles = [...tiles];
    for (const [i, t] of delta.tiles) tiles[i] = t;
  }
  return {
    ...prev,
    ...delta.fields,
    map: { ...(delta.map ?? prev.map), tiles },
    history: [...prev.history.slice(0, delta.historyFrom), ...delta.history],
  };
}

/** Deep equality for plain JSON values (views are plain JSON). */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka)
    if (!same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  return true;
}

/** A join code: six letters and digits that can't be misread (no 0/O, 1/I/L). */
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function isJoinCode(code: string): boolean {
  return new RegExp(`^[${CODE_ALPHABET}]{6}$`).test(code);
}

/** "abc def" → "ABCDEF", for codes typed with spaces, dashes or lowercase. */
export function normalizeCode(text: string): string {
  return text.toUpperCase().replace(/[^0-9A-Z]/g, '');
}
