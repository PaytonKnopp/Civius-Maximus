import { resolveText } from '@cx/content';
import { current, type Draft } from 'immer';
import { bestSoldier, chooseBuild, keepUp } from '../citystates/handlers';
import { killUnit } from '../combat/handlers';
import { type EngineContext, type Emit, FREE, unitIds } from '../context';
import { distance, tilesWithin } from '../map/hex';
import { playerEffects } from '../progress/sources';
import { processSettlement, refreshCitizens, refreshExplored } from '../settlements/handlers';
import { happinessOf, settlementIds } from '../settlements/rules';
import type { GameState, PlayerId, SettlementState } from '../state';
import { hostilePlayer } from '../combat/camps';
import { canTraverse, hasForeignUnit, hasRoom } from '../units/movement';
import { governorOf } from '../governors/governors';

/**
 * Loyalty (docs/04-advanced-systems.md, "Loyalty"), after Civ VI. Citizens push on every
 * settlement within `rules.loyalty.range` tiles, less the farther they are. A settlement whose
 * own side pushes less than its neighbours loses loyalty each turn; at 0 it declares itself a
 * free city, and a free city at 0 joins the civ pushing on it hardest. Governors, happiness and
 * some buildings and ages add or take loyalty. Capitals and city-states always stay loyal.
 */

export const loyaltyOn = (state: Pick<GameState, 'settings'>) => state.settings.loyalty !== false;

export interface LoyaltyLine {
  label: string;
  amount: number;
}

export interface LoyaltyReport {
  loyalty: number;
  /** Change next turn: the sum of `lines`. */
  change: number;
  lines: LoyaltyLine[];
  /** Pressure (tenths of a citizen) from its own side, and from everyone else. */
  domestic: number;
  foreign: number;
  /** The civ pushing on it hardest from outside, if any. */
  strongest: PlayerId | null;
  /** It never loses loyalty (a capital or a city-state). */
  steadfast: boolean;
}

/** A settlement's loyalty now (full when never set). */
export function loyaltyNow(ctx: EngineContext, s: SettlementState): number {
  return s.loyalty ?? ctx.content.rules.loyalty.max;
}

/** How much harder (percent) a player's citizens push than usual (ages and the like). */
function pressurePercent(ctx: EngineContext, state: GameState, player: PlayerId): number {
  const p = state.players[player];
  if (!p || (p.kind !== 'human' && p.kind !== 'ai')) return 0;
  return playerEffects(ctx, state, player, 'modify_loyalty_pressure').reduce(
    (n, { effect }) => n + effect.params.percent,
    0,
  );
}

/**
 * Pressure on a tile from each owner's settlements in range, in tenths of a citizen: a citizen
 * pushes 10 on its own tile and one less for every tile away. Teammates count as one side.
 */
export function pressureAt(
  ctx: EngineContext,
  state: GameState,
  tile: number,
  percents: Map<PlayerId, number> = new Map(),
): Map<PlayerId, number> {
  const range = ctx.content.rules.loyalty.range;
  const out = new Map<PlayerId, number>();
  for (const id of settlementIds(state)) {
    const o = state.settlements[id]!;
    if (o.razing) continue;
    const d = distance(state.map, tile, o.tile);
    if (d > range) continue;
    if (!percents.has(o.owner)) percents.set(o.owner, pressurePercent(ctx, state, o.owner));
    const base = o.population * (range + 1 - d);
    const push = Math.trunc((base * (100 + percents.get(o.owner)!)) / 100);
    out.set(o.owner, (out.get(o.owner) ?? 0) + Math.max(0, push));
  }
  return out;
}

function sameSide(state: GameState, a: PlayerId, b: PlayerId): boolean {
  if (a === b) return true;
  const ta = state.players[a]?.team ?? null;
  return ta !== null && ta === (state.players[b]?.team ?? null);
}

/** The capped push of citizens' pressure on a tile for a settlement `owner` would hold there. */
export function pushFor(
  ctx: EngineContext,
  state: GameState,
  tile: number,
  owner: PlayerId,
  percents: Map<PlayerId, number> = new Map(),
): number {
  const r = ctx.content.rules.loyalty;
  let domestic = 0;
  let foreign = 0;
  for (const [id, push] of pressureAt(ctx, state, tile, percents)) {
    if (sameSide(state, id, owner)) domestic += push;
    else foreign += push;
  }
  return capPush(r.maxPressure, domestic, foreign);
}

function capPush(max: number, domestic: number, foreign: number): number {
  const net = Math.trunc((10 * (domestic - foreign)) / (Math.min(domestic, foreign) + 5));
  return Math.max(-max, Math.min(max, net));
}

/** Whether `player`'s people nearby would keep a settlement on this tile loyal. */
export function holdable(ctx: EngineContext, state: GameState, tile: number, player: PlayerId) {
  return pushFor(ctx, state, tile, player) >= 0;
}

/** Why a settlement's loyalty is going up or down, and by how much a turn. */
export function loyaltyOf(
  ctx: EngineContext,
  state: GameState,
  s: SettlementState,
  percents: Map<PlayerId, number> = new Map(),
): LoyaltyReport {
  const r = ctx.content.rules.loyalty;
  const loyalty = loyaltyNow(ctx, s);
  const owner = state.players[s.owner];
  const steadfast = s.capital || owner?.kind === 'cityState';
  const pressure = pressureAt(ctx, state, s.tile, percents);
  let domestic = 0;
  let foreign = 0;
  let strongest: { id: PlayerId; push: number } | null = null;
  // Stable order: the turn order, then everyone else by id.
  const owners = [...pressure.keys()].sort((a, b) => {
    const ia = state.playerOrder.indexOf(a);
    const ib = state.playerOrder.indexOf(b);
    return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib) || (a < b ? -1 : a > b ? 1 : 0);
  });
  for (const id of owners) {
    const push = pressure.get(id)!;
    if (sameSide(state, id, s.owner)) {
      domestic += push;
      continue;
    }
    // Teammates of the owner don't push either way.
    foreign += push;
    if (state.playerOrder.includes(id) && (!strongest || push > strongest.push))
      strongest = { id, push };
  }
  const report: LoyaltyReport = {
    loyalty,
    change: 0,
    lines: [],
    domestic,
    foreign,
    strongest: strongest?.id ?? null,
    steadfast,
  };
  if (steadfast) return report;

  const lines = report.lines;
  const push = capPush(r.maxPressure, domestic, foreign);
  if (push > 0) lines.push({ label: 'Its own people nearby', amount: push });
  else if (push < 0) {
    const who = strongest ? state.players[strongest.id]?.name : undefined;
    lines.push({
      label: who ? `Pull of ${who} and others` : 'Foreign people nearby',
      amount: push,
    });
  }
  if (owner?.kind === 'human' || owner?.kind === 'ai') {
    const gov = governorOf(state, s.id);
    if (gov && r.governor !== 0) {
      const def = ctx.content.entities.governor[gov];
      lines.push({
        label: def ? `Governor ${resolveText(ctx.content, def.name)}` : 'Governor',
        amount: r.governor,
      });
    }
    const mood = happinessOf(ctx, state, s).mood;
    const fromMood = r.mood[mood];
    if (fromMood !== 0)
      lines.push({ label: mood === 'thriving' ? 'Thriving' : `${cap(mood)}`, amount: fromMood });
    for (const { source, effect } of playerEffects(ctx, state, s.owner, 'modify_loyalty', s))
      if (effect.params.amount !== 0)
        lines.push({ label: source.label, amount: effect.params.amount });
  }
  report.change = lines.reduce((n, l) => n + l.amount, 0);
  return report;
}

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/** Turns until loyalty runs out at this rate, or null if it isn't falling. */
export function turnsToFlip(report: LoyaltyReport): number | null {
  if (report.steadfast || report.change >= 0) return null;
  return Math.ceil(report.loyalty / -report.change);
}

/** The yield percent a settlement loses to low loyalty, and why (0 when loyal or off). */
export function loyaltyPenalty(
  ctx: EngineContext,
  state: GameState,
  s: SettlementState,
): { percent: number; label: string } | null {
  if (!loyaltyOn(state)) return null;
  const loyalty = loyaltyNow(ctx, s);
  let worst: { percent: number; label: string } | null = null;
  for (const p of ctx.content.rules.loyalty.yieldPenalties) {
    if (loyalty < p.below && (!worst || p.percent < worst.percent))
      worst = { percent: p.percent, label: resolveText(ctx.content, p.label) };
  }
  return worst && worst.percent !== 0 ? worst : null;
}

/** The free cities' player, created the first time a settlement breaks away. */
function freePlayer(draft: Draft<GameState>, ctx: EngineContext) {
  if (!draft.players[FREE]) {
    draft.players[FREE] = {
      ...hostilePlayer(ctx, current(draft)),
      id: FREE,
      name: 'Free Cities',
    };
  }
  return draft.players[FREE]!;
}

/** Moves a player's units off a tile (to the nearest open tile), or disbands them. */
function evict(
  draft: Draft<GameState>,
  ctx: EngineContext,
  tile: number,
  owner: PlayerId,
  emit: Emit,
) {
  for (const id of unitIds(draft)) {
    const u = draft.units[id]!;
    if (u.owner !== owner || u.tile !== tile) continue;
    const snap = current(draft);
    const unit = snap.units[id]!;
    const to =
      tilesWithin(snap.map, tile, 3).find(
        (t) =>
          t !== tile &&
          snap.map.tiles[t]!.owner === owner &&
          canTraverse(ctx, snap, unit, t) &&
          hasRoom(ctx, snap, unit, t) &&
          !hasForeignUnit(snap, unit, t),
      ) ??
      tilesWithin(snap.map, tile, 3).find(
        (t) =>
          t !== tile &&
          canTraverse(ctx, snap, unit, t) &&
          hasRoom(ctx, snap, unit, t) &&
          !hasForeignUnit(snap, unit, t),
      );
    if (to === undefined) {
      killUnit(draft, ctx, id, owner, emit);
      continue;
    }
    u.tile = to;
    u.orders = null;
  }
}

/** A settlement changes sides without a fight (loyalty ran out). */
function flip(draft: Draft<GameState>, ctx: EngineContext, id: string, to: PlayerId, emit: Emit) {
  const r = ctx.content.rules.loyalty;
  const s = draft.settlements[id]!;
  const from = s.owner;
  if (to === FREE) {
    const free = freePlayer(draft, ctx);
    free.alive = true;
  }
  evict(draft, ctx, s.tile, from, emit);
  // The governor who served there comes home.
  for (const g of Object.values(draft.players[from]?.governors ?? {})) {
    if (g.settlement === id) {
      g.settlement = null;
      g.established = false;
    }
  }
  s.owner = to;
  for (const t of draft.map.tiles) if (t.settlement === id) t.owner = to;
  s.queue = [];
  s.progress = {};
  s.locked = [];
  s.focus = 'balanced';
  s.pendingDevelop = 0;
  s.capturedFrom = null;
  s.captureChoice = false;
  s.loyalty = to === FREE ? r.freeCity : r.afterCapture;
  refreshCitizens(draft, ctx, id);
  if (to !== FREE) refreshExplored(draft, ctx, to);
  if (from !== FREE && draft.players[from]?.alive) refreshExplored(draft, ctx, from);
  emit({
    type: 'settlement_flipped',
    settlement: id,
    name: s.name,
    from,
    to,
    tile: s.tile,
    visibleTo: 'all',
  });
  if (to === FREE) {
    keepUp(draft, ctx, [FREE]);
    for (let i = 0; i < r.freeCityUnits; i++) {
      const unit = bestSoldier(ctx, current(draft), id);
      if (!unit || !spawnDefender(draft, ctx, unit, s.tile)) break;
    }
  }
}

function spawnDefender(draft: Draft<GameState>, ctx: EngineContext, type: string, near: number) {
  const snap = current(draft);
  const uid = `u${snap.nextEntityId}`;
  const probe = { id: uid, owner: FREE, type };
  const tile = tilesWithin(snap.map, near, 1).find(
    (t) =>
      canTraverse(ctx, snap, probe, t) &&
      hasRoom(ctx, snap, probe, t) &&
      !hasForeignUnit(snap, probe, t),
  );
  if (tile === undefined) return false;
  draft.units[uid] = {
    ...probe,
    tile,
    moves: 0,
    health: ctx.content.rules.combat.maxHealth,
    xp: 0,
    orders: { kind: 'fortify', turns: 0 },
    skippedTurn: null,
    promotions: [],
  };
  draft.nextEntityId++;
  return true;
}

/** Turn step (after the civs' and city-states' settlements): free cities build and grow. */
export function freeCitiesTurn(draft: Draft<GameState>, ctx: EngineContext, emit: Emit) {
  const free = draft.players[FREE];
  if (!free?.alive) return;
  const mine = settlementIds(draft).filter((id) => draft.settlements[id]!.owner === FREE);
  if (mine.length === 0) return;
  keepUp(draft, ctx, [FREE]);
  for (const id of mine) {
    chooseBuild(draft, ctx, id, ctx.content.rules.loyalty.freeCityUnits, true);
    processSettlement(draft, ctx, id, emit);
  }
  for (const id of unitIds(draft)) {
    const u = draft.units[id]!;
    if (u.owner === FREE && u.orders?.kind !== 'fortify') u.orders = { kind: 'fortify', turns: 0 };
  }
}

/** Turn step: every settlement's loyalty moves; those at 0 change sides. */
export function loyaltyTurn(draft: Draft<GameState>, ctx: EngineContext, emit: Emit) {
  if (!loyaltyOn(draft) || draft.status !== 'playing') return;
  const r = ctx.content.rules.loyalty;
  const snap = current(draft);
  const percents = new Map<PlayerId, number>();
  // Every settlement moves on the same snapshot, so the order doesn't matter.
  const reports = settlementIds(snap)
    .map((id) => snap.settlements[id]!)
    .filter((s) => !s.razing && !s.captureChoice)
    .map((s) => ({ s, report: loyaltyOf(ctx, snap, s, percents) }));
  const flips: { id: string; to: PlayerId }[] = [];
  for (const { s, report } of reports) {
    const d = draft.settlements[s.id]!;
    if (report.steadfast) {
      if (d.loyalty !== undefined) delete d.loyalty;
      continue;
    }
    const before = report.loyalty;
    const after = Math.max(0, Math.min(r.max, before + report.change));
    if (after === r.max) delete d.loyalty;
    else d.loyalty = after;
    if (after === 0) {
      // A free city joins the civ pulling hardest, but only one whose people would keep it.
      const to =
        s.owner !== FREE
          ? FREE
          : report.strongest && pushFor(ctx, snap, s.tile, report.strongest, percents) >= 0
            ? report.strongest
            : null;
      if (to) flips.push({ id: s.id, to });
      continue;
    }
    // A warning as it crosses each mark on the way down.
    if (
      report.change < 0 &&
      s.owner !== FREE &&
      r.yieldPenalties.some((p) => before >= p.below && after < p.below)
    )
      emit({
        type: 'loyalty_falling',
        settlement: s.id,
        name: s.name,
        owner: s.owner,
        loyalty: after,
        change: report.change,
        visibleTo: [s.owner],
      });
  }
  for (const f of flips) flip(draft, ctx, f.id, f.to, emit);
}
