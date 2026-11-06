import type { Personality } from '@cx/content';
import type { EngineContext } from '../context';
import type { GameState, PlayerId } from '../state';

/**
 * Victory plans (D121): a leader whose temperament leans hard toward culture or faith plays for
 * that victory, so all-AI games don't all end in the space race. The plan shifts what the AI
 * values (more culture and much more tourism; or more faith) and a few choices made elsewhere:
 * great work buildings and Theater Squares, open borders (ai/cities.ts, ai/diplomacy.ts); more
 * preachers, sent to other civs first (ai/religion.ts).
 */
export type VictoryPlan = 'culture' | 'religion' | null;

/** The lean (personality traits run 0–10) that makes a plan. */
const CULTURE_LEAN = 8;
const FAITH_LEAN = 7;

/** A personality as a plan bends it; `tourismFocus` multiplies tourism's weight. */
export interface PlannedPersonality extends Personality {
  tourismFocus?: number;
}

/** The victory a player's AI plays for, if any (only victories that are on in this game). */
export function victoryPlan(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  me: Personality,
): VictoryPlan {
  const p = state.players[player];
  if (!p || p.kind === 'cityState') return null;
  const culture =
    state.settings.culture !== false && me.culture >= CULTURE_LEAN && me.culture >= me.science;
  // A religious victory needs a religion of one's own.
  const religion =
    state.settings.religion !== false && p.religion !== null && me.faith >= FAITH_LEAN;
  if (culture && religion) return me.faith > me.culture ? 'religion' : 'culture';
  return culture ? 'culture' : religion ? 'religion' : null;
}

/** The personality the AI plays with under a plan. */
export function withPlan(me: Personality, plan: VictoryPlan): PlannedPersonality {
  const up = (n: number, by: number) => Math.min(10, n + by);
  if (plan === 'culture')
    return { ...me, culture: up(me.culture, 2), wonders: up(me.wonders, 2), tourismFocus: 4 };
  if (plan === 'religion') return { ...me, faith: up(me.faith, 3) };
  return me;
}
