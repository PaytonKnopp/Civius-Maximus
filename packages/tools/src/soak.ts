import type { CompiledContent } from '@cx/content';
import {
  type Action,
  applyAction,
  checkInvariants,
  createGame,
  type EngineContext,
  type GameState,
  goldForecast,
  influencePerTurn,
  playAiTurn,
  settlementsOf,
  settlementYields,
  stateHash,
  turnOrder,
} from '@cx/engine';
import { setupFor, type StatsOptions } from './stats';

/**
 * A soak test (`pnpm cx soak`): all-AI games played to the end with the rules checked as they go,
 * for the release question "does it ever break?" rather than "is it balanced?" (`cx stats`).
 *
 * After every turn of a game it runs the engine's `checkInvariants` (every reference valid,
 * units and settlements where they may be, nothing impossible below zero). Every few turns it
 * saves the game to JSON, loads it back and plays both copies on a few turns: the hashes must
 * match, or a saved game would not continue the way the live one does. And it compares what the
 * top bar promises a player for next turn (gold, science, culture, faith, influence: the same
 * engine sums the client shows) with what the turn then gives, so a number that lies shows up.
 *
 * A throw from the engine, a turn nobody can end, or a game that outlives its turn limit is a
 * failure too. Everything is read from the states the game produces, so a soaked game plays out
 * exactly like the same setup in `cx simulate`, `cx stats` or `cx profile` (same final hash).
 */

export interface SoakOptions extends StatsOptions {
  /** Save, load and compare every this many turns (0 = never). Default 40. */
  roundTripEvery?: number;
  /** Turns both copies are played on after a load. Default 2. */
  roundTripTurns?: number;
}

/** How one promised per-turn number compared with what the turn gave. */
export interface Prediction {
  /** Player-turns compared. */
  n: number;
  /** Exactly as promised. */
  exact: number;
  /** Within 5% (or one whole point) of the promise. */
  close: number;
  /** The widest misses: "turn 87 p03: promised 12.5, got 9". */
  worst: string[];
}

export interface SoakResult {
  config: SoakOptions & { size: string; script: string; speed: string };
  endTurn: number;
  result: GameState['result'];
  hash: string;
  /** Wall-clock seconds. */
  seconds: number;
  /** Broken invariants, failed round trips and crashes: the first of each kind, with its turn. */
  problems: string[];
  /** How many problem lines there were in all. */
  problemCount: number;
  /** Actions the engine refused, by `type:code` (the AI asking for something it can't have). */
  rejected: Record<string, number>;
  roundTrips: number;
  predictions: Record<'gold' | 'science' | 'culture' | 'faith' | 'influence', Prediction>;
}

const emptyPrediction = (): Prediction => ({ n: 0, exact: 0, close: 0, worst: [] });

/** One turn of everyone's AI on `state`; returns the new state (the same one if stuck). */
function playRound(
  ctx: EngineContext,
  start: GameState,
  onRejected?: (key: string) => void,
  beforeLastEnd?: (state: GameState) => void,
): GameState {
  let state = start;
  const act = (action: Action) => {
    // The action that ends the round: the state before it is what every player last saw.
    if (action.type === 'end_turn' && beforeLastEnd) {
      const waiting = state.playerOrder.filter((id) => {
        const p = state.players[id]!;
        return p.alive && !p.turnEnded && (p.kind === 'ai' || p.kind === 'human');
      });
      if (waiting.length === 1 && waiting[0] === action.player) beforeLastEnd(state);
    }
    const r = applyAction(state, action, ctx);
    if (!r.ok) {
      onRejected?.(`${action.type}:${r.error.code}`);
      return undefined;
    }
    state = r.state;
    return state;
  };
  for (const player of turnOrder(state)) {
    const p = state.players[player]!;
    if (!p.alive || p.turnEnded) continue;
    state = playAiTurn(ctx, state, player, act);
  }
  return state;
}

export function runSoak(
  content: CompiledContent,
  o: SoakOptions,
  clock: () => number = () => performance.now(),
): SoakResult {
  const ctx: EngineContext = { content };
  const setup = setupFor(content, o);
  const started = clock();
  const problems: string[] = [];
  const kinds = new Set<string>();
  let problemCount = 0;
  /** Keeps the first problem of each kind (numbers and ids aside), counts them all. */
  const report = (turn: number, line: string) => {
    problemCount++;
    const kind = line.replace(/\d+/g, '#').replace(/\b[a-z]+_[a-z_]+\b/g, 'ID');
    if (kinds.has(kind) || problems.length >= 60) return;
    kinds.add(kind);
    problems.push(`turn ${turn}: ${line}`);
  };
  const rejected: Record<string, number> = {};
  const predictions = {
    gold: emptyPrediction(),
    science: emptyPrediction(),
    culture: emptyPrediction(),
    faith: emptyPrediction(),
    influence: emptyPrediction(),
  };
  const misses: { key: keyof typeof predictions; off: number; line: string }[] = [];
  const compare = (
    key: keyof typeof predictions,
    turn: number,
    player: string,
    promised: number,
    got: number,
  ) => {
    const p = predictions[key];
    p.n++;
    const off = Math.abs(promised - got);
    if (off === 0) p.exact++;
    if (off <= Math.max(100, Math.abs(promised) * 0.05)) p.close++;
    else
      misses.push({
        key,
        off,
        line: `turn ${turn} ${player}: promised ${promised / 100}, got ${got / 100}`,
      });
  };

  let state: GameState;
  try {
    state = createGame(setup, ctx);
  } catch (e) {
    return {
      config: {
        ...o,
        size: setup.settings.map.size,
        script: setup.settings.map.script,
        speed: setup.settings.speed!,
      },
      endTurn: 0,
      result: null,
      hash: '',
      seconds: (clock() - started) / 1000,
      problems: [`the game could not be created: ${(e as Error).message}`],
      problemCount: 1,
      rejected,
      roundTrips: 0,
      predictions,
    };
  }
  for (const line of checkInvariants(ctx, state)) report(state.turn, line);

  const every = o.roundTripEvery ?? 40;
  const ahead = o.roundTripTurns ?? 2;
  const limit = (setup.settings.turnLimit ?? 500) + 2;
  let roundTrips = 0;

  while (state.status === 'playing') {
    const turn = state.turn;
    // What each civ is promised for this turn, as its player sees it when the turn ends.
    const promised: Record<
      string,
      { gold: number; science: number; culture: number; faith: number; influence: number }
    > = {};
    let before: GameState | undefined;
    let next: GameState;
    try {
      next = playRound(
        ctx,
        state,
        (key) => (rejected[key] = (rejected[key] ?? 0) + 1),
        (s) => {
          before = s;
          for (const id of s.playerOrder) {
            const p = s.players[id]!;
            if (!p.alive || p.kind !== 'ai') continue;
            const sum = { science: 0, culture: 0, faith: 0 };
            for (const x of settlementsOf(s, id)) {
              const y = settlementYields(ctx, s, x).total;
              sum.science += y.science ?? 0;
              sum.culture += y.culture ?? 0;
              sum.faith += y.faith ?? 0;
            }
            promised[id] = {
              gold: goldForecast(ctx, s, id).total,
              influence: influencePerTurn(ctx, s, id),
              ...sum,
            };
          }
        },
      );
    } catch (e) {
      report(turn, `the engine threw: ${(e as Error).stack?.split('\n').slice(0, 4).join(' | ')}`);
      break;
    }
    if (next.turn === turn && next.status === 'playing') {
      report(turn, 'the turn is stuck: every seat played and no new turn began');
      break;
    }
    state = next;
    if (before) {
      for (const [id, want] of Object.entries(promised)) {
        const was = before.players[id]!;
        const now = state.players[id]!;
        if (!now.alive) continue;
        compare('gold', turn, id, want.gold, now.gold - was.gold);
        compare('faith', turn, id, want.faith, now.faith - was.faith);
        compare('influence', turn, id, want.influence, now.influence - was.influence);
        compare('science', turn, id, want.science, now.scienceRate);
        compare('culture', turn, id, want.culture, now.cultureRate);
      }
    }
    for (const line of checkInvariants(ctx, state)) report(state.turn, line);
    if (state.turn > limit) {
      report(state.turn, `the game is past its turn limit (${limit - 2})`);
      break;
    }
    // A saved game must go on exactly as the live one does.
    if (every > 0 && state.turn % every === 0 && state.status === 'playing') {
      roundTrips++;
      try {
        const loaded = JSON.parse(JSON.stringify(state)) as GameState;
        if (stateHash(loaded) !== stateHash(state))
          report(state.turn, 'a state saved and loaded hashes differently from the live one');
        let a = state;
        let b = loaded;
        for (let i = 0; i < ahead && a.status === 'playing'; i++) {
          a = playRound(ctx, a);
          b = playRound(ctx, b);
        }
        if (stateHash(a) !== stateHash(b))
          report(
            state.turn,
            `a saved and loaded game played ${ahead} turns on differs from the live one`,
          );
      } catch (e) {
        report(state.turn, `the save round trip threw: ${(e as Error).message}`);
      }
    }
  }

  // The widest misses of each kind, a few of each.
  for (const key of Object.keys(predictions) as (keyof typeof predictions)[])
    predictions[key].worst = misses
      .filter((m) => m.key === key)
      .sort((a, b) => b.off - a.off)
      .slice(0, 4)
      .map((m) => m.line);

  return {
    config: {
      ...o,
      size: setup.settings.map.size,
      script: setup.settings.map.script,
      speed: setup.settings.speed!,
    },
    endTurn: state.turn,
    result: state.result,
    hash: stateHash(state),
    seconds: Math.round((clock() - started) / 100) / 10,
    problems,
    problemCount,
    rejected,
    roundTrips,
    predictions,
  };
}

/** One line for a finished soak game, and its problems under it. */
export function soakLine(r: SoakResult): string[] {
  const c = r.config;
  const what = [
    `${c.players} civs`,
    c.size,
    c.script,
    c.speed.replace('speed_', ''),
    c.difficulty?.replace('difficulty_', ''),
    c.startEra?.replace('era_', ''),
    c.options ? `options ${JSON.stringify(c.options)}` : '',
    `seed ${c.seed}`,
  ]
    .filter(Boolean)
    .join(', ');
  const end = r.result ? `${r.result.reason} on turn ${r.endTurn}` : `stopped on turn ${r.endTurn}`;
  return [
    `${r.problemCount === 0 ? 'ok ' : 'BAD'} ${what}: ${end}, ${r.seconds}s${r.problemCount ? `, ${r.problemCount} problems` : ''}`,
    ...r.problems.map((p) => `      ${p}`),
  ];
}

/** The games of a soak: every size, script, speed, difficulty, start era and switch, in turn. */
export function soakMatrix(name: string): SoakOptions[] {
  const base: SoakOptions = { players: 6, seed: '1', size: 'small', script: 'continents' };
  const online = { speed: 'speed_online' };
  const scripts = [
    'continents',
    'pangaea',
    'archipelago',
    'fractal',
    'small_continents',
    'island_plates',
    'inland_sea',
    'continents_islands',
    'highlands',
    'lakes',
    'mirror',
    'shuffle',
  ];
  const off = (key: string) => ({ options: { [key]: false } });
  switch (name) {
    case 'smoke':
      return [{ ...base, players: 4, size: 'tiny', turns: 60, ...online, seed: 's1' }];
    case 'scripts':
      return scripts.map((script, i) => ({ ...base, ...online, script, seed: `sc${i}` }));
    case 'sizes':
      return [
        { players: 2, size: 'duel' },
        { players: 3, size: 'tiny' },
        { players: 4, size: 'tiny' },
        { players: 6, size: 'small' },
        { players: 8, size: 'standard' },
        { players: 10, size: 'large' },
        { players: 12, size: 'huge' },
        { players: 16, size: 'huge' },
      ].map((x, i) => ({ ...base, ...online, ...x, seed: `sz${i}` }));
    case 'speeds':
      return ['speed_online', 'speed_quick', 'speed_standard', 'speed_epic', 'speed_marathon'].map(
        (speed, i) => ({ ...base, players: 4, size: 'tiny', speed, seed: `sp${i}` }),
      );
    case 'difficulty':
      return [
        'difficulty_settler',
        'difficulty_chieftain',
        'difficulty_warlord',
        'difficulty_king',
        'difficulty_emperor',
        'difficulty_immortal',
        'difficulty_deity',
      ].map((difficulty, i) => ({ ...base, ...online, difficulty, seed: `d${i}` }));
    case 'eras':
      return [
        'era_classical',
        'era_medieval',
        'era_renaissance',
        'era_industrial',
        'era_modern',
        'era_atomic',
        'era_information',
      ].map((startEra, i) => ({ ...base, ...online, startEra, seed: `e${i}` }));
    case 'options':
      // Each switch off on its own, the optional one on, and everything off at once.
      return [
        ...[
          'camps',
          'cityStates',
          'huts',
          'disasters',
          'congress',
          'espionage',
          'loyalty',
          'nukes',
          'domination',
          'science',
          'culture',
          'religion',
          'diplomatic',
        ].map((key, i) => ({ ...base, ...online, ...off(key), seed: `o${i}` })),
        { ...base, ...online, options: { theologicalCombat: true }, seed: 'o-theo' },
        {
          ...base,
          ...online,
          seed: 'o-none',
          options: {
            camps: false,
            cityStates: false,
            huts: false,
            loyalty: false,
            espionage: false,
            congress: false,
            disasters: false,
            nukes: false,
            religion: false,
            diplomatic: false,
          },
        },
        {
          ...base,
          ...online,
          seed: 'o-score',
          // Every victory off: the game must run to the turn limit and end on score.
          options: {
            domination: false,
            science: false,
            culture: false,
            religion: false,
            diplomatic: false,
          },
        },
      ];
    case 'seeds':
      return Array.from({ length: 16 }, (_, i) => ({
        ...base,
        ...online,
        players: 4 + (i % 5),
        size: ['tiny', 'small', 'small', 'standard', 'standard'][i % 5]!,
        script: scripts[i % scripts.length]!,
        seed: `r${i}`,
      }));
    case 'all':
      return ['scripts', 'sizes', 'speeds', 'difficulty', 'eras', 'options', 'seeds'].flatMap(
        soakMatrix,
      );
    default:
      throw new Error(
        `Unknown soak "${name}" (smoke, scripts, sizes, speeds, difficulty, eras, options, seeds, all)`,
      );
  }
}
