import type { EngineContext } from './context';
import type { Fixed } from './fixed';
import type { GameState } from './state';

/** The speed a game uses when its settings don't name one. */
export const DEFAULT_SPEED = 'speed_standard';

/**
 * How much everything costs at this game's speed, in percent of standard (docs/02-multiplayer.md,
 * "Game setup"): research, civics, production, growth, borders, great people and faith.
 */
export function speedPercent(ctx: EngineContext, state: Pick<GameState, 'settings'>): number {
  const id = state.settings.speed ?? DEFAULT_SPEED;
  return ctx.content.entities.gameSpeed?.[id]?.costPercent ?? 100;
}

/** A cost (hundredths, or whole points) at this game's speed. */
export function scaleCost(
  ctx: EngineContext,
  state: Pick<GameState, 'settings'>,
  cost: Fixed,
): Fixed {
  const percent = speedPercent(ctx, state);
  return percent === 100 ? cost : Math.floor((cost * percent) / 100);
}
