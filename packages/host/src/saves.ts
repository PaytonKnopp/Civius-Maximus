import type { EngineContext, GameState } from '@cx/engine';

/**
 * Saved games (docs/02-multiplayer.md, "Load Game"): the whole game state as JSON, with enough
 * around it to list saves and to refuse ones made with different content. Where saves are kept
 * (browser storage, a file, the cloud later) is up to the caller.
 */

export const SAVE_FORMAT = 'civius-maximus-save';
export const SAVE_VERSION = 1;

export interface SaveFile {
  format: typeof SAVE_FORMAT;
  version: number;
  name: string;
  /** ISO time it was saved. */
  savedAt: string;
  turn: number;
  /** The content the game was played with: a save only loads with the same content. */
  contentHash: string;
  state: GameState;
}

export function makeSave(state: GameState, name: string, now = new Date()): SaveFile {
  return {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    name,
    savedAt: now.toISOString(),
    turn: state.turn,
    contentHash: state.contentHash,
    state,
  };
}

/** Reads a save, or explains why it can't be loaded with this content. */
export function readSave(
  text: string,
  ctx: EngineContext,
): { ok: true; save: SaveFile } | { ok: false; message: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, message: "That file isn't a saved game" };
  }
  const save = data as Partial<SaveFile>;
  if (save?.format !== SAVE_FORMAT || !save.state)
    return { ok: false, message: "That file isn't a saved game" };
  if ((save.version ?? 0) > SAVE_VERSION)
    return { ok: false, message: 'That save is from a newer version of the game' };
  if (save.state.stateVersion !== 1)
    return { ok: false, message: 'That save is from an older version of the game' };
  if (save.contentHash !== ctx.content.hash || save.state.contentHash !== ctx.content.hash)
    return {
      ok: false,
      message: 'That save was made with different rules or mods, so it would play differently',
    };
  return { ok: true, save: save as SaveFile };
}
