import { type CityStateDef, type CityStateTypeDef, resolveText } from '@cx/content';
import { atWar, type EngineContext, type RuleError } from '../context';
import type { EffectSource } from '../effects/yields';
import { toFixed } from '../fixed';
import type { CityStateState, GameState, PlayerId, SettlementState } from '../state';
import { countsAs } from '../uniques';

/**
 * City-states (docs/04-advanced-systems.md, "Independent powers"): one-settlement powers outside
 * the turn order. Players send them envoys (free ones from civics, quests and meeting them
 * first, or for influence); envoys unlock their kind's bonuses at 1, 3 and 6, and the player
 * with the most (at least 3) is their suzerain and gets their own bonus.
 */

export const cityStateIds = (state: Pick<GameState, 'cityStates'>): PlayerId[] =>
  Object.keys(state.cityStates).sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)));

export const isCityState = (state: GameState, player: PlayerId) =>
  state.players[player]?.kind === 'cityState';

export function cityStateDef(ctx: EngineContext, cs: CityStateState): CityStateDef {
  return ctx.content.entities.cityState[cs.def]!;
}

export function cityStateType(ctx: EngineContext, cs: CityStateState): CityStateTypeDef {
  return ctx.content.entities.cityStateType[cityStateDef(ctx, cs).cityStateType]!;
}

/** The city-state's own settlement (its capital), if it still has it. */
export function cityStateSettlement(
  state: GameState,
  player: PlayerId,
): SettlementState | undefined {
  const id = state.players[player]?.capital;
  return id ? state.settlements[id] : undefined;
}

export const envoysOf = (state: GameState, cs: PlayerId, player: PlayerId) =>
  state.cityStates[cs]?.envoys[player] ?? 0;

/**
 * Who should lead a city-state now: the most envoys, at least `suzerainEnvoys`. A tie keeps the
 * current suzerain if they're in it, and otherwise leaves it without one.
 */
export function suzerainFor(ctx: EngineContext, cs: CityStateState): PlayerId | null {
  const min = ctx.content.rules.cityStates.suzerainEnvoys;
  let best = 0;
  let leaders: PlayerId[] = [];
  for (const [p, n] of Object.entries(cs.envoys).sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (n > best) {
      best = n;
      leaders = [p];
    } else if (n === best) leaders.push(p);
  }
  if (best < min) return null;
  if (leaders.length === 1) return leaders[0]!;
  return cs.suzerain !== null && leaders.includes(cs.suzerain) ? cs.suzerain : null;
}

/** Why a player can't send an envoy to this city-state now, or undefined. */
export function envoyProblem(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  target: PlayerId,
): RuleError | undefined {
  const p = state.players[player];
  if (!p?.alive || !state.playerOrder.includes(player))
    return { code: 'not_playing', message: `${player} is not playing` };
  const cs = state.cityStates[target];
  if (!cs || !state.players[target]?.alive)
    return { code: 'no_city_state', message: 'No such city-state' };
  if (!cs.met.includes(player))
    return { code: 'not_met', message: "You haven't met that city-state yet" };
  if (atWar(state, player, target)) return { code: 'at_war', message: "You're at war with them" };
  if (p.envoys > 0) return undefined;
  const cost = toFixed(ctx.content.rules.cityStates.envoyInfluence);
  if (p.influence < cost)
    return { code: 'no_influence', message: `Needs ${Math.ceil(cost / 100)} influence` };
  return undefined;
}

export interface Quest {
  id: 'district' | 'route';
  text: string;
}

/** What a city-state asks of every player (each pays `questEnvoys` envoys, once). */
export function questsOf(ctx: EngineContext, state: GameState, target: PlayerId): Quest[] {
  const cs = state.cityStates[target];
  if (!cs) return [];
  const type = cityStateType(ctx, cs);
  const out: Quest[] = [];
  if (type.district) {
    const name = resolveText(ctx.content, ctx.content.entities.district[type.district]?.name ?? '');
    out.push({ id: 'district', text: `Build ${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}` });
  }
  out.push({ id: 'route', text: 'Send a trade route here' });
  return out;
}

/** Whether a player has done what a quest asks (right now). */
export function questMet(
  ctx: EngineContext,
  state: GameState,
  target: PlayerId,
  player: PlayerId,
  quest: Quest['id'],
): boolean {
  if (quest === 'route') {
    const home = cityStateSettlement(state, target);
    return !!home && state.routes.some((r) => r.owner === player && r.to === home.id);
  }
  const district = cityStateType(ctx, state.cityStates[target]!).district;
  return (
    !!district &&
    Object.values(state.settlements).some(
      (s) =>
        s.owner === player && s.districts.some((d) => countsAs(ctx, 'district', d.id, district)),
    )
  );
}

/** The bonuses a player has from one city-state: each tier reached, and suzerainty. */
export function bonusesFrom(
  ctx: EngineContext,
  state: GameState,
  target: PlayerId,
  player: PlayerId,
): { label: string; description: string; effects: EffectSource['effects'] }[] {
  const cs = state.cityStates[target];
  if (!cs || !state.players[target]?.alive) return [];
  const t = (text: string) => resolveText(ctx.content, text);
  const def = cityStateDef(ctx, cs);
  const type = cityStateType(ctx, cs);
  const envoys = cs.envoys[player] ?? 0;
  const out = type.tiers
    .filter((tier) => envoys >= tier.envoys)
    .map((tier) => ({
      label: `${t(def.name)} (${t(type.name)}, ${tier.envoys})`,
      description: t(tier.description),
      effects: tier.effects,
    }));
  if (cs.suzerain === player)
    out.push({
      label: `${t(def.name)}: ${t(def.suzerain.name)}`,
      description: t(def.suzerain.description),
      effects: def.suzerain.effects,
    });
  return out;
}

const sourceCache = new WeakMap<object, Map<PlayerId, EffectSource[]>>();

/** Effects a player has from city-states (cached per frozen city-states object). */
export function cityStateSources(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
): EffectSource[] {
  if (!state.cityStates) return [];
  const frozen = Object.isFrozen(state.cityStates);
  const cached = frozen ? sourceCache.get(state.cityStates)?.get(player) : undefined;
  if (cached) return cached;
  const out: EffectSource[] = [];
  for (const id of cityStateIds(state)) {
    for (const b of bonusesFrom(ctx, state, id, player))
      if (b.effects.length > 0)
        out.push({ id: `${id}:${b.label}`, label: b.label, effects: b.effects });
  }
  if (frozen) {
    const byPlayer = sourceCache.get(state.cityStates) ?? new Map<PlayerId, EffectSource[]>();
    byPlayer.set(player, out);
    sourceCache.set(state.cityStates, byPlayer);
  }
  return out;
}
