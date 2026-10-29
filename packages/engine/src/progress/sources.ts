import { type Effect, resolveText, type SlotKind } from '@cx/content';
import { cityStateSources } from '../citystates/rules';
import type { EngineContext } from '../context';
import { evaluateCondition } from '../effects/conditions';
import type { PlayerFacts, SettlementFacts } from '../effects/tile';
import type { EffectSource } from '../effects/yields';
import { tileTouchesRiver } from '../map/hex';
import type { GameState, PlayerId, PlayerState, SettlementState, Track } from '../state';
import { ageSources } from '../eras/ages';
import { governorOf, governorSources } from '../governors/governors';

/**
 * Where a player's effects come from (docs/05-modding.md, "The effects system"): their
 * government, slotted policy cards, a running celebration, and finished techs and civics with
 * effects, the leader's and civ's abilities. Later: beliefs, great people.
 */

export const SLOT_KINDS: readonly SlotKind[] = ['military', 'economic', 'diplomatic', 'wildcard'];

/** The starting progress fields of a new player. */
export function newProgress(
  ctx: EngineContext,
): Pick<
  PlayerState,
  'techs' | 'civics' | 'government' | 'policies' | 'policyWindow' | 'celebration'
> {
  const track = (): Track => ({
    done: [],
    current: null,
    queue: [],
    progress: {},
    boosted: [],
    stored: 0,
  });
  return {
    techs: track(),
    civics: track(),
    government: ctx.content.rules.progress.startingGovernment,
    policies: { military: [], economic: [], diplomatic: [], wildcard: [] },
    policyWindow: true,
    celebration: { store: 0, count: 0, turnsLeft: 0 },
  };
}

export function playerFacts(ctx: EngineContext, p: PlayerState): PlayerFacts {
  return {
    techs: p.techs.done,
    civics: p.civics.done,
    government: p.government,
    celebrating: p.celebration.turnsLeft > 0,
    eraOrder: eraOrderOf(ctx, p),
  };
}

/** Era order by finished-techs list, then finished-civics list (both frozen and shared). */
const eraCache = new WeakMap<object, WeakMap<object, number>>();

/** The order of the latest era among the player's finished techs and civics. */
function eraOrderOf(ctx: EngineContext, p: PlayerState): number {
  const cached = eraCache.get(p.techs.done)?.get(p.civics.done);
  if (cached !== undefined) return cached;
  const e = ctx.content.entities;
  let best = 0;
  for (const id of p.techs.done) best = Math.max(best, e.era[e.tech[id]?.era ?? '']?.order ?? 0);
  for (const id of p.civics.done) best = Math.max(best, e.era[e.civic[id]?.era ?? '']?.order ?? 0);
  if (Object.isFrozen(p.techs.done) && Object.isFrozen(p.civics.done)) {
    const byCivics = eraCache.get(p.techs.done) ?? new WeakMap<object, number>();
    byCivics.set(p.civics.done, best);
    eraCache.set(p.techs.done, byCivics);
  }
  return best;
}

export function settlementFacts(state: GameState, s: SettlementState): SettlementFacts {
  return {
    kind: s.kind,
    capital: s.capital,
    population: s.population,
    buildings: s.buildings,
    districts: s.districts.map((d) => d.id),
    onRiver: tileTouchesRiver(state.map, state.map.tiles, s.tile),
    unitsTrained: s.unitsTrained,
    ...(governorOf(state, s.id) ? { governor: governorOf(state, s.id)! } : {}),
  };
}

const sourceCache = new WeakMap<PlayerState, EffectSource[]>();

/** Every effect source active for a player, in a stable order (cached per player state). */
export function activeSources(ctx: EngineContext, p: PlayerState): EffectSource[] {
  const cached = sourceCache.get(p);
  if (cached) return cached;
  const { content } = ctx;
  const out: EffectSource[] = [];
  // The leader's and the civ's abilities.
  const leader = content.entities.leader[p.leader];
  if (leader && leader.ability.effects.length > 0)
    out.push({
      id: leader.id,
      label: resolveText(content, leader.ability.name),
      effects: leader.ability.effects,
    });
  const civ = content.entities.civ[p.civ];
  if (civ?.ability && civ.ability.effects.length > 0)
    out.push({
      id: civ.id,
      label: resolveText(content, civ.ability.name),
      effects: civ.ability.effects,
    });
  // Great people activated: their lasting effects.
  for (const id of p.greatPeople ?? []) {
    const gp = content.entities.greatPerson[id];
    if (gp && gp.effects.length > 0)
      out.push({ id, label: resolveText(content, gp.name), effects: gp.effects });
  }
  // Their pantheon and the founder belief of the religion they founded.
  for (const id of p.beliefs ?? []) {
    const b = content.entities.belief[id];
    if (b && b.effects.length > 0)
      out.push({ id, label: resolveText(content, b.name), effects: b.effects });
  }
  // An AI seat's difficulty bonuses (D53), declared openly in the setup screen.
  const level = p.handicap ? content.entities.difficulty?.[p.handicap] : undefined;
  if (level && level.aiEffects.length > 0)
    out.push({ id: level.id, label: resolveText(content, level.name), effects: level.aiEffects });
  // The age and its dedications (docs/04-advanced-systems.md, "Eras and ages").
  out.push(...ageSources(ctx, p));
  // Established governors (their settlement-scope effects only where they serve).
  out.push(...governorSources(ctx, p));
  const gov = content.entities.government[p.government];
  if (gov && gov.effects.length > 0)
    out.push({ id: gov.id, label: resolveText(content, gov.name), effects: gov.effects });
  for (const kind of SLOT_KINDS) {
    for (const id of p.policies[kind]) {
      const pol = content.entities.policy[id];
      if (pol) out.push({ id, label: resolveText(content, pol.name), effects: pol.effects });
    }
  }
  if (p.celebration.turnsLeft > 0) {
    out.push({
      id: 'celebration',
      label: 'Celebration',
      effects: content.rules.progress.celebration.effects,
    });
  }
  for (const id of p.techs.done) {
    const t = content.entities.tech[id];
    if (t && t.effects.length > 0)
      out.push({ id, label: resolveText(content, t.name), effects: t.effects });
  }
  for (const id of p.civics.done) {
    const c = content.entities.civic[id];
    if (c && c.effects.length > 0)
      out.push({ id, label: resolveText(content, c.name), effects: c.effects });
  }
  // Only frozen (finished) states are cached: a draft or snapshot may still change.
  if (Object.isFrozen(p)) sourceCache.set(p, out);
  return out;
}

type Built = { localEffects: Effect[]; effects: Effect[]; name: string };

/** What a settlement has built or chosen that can carry effects, with labels. */
function builtThings(ctx: EngineContext, s: SettlementState): { id: string; def: Built }[] {
  const e = ctx.content.entities;
  const out: { id: string; def: Built }[] = [];
  const add = (id: string, def: Built | undefined) => {
    if (def) out.push({ id, def });
  };
  for (const id of s.buildings) add(id, e.building[id]);
  for (const d of s.districts) add(d.id, e.district[d.id]);
  for (const id of s.wonders) add(id, e.wonder[id]);
  if (s.specialization) add(s.specialization, e.specialization[s.specialization]);
  return out;
}

/** Effects that apply only inside one settlement (its buildings', districts', wonders' local
 * effects and its town specialization). */
export function localSources(ctx: EngineContext, s: SettlementState): EffectSource[] {
  return builtThings(ctx, s)
    .filter((x) => x.def.localEffects.length > 0)
    .map((x) => ({
      id: x.id,
      label: resolveText(ctx.content, x.def.name),
      effects: x.def.localEffects,
    }));
}

const builtCache = new WeakMap<object, Map<PlayerId, EffectSource[]>>();

/** Empire-wide effects from everything a player has built (wonders, the government plaza...). */
export function builtSources(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
): EffectSource[] {
  const frozen = Object.isFrozen(state.settlements);
  const cached = frozen ? builtCache.get(state.settlements)?.get(player) : undefined;
  if (cached) return cached;
  const out: EffectSource[] = [];
  const ids = Object.keys(state.settlements).sort(
    (a, b) => Number(a.slice(1)) - Number(b.slice(1)),
  );
  for (const id of ids) {
    const s = state.settlements[id]!;
    if (s.owner !== player) continue;
    for (const x of builtThings(ctx, s)) {
      if (x.def.effects.length > 0)
        out.push({ id: x.id, label: resolveText(ctx.content, x.def.name), effects: x.def.effects });
    }
  }
  if (frozen) {
    const byPlayer = builtCache.get(state.settlements) ?? new Map<PlayerId, EffectSource[]>();
    byPlayer.set(player, out);
    builtCache.set(state.settlements, byPlayer);
  }
  return out;
}

/** Follower beliefs of the religion a settlement follows (whoever founded it). */
export function religionSources(
  ctx: EngineContext,
  state: GameState,
  s: SettlementState,
): EffectSource[] {
  const r = s.religion === null ? undefined : state.religions[s.religion];
  if (!r) return [];
  const out: EffectSource[] = [];
  for (const id of r.beliefs) {
    const b = ctx.content.entities.belief[id];
    if (b?.kind === 'follower' && b.effects.length > 0)
      out.push({ id, label: resolveText(ctx.content, b.name), effects: b.effects });
  }
  return out;
}

/**
 * Every source that applies to a player's tiles and settlements (city-state bonuses included),
 * plus one settlement's own and its religion's follower beliefs.
 */
export function sourcesFor(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  settlement?: SettlementState,
): EffectSource[] {
  const base = [
    ...activeSources(ctx, state.players[player]!),
    ...builtSources(ctx, state, player),
    ...cityStateSources(ctx, state, player),
  ];
  return settlement
    ? [...base, ...localSources(ctx, settlement), ...religionSources(ctx, state, settlement)]
    : base;
}

/** Effects of one type from a player's sources whose conditions hold (player-level context). */
export function playerEffects<T extends Effect['effect']>(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  type: T,
  settlement?: SettlementState,
): { source: EffectSource; effect: Extract<Effect, { effect: T }> }[] {
  const p = state.players[player]!;
  const facts = playerFacts(ctx, p);
  const out: { source: EffectSource; effect: Extract<Effect, { effect: T }> }[] = [];
  for (const source of sourcesFor(ctx, state, player, settlement)) {
    for (const effect of source.effects) {
      if (effect.effect !== type) continue;
      const ok =
        effect.condition === undefined ||
        evaluateCondition(
          {
            content: ctx.content,
            playerId: player,
            player: facts,
            ...(settlement ? { settlement: settlementFacts(state, settlement) } : {}),
          },
          effect.condition,
        );
      if (ok) out.push({ source, effect: effect as Extract<Effect, { effect: T }> });
    }
  }
  return out;
}

export function settlementLimitOf(ctx: EngineContext, state: GameState, player: PlayerId): number {
  return (
    ctx.content.rules.settlements.startingLimit +
    playerEffects(ctx, state, player, 'modify_settlement_limit').reduce(
      (sum, e) => sum + e.effect.params.amount,
      0,
    )
  );
}

/** Policy slots per kind: the government's, plus extra slots from effects. */
export function policySlots(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
): Record<SlotKind, number> {
  const gov = ctx.content.entities.government[state.players[player]!.government];
  const slots: Record<SlotKind, number> = {
    military: gov?.slots.military ?? 0,
    economic: gov?.slots.economic ?? 0,
    diplomatic: gov?.slots.diplomatic ?? 0,
    wildcard: gov?.slots.wildcard ?? 0,
  };
  for (const e of playerEffects(ctx, state, player, 'extra_policy_slot')) {
    slots[e.effect.params.slot] += e.effect.params.amount;
  }
  return slots;
}

/** Sum of a player's percent modifiers of one type (e.g. purchase cost −25%). */
export function playerPercent(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  type: 'modify_unit_upkeep' | 'modify_purchase_cost',
): number {
  return playerEffects(ctx, state, player, type).reduce(
    (sum, e) => sum + e.effect.params.percent,
    0,
  );
}

export function canEmbarkNow(ctx: EngineContext, state: GameState, player: PlayerId): boolean {
  return (
    ctx.content.rules.units.embarkFromStart ||
    playerEffects(ctx, state, player, 'enable_embark').length > 0
  );
}
