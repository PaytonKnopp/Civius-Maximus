import type { Draft } from 'immer';
import type { Action } from '../actions';
import type { ActionHandler, EngineContext, Emit } from '../context';
import { view } from '../draft';
import { toFixed } from '../fixed';
import { settlementAt } from '../combat/strength';
import { spawnUnit } from '../settlements/handlers';
import type { GameState, SettlementState } from '../state';
import { endGame } from '../victory';
import {
  faithUnitProblem,
  faithUnitReligion,
  religionFoundingProblem,
  hasReligiousVictory,
  incomingPressure,
  leadingReligion,
  pantheonProblem,
  religionsOf,
  spreadProblem,
  takenBeliefs,
} from './rules';

type A<T extends Action['type']> = Extract<Action, { type: T }>;

/** Switches a settlement to whichever religion now leads its pressure, if that changed. */
function convert(draft: Draft<GameState>, ctx: EngineContext, id: string, emit: Emit) {
  const s = draft.settlements[id]!;
  const next = leadingReligion(ctx, s);
  if (next === s.religion) return;
  const from = s.religion;
  s.religion = next;
  const founder = next ? draft.religions[next]?.founder : undefined;
  emit({
    type: 'settlement_converted',
    settlement: id,
    owner: s.owner,
    religion: next,
    from,
    visibleTo: founder && founder !== s.owner ? [s.owner, founder] : [s.owner],
  });
}

export const religionHandlers = {
  found_pantheon: {
    validate(state, action, ctx) {
      return pantheonProblem(ctx, state, action.player, action.belief);
    },
    apply(draft, action, ctx, emit) {
      const p = draft.players[action.player]!;
      p.faith -= toFixed(ctx.content.rules.religion.pantheonFaith);
      p.beliefs = [...p.beliefs, action.belief];
      emit({
        type: 'pantheon_founded',
        player: action.player,
        belief: action.belief,
        visibleTo: 'all',
      });
    },
  } satisfies ActionHandler<A<'found_pantheon'>>,

  found_religion: {
    validate(state, action, ctx) {
      const problem = religionFoundingProblem(ctx, state, action.player, action.unit);
      if (problem) return problem;
      const taken = takenBeliefs(state);
      const e = ctx.content.entities.belief;
      if (e[action.founder]?.kind !== 'founder')
        return { code: 'unknown', message: 'Pick a founder belief' };
      if (e[action.follower]?.kind !== 'follower')
        return { code: 'unknown', message: 'Pick a follower belief' };
      if (taken.has(action.founder) || taken.has(action.follower))
        return { code: 'belief_taken', message: 'Another religion already has that belief' };
      const name = action.name.trim().toLowerCase();
      if (religionsOf(state).some((r) => r.name.trim().toLowerCase() === name))
        return { code: 'name_taken', message: 'A religion already has that name' };
      return undefined;
    },
    apply(draft, action, ctx, emit) {
      const snap = view(draft);
      const u = snap.units[action.unit]!;
      const s = settlementAt(snap, u.tile)!;
      const id = `r${draft.nextEntityId++}`;
      draft.religions[id] = {
        id,
        name: action.name.trim(),
        founder: action.player,
        holyCity: s.id,
        beliefs: [action.founder, action.follower],
        founded: snap.turn,
      };
      const p = draft.players[action.player]!;
      p.religion = id;
      p.beliefs = [...p.beliefs, action.founder];
      delete draft.units[action.unit];
      const holy = draft.settlements[s.id]!;
      // The holy city follows it at once, whatever it followed before, with a fresh start.
      holy.pressure = { [id]: ctx.content.rules.religion.convertAt };
      emit({
        type: 'religion_founded',
        religion: id,
        player: action.player,
        settlement: s.id,
        visibleTo: 'all',
      });
      convert(draft, ctx, s.id, emit);
    },
  } satisfies ActionHandler<A<'found_religion'>>,

  spread_religion: {
    validate(state, action) {
      return spreadProblem(state, action.player, action.unit, action.settlement);
    },
    apply(draft, action, ctx, emit) {
      const u = draft.units[action.unit]!;
      const s = draft.settlements[action.settlement]!;
      s.pressure[u.religion!] =
        (s.pressure[u.religion!] ?? 0) + ctx.content.rules.religion.missionaryPressure;
      u.moves = 0;
      u.charges = (u.charges ?? 1) - 1;
      emit({
        type: 'religion_preached',
        unit: action.unit,
        owner: action.player,
        settlement: action.settlement,
        religion: u.religion!,
        visibleTo: s.owner === action.player ? [action.player] : [action.player, s.owner],
      });
      if (u.charges <= 0) delete draft.units[action.unit];
      convert(draft, ctx, action.settlement, emit);
    },
  } satisfies ActionHandler<A<'spread_religion'>>,

  buy_faith_unit: {
    validate(state, action, ctx) {
      return faithUnitProblem(ctx, state, action.player, action.settlement, action.unit);
    },
    apply(draft, action, ctx, emit) {
      const s = draft.settlements[action.settlement]!;
      const def = ctx.content.entities.unit[action.unit]!;
      const religion = faithUnitReligion(view(draft), s)!;
      const id = spawnUnit(draft, ctx, action.player, action.unit, s.tile);
      if (!id) return;
      draft.players[action.player]!.faith -= toFixed(def.faithCost);
      draft.units[id]!.religion = religion;
      draft.units[id]!.charges = ctx.content.rules.religion.missionaryCharges;
      emit({
        type: 'item_bought',
        settlement: action.settlement,
        owner: action.player,
        item: { kind: 'unit', id: action.unit },
        visibleTo: [action.player],
      });
    },
  } satisfies ActionHandler<A<'buy_faith_unit'>>,
} satisfies {
  [T in 'found_pantheon' | 'found_religion' | 'spread_religion' | 'buy_faith_unit']: ActionHandler<
    A<T>
  >;
};

/**
 * End of each turn: every settlement's pressure decays a little and the pressure it feels comes
 * in; settlements convert; then a religion may have won.
 */
export function religionTurn(draft: Draft<GameState>, ctx: EngineContext, emit: Emit) {
  if (Object.keys(draft.religions).length === 0) return;
  const r = ctx.content.rules.religion;
  const snap = view(draft);
  const ids = Object.keys(snap.settlements).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  // Everyone's pressure is worked out from the same picture, before anyone converts.
  const incoming = new Map<string, Record<string, number>>();
  for (const id of ids) incoming.set(id, incomingPressure(ctx, snap, snap.settlements[id]!));
  for (const id of ids) {
    const s: Draft<SettlementState> = draft.settlements[id]!;
    const add = incoming.get(id)!;
    const next: Record<string, number> = {};
    for (const rel of [...new Set([...Object.keys(s.pressure), ...Object.keys(add)])].sort()) {
      if (!draft.religions[rel]) continue;
      const before = s.pressure[rel] ?? 0;
      const after = before - Math.floor((before * r.pressureDecayPercent) / 100) + (add[rel] ?? 0);
      if (after > 0) next[rel] = after;
    }
    s.pressure = next;
    convert(draft, ctx, id, emit);
  }
  if (draft.status !== 'playing' || draft.settings.religion === false) return;
  const after = view(draft);
  for (const rel of religionsOf(after)) {
    if (after.players[rel.founder]?.alive && hasReligiousVictory(after, rel.id)) {
      endGame(draft, 'religion', rel.founder, emit);
      return;
    }
  }
}
