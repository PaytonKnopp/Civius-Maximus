import { type GreatPersonDef, type GreatWorkKind, resolveText } from '@cx/content';
import { current, type Draft } from 'immer';
import type { Action } from '../actions';
import type { ActionHandler, Emit, EngineContext, RuleError } from '../context';
import { type Fixed, toFixed } from '../fixed';
import type { GameState, GreatWorkState, PlayerId, SettlementState, UnitState } from '../state';

/**
 * Great works (docs/04-advanced-systems.md, "Great works"), after Civ VI. Great Writers, Artists
 * and Musicians make named works, one each time they're activated, into empty slots in the
 * settlement's buildings and wonders. A displayed work yields culture and tourism (relics:
 * faith and tourism); a building whose slots are all full of works by different people is
 * themed and yields more. Works stay with their settlement when it changes hands.
 */

type SlotKind = GreatWorkKind | 'any';
const SLOT_KINDS: readonly SlotKind[] = ['writing', 'art', 'music', 'relic', 'any'];

export const WORK_KIND_NAMES: Record<GreatWorkKind, string> = {
  writing: 'writing',
  art: 'art',
  music: 'music',
  relic: 'relic',
};

/** One building or wonder with slots, in the order they were finished. */
export interface Holder {
  id: string;
  name: string;
  slots: { [K in SlotKind]?: number | undefined };
  total: number;
}

/** The buildings and wonders in a settlement that have slots for great works. */
export function holdersIn(ctx: EngineContext, s: SettlementState): Holder[] {
  const out: Holder[] = [];
  const add = (id: string, name: string, slots: { [K in SlotKind]?: number | undefined }) => {
    const total = SLOT_KINDS.reduce((n, k) => n + (slots[k] ?? 0), 0);
    if (total > 0) out.push({ id, name: resolveText(ctx.content, name), slots, total });
  };
  for (const b of s.buildings) {
    const def = ctx.content.entities.building[b];
    if (def) add(b, def.name, def.slots);
  }
  for (const w of s.wonders) {
    const def = ctx.content.entities.wonder[w];
    if (def) add(w, def.name, def.slots);
  }
  return out;
}

const workOrder = (a: string, b: string) =>
  Number(a.slice(2)) - Number(b.slice(2)) || (a < b ? -1 : a > b ? 1 : 0);

/** The works kept in a settlement (displayed or not), oldest first. */
export function worksIn(state: Pick<GameState, 'greatWorks'>, settlement: string) {
  return Object.entries(state.greatWorks ?? {})
    .filter(([, w]) => w.settlement === settlement)
    .sort(([a], [b]) => workOrder(a, b));
}

/** Whether one more work of `kind` fits in a holder with these works already in it. */
function fits(holder: Holder, inside: readonly GreatWorkState[], kind: GreatWorkKind): boolean {
  const count = (k: GreatWorkKind) => inside.filter((w) => w.kind === k).length;
  if (count(kind) < (holder.slots[kind] ?? 0)) return true;
  // Works beyond their own kind's slots sit in the `any` slots.
  const overflow = (['writing', 'art', 'music', 'relic'] as const).reduce(
    (n, k) => n + Math.max(0, count(k) - (holder.slots[k] ?? 0)),
    0,
  );
  return overflow < (holder.slots.any ?? 0);
}

/** The building or wonder in a settlement with an empty slot for this kind (its own kind first). */
export function freeHolder(
  ctx: EngineContext,
  state: GameState,
  s: SettlementState,
  kind: GreatWorkKind,
): string | undefined {
  const works = worksIn(state, s.id).map(([, w]) => w);
  const holders = holdersIn(ctx, s);
  const open = (h: Holder) =>
    fits(
      h,
      works.filter((w) => w.holder === h.id),
      kind,
    );
  return (
    holders.find((h) => (h.slots[kind] ?? 0) > 0 && open(h))?.id ??
    holders.find((h) => (h.slots.any ?? 0) > 0 && open(h))?.id
  );
}

/** A holder's works, and whether it's themed (two or more slots, all full, all by different people). */
export function holderWorks(state: GameState, s: SettlementState, holder: Holder) {
  const works = worksIn(state, s.id).filter(([, w]) => w.holder === holder.id);
  const creators = new Set(works.map(([, w]) => w.creator));
  const themed =
    holder.total >= 2 && works.length >= holder.total && creators.size === works.length;
  return { works, themed };
}

/** What a settlement's displayed works yield, per building or wonder (hundredths). */
export function greatWorkYields(
  ctx: EngineContext,
  state: GameState,
  s: SettlementState,
): { label: string; yields: Record<string, Fixed> }[] {
  if (!state.greatWorks) return [];
  const r = ctx.content.rules.greatWorks;
  const out: { label: string; yields: Record<string, Fixed> }[] = [];
  for (const holder of holdersIn(ctx, s)) {
    const { works, themed } = holderWorks(state, s, holder);
    if (works.length === 0) continue;
    const yields: Record<string, Fixed> = {};
    for (const [, w] of works) {
      for (const [y, v] of Object.entries(r.yields[w.kind])) {
        const amount = Math.trunc((toFixed(v) * (100 + (themed ? r.themingPercent : 0))) / 100);
        yields[y] = (yields[y] ?? 0) + amount;
      }
    }
    out.push({ label: `Great works: ${holder.name}${themed ? ' (themed)' : ''}`, yields });
  }
  return out;
}

/** A player's works whose building is gone (a lost Palace, say): kept, but not displayed. */
export function storedWorks(ctx: EngineContext, state: GameState, player: PlayerId) {
  return Object.entries(state.greatWorks ?? {})
    .filter(([, w]) => {
      const s = state.settlements[w.settlement];
      return s?.owner === player && !holdersIn(ctx, s).some((h) => h.id === w.holder);
    })
    .sort(([a], [b]) => workOrder(a, b));
}

/** The great works a great person still has to make, if they make works. */
export function worksToMake(
  person: GreatPersonDef,
  unit: Pick<UnitState, 'charges'>,
): { kind: GreatWorkKind; next: string; left: number } | undefined {
  const a = person.activate.find((x) => x.kind === 'create_works');
  if (!a || a.kind !== 'create_works') return undefined;
  const left = Math.max(0, Math.min(a.works.length, unit.charges ?? a.works.length));
  if (left === 0) return undefined;
  return { kind: a.work, next: a.works[a.works.length - left]!, left };
}

/** Why a great person can't make a work in this settlement (needs an empty slot of its kind). */
export function workProblem(
  ctx: EngineContext,
  state: GameState,
  person: GreatPersonDef,
  unit: UnitState,
  s: SettlementState,
): RuleError | undefined {
  const make = worksToMake(person, unit);
  if (!make) return undefined;
  if (freeHolder(ctx, state, s, make.kind)) return undefined;
  const kinds = ctx.content.ids.building
    .map((id) => ctx.content.entities.building[id]!)
    .filter((b) => (b.slots[make.kind] ?? 0) > 0)
    .map((b) => resolveText(ctx.content, b.name));
  return {
    code: 'no_slot',
    message: `No empty slot for a great work of ${WORK_KIND_NAMES[make.kind]} here${
      kinds.length ? ` (build a${/^[AEIOU]/.test(kinds[0]!) ? 'n' : ''} ${kinds[0]})` : ''
    }`,
  };
}

/** Makes the next work of a great person in a settlement. Returns whether they have more. */
export function makeWork(
  draft: Draft<GameState>,
  ctx: EngineContext,
  person: GreatPersonDef,
  unitId: string,
  settlement: string,
  emit: Emit,
): boolean {
  const snap = current(draft);
  const unit = snap.units[unitId]!;
  const make = worksToMake(person, unit);
  const s = snap.settlements[settlement]!;
  if (!make) return false;
  const holder = freeHolder(ctx, snap, s, make.kind);
  if (!holder) return true;
  const id = `gw${draft.nextEntityId++}`;
  (draft.greatWorks ??= {})[id] = {
    name: make.next,
    kind: make.kind,
    creator: person.id,
    by: unit.owner,
    turn: draft.turn,
    settlement,
    holder,
  };
  emit({
    type: 'great_work_created',
    work: id,
    name: resolveText(ctx.content, make.next),
    kind: make.kind,
    person: person.id,
    player: unit.owner,
    settlement,
    visibleTo: 'all',
  });
  const left = make.left - 1;
  draft.units[unitId]!.charges = left;
  draft.units[unitId]!.moves = 0;
  return left > 0;
}

/** Turn step: works in settlements that are gone (razed) are lost. */
export function greatWorksTurn(draft: Draft<GameState>) {
  const works = draft.greatWorks;
  if (!works) return;
  for (const id of Object.keys(works))
    if (!draft.settlements[works[id]!.settlement]) delete works[id];
}

type MoveWork = Extract<Action, { type: 'move_great_work' }>;
type SwapWorks = Extract<Action, { type: 'swap_great_works' }>;

export const greatWorksHandlers = {
  move_great_work: {
    validate(state, action, ctx) {
      const w = state.greatWorks?.[action.work];
      const from = w ? state.settlements[w.settlement] : undefined;
      if (!w || from?.owner !== action.player)
        return { code: 'not_yours', message: "That isn't one of your great works" };
      const to = state.settlements[action.settlement];
      if (!to || to.owner !== action.player)
        return { code: 'not_yours', message: 'Great works go to your own settlements' };
      if (to.id === from.id && holdersIn(ctx, to).some((h) => h.id === w.holder))
        return { code: 'already', message: "It's already there" };
      if (!freeHolder(ctx, state, to, w.kind))
        return {
          code: 'no_slot',
          message: `No empty slot for a great work of ${WORK_KIND_NAMES[w.kind]} there`,
        };
      return undefined;
    },
    apply(draft, action, ctx) {
      const snap = current(draft);
      const holder = freeHolder(
        ctx,
        snap,
        snap.settlements[action.settlement]!,
        snap.greatWorks![action.work]!.kind,
      )!;
      const w = draft.greatWorks![action.work]!;
      w.settlement = action.settlement;
      w.holder = holder;
    },
  } satisfies ActionHandler<MoveWork>,

  swap_great_works: {
    validate(state, action) {
      const a = state.greatWorks?.[action.a];
      const b = state.greatWorks?.[action.b];
      const mine = (w: GreatWorkState | undefined) =>
        !!w && state.settlements[w.settlement]?.owner === action.player;
      if (!mine(a) || !mine(b) || action.a === action.b)
        return { code: 'not_yours', message: 'Swap two of your own great works' };
      if (a!.kind !== b!.kind)
        return { code: 'kinds', message: 'Only works of the same kind can swap places' };
      return undefined;
    },
    apply(draft, action) {
      const a = draft.greatWorks![action.a]!;
      const b = draft.greatWorks![action.b]!;
      [a.settlement, b.settlement] = [b.settlement, a.settlement];
      [a.holder, b.holder] = [b.holder, a.holder];
    },
  } satisfies ActionHandler<SwapWorks>,
};
