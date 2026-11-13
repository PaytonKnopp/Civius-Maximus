import { checkInvariants, type EngineContext, type GameState } from '@cx/engine';

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
  if (text.length > MAX_SAVE_CHARS)
    return { ok: false, message: 'That file is too big to be a saved game' };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, message: "That file isn't a saved game" };
  }
  const save = data as Partial<SaveFile>;
  if (!save || typeof save !== 'object' || save.format !== SAVE_FORMAT || !save.state)
    return { ok: false, message: "That file isn't a saved game" };
  if (typeof save.version !== 'number' || save.version > SAVE_VERSION)
    return { ok: false, message: 'That save is from a newer version of the game' };
  if (typeof save.state !== 'object' || save.state.stateVersion !== 1)
    return { ok: false, message: 'That save is from an older version of the game' };
  // A file that was cut short, edited by hand or damaged on the way must be refused here, with
  // a reason: once loaded, a broken state would take the whole game screen down with it.
  const damaged = (damage: string) => ({
    ok: false as const,
    message: `That save is damaged and can't be loaded (${damage})`,
  });
  try {
    const damage = stateDamage(save.state);
    if (damage) return damaged(damage);
  } catch {
    return damaged('parts of the game are missing');
  }
  const updated = save.state.contentHash !== ctx.content.hash;
  if (updated) {
    // Made with other content (an earlier version, or a mod): what it needs must still exist.
    const missing = missingContent(save.state, ctx.content);
    if (missing.length > 0) {
      const more = missing.length > 3 ? ` and ${missing.length - 3} more` : '';
      return {
        ok: false,
        message: `That save needs content this version doesn't have (${missing.slice(0, 3).join(', ')}${more}): a mod that's off, or something removed since`,
      };
    }
  }
  // Last, the rules read all of it once (what they find is not judged: a save from an earlier
  // version may hold things today's rules wouldn't make, and still loads). If they can't even
  // read it, nothing else will.
  try {
    checkInvariants(ctx, save.state);
  } catch {
    return damaged('parts of the game are missing');
  }
  if (!updated) return { ok: true, save: save as SaveFile, updated: false };
  const state = { ...save.state, contentHash: ctx.content.hash };
  return {
    ok: true,
    save: { ...(save as SaveFile), contentHash: ctx.content.hash, state },
    updated: true,
  };
}

/** Saves are 1 to 3 MB; nothing near this size is one (and parsing it would freeze the page). */
const MAX_SAVE_CHARS = 64 * 1024 * 1024;

/**
 * What is structurally wrong with a state read from a file, in a few words, or undefined: the
 * parts every screen and every turn takes for granted (the map's size, who the players are,
 * where units and settlements stand). Not a rules check, and not a content check (what a save
 * needs that this version lacks is `missingContent`'s to name): a save from an earlier version
 * may hold things today's rules would not produce, and still loads.
 */
function stateDamage(state: GameState): string | undefined {
  const obj = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v);
  const int = (v: unknown, min: number) => typeof v === 'number' && Number.isInteger(v) && v >= min;
  const fin = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  const strings = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === 'string');
  const s = state as unknown as Record<string, unknown>;
  if (!int(s.turn, 1) || !int(s.nextEntityId, 0)) return 'its turn counter is unreadable';
  if (s.status !== 'playing' && s.status !== 'ended') return 'its status is unreadable';
  if (!obj(s.settings) || !obj(s.settings.map)) return 'its settings are missing';
  if (!Array.isArray(s.rng) || s.rng.length !== 4 || !s.rng.every((x) => int(x, -(2 ** 31))))
    return 'its dice are missing';
  for (const key of [
    'players',
    'units',
    'settlements',
    'camps',
    'religions',
    'cityStates',
    'tourism',
    'diplomacy',
    'greatPeople',
    'warStarted',
    'warSupport',
  ])
    if (!obj(s[key])) return `its ${key} are missing`;
  for (const key of ['playerOrder', 'wars', 'peaceOffers', 'routes', 'history'])
    if (!Array.isArray(s[key])) return `its ${key} are missing`;
  if (typeof s.roads !== 'string') return 'its roads are missing';
  const d = s.diplomacy as Record<string, unknown>;
  for (const key of ['friends', 'alliances', 'peaceUntil', 'lastWar', 'denounced'])
    if (!obj(d[key])) return 'its treaties are missing';
  for (const key of ['payments', 'proposals', 'incidents'])
    if (!Array.isArray(d[key])) return 'its deals are missing';
  const gp = s.greatPeople as Record<string, unknown>;
  if (!obj(gp.points) || !obj(gp.claimed)) return 'its great people are missing';

  const map = s.map as Record<string, unknown> | undefined;
  if (!obj(map) || !int(map.width, 1) || !int(map.height, 1) || !Array.isArray(map.tiles))
    return 'its map is missing';
  const count = (map.width as number) * (map.height as number);
  if (count > 250_000 || map.tiles.length !== count) return 'its map is the wrong size';
  for (const t of map.tiles as unknown[]) {
    if (!obj(t) || typeof t.terrain !== 'string') return 'a map tile is unreadable';
    if (t.feature !== null && typeof t.feature !== 'string') return 'a map tile is unreadable';
    if (t.owner !== null && typeof t.owner !== 'string') return 'a map tile is unreadable';
    if (!fin(t.river)) return 'a map tile is unreadable';
  }

  const players = s.players as Record<string, unknown>;
  if (!strings(s.playerOrder) || (s.playerOrder as string[]).length === 0)
    return 'its turn order is missing';
  for (const id of s.playerOrder as string[]) if (!obj(players[id])) return 'a player is missing';
  for (const [id, p] of Object.entries(players)) {
    if (!obj(p) || p.id !== id || typeof p.kind !== 'string') return 'a player is unreadable';
    if (!fin(p.gold) || !fin(p.faith) || !fin(p.influence) || typeof p.alive !== 'boolean')
      return 'a player is unreadable';
    for (const key of ['techs', 'civics']) {
      const track = p[key];
      if (!obj(track) || !strings(track.done) || !strings(track.queue) || !obj(track.progress))
        return "a player's research is unreadable";
      if (!strings(track.boosted) || !fin(track.stored)) return "a player's research is unreadable";
    }
    if (!obj(p.policies) || !obj(p.celebration)) return "a player's government is unreadable";
    for (const kind of ['military', 'economic', 'diplomatic', 'wildcard'])
      if (!strings((p.policies as Record<string, unknown>)[kind]))
        return "a player's government is unreadable";
    if (!strings(p.greatPeople) || !strings(p.beliefs) || !strings(p.spaceProjects))
      return 'a player is unreadable';
    if (typeof p.explored !== 'string') return 'a player is unreadable';
  }
  for (const [id, u] of Object.entries(s.units as Record<string, unknown>)) {
    if (!obj(u) || u.id !== id || typeof u.type !== 'string') return 'a unit is unreadable';
    if (typeof u.owner !== 'string' || !obj(players[u.owner])) return 'a unit has no owner';
    if (!int(u.tile, 0) || (u.tile as number) >= count) return 'a unit is off the map';
    if (!fin(u.moves) || !fin(u.health) || !fin(u.xp) || !strings(u.promotions))
      return 'a unit is unreadable';
    if (u.cargo !== undefined && !Array.isArray(u.cargo)) return 'a unit is unreadable';
  }
  for (const [id, x] of Object.entries(s.settlements as Record<string, unknown>)) {
    if (!obj(x) || x.id !== id || typeof x.name !== 'string') return 'a settlement is unreadable';
    if (typeof x.owner !== 'string' || !obj(players[x.owner])) return 'a settlement has no owner';
    if (!int(x.tile, 0) || (x.tile as number) >= count) return 'a settlement is off the map';
    if (x.kind !== 'town' && x.kind !== 'city') return 'a settlement is unreadable';
    if (!fin(x.population) || !fin(x.food) || !fin(x.health) || !fin(x.walls))
      return 'a settlement is unreadable';
    if (!strings(x.buildings) || !strings(x.wonders) || !Array.isArray(x.queue))
      return 'a settlement is unreadable';
    if (!Array.isArray(x.worked) || !Array.isArray(x.locked) || !Array.isArray(x.districts))
      return 'a settlement is unreadable';
    if (!obj(x.progress) || !obj(x.specialists) || !obj(x.pressure))
      return 'a settlement is unreadable';
    for (const t of [...(x.worked as unknown[]), ...(x.locked as unknown[])])
      if (!int(t, 0) || (t as number) >= count) return 'a settlement works land off the map';
    for (const dd of x.districts as unknown[])
      if (!obj(dd) || typeof dd.id !== 'string' || !int(dd.tile, 0) || (dd.tile as number) >= count)
        return 'a settlement is unreadable';
    for (const q of x.queue as unknown[])
      if (!obj(q) || typeof q.kind !== 'string' || typeof q.id !== 'string')
        return 'a settlement is unreadable';
  }
  return undefined;
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
