import type { PlayerId } from '@cx/engine';
import type { SeatKeys } from '@cx/host';

/**
 * What this browser remembers about online games (docs/02-multiplayer.md, "Rejoining"): the
 * seat keys it was given as a friend, and, for the games it hosted, each seat's key and the
 * join code, so hosting one again keeps every seat for its player under the same code.
 */

const SEATS = 'cx.online.seats';
const HOSTED = 'cx.online.hosted';

function read<T>(key: string): T[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown;
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is off or full: rejoining then needs the host to free the seat.
  }
}

/** The seat keys this browser holds, by game (the 30 newest). */
export function browserSeatKeys(): SeatKeys {
  type Entry = { gameId: string; key: string };
  return {
    all: () => read<Entry>(SEATS).flatMap((e) => (typeof e.key === 'string' ? [e.key] : [])),
    save: (gameId, key) =>
      write(
        SEATS,
        [{ gameId, key }, ...read<Entry>(SEATS).filter((e) => e.gameId !== gameId)].slice(0, 30),
      ),
  };
}

export interface HostedGame {
  gameId: string;
  code: string;
  keys: Record<PlayerId, string>;
}

/** A game this browser hosted (the 10 newest are kept). */
export function hostedGame(gameId: string): HostedGame | undefined {
  return read<HostedGame>(HOSTED).find((h) => h.gameId === gameId);
}

export function rememberHosted(game: HostedGame) {
  write(
    HOSTED,
    [game, ...read<HostedGame>(HOSTED).filter((h) => h.gameId !== game.gameId)].slice(0, 10),
  );
}
