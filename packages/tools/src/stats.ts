import type { CompiledContent } from '@cx/content';
import {
  turnOrder,
  type Action,
  applyAction,
  createGame,
  type EngineContext,
  type GameEvent,
  type GameSettings,
  type GameSetup,
  type GameState,
  goldPerTurn,
  influencePerTurn,
  militaryStrength,
  playAiTurn,
  playerEra,
  scoreOf,
  settlementsOf,
  settlementYields,
  stateHash,
} from '@cx/engine';

/**
 * Balance measurements from all-AI games (`pnpm cx stats`): what a game looks like over time,
 * not just how it ends. One game gives a `GameStats` record (plain JSON, one line per game in a
 * batch file); `summarizeStats` turns many of them into the tables in docs/MECHANICS-REVIEW.md.
 *
 * Everything here only reads the state the game produces, so measuring never changes a game:
 * the final state hash is the same as `cx simulate` and `cx profile` give for the same setup.
 */

export interface StatsOptions {
  players: number;
  /** Turns to play at most (the game's turn limit). Defaults to the speed's own limit. */
  turns?: number;
  seed: string;
  size?: string;
  script?: string;
  speed?: string;
  difficulty?: string;
  startEra?: string;
  /** Rule toggles, as in the game setup (`{ congress: false }`...). */
  options?: Partial<GameSettings>;
  /** Take a sample of every civ's yields every N turns. */
  sampleEvery?: number;
  /** Seat p01 plays at this difficulty instead (e.g. Prince, a stand-in for a human), so its
   * finishing place shows how much the others' difficulty bonuses matter. */
  probe?: string;
}

/** The yields a civ makes in a turn, whole units. */
export type YieldSample = Record<string, number>;

export interface PlayerSample {
  yields: YieldSample;
  /** Net gold a turn after upkeep. */
  goldNet: number;
  gold: number;
  faith: number;
  influence: number;
  settlements: number;
  cities: number;
  population: number;
  army: number;
  score: number;
  era: number;
  techs: number;
  civics: number;
  greatPeople: number;
  wonders: number;
  districts: number;
  buildings: number;
  /** Settlements with a negative happiness balance, and in unrest. */
  unhappy: number;
  unrest?: number;
  /** Average happiness balance per settlement. */
  balance?: number;
  units: number;
}

export interface GameStats {
  config: StatsOptions & { size: string; script: string; speed: string; difficulty: string };
  endTurn: number;
  result: GameState['result'];
  winnerLeader: string | null;
  winnerCiv: string | null;
  hash: string;
  players: {
    id: string;
    leader: string;
    civ: string;
    alive: boolean;
    score: number;
    era: number;
    settlements: number;
    population: number;
    techs: number;
    civics: number;
  }[];
  /** era order → first turn any civ reached it, and the turn half the civs had. */
  eraFirst: Record<number, number>;
  eraHalf: Record<number, number>;
  samples: { turn: number; players: Record<string, PlayerSample> }[];
  events: Record<string, number>;
  rejected: Record<string, number>;
  built: {
    unit: Record<string, number>;
    building: Record<string, number>;
    district: Record<string, number>;
    wonder: Record<string, number>;
    project: Record<string, number>;
  };
  /** Bought rather than built (gold or faith), by kind:id. */
  bought: Record<string, number>;
  wonders: { turn: number; id: string; player: string }[];
  greatPeople: { turn: number; id: string; player: string }[];
  pantheons: { turn: number; belief: string; player: string }[];
  religions: { turn: number; player: string }[];
  wars: { turn: number; by: string; target: string; cityState: boolean }[];
  peace: { turn: number; players: string[] }[];
  captures: { turn: number; by: string; from: string; cityState: boolean }[];
  defeated: { turn: number; player: string }[];
  /** Player-turns each policy card sat in a slot, and each government was in force (sampled). */
  policyTurns: Record<string, number>;
  governmentTurns: Record<string, number>;
  beliefs: Record<string, number>;
  spyMissions: Record<string, number>;
  resolutions: Record<string, number>;
  dedications: Record<string, number>;
  ages: Record<string, number>;
  governors: Record<string, number>;
  /** Average and slowest ms: all AI seats' thinking per turn, and the world's turn processing. */
  aiMs: { average: number; slowest: number };
  processMs: { average: number; slowest: number };
}

const YIELDS = [
  'food',
  'production',
  'gold',
  'science',
  'culture',
  'faith',
  'happiness',
  'influence',
  'tourism',
];

function setupFor(content: CompiledContent, o: StatsOptions): GameSetup {
  const size =
    o.size ??
    (o.players <= 2
      ? 'duel'
      : o.players <= 4
        ? 'tiny'
        : o.players <= 6
          ? 'small'
          : o.players <= 8
            ? 'standard'
            : o.players <= 10
              ? 'large'
              : 'huge');
  const speed = o.speed ?? 'speed_standard';
  const limit = o.turns ?? content.entities.gameSpeed?.[speed]?.turnLimit ?? 500;
  return {
    gameId: `stats-${o.seed}`,
    settings: {
      seed: o.seed,
      turnLimit: limit,
      map: {
        script: o.script ?? 'continents',
        size,
        wrapX: true,
        resources: 'standard',
        startBalance: 'normal',
      },
      speed,
      ...(o.difficulty ? { difficulty: o.difficulty } : {}),
      ...(o.startEra ? { startEra: o.startEra } : {}),
      ...o.options,
    },
    players: Array.from({ length: o.players }, (_, i) => ({
      id: `p${String(i + 1).padStart(2, '0')}`,
      name: `AI ${i + 1}`,
      kind: 'ai' as const,
      ...(i === 0 && o.probe ? { difficulty: o.probe } : {}),
    })),
  };
}

const inc = (m: Record<string, number>, k: string, n = 1) => (m[k] = (m[k] ?? 0) + n);

export function runStats(
  content: CompiledContent,
  o: StatsOptions,
  clock: () => number = () => performance.now(),
): GameStats {
  const ctx: EngineContext = { content };
  const setup = setupFor(content, o);
  let state = createGame(setup, ctx);
  const every = o.sampleEvery ?? 10;
  const majors = () => state.playerOrder.filter((id) => state.players[id]!.kind === 'ai');
  const isCityState = (id: string) => state.players[id]?.kind === 'cityState';

  const stats: GameStats = {
    config: {
      ...o,
      size: setup.settings.map.size,
      script: setup.settings.map.script,
      speed: setup.settings.speed!,
      difficulty: o.difficulty ?? 'difficulty_prince',
    },
    endTurn: 0,
    result: null,
    winnerLeader: null,
    winnerCiv: null,
    hash: '',
    players: [],
    eraFirst: {},
    eraHalf: {},
    samples: [],
    events: {},
    rejected: {},
    built: { unit: {}, building: {}, district: {}, wonder: {}, project: {} },
    bought: {},
    wonders: [],
    greatPeople: [],
    pantheons: [],
    religions: [],
    wars: [],
    peace: [],
    captures: [],
    defeated: [],
    policyTurns: {},
    governmentTurns: {},
    beliefs: {},
    spyMissions: {},
    resolutions: {},
    dedications: {},
    ages: {},
    governors: {},
    aiMs: { average: 0, slowest: 0 },
    processMs: { average: 0, slowest: 0 },
  };

  const onEvent = (e: GameEvent) => {
    inc(stats.events, e.type);
    const turn = state.turn;
    switch (e.type) {
      case 'item_completed':
        if (state.players[e.owner]?.kind === 'ai') inc(stats.built[e.item.kind], e.item.id);
        break;
      case 'item_bought':
        if (state.players[e.owner]?.kind === 'ai') {
          inc(stats.bought, `${e.item.kind}:${e.item.id}`);
          inc(stats.built[e.item.kind], e.item.id);
        }
        break;
      case 'wonder_completed':
        stats.wonders.push({ turn, id: e.wonder, player: e.owner });
        break;
      case 'great_person_born':
        stats.greatPeople.push({ turn, id: e.person, player: e.player });
        break;
      case 'pantheon_founded':
        stats.pantheons.push({ turn, belief: e.belief, player: e.player });
        inc(stats.beliefs, e.belief);
        break;
      case 'religion_founded':
        stats.religions.push({ turn, player: e.player });
        break;
      case 'war_declared':
        stats.wars.push({ turn, by: e.by, target: e.target, cityState: isCityState(e.target) });
        break;
      case 'peace_made':
        stats.peace.push({ turn, players: [...e.players] });
        break;
      case 'settlement_captured':
        stats.captures.push({ turn, by: e.by, from: e.from, cityState: isCityState(e.from) });
        break;
      case 'player_defeated':
        stats.defeated.push({ turn, player: e.player });
        break;
      case 'spy_mission':
        inc(stats.spyMissions, `${e.mission}:${e.outcome}`);
        break;
      case 'resolution_passed':
        inc(stats.resolutions, `${e.resolution}:${e.option}`);
        break;
      case 'age_started':
        inc(stats.ages, e.age);
        break;
      default:
        break;
    }
  };

  const act = (action: Action) => {
    const start = clock();
    const r = applyAction(state, action, ctx);
    if (!r.ok) {
      inc(stats.rejected, `${action.type}:${r.error.code}`);
      return undefined;
    }
    if (r.state.turn !== state.turn) lastProcess = clock() - start;
    // Events belong to the turn they happened in (turn processing reports the old turn's).
    for (const e of r.events) onEvent(e);
    state = r.state;
    if (action.type === 'choose_dedications')
      for (const d of action.dedications) inc(stats.dedications, d);
    if (action.type === 'found_religion')
      for (const b of [action.founder, action.follower, action.worship ?? ''])
        if (b) inc(stats.beliefs, b);
    if (action.type === 'appoint_governor') inc(stats.governors, action.governor);
    return state;
  };

  let lastProcess: number;
  let aiTotal = 0;
  let aiSlowest = 0;
  let procTotal = 0;
  let procSlowest = 0;
  let rounds = 0;

  const sample = () => {
    const players: Record<string, PlayerSample> = {};
    for (const id of majors()) {
      const p = state.players[id]!;
      if (!p.alive) continue;
      const own = settlementsOf(state, id);
      const yields: YieldSample = Object.fromEntries(YIELDS.map((y) => [y, 0]));
      let unhappy = 0;
      let unrest = 0;
      let balance = 0;
      for (const s of own) {
        const y = settlementYields(ctx, state, s);
        for (const k of YIELDS) yields[k]! += (y.total[k] ?? 0) / 100;
        if (y.happiness.balance < 0) unhappy++;
        if (y.happiness.mood === 'unrest') unrest++;
        balance += y.happiness.balance;
      }
      yields.influence = influencePerTurn(ctx, state, id) / 100;
      yields.tourism = p.tourismRate / 100;
      for (const k of YIELDS) yields[k] = Math.round(yields[k]! * 10) / 10;
      players[id] = {
        yields,
        goldNet: Math.round(goldPerTurn(ctx, state, id)) / 100,
        gold: Math.round(p.gold / 100),
        faith: Math.round(p.faith / 100),
        influence: Math.round(p.influence / 100),
        settlements: own.length,
        cities: own.filter((s) => s.kind === 'city').length,
        population: own.reduce((n, s) => n + s.population, 0),
        army: militaryStrength(ctx, state, id),
        score: scoreOf(ctx, state, id).total,
        era: playerEra(ctx, p)?.order ?? 0,
        techs: p.techs.done.length,
        civics: p.civics.done.length,
        greatPeople: p.greatPeople.length,
        wonders: own.reduce((n, s) => n + s.wonders.length, 0),
        districts: own.reduce((n, s) => n + s.districts.length, 0),
        buildings: own.reduce((n, s) => n + s.buildings.length, 0),
        unhappy,
        unrest,
        balance: own.length ? Math.round((10 * balance) / own.length) / 10 : 0,
        units: Object.values(state.units).filter((u) => u.owner === id).length,
      };
      for (const kind of Object.keys(p.policies) as (keyof typeof p.policies)[])
        for (const card of p.policies[kind]) inc(stats.policyTurns, card, every);
      inc(stats.governmentTurns, p.government, every);
    }
    stats.samples.push({ turn: state.turn, players });
  };

  const eraOrders = new Map<string, number>();
  const trackEras = () => {
    const alive = majors().filter((id) => state.players[id]!.alive);
    for (const id of alive) {
      const era = playerEra(ctx, state.players[id]!)?.order ?? 0;
      eraOrders.set(id, Math.max(eraOrders.get(id) ?? 0, era));
    }
    const orders = [...eraOrders.values()];
    for (const era of new Set(orders)) {
      for (let e = 0; e <= era; e++) {
        if (stats.eraFirst[e] === undefined) stats.eraFirst[e] = state.turn;
        const reached = orders.filter((x) => x >= e).length;
        if (stats.eraHalf[e] === undefined && reached * 2 >= Math.max(1, alive.length))
          stats.eraHalf[e] = state.turn;
      }
    }
  };

  trackEras();
  while (state.status === 'playing') {
    const turn = state.turn;
    lastProcess = 0;
    const roundStart = clock();
    for (const player of turnOrder(state)) {
      const p = state.players[player]!;
      if (!p.alive || p.turnEnded) continue;
      state = playAiTurn(ctx, state, player, act);
    }
    if (state.turn === turn) break; // nobody could end the turn
    const round = clock() - roundStart;
    const ai = Math.max(0, round - lastProcess);
    aiTotal += ai;
    aiSlowest = Math.max(aiSlowest, ai);
    procTotal += lastProcess;
    procSlowest = Math.max(procSlowest, lastProcess);
    rounds++;
    trackEras();
    if (state.turn % every === 0 || state.status !== 'playing') sample();
  }

  stats.endTurn = state.turn;
  stats.result = state.result;
  const winner = state.result?.winner ? state.players[state.result.winner] : undefined;
  stats.winnerLeader = winner?.leader ?? null;
  stats.winnerCiv = winner?.civ ?? null;
  stats.hash = stateHash(state);
  stats.players = majors().map((id) => {
    const p = state.players[id]!;
    const own = settlementsOf(state, id);
    return {
      id,
      leader: p.leader,
      civ: p.civ,
      alive: p.alive,
      score: scoreOf(ctx, state, id).total,
      era: playerEra(ctx, p)?.order ?? 0,
      settlements: own.length,
      population: own.reduce((n, s) => n + s.population, 0),
      techs: p.techs.done.length,
      civics: p.civics.done.length,
    };
  });
  stats.aiMs = { average: rounds ? aiTotal / rounds : 0, slowest: aiSlowest };
  stats.processMs = { average: rounds ? procTotal / rounds : 0, slowest: procSlowest };
  return stats;
}
