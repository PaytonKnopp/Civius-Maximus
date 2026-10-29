import type { CompiledContent } from '@cx/content';
import type { GameSetup, MapSettings } from '@cx/engine';

/**
 * Game setup (docs/02-multiplayer.md, "Game setup"): what the setup screen edits and how it
 * becomes an engine `GameSetup`. Seats are the humans first, then the AI rivals; each seat can
 * pick a leader (or leave it random), a team and (AI) its own difficulty.
 */

export interface SeatPick {
  /** A `leader` content id; absent = random. */
  leader?: string;
  /** Team number; absent = no team. */
  team?: number;
  /** AI seats only: a `difficulty` for this seat (absent = the game's). */
  difficulty?: string;
}

export interface NewGameOptions {
  script: string;
  size: string;
  /** Human players' names: one for single player, more for hotseat. */
  humans: string[];
  rivals: number;
  seed: string;
  wrapX: boolean;
  resources: MapSettings['resources'];
  startBalance?: MapSettings['startBalance'];
  /** World settings (standard when absent). */
  age?: NonNullable<MapSettings['age']>;
  temperature?: NonNullable<MapSettings['temperature']>;
  rainfall?: NonNullable<MapSettings['rainfall']>;
  seaLevel?: NonNullable<MapSettings['seaLevel']>;
  camps: boolean;
  domination: boolean;
  religion: boolean;
  cityStates: boolean;
  science: boolean;
  culture: boolean;
  /** Settlements can break away when their loyalty runs out. */
  loyalty: boolean;
  /** Spies and their missions. */
  espionage: boolean;
  /** The World Congress, and the diplomatic victory it leads to. */
  congress: boolean;
  diplomatic: boolean;
  /** Natural disasters and climate change. */
  disasters: boolean;
  /** Nuclear weapons. */
  nukes: boolean;
  turnLimit: number | null;
  speed: string;
  difficulty: string;
  /** An `era` content id (the first era when absent). */
  startEra?: string;
  /** Per seat (humans first, then rivals), by seat index. */
  picks?: Record<number, SeatPick>;
}

export const randomSeed = () => Math.random().toString(36).slice(2, 8);

export const DEFAULT_OPTIONS: NewGameOptions = {
  script: 'continents',
  size: 'small',
  humans: ['You'],
  rivals: 3,
  seed: randomSeed(),
  wrapX: true,
  resources: 'standard',
  startBalance: 'normal',
  camps: true,
  domination: true,
  religion: true,
  cityStates: true,
  science: true,
  culture: true,
  loyalty: true,
  espionage: true,
  congress: true,
  diplomatic: true,
  disasters: true,
  nukes: true,
  turnLimit: null,
  speed: 'speed_standard',
  difficulty: 'difficulty_prince',
};

export function makeSetup(o: NewGameOptions): GameSetup {
  const pick = (i: number) => o.picks?.[i] ?? {};
  const seat = (i: number) => {
    const p = pick(i);
    return {
      ...(p.leader ? { leader: p.leader } : {}),
      ...(p.team !== undefined ? { team: p.team } : {}),
    };
  };
  return {
    gameId: `local-${o.seed}`,
    settings: {
      seed: o.seed,
      camps: o.camps,
      domination: o.domination,
      religion: o.religion,
      cityStates: o.cityStates,
      science: o.science,
      culture: o.culture,
      ...(o.loyalty === false ? { loyalty: false } : {}),
      ...(o.espionage === false ? { espionage: false } : {}),
      ...(o.congress === false ? { congress: false } : {}),
      ...(o.diplomatic === false ? { diplomatic: false } : {}),
      ...(o.disasters === false ? { disasters: false } : {}),
      ...(o.nukes === false ? { nukes: false } : {}),
      turnLimit: o.turnLimit,
      speed: o.speed,
      difficulty: o.difficulty,
      ...(o.startEra && o.startEra !== 'era_ancient' ? { startEra: o.startEra } : {}),
      map: {
        script: o.script,
        size: o.size,
        wrapX: o.wrapX,
        resources: o.resources,
        startBalance: o.startBalance ?? 'normal',
        ...(o.age && o.age !== 'standard' ? { age: o.age } : {}),
        ...(o.temperature && o.temperature !== 'standard' ? { temperature: o.temperature } : {}),
        ...(o.rainfall && o.rainfall !== 'standard' ? { rainfall: o.rainfall } : {}),
        ...(o.seaLevel && o.seaLevel !== 'standard' ? { seaLevel: o.seaLevel } : {}),
      },
    },
    players: [
      ...o.humans.map((name, i) => ({
        id: `p${i + 1}`,
        name: name.trim() || `Player ${i + 1}`,
        kind: 'human' as const,
        ...seat(i),
      })),
      ...Array.from({ length: o.rivals }, (_, k) => {
        const i = o.humans.length + k;
        const difficulty = pick(i).difficulty;
        return {
          id: `p${i + 1}`,
          name: `Rival ${k + 1}`,
          kind: 'ai' as const,
          ...seat(i),
          ...(difficulty ? { difficulty } : {}),
        };
      }),
    ],
  };
}

// --- Presets ---------------------------------------------------------------------------------

export interface Preset {
  name: string;
  description: string;
  options: Partial<NewGameOptions>;
}

/** Built-in presets: common ways to play, one click each. */
export const PRESETS: Preset[] = [
  {
    name: 'Standard',
    description: 'A small map, three rivals, every victory on.',
    options: { size: 'small', rivals: 3, speed: 'speed_standard', startEra: 'era_ancient' },
  },
  {
    name: 'Duel',
    description: 'You and one rival on a tiny map, at the fast online speed.',
    options: { size: 'tiny', rivals: 1, speed: 'speed_online', cityStates: true },
  },
  {
    name: 'Grand empire',
    description: 'A large map with seven rivals at epic speed.',
    options: { size: 'large', rivals: 7, speed: 'speed_epic' },
  },
  {
    name: 'Conquest',
    description: 'Only domination wins: hold every rival capital. No camps to distract you.',
    options: { domination: true, religion: false, science: false, culture: false, camps: false },
  },
  {
    name: 'Peaceful builder',
    description: 'No domination victory and no camps: build, research, and outshine the world.',
    options: { domination: false, camps: false, religion: true, science: true, culture: true },
  },
  {
    name: 'Renaissance start',
    description: 'Begin in the Renaissance with three cities’ worth of settlers and an army.',
    options: { startEra: 'era_renaissance', size: 'standard', rivals: 5 },
  },
];

const KEY = 'cx-setup';
const PRESETS_KEY = 'cx-presets';

/** The last setup used, so the screen opens where you left it. */
export function loadLastOptions(): Partial<NewGameOptions> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<NewGameOptions>;
  } catch {
    return {};
  }
}

export function saveLastOptions(o: NewGameOptions) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...o, seed: undefined }));
  } catch {
    // Not saved.
  }
}

export function loadPresets(): Preset[] {
  try {
    return JSON.parse(localStorage.getItem(PRESETS_KEY) ?? '[]') as Preset[];
  } catch {
    return [];
  }
}

export function savePresets(list: Preset[]) {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(list));
  } catch {
    // Not saved.
  }
}

/** Keeps saved options valid against the current content (ids can disappear between versions). */
export function sanitize(content: CompiledContent, o: NewGameOptions): NewGameOptions {
  const e = content.entities;
  const ok = (map: Record<string, unknown>, id: string | undefined, fallback: string) =>
    id && map[id] ? id : fallback;
  const picks: Record<number, SeatPick> = {};
  for (const [i, p] of Object.entries(o.picks ?? {})) {
    const clean: SeatPick = {};
    if (p.leader && e.leader[p.leader]) clean.leader = p.leader;
    if (p.team !== undefined) clean.team = p.team;
    if (p.difficulty && e.difficulty[p.difficulty]) clean.difficulty = p.difficulty;
    picks[Number(i)] = clean;
  }
  return {
    ...o,
    script: ok(e.mapScript, o.script, DEFAULT_OPTIONS.script),
    size: ok(e.mapSize, o.size, DEFAULT_OPTIONS.size),
    speed: ok(e.gameSpeed, o.speed, DEFAULT_OPTIONS.speed),
    difficulty: ok(e.difficulty, o.difficulty, DEFAULT_OPTIONS.difficulty),
    ...(o.startEra ? { startEra: ok(e.era, o.startEra, 'era_ancient') } : {}),
    picks,
  };
}
