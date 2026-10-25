import {
  atWar,
  type EngineContext,
  type GameState,
  HOSTILE,
  pantheonOf,
  type PlayerId,
  toFixed,
  unitDef,
} from '@cx/engine';
import type { NextAction } from './model';

/**
 * First-game hints: one short note the first time something this game does its own way comes up.
 * Players know Civ (docs/06-ui-ux.md), so these only cover what differs, and one click turns
 * them off. What's been seen is kept in this browser only.
 */
export interface Hint {
  id: string;
  text: (ctx: EngineContext) => string;
  when: (f: HintFacts) => boolean;
}

interface HintFacts {
  ctx: EngineContext;
  state: GameState;
  viewer: PlayerId;
  next: NextAction;
}

export const HINTS: Hint[] = [
  {
    id: 'welcome',
    when: () => true,
    text: () =>
      'The button at the bottom always does the next thing that needs you (or press Enter). The ? button lists every shortcut.',
  },
  {
    id: 'develop',
    when: ({ next }) => next.kind === 'develop',
    text: () =>
      'Your settlement grew. There are no builders: each new citizen develops one tile (a farm, a mine…) and works it at once. Unclaimed tiles touching your land count too.',
  },
  {
    id: 'town',
    when: ({ state, viewer }) =>
      Object.values(state.settlements).some((s) => s.owner === viewer && s.kind === 'town'),
    text: (ctx) =>
      `Settlements after your capital start as towns: no build queue, their production becomes gold. At ${ctx.content.rules.settlements.specialization.minPopulation} citizens a town picks a specialization, or you can pay gold to make it a city.`,
  },
  {
    id: 'policies',
    when: ({ next }) => next.kind === 'policies',
    text: () =>
      'A finished civic lets you change policy cards for free this turn; at other times new cards cost gold.',
  },
  {
    id: 'lenses',
    when: ({ state }) => state.turn >= 6,
    text: () => 'L cycles map lenses: tile yields, the best places to settle, resources, religion.',
  },
  {
    id: 'commander',
    when: ({ ctx, state, viewer }) =>
      Object.values(state.units).some((u) => u.owner === viewer && unitDef(ctx, u).commander),
    text: () =>
      'Commanders pack nearby units and move them as one, make units around them stronger, and retreat instead of being captured.',
  },
  {
    id: 'envoys',
    when: ({ state, viewer }) => state.players[viewer]!.envoys > 0,
    text: (ctx) =>
      `You have envoys to send (I). Each city-state rewards your envoys there at a few levels, and whoever has the most (at least ${ctx.content.rules.cityStates.suzerainEnvoys}) becomes its suzerain.`,
  },
  {
    id: 'pantheon',
    when: ({ ctx, state, viewer }) =>
      state.settings.religion !== false &&
      state.players[viewer]!.faith >= toFixed(ctx.content.rules.religion.pantheonFaith) &&
      !pantheonOf(ctx, state, viewer),
    text: () =>
      'You have enough faith for a pantheon (R). Holy Sites earn prophet points toward founding a religion.',
  },
  {
    id: 'war',
    when: ({ state, viewer }) =>
      state.playerOrder.some(
        (p) => p !== viewer && p !== HOSTILE && state.players[p]!.alive && atWar(state, viewer, p),
      ),
    text: (ctx) =>
      `You are at war. Peace can be offered after ${ctx.content.rules.combat.minWarTurns} turns (click their name at the top right). Losses lower war support, and falling behind on it costs happiness.`,
  },
  {
    id: 'victories',
    when: ({ state }) => state.turn >= 40,
    text: () => 'V shows everyone’s progress toward each victory, and H the graphs.',
  },
];

const SEEN = 'cx.hints.seen';
const OFF = 'cx.hints.off';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage blocked: hints just come back next time.
  }
}

export const hintsOn = () => read(OFF) !== '1';

export function seenHints(): Set<string> {
  return new Set((read(SEEN) ?? '').split(',').filter(Boolean));
}

export function markSeen(id: string) {
  const seen = seenHints();
  seen.add(id);
  write(SEEN, [...seen].join(','));
}

/** Turns hints on (from the start again) or off. */
export function setHints(on: boolean) {
  write(OFF, on ? null : '1');
  if (on) write(SEEN, null);
}

/** The first hint that applies now and hasn't been seen. */
export function hintFor(f: HintFacts, seen: Set<string>): Hint | undefined {
  return HINTS.find((h) => !seen.has(h.id) && h.when(f));
}
