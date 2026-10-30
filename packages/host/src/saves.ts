import type { EngineContext, GameState } from '@cx/engine';

/**
 * Saved games (docs/02-multiplayer.md, "Saving"): the whole game state as JSON, with enough
 * around it to list saves and to check them against this version's content. Where saves are
 * kept (browser storage, a file, the cloud) is up to the caller.
 *
 * The game updates often, and an update changes the content's hash. A save from before an
 * update still loads, like a Civ save after a patch, as long as everything it refers to still
 * exists: it then plays on with the current rules. Only a save that needs content this version
 * doesn't have (a mod that's off, something removed since) is refused, with what's missing.
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
  /** The content the game was played with (the latest rules it was played with). */
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

/**
 * Reads a save, or explains why it can't be loaded with this content. `updated`: it was made
 * with other content (an earlier version of the game) and now plays with this one.
 */
export function readSave(
  text: string,
  ctx: EngineContext,
): { ok: true; save: SaveFile; updated: boolean } | { ok: false; message: string } {
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
  if (save.state.contentHash === ctx.content.hash)
    return { ok: true, save: save as SaveFile, updated: false };
  const missing = missingContent(save.state, ctx.content);
  if (missing.length > 0) {
    const more = missing.length > 3 ? ` and ${missing.length - 3} more` : '';
    return {
      ok: false,
      message: `That save needs content this version doesn't have (${missing.slice(0, 3).join(', ')}${more}): a mod that's off, or something removed since`,
    };
  }
  const state = { ...save.state, contentHash: ctx.content.hash };
  return {
    ok: true,
    save: { ...(save as SaveFile), contentHash: ctx.content.hash, state },
    updated: true,
  };
}

/**
 * The content ids a game refers to that `content` doesn't have. Ids carry their type's prefix
 * (`unit_`, `tech_`...), so every such string in the state counts, as a value or a key; the
 * types named without one (terrain, features, resources, map scripts and sizes) are checked
 * where the state uses them.
 */
export function missingContent(state: GameState, content: EngineContext['content']): string[] {
  const ids = new Set<string>();
  const prefixes: string[] = [];
  for (const table of Object.values(content.entities) as Record<string, unknown>[]) {
    const keys = Object.keys(table);
    for (const k of keys) ids.add(k);
    const prefix = /^([a-z]+)_/.exec(keys[0] ?? '')?.[1];
    if (prefix && keys.every((k) => k.startsWith(`${prefix}_`))) prefixes.push(prefix);
  }
  const looksLikeId = new RegExp(`^(${prefixes.join('|')})_[a-z0-9_]+$`);
  const missing = new Set<string>();
  const check = (id: string | null | undefined, table: Record<string, unknown>) => {
    if (id && !(id in table)) missing.add(id);
  };
  const walk = (v: unknown) => {
    if (typeof v === 'string') {
      if (looksLikeId.test(v) && !ids.has(v)) missing.add(v);
    } else if (Array.isArray(v)) {
      for (const x of v) walk(x);
    } else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if (looksLikeId.test(k) && !ids.has(k)) missing.add(k);
        walk(x);
      }
    }
  };
  walk(state);
  const e = content.entities;
  for (const t of state.map.tiles) {
    check(t.terrain, e.terrain);
    check(t.feature, e.feature);
    check(t.resource, e.resource);
  }
  check(state.settings.map.script, e.mapScript);
  check(state.settings.map.size, e.mapSize);
  return [...missing].sort();
}
