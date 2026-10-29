import { castDraft, type Draft, freeze, produce } from 'immer';
import { placeStartingCamps, raidersTurn } from './combat/camps';
import { combatHandlers, combatTurn, healUnits } from './combat/handlers';
import type { Action, ActionType } from './actions';
import type { ActionHandler, Emit, EngineContext, RuleError } from './context';
import type { GameEvent } from './events';
import { generateMap } from './map/generate';
import { makeRandom } from './map/random';
import type { StartBias } from './map/types';
import { diplomacyHandlers, diplomacyTurn } from './diplomacy/handlers';
import { emptyDiplomacy } from './diplomacy/rules';
import { emptyBits, encodeBits } from './bitset';
import { createRng } from './rng';
import { historyTurn, scoreVictory } from './victory';
import { checkBoosts, progressHandlers } from './progress/handlers';
import { newProgress } from './progress/sources';
import { settlementHandlers, settlementsTurn } from './settlements/handlers';
import { commanderHandlers } from './units/commanders';
import { tradeHandlers, tradeTurn } from './trade/handlers';
import { greatPeopleHandlers, greatPeopleTurn } from './greatpeople/greatpeople';
import { religionHandlers, religionTurn } from './religion/handlers';
import { cityStateHandlers, cityStatesTurn, placeCityStates } from './citystates/handlers';
import { upgradeHandlers } from './units/upgrades';
import { cultureTurn } from './culture/tourism';
import { scienceTurn } from './science/space';
import { agesHandlers, agesTurn, awardMoments, newAgeState } from './eras/ages';
import { governorHandlers, governorsTurn } from './governors/governors';
import { greatWorksHandlers, greatWorksTurn } from './greatworks/greatworks';
import { espionageHandlers, espionageTurn } from './espionage/espionage';
import { congressHandlers, congressTurn } from './congress/congress';
import { disastersTurn } from './disasters/disasters';
import { freeCitiesTurn, loyaltyTurn } from './loyalty/loyalty';
import { applyStartEra } from './progress/startEra';
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
    /** A `civ` content id. Players without one get their leader's civ, or a civ nobody else
     * picked, at random. */
    civ?: string;
    /** A `leader` content id. Players without one get their civ's leader. */
    leader?: string;
    /** From the player's civ (later); influences where they start. */
    startBias?: StartBias[];
    /** AI seats: a `difficulty` for this seat only (otherwise the game's). */
    difficulty?: string;
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
  for (const level of [setup.settings.difficulty, ...setup.players.map((p) => p.difficulty)])
    if (level !== undefined && !ctx.content.entities.difficulty?.[level])
      throw new Error(`Unknown difficulty "${level}"`);
  for (const p of setup.players) {
    if (p.civ !== undefined && !ctx.content.entities.civ[p.civ])
      throw new Error(`Unknown civ "${p.civ}" for ${p.id}`);
    if (p.leader !== undefined && !ctx.content.entities.leader[p.leader])
      throw new Error(`Unknown leader "${p.leader}" for ${p.id}`);
  }
  const civOf = (p: GameSetup['players'][number]) =>
    p.civ ?? (p.leader ? ctx.content.entities.leader[p.leader]!.civ : undefined);
  const chosen = new Set(setup.players.flatMap((p) => civOf(p) ?? []));
  const pool = random.shuffle(ctx.content.ids.civ.filter((c) => !chosen.has(c)));
  const civs = pool.length > 0 ? pool : [...ctx.content.ids.civ];
  let nextCiv = 0;

  const players: Record<PlayerId, PlayerState> = {};
  for (const id of playerOrder) {
    const p = byId(id);
    const civ = civOf(p) ?? civs[nextCiv++ % civs.length] ?? '';
    const leader =
      p.leader ??
      ctx.content.ids.leader.find((l) => ctx.content.entities.leader[l]!.civ === civ) ??
      '';
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
      leader,
      gold: 0,
      influence: 0,
      greatPeople: [],
      beliefs: [],
      religion: null,
      envoys: 0,
      lifetimeCulture: 0,
      scienceRate: 0,
      cultureRate: 0,
      tourismRate: 0,
      spaceProjects: [],
      expeditionArrives: null,
      faith: 0,
      capital: null,
      settlementsFounded: 0,
      kills: 0,
      declaredWarTurn: null,
      ...newProgress(ctx),
    };
    // AI seats get their difficulty's bonuses (D53).
    const level = p.difficulty ?? setup.settings.difficulty;
    if (p.kind === 'ai' && level !== undefined) players[id]!.handicap = level;
  }
  const state: GameState = {
    stateVersion: 1,
    gameId: setup.gameId,
    contentHash: ctx.content.hash,
    settings: { ...setup.settings, map: { ...setup.settings.map } },
    status: 'playing',
    result: null,
    turn: 1,
    rng: random.state(),
    players,
    playerOrder,
    nextEntityId: 1,
    map,
    units: {},
    wars: [],
    warStarted: {},
    peaceOffers: [],
    warSupport: {},
    camps: {},
    settlements: {},
    diplomacy: emptyDiplomacy(),
    roads: encodeBits(emptyBits(map.tiles.length)),
    routes: [],
    greatPeople: { points: {}, claimed: {} },
    religions: {},
    cityStates: {},
    tourism: {},
    history: [],
  };
  applyStartEra(state, ctx);
  for (const id of state.playerOrder)
    state.players[id]!.ages = newAgeState(ctx, state.players[id]!, state.settings.startEra);
  spawnStartingUnits(state, ctx);
  placeStartingCamps(state, ctx, random);
  const placed = produce(state, (draft) => {
    placeCityStates(draft, ctx, random);
    draft.rng = castDraft(random.state());
  });
  // Frozen like every later state: Immer then shares the untouched parts instead of copying
  // them (snapshots during turn processing would otherwise copy the whole map each time).
  return freeze(placed, true);
}

const handlers: Handlers = {
  ...agesHandlers,
  ...governorHandlers,
  ...greatWorksHandlers,
  ...espionageHandlers,
  ...congressHandlers,
  ...unitHandlers,
  ...settlementHandlers,
  ...progressHandlers,
  ...combatHandlers,
  ...diplomacyHandlers,
  ...commanderHandlers,
  ...tradeHandlers,
  ...greatPeopleHandlers,
  ...religionHandlers,
  ...cityStateHandlers,
  ...upgradeHandlers,
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
const turnSteps: TurnStep[] = [
  { id: 'combat', order: 90, run: combatTurn },
  { id: 'settlements', order: 100, run: settlementsTurn },
  { id: 'cityStates', order: 105, run: cityStatesTurn },
  { id: 'freeCities', order: 106, run: freeCitiesTurn },
  { id: 'diplomacy', order: 110, run: diplomacyTurn },
  { id: 'trade', order: 120, run: tradeTurn },
  { id: 'greatPeople', order: 115, run: greatPeopleTurn },
  { id: 'religion', order: 125, run: religionTurn },
  { id: 'greatWorks', order: 127, run: (draft) => greatWorksTurn(draft) },
  { id: 'culture', order: 128, run: cultureTurn },
  { id: 'science', order: 129, run: scienceTurn },
  { id: 'disasters', order: 134, run: disastersTurn },
  { id: 'ages', order: 135, run: agesTurn },
  { id: 'governors', order: 136, run: governorsTurn },
  { id: 'loyalty', order: 137, run: loyaltyTurn },
  { id: 'espionage', order: 138, run: espionageTurn },
  { id: 'congress', order: 139, run: congressTurn },
  { id: 'history', order: 140, run: (draft, ctx) => historyTurn(draft, ctx) },
];

function processTurn(draft: Draft<GameState>, ctx: EngineContext, emit: Emit) {
  for (const step of [...turnSteps].sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1))) {
    step.run(draft, ctx, emit);
  }
  const limit = draft.settings.turnLimit;
  if (limit !== null && draft.turn >= limit) {
    scoreVictory(draft, ctx, emit);
    return;
  }
  draft.turn += 1;
  for (const id of draft.playerOrder) draft.players[id]!.turnEnded = false;
  emit({ type: 'turn_started', turn: draft.turn, visibleTo: 'all' });
  healUnits(draft, ctx);
  startTurnForUnits(draft, ctx, emit);
  // Raiders move next, in a step of their own (see `applyAction`).
}

/** Actions that can complete a boost goal on the spot. */
const BOOSTING_ACTIONS = new Set<ActionType>([
  'found_settlement',
  'buy_item',
  'develop_tile',
  'buy_tile',
  'upgrade_town',
  'set_government',
  'set_policies',
]);

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
  const emit = (e: GameEvent) => events.push(e);
  const handler = handlers[action.type] as ActionHandler<Action>;
  let next = produce(state, (draft) => {
    handler.apply(draft, action, ctx, emit);
    // Doing things can earn boosts (founding on the coast, buying a shrine...): pay them now.
    // (Turn processing checks everyone's at the end of each turn.)
    if (
      BOOSTING_ACTIONS.has(action.type) &&
      draft.status === 'playing' &&
      draft.players[action.player]?.alive
    ) {
      checkBoosts(draft, ctx, action.player, emit);
    }
  });
  // A new turn began: hostile raiders act first. They run on the finished turn as a second
  // step, so their many small snapshots copy only what they change, not the whole turn's work.
  if (next.turn !== state.turn && next.status === 'playing') {
    next = produce(next, (draft) => raidersTurn(draft, ctx, emit));
  }
  // Historic moments: era score for what just happened, and natural wonders just found.
  if (next.status === 'playing') {
    const happened = [...events];
    next = produce(next, (draft) => awardMoments(draft, ctx, happened, emit));
  }
  return { ok: true, state: next, events };
}
