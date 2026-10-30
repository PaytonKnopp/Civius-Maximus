import { resolveText } from '@cx/content';
import { type EngineContext, type GameState, type PlayerId, scoreOf } from '@cx/engine';

/**
 * The Hall of Fame (docs/06-ui-ux.md): every finished game in this browser, with a replay of
 * the newest ones (the map's owners every few turns, the players and their historic moments).
 * Kept in local storage only; a full store drops the oldest replays first.
 */

export interface ReplayPlayer {
  name: string;
  civ: string;
  leader: string;
  color: string;
}

export interface Replay {
  width: number;
  height: number;
  /** One character per tile: a terrain's index letter (`a`...), or `M` for a mountain. */
  terrain: string;
  /** Terrain colors by index letter. */
  colors: Record<string, string>;
  /** In turn order, like the letters in the frames. */
  players: ReplayPlayer[];
  /** The history's owner maps (run-length encoded, see the engine's `encodeOwners`). */
  frames: { turn: number; owners: string }[];
  /** Historic moments: turn, player index, what happened. */
  moments: { turn: number; player: number; text: string }[];
}

export interface FameEntry {
  id: string;
  /** When it ended (ISO date). */
  date: string;
  /** The seat this browser played. */
  player: string;
  leader: string;
  civ: string;
  won: boolean;
  /** How the game ended (`score`, `domination`...) and who won. */
  reason: string;
  winner: string;
  turn: number;
  score: number;
  difficulty: string;
  speed: string;
  map: string;
  players: number;
  replay?: Replay;
}

const KEY = 'cx.hallOfFame';
const MAX_ENTRIES = 50;
const MAX_REPLAYS = 8;

export function hallOfFame(): FameEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as FameEntry[]) : [];
  } catch {
    return [];
  }
}

function save(entries: FameEntry[]) {
  // Drop replays (oldest first) until it fits.
  let list = entries
    .slice(0, MAX_ENTRIES)
    .map((e, i) => (i < MAX_REPLAYS ? e : { ...e, replay: undefined }));
  for (let keep = MAX_REPLAYS; keep >= 0; keep--) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
      return;
    } catch {
      list = list.map((e, i) => (i < keep ? e : { ...e, replay: undefined }));
    }
  }
}

/** The replay of a game, from its final state. */
export function replayOf(ctx: EngineContext, state: GameState): Replay {
  const { content } = ctx;
  const terrains = content.ids.terrain;
  const colors: Record<string, string> = { M: '#8a8478' };
  terrains.forEach(
    (id, i) => (colors[String.fromCharCode(97 + i)] = content.entities.terrain[id]!.color),
  );
  const terrain = state.map.tiles
    .map((t) =>
      t.elevation === 'mountain'
        ? 'M'
        : String.fromCharCode(97 + Math.max(0, terrains.indexOf(t.terrain))),
    )
    .join('');
  const players = state.playerOrder.map((p) => {
    const pl = state.players[p]!;
    const civ = content.entities.civ[pl.civ];
    return {
      name: pl.name,
      civ: civ ? resolveText(content, civ.name) : pl.civ,
      leader: content.entities.leader[pl.leader]
        ? resolveText(content, content.entities.leader[pl.leader]!.name)
        : pl.leader,
      color: civ?.colors.primary ?? '#888888',
    };
  });
  const frames = state.history.flatMap((h) =>
    h.owners ? [{ turn: h.turn, owners: h.owners }] : [],
  );
  const moments = state.playerOrder
    .flatMap((p, i) =>
      (state.players[p]!.ages?.timeline ?? []).map((m) => {
        const def = content.entities.moment[m.moment];
        return { turn: m.turn, player: i, text: def ? resolveText(content, def.name) : m.moment };
      }),
    )
    .sort((a, b) => a.turn - b.turn || a.player - b.player);
  return {
    width: state.map.width,
    height: state.map.height,
    terrain,
    colors,
    players,
    frames,
    moments,
  };
}

/** Records a finished game from `viewer`'s seat (once per game; later calls are ignored). */
export function recordGame(
  ctx: EngineContext,
  state: GameState,
  viewer: PlayerId,
  gameId: string,
): FameEntry | undefined {
  const entries = hallOfFame();
  if (entries.some((e) => e.id === gameId)) return undefined;
  const { content } = ctx;
  const p = state.players[viewer]!;
  const winner = state.result?.winner ?? null;
  const name = (id: string, kind: 'civ' | 'leader' | 'difficulty' | 'gameSpeed' | 'mapScript') => {
    const d = (content.entities[kind] as Record<string, { name: string } | undefined>)[id];
    return d ? resolveText(content, d.name) : id;
  };
  const entry: FameEntry = {
    id: gameId,
    date: new Date().toISOString(),
    player: p.name,
    leader: name(p.leader, 'leader'),
    civ: name(p.civ, 'civ'),
    won:
      winner !== null &&
      (winner === viewer || (p.team !== null && state.players[winner]?.team === p.team)),
    reason: state.result?.reason ?? 'score',
    winner: winner ? state.players[winner]!.name : '',
    turn: state.turn,
    score: scoreOf(ctx, state, viewer).total,
    difficulty: name(state.settings.difficulty ?? '', 'difficulty') || 'Normal',
    speed: name(state.settings.speed ?? 'speed_standard', 'gameSpeed'),
    map: `${name(state.settings.map.script, 'mapScript')} · ${state.settings.map.size}`,
    players: state.playerOrder.length,
    replay: replayOf(ctx, state),
  };
  save([entry, ...entries]);
  return entry;
}
