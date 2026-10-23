import { type Draft, produce } from 'immer';
import type { Action, ActionType } from './actions';
import type { ActionHandler, Emit, EngineContext, RuleError } from './context';
import type { GameEvent } from './events';
import { generateMap } from './map/generate';
import { makeRandom } from './map/random';
import type { StartBias } from './map/types';
import { createRng } from './rng';
import { settlementHandlers, settlementsTurn } from './settlements/handlers';
import { spawnStartingUnits, startTurnForUnits, unitHandlers } from './units/handlers';
import type { GameSettings, GameState, PlayerId, PlayerState } from './state';

export type { EngineContext, RuleError } from './context';

export const MAX_PLAYERS = 16;

export interface GameSetup {
  gameId: string;
  settings: GameSettings;
  players: {
    id: PlayerId;
    name: string;
    kind: PlayerState['kind'];
    team?: number | null;
    /** A `civ` content id. Players without one get a civ nobody else picked, at random. */
    civ?: string;
    /** From the player's civ (later); influences where they start. */
    startBias?: StartBias[];
  }[];
}

export type ActionResult =
  { ok: true; state: GameState; events: GameEvent[] } | { ok: false; error: RuleError };

type Handlers = { [T in ActionType]: ActionHandler<Extract<Action, { type: T }>> };

/** A step run once per turn, after every player ended their turn. Lower `order` runs first. */
export interface TurnStep {
  id: string;
  order: number;
  run(draft: Draft<GameState>, ctx: EngineContext, emit: Emit): void;
}

/** Creates a new game, including its map. The same setup always produces the same state. */
export function createGame(setup: GameSetup, ctx: EngineContext): GameState {
  if (setup.players.length < 1 || setup.players.length > MAX_PLAYERS) {
    throw new RangeError(`A game needs 1-${MAX_PLAYERS} players, got ${setup.players.length}`);
  }
  const ids = setup.players.map((p) => p.id);
  if (new Set(ids).size !== ids.length) throw new Error('Player IDs must be unique');

  const playerOrder = [...ids].sort();
  const byId = (id: PlayerId) => setup.players.find((x) => x.id === id)!;

  const random = makeRandom(createRng(`${setup.settings.seed}:${setup.gameId}`));
  const { map, starts } = generateMap(
    {
      content: ctx.content,
      settings: setup.settings.map,
      players: playerOrder.map((id) => {
        const bias = byId(id).startBias;
        return bias ? { id, startBias: bias } : { id };
      }),
    },
    random,
  );

  // Civs: as chosen, then the unpicked ones shuffled (repeating if there are more players).
  for (const p of setup.players) {
    if (p.civ !== undefined && !ctx.content.entities.civ[p.civ])
      throw new Error(`Unknown civ "${p.civ}" for ${p.id}`);
  }
  const chosen = new Set(setup.players.flatMap((p) => (p.civ ? [p.civ] : [])));
  const pool = random.shuffle(ctx.content.ids.civ.filter((c) => !chosen.has(c)));
  const civs = pool.length > 0 ? pool : [...ctx.content.ids.civ];
  let nextCiv = 0;

  const players: Record<PlayerId, PlayerState> = {};
  for (const id of playerOrder) {
    const p = byId(id);
    const civ = p.civ ?? civs[nextCiv++ % civs.length] ?? '';
    players[id] = {
      id,
      name: p.name,
      kind: p.kind,
      team: p.team ?? null,
      alive: true,
      turnEnded: false,
      startTile: starts[id]!,
      explored: '',
      canEmbark: ctx.content.rules.units.embarkFromStart,
      civ,
      gold: 0,
      faith: 0,
      capital: null,
      settlementsFounded: 0,
    };
  }
  const state: GameState = {
    stateVersion: 1,
    gameId: setup.gameId,
    contentHash: ctx.content.hash,
    settings: { ...setup.settings, map: { ...setup.settings.map } },
    status: 'playing',
    turn: 1,
    rng: random.state(),
    players,
    playerOrder,
    nextEntityId: 1,
    map,
    units: {},
    wars: [],
    settlements: {},
  };
  spawnStartingUnits(state, ctx);
  return state;
}

const handlers: Handlers = {
  ...unitHandlers,
  ...settlementHandlers,
  end_turn: {
    validate(state, action) {
      const p = state.players[action.player];
      if (!p?.alive) return { code: 'not_playing', message: `${action.player} is not playing` };
      if (p.turnEnded) return { code: 'already_ended', message: 'You already ended your turn' };
      return undefined;
    },
    apply(draft, action, ctx, emit) {
      draft.players[action.player]!.turnEnded = true;
      emit({ type: 'turn_ended_by_player', player: action.player, visibleTo: 'all' });
      if (
        draft.playerOrder.every((id) => !draft.players[id]!.alive || draft.players[id]!.turnEnded)
      ) {
        processTurn(draft, ctx, emit);
      }
    },
  },
  unend_turn: {
    validate(state, action) {
      const p = state.players[action.player];
      if (!p?.alive) return { code: 'not_playing', message: `${action.player} is not playing` };
      if (!p.turnEnded) return { code: 'not_ended', message: "You haven't ended your turn" };
      return undefined;
    },
    apply(draft, action, _ctx, emit) {
      draft.players[action.player]!.turnEnded = false;
      emit({ type: 'turn_unended_by_player', player: action.player, visibleTo: 'all' });
    },
  },
};

/** Per-turn processing. Modules add steps here as they're built (growth, research, ...). */
const turnSteps: TurnStep[] = [{ id: 'settlements', order: 100, run: settlementsTurn }];

function processTurn(draft: Draft<GameState>, ctx: EngineContext, emit: Emit) {
  for (const step of [...turnSteps].sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1))) {
    step.run(draft, ctx, emit);
  }
  const limit = draft.settings.turnLimit;
  if (limit !== null && draft.turn >= limit) {
    draft.status = 'ended';
    emit({ type: 'game_ended', reason: 'turn_limit', visibleTo: 'all' });
    return;
  }
  draft.turn += 1;
  for (const id of draft.playerOrder) draft.players[id]!.turnEnded = false;
  emit({ type: 'turn_started', turn: draft.turn, visibleTo: 'all' });
  startTurnForUnits(draft, ctx, emit);
}

/** Checks an action against the rules without applying it (for greying out buttons). */
export function validateAction(
  state: GameState,
  action: Action,
  ctx: EngineContext,
): RuleError | undefined {
  if (state.status !== 'playing') return { code: 'game_over', message: 'The game is over' };
  if (state.contentHash !== ctx.content.hash) {
    return { code: 'content_mismatch', message: 'This game was started with different content' };
  }
  const handler = handlers[action.type] as ActionHandler<Action>;
  return handler.validate(state, action, ctx);
}

/** Validates and applies one action. Never mutates `state`. */
export function applyAction(state: GameState, action: Action, ctx: EngineContext): ActionResult {
  const error = validateAction(state, action, ctx);
  if (error) return { ok: false, error };
  const events: GameEvent[] = [];
  const handler = handlers[action.type] as ActionHandler<Action>;
  const next = produce(state, (draft) => {
    handler.apply(draft, action, ctx, (e) => events.push(e));
  });
  return { ok: true, state: next, events };
}
