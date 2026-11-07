import type { StatsOptions } from './stats';

/**
 * Named batches of all-AI games for `pnpm cx stats <preset>`. Each varies one thing around a
 * base setup (6 civs, a small continents map, Standard speed, Prince, Ancient start) so the
 * effect of each setting can be read on its own.
 */

const seeds = (n: number, from = 1) => Array.from({ length: n }, (_, i) => String(from + i));

export function statsPreset(name: string): StatsOptions[] {
  const base: StatsOptions = { players: 6, seed: '1', size: 'small', script: 'continents' };
  switch (name) {
    case 'smoke':
      return [{ ...base, players: 4, size: 'tiny', turns: 60 }];
    case 'speeds':
      return [
        ...seeds(4).map((seed) => ({ ...base, seed, speed: 'speed_online' })),
        ...seeds(4).map((seed) => ({ ...base, seed, speed: 'speed_quick' })),
        ...seeds(2).map((seed) => ({ ...base, seed, speed: 'speed_epic' })),
        ...seeds(1).map((seed) => ({ ...base, seed, speed: 'speed_marathon' })),
      ];
    case 'sizes':
      return [
        ...seeds(3).map((seed) => ({
          ...base,
          seed,
          players: 2,
          size: 'duel',
          speed: 'speed_online',
        })),
        ...seeds(3).map((seed) => ({
          ...base,
          seed,
          players: 4,
          size: 'tiny',
          speed: 'speed_online',
        })),
        ...seeds(3).map((seed) => ({
          ...base,
          seed,
          players: 6,
          size: 'small',
          speed: 'speed_online',
        })),
        ...seeds(3).map((seed) => ({
          ...base,
          seed,
          players: 8,
          size: 'standard',
          speed: 'speed_online',
        })),
        ...seeds(2).map((seed) => ({
          ...base,
          seed,
          players: 10,
          size: 'large',
          speed: 'speed_online',
        })),
        ...seeds(2).map((seed) => ({
          ...base,
          seed,
          players: 12,
          size: 'huge',
          speed: 'speed_online',
        })),
      ];
    case 'scripts':
      return [
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
      ].flatMap((script) =>
        seeds(2).map((seed) => ({ ...base, seed, script, speed: 'speed_online' })),
      );
    case 'difficulty':
      // Seat p01 plays at Prince (no bonuses); the rest at the level, so p01's place shows
      // what the level's bonuses are worth.
      return [
        'difficulty_settler',
        'difficulty_warlord',
        'difficulty_prince',
        'difficulty_king',
        'difficulty_emperor',
        'difficulty_deity',
      ].flatMap((difficulty) =>
        seeds(3).map((seed) => ({
          ...base,
          seed,
          difficulty,
          probe: 'difficulty_prince',
          speed: 'speed_online',
        })),
      );
    case 'eras':
      return [
        'era_classical',
        'era_medieval',
        'era_renaissance',
        'era_industrial',
        'era_modern',
        'era_atomic',
        'era_information',
      ].flatMap((startEra) =>
        seeds(2).map((seed) => ({ ...base, seed, startEra, speed: 'speed_online' })),
      );
    case 'standard':
      // Full-length Standard games: the main reference for pace and victories.
      return seeds(6).map((seed) => ({ ...base, seed, speed: 'speed_standard' }));
    case 'options-off':
      // Every optional system off: the core game alone must still finish and play well.
      return seeds(3).map((seed) => ({
        ...base,
        seed,
        speed: 'speed_online',
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
      }));
    default:
      throw new Error(`Unknown stats preset "${name}"`);
  }
}
