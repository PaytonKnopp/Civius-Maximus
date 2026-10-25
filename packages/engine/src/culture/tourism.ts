import type { Draft } from 'immer';
import { getBit } from '../bitset';
import type { EngineContext, Emit } from '../context';
import { areAllies, areFriends } from '../diplomacy/rules';
import { view } from '../draft';
import { toFixed } from '../fixed';
import type { GameState, PlayerId } from '../state';
import { tradePartners } from '../trade/rules';
import { exploredBits } from '../units/vision';
import { endGame, teamOf } from '../victory';

/**
 * Culture victory (docs/04-advanced-systems.md, "Tourism & great works"): every civ has domestic
 * tourists (all the culture it has ever earned) and draws visiting tourists from each civ it
 * has met (all the tourism it has sent toward that civ). A civ wins when, for every other civ,
 * its visitors from there outnumber that civ's domestic tourists.
 */

export interface TourismLine {
  label: string;
  percent: number;
}

/** How much more of a player's tourism reaches another civ, and why. */
export function tourismBonus(
  ctx: EngineContext,
  state: GameState,
  from: PlayerId,
  to: PlayerId,
): TourismLine[] {
  const r = ctx.content.rules.culture;
  const out: TourismLine[] = [];
  if (tradePartners(state, from, to))
    out.push({ label: 'Trade route', percent: r.tradeRoutePercent });
  const religionOf = (p: PlayerId) => {
    const capital = state.players[p]?.capital;
    return capital ? (state.settlements[capital]?.religion ?? null) : null;
  };
  const shared = religionOf(from);
  if (shared !== null && shared === religionOf(to))
    out.push({ label: 'Shared religion', percent: r.religionPercent });
  if (areFriends(state, from, to) || areAllies(state, from, to))
    out.push({ label: 'Friends', percent: r.friendsPercent });
  return out.filter((l) => l.percent !== 0);
}

export const domesticTourists = (ctx: EngineContext, state: GameState, player: PlayerId) =>
  Math.floor(
    state.players[player]!.lifetimeCulture / toFixed(ctx.content.rules.culture.culturePerTourist),
  );

export const visitingTourists = (
  ctx: EngineContext,
  state: GameState,
  from: PlayerId,
  to: PlayerId,
) =>
  Math.floor(
    (state.tourism[from]?.[to] ?? 0) / toFixed(ctx.content.rules.culture.tourismPerTourist),
  );

/** For every other team's living civ: tourists visiting from it, and its own domestic ones. */
export function cultureProgress(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
): { player: PlayerId; visiting: number; domestic: number }[] {
  const team = new Set(teamOf(state, player));
  return state.playerOrder
    .filter((p) => !team.has(p) && state.players[p]!.alive)
    .map((p) => ({
      player: p,
      visiting: visitingTourists(ctx, state, player, p),
      domestic: domesticTourists(ctx, state, p),
    }));
}

export function hasCultureVictory(ctx: EngineContext, state: GameState, player: PlayerId) {
  const progress = cultureProgress(ctx, state, player);
  return progress.length > 0 && progress.every((x) => x.visiting > x.domestic);
}

/**
 * End of each turn (after the civs' settlements): each civ's tourism goes out to every civ it
 * has met (one of whose settlements it has seen), more with the bonuses; then a civ may win.
 */
export function cultureTurn(draft: Draft<GameState>, ctx: EngineContext, emit: Emit) {
  const snap = view(draft);
  const alive = snap.playerOrder.filter((p) => snap.players[p]!.alive);
  const homes = new Map<PlayerId, number[]>();
  for (const s of Object.values(snap.settlements)) {
    const list = homes.get(s.owner) ?? [];
    list.push(s.tile);
    homes.set(s.owner, list);
  }
  for (const from of alive) {
    const tourism = snap.players[from]!.tourismRate;
    if (tourism <= 0) continue;
    const explored = exploredBits(snap, from);
    for (const to of alive) {
      if (to === from || !(homes.get(to) ?? []).some((t) => getBit(explored, t))) continue;
      const percent = 100 + tourismBonus(ctx, snap, from, to).reduce((n, l) => n + l.percent, 0);
      const row = (draft.tourism[from] ??= {});
      row[to] = (row[to] ?? 0) + Math.floor((tourism * percent) / 100);
    }
  }
  if (draft.status !== 'playing' || draft.settings.culture === false) return;
  for (const id of alive) {
    if (hasCultureVictory(ctx, view(draft), id)) {
      endGame(draft, 'culture', id, emit);
      return;
    }
  }
}
