import { resolveText } from '@cx/content';
import type { EngineContext } from '../context';
import { toFixed } from '../fixed';
import { memoRead } from '../progress/sources';
import type { GameState, PlayerId } from '../state';

/**
 * Ideologies (D118, light; docs/04-advanced-systems.md, "Tourism & great works"): the late
 * governments fall into camps (`rules.ideology.camps`). Visitors from civs of another camp
 * unsettle a civ's citizens: −1 happiness in every settlement for each `stepPercent` of its
 * domestic tourists they make up together, up to `maxUnhappiness`. While a civ of its own camp
 * has at least one step on it, +`sharedHappiness` instead. Civs outside every camp feel nothing.
 */

export interface IdeologyCamp {
  id: string;
  name: string;
}

/** The camp a government belongs to, if any. */
export function campOfGovernment(ctx: EngineContext, government: string): IdeologyCamp | undefined {
  const camp = ctx.content.rules.ideology.camps.find((c) => c.governments.includes(government));
  return camp ? { id: camp.id, name: resolveText(ctx.content, camp.name) } : undefined;
}

/** A player's camp (from their government), if any. */
export function campOf(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
): IdeologyCamp | undefined {
  const p = state.players[player];
  return p ? campOfGovernment(ctx, p.government) : undefined;
}

/** How much a civ's visitors weigh on another: percent of the other's domestic tourists. */
export function culturalWeight(
  ctx: EngineContext,
  state: GameState,
  from: PlayerId,
  on: PlayerId,
): number {
  const r = ctx.content.rules.culture;
  const visiting = Math.floor((state.tourism[from]?.[on] ?? 0) / toFixed(r.tourismPerTourist));
  const domestic = Math.floor(
    (state.players[on]?.lifetimeCulture ?? 0) / toFixed(r.culturePerTourist),
  );
  return Math.floor((visiting * 100) / Math.max(1, domestic));
}

export interface IdeologyPressure {
  camp: IdeologyCamp;
  /** Per settlement: negative from rival camps, positive from a friendly one. */
  happiness: number;
  /** The rival-camp civs pressing (percent each), heaviest first. */
  rivals: { player: PlayerId; percent: number }[];
}

/** The ideological pressure on a player, or undefined if they're in no camp. */
export function ideologyPressure(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
): IdeologyPressure | undefined {
  return memoRead(state, `ideology:${player}`, () => computePressure(ctx, state, player));
}

/** The happiness per settlement a player would feel under `government` (the AI weighs it). */
export function ideologyHappinessUnder(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  government: string,
): number {
  const camp = campOfGovernment(ctx, government);
  return camp ? (computePressure(ctx, state, player, camp)?.happiness ?? 0) : 0;
}

function computePressure(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  as?: IdeologyCamp,
): IdeologyPressure | undefined {
  const camp = as ?? campOf(ctx, state, player);
  if (!camp) return undefined;
  const r = ctx.content.rules.ideology;
  const rivals: { player: PlayerId; percent: number }[] = [];
  let friendly = false;
  for (const other of state.playerOrder) {
    if (other === player || !state.players[other]?.alive) continue;
    const theirs = campOf(ctx, state, other);
    if (!theirs) continue;
    const percent = culturalWeight(ctx, state, other, player);
    if (theirs.id === camp.id) friendly ||= percent >= r.stepPercent;
    else if (percent > 0) rivals.push({ player: other, percent });
  }
  rivals.sort((a, b) => b.percent - a.percent || (a.player < b.player ? -1 : 1));
  const total = rivals.reduce((n, x) => n + x.percent, 0);
  const steps = Math.min(r.maxUnhappiness, Math.floor(total / r.stepPercent));
  const happiness = steps > 0 ? -steps : friendly ? r.sharedHappiness : 0;
  return { camp, happiness, rivals };
}

/** The happiness line for one settlement of `player`, if any. */
export function ideologyLine(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
): { label: string; amount: number } | undefined {
  const p = ideologyPressure(ctx, state, player);
  if (!p || p.happiness === 0) return undefined;
  if (p.happiness > 0) return { label: `Shared ideology (${p.camp.name})`, amount: p.happiness };
  const who = p.rivals
    .slice(0, 2)
    .map((x) => state.players[x.player]?.name ?? x.player)
    .join(', ');
  return { label: `Ideological pressure (${who})`, amount: p.happiness };
}
