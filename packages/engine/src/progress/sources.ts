import { type Effect, resolveText, type SlotKind } from '@cx/content';
import { cityStateSources } from '../citystates/rules';
import type { EngineContext } from '../context';
import { evaluateCondition } from '../effects/conditions';
import type { PlayerFacts, SettlementFacts, TileFacts } from '../effects/tile';
import type { EffectSource } from '../effects/yields';
import { distance, tileTouchesRiver } from '../map/hex';
import { baseOf } from '../uniques';
import { continentOf } from '../map/appeal';
import type { GameState, PlayerId, PlayerState, SettlementState, Track } from '../state';
import { ageSources } from '../eras/ages';
import { congressSources } from '../congress/congress';
import { governorOf, governorSources } from '../governors/governors';
import { pactSources } from '../diplomacy/pacts';
import { monopolySources } from '../resources/monopoly';

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

export function settlementFacts(
  state: GameState,
  s: SettlementState,
  ctx?: EngineContext,
): SettlementFacts {
  const governor = governorOf(state, s.id);
  // On the capital's landmass (needs the content to tell land from water).
  const capital = state.players[s.owner]?.capital;
  const home =
    ctx && capital && state.settlements[capital]
      ? continentOf(ctx, state.map, s.tile) ===
        continentOf(ctx, state.map, state.settlements[capital]!.tile)
      : undefined;
  return {
    kind: s.kind,
    capital: s.capital,
    population: s.population,
    buildings: s.buildings,
    districts: s.districts.map((d) => d.id),
    onRiver: tileTouchesRiver(state.map, state.map.tiles, s.tile),
    unitsTrained: s.unitsTrained,
    ...(governor ? { governor } : {}),
    ...(home !== undefined ? { homeContinent: home } : {}),
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
  out.push(...congressSources(ctx, p));
  const gov = content.entities.government[p.government];
  if (gov && gov.effects.length > 0)
    out.push({ id: gov.id, label: resolveText(content, gov.name), effects: gov.effects });
  // Legacies of the governments they've lived under (D113), one copy per legacy earned.
  for (const [id, n] of Object.entries(p.legacies ?? {}).sort()) {
    const g = content.entities.government[id];
    if (!g || n <= 0 || g.legacy.length === 0) continue;
    out.push({
      id: `legacy:${id}`,
      label: `${resolveText(content, g.name)} legacy${n > 1 ? ` (×${n})` : ''}`,
      effects: g.legacy.map((e) => timesEffect(e, n)),
    });
  }
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

/** An effect `n` times over: its `amount` or `percent` multiplied (one line, not n). */
function timesEffect(effect: Effect, n: number): Effect {
  if (n === 1) return effect;
  const params: Record<string, unknown> = { ...effect.params };
  for (const key of ['amount', 'percent'] as const)
    if (typeof params[key] === 'number') params[key] = (params[key] as number) * n;
  return { ...effect, params } as Effect;
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

/**
 * Regional effects reaching a settlement from its owner's other settlements nearby (a Factory's
 * production, a Stadium's happiness): each kind once, and none of a kind it has itself.
 */
export function regionalSources(
  ctx: EngineContext,
  state: GameState,
  s: SettlementState,
): EffectSource[] {
  const e = ctx.content.entities;
  const own = new Set([...s.buildings.map((b) => baseOf(ctx, 'building', b)), ...s.wonders]);
  const out = new Map<string, EffectSource>();
  const ids = Object.keys(state.settlements).sort(
    (a, b) => Number(a.slice(1)) - Number(b.slice(1)),
  );
  for (const id of ids) {
    const other = state.settlements[id]!;
    if (other.owner !== s.owner || other.id === s.id) continue;
    const things = [
      ...other.buildings.map((b) => ({ id: baseOf(ctx, 'building', b), def: e.building[b] })),
      ...other.wonders.map((w) => ({ id: w, def: e.wonder[w] })),
    ];
    for (const { id: kind, def } of things) {
      if (!def?.regional || own.has(kind) || out.has(kind)) continue;
      if (distance(state.map, other.tile, s.tile) > def.regional.radius) continue;
      out.set(kind, {
        id: `regional:${kind}`,
        label: `${resolveText(ctx.content, def.name)} in ${other.name}`,
        effects: def.regional.effects,
      });
    }
  }
  return [...out.values()];
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
 * A short memory for `sourcesFor` while code only reads one state. Turn processing works on a
 * mutable draft, which the frozen-state caches above can't use, yet one settlement's yields ask
 * for the same player's sources dozens of times. Inside `withSourceMemo` the answers are kept
 * until the call returns; it is only for pure reads of the state it is given (nothing may change
 * the state meanwhile), and it ignores calls made with any other state.
 */
interface SourceMemo {
  state: GameState;
  base: Map<PlayerId, EffectSource[]>;
  full: WeakMap<SettlementState, EffectSource[]>;
  facts: WeakMap<PlayerState, PlayerFacts>;
  /** Anything else worked out once per read (see `memoRead`), by key. */
  other: Map<string, unknown>;
}
let activeMemo: SourceMemo | null = null;

/**
 * `compute()` once per `withSourceMemo` read of `state` for this key (and every time outside one).
 * For pure facts many settlements share, such as which luxuries reach which settlement.
 */
export function memoRead<T>(state: GameState, key: string, compute: () => T): T {
  const memo = activeMemo?.state === state ? activeMemo : undefined;
  if (!memo) return compute();
  if (memo.other.has(key)) return memo.other.get(key) as T;
  const value = compute();
  memo.other.set(key, value);
  return value;
}

export function withSourceMemo<T>(state: GameState, read: () => T): T {
  if (activeMemo?.state === state) return read();
  const outer = activeMemo;
  activeMemo = {
    state,
    base: new Map(),
    full: new WeakMap(),
    facts: new WeakMap(),
    other: new Map(),
  };
  try {
    return read();
  } finally {
    activeMemo = outer;
  }
}

/**
 * Every source that applies to a player's tiles and settlements (city-state bonuses included),
 * plus one settlement's own and its religion's follower beliefs. Treat the result as read-only.
 */
export function sourcesFor(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  settlement?: SettlementState,
): EffectSource[] {
  const memo = activeMemo?.state === state ? activeMemo : undefined;
  const known = settlement ? memo?.full.get(settlement) : memo?.base.get(player);
  if (known) return known;
  let base = memo?.base.get(player);
  if (!base) {
    base = [
      ...activeSources(ctx, state.players[player]!),
      ...builtSources(ctx, state, player),
      ...cityStateSources(ctx, state, player),
      ...pactSources(ctx, state, player),
      ...monopolySources(ctx, state, player),
    ];
    memo?.base.set(player, base);
  }
  if (!settlement) return base;
  const full = [
    ...base,
    ...localSources(ctx, settlement),
    ...regionalSources(ctx, state, settlement),
    ...religionSources(ctx, state, settlement),
  ];
  memo?.full.set(settlement, full);
  return full;
}

/** A player's facts, remembered while `withSourceMemo` is reading the state they belong to. */
function factsOf(ctx: EngineContext, state: GameState, player: PlayerId): PlayerFacts {
  const p = state.players[player]!;
  const memo = activeMemo?.state === state ? activeMemo : undefined;
  const known = memo?.facts.get(p);
  if (known) return known;
  const facts = playerFacts(ctx, p);
  memo?.facts.set(p, facts);
  return facts;
}

/** Effects of one type from a player's sources whose conditions hold (player-level context). */
/**
 * Whether a condition holds for a player, optionally in one settlement and on one tile (facts
 * built by the caller). The AI uses it to value an effect where it would actually apply.
 */
export function conditionHolds(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  condition: Effect['condition'],
  settlement?: SettlementState,
  tile?: TileFacts,
  neighbors?: TileFacts[],
): boolean {
  if (condition === undefined) return true;
  return evaluateCondition(
    {
      content: ctx.content,
      playerId: player,
      player: factsOf(ctx, state, player),
      ...(settlement ? { settlement: settlementFacts(state, settlement, ctx) } : {}),
      ...(tile ? { tile, neighbors: neighbors ?? [] } : {}),
    },
    condition,
  );
}

export function playerEffects<T extends Effect['effect']>(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  type: T,
  settlement?: SettlementState,
): { source: EffectSource; effect: Extract<Effect, { effect: T }> }[] {
  const facts = factsOf(ctx, state, player);
  // The settlement's facts are the same for every effect, so they're worked out at most once.
  let here: SettlementFacts | undefined;
  const out: { source: EffectSource; effect: Extract<Effect, { effect: T }> }[] = [];
  for (const source of sourcesFor(ctx, state, player, settlement)) {
    for (const effect of source.effects) {
      if (effect.effect !== type) continue;
      if (settlement && effect.condition !== undefined)
        here ??= settlementFacts(state, settlement, ctx);
      const ok =
        effect.condition === undefined ||
        evaluateCondition(
          {
            content: ctx.content,
            playerId: player,
            player: facts,
            ...(here ? { settlement: here } : {}),
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
