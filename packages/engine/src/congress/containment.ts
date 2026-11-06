import type { Draft } from 'immer';
import type { Emit, EngineContext } from '../context';
import { cultureProgress } from '../culture/tourism';
import { religiousProgress } from '../religion/rules';
import { spaceProgress } from '../science/space';
import { scaleCost } from '../speed';
import type { GameState, PlayerId, VictoryKind } from '../state';
import { turnOrder } from '../context';
import { dominationProgress } from '../victory';
import { diplomaticOn, diplomaticPoints } from './congress';

/**
 * Stopping a runaway leader (D120): when a civ is `rules.congress.containment.atPercent` of the
 * way to a victory, the World Congress meets at once (the next turn) to vote on an emergency
 * resolution against it. If "Contain" wins, its `bane` effects hold for `containment.turns`
 * turns (scaled by speed); the same civ and victory can't be called again for `cooldown` turns.
 */

const KINDS: readonly VictoryKind[] = [
  'science',
  'culture',
  'religion',
  'diplomatic',
  'domination',
];

const average = (parts: number[]) =>
  parts.length === 0 ? 0 : Math.floor(parts.reduce((a, b) => a + b, 0) / parts.length);

/** How far (percent, 0–100) a player is toward each victory that's on in this game. */
export function victoryProgress(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
): { victory: VictoryKind; percent: number }[] {
  const out: { victory: VictoryKind; percent: number }[] = [];
  const st = state.settings;
  for (const victory of KINDS) {
    let percent = 0;
    switch (victory) {
      case 'science': {
        if (st.science === false) continue;
        // The tree is most of the way to the stars: its share of the techs, or the space
        // projects done, whichever is further along.
        const sp = spaceProgress(ctx, state, player);
        const techs = ctx.content.ids.tech.filter(
          (id) => !ctx.content.entities.tech[id]!.repeatable,
        );
        const known =
          state.players[player]?.techs.done.filter((id) => techs.includes(id)).length ?? 0;
        percent =
          sp.arrives !== null
            ? 100
            : Math.max(
                Math.floor((sp.done * 100) / Math.max(1, sp.total)),
                Math.min(99, Math.floor((known * 100) / Math.max(1, techs.length))),
              );
        break;
      }
      case 'culture':
        if (st.culture === false) continue;
        // Each other civ: visiting tourists against its domestic ones, at most 100%.
        percent = average(
          cultureProgress(ctx, state, player).map((x) =>
            Math.min(100, Math.floor((x.visiting * 100) / Math.max(1, x.domestic))),
          ),
        );
        break;
      case 'religion': {
        const religion = state.players[player]?.religion;
        if (st.religion === false || !religion) continue;
        percent = average(
          religiousProgress(state, religion).map((x) =>
            Math.min(100, Math.floor((x.following * 100) / Math.max(1, x.needed))),
          ),
        );
        break;
      }
      case 'diplomatic':
        if (!diplomaticOn(state)) continue;
        percent = Math.min(
          100,
          Math.floor(
            (diplomaticPoints(ctx, state, player) * 100) /
              Math.max(1, ctx.content.rules.congress.victoryPoints),
          ),
        );
        break;
      case 'domination': {
        if (st.domination === false) continue;
        const d = dominationProgress(state, player);
        percent = d.needed > 0 ? Math.floor((d.held * 100) / d.needed) : 0;
        break;
      }
    }
    out.push({ victory, percent });
  }
  return out;
}

/** The emergency resolution for a victory, if the content has one. */
export function containmentResolution(ctx: EngineContext, victory: VictoryKind) {
  return ctx.content.ids.resolution
    .map((id) => ctx.content.entities.resolution[id]!)
    .find((r) => r.emergency === victory);
}

/**
 * Turn step (after regular sessions): containments that ran their course end; then, if no
 * session is meeting, the first civ in this turn's order that's close to a victory (and not
 * already contained or called for it lately) brings an emergency session for next turn.
 */
export function containmentTurn(draft: Draft<GameState>, ctx: EngineContext, emit: Emit) {
  const c = draft.congress;
  if (!c) return;
  for (const id of draft.playerOrder) {
    const p = draft.players[id]!;
    if (p.contained && (p.contained.until < draft.turn || !p.alive)) {
      emit({
        type: 'containment_ended',
        player: id,
        resolution: p.contained.resolution,
        visibleTo: 'all',
      });
      delete p.contained;
    }
  }
  if (c.session) return;
  const r = ctx.content.rules.congress.containment;
  const state = draft as GameState;
  for (const id of turnOrder(state)) {
    const p = state.players[id]!;
    if (!p.alive || p.contained) continue;
    const near = victoryProgress(ctx, state, id)
      .filter((x) => x.percent >= r.atPercent && x.percent < 100)
      .sort((a, b) => b.percent - a.percent || KINDS.indexOf(a.victory) - KINDS.indexOf(b.victory));
    for (const { victory, percent } of near) {
      const res = containmentResolution(ctx, victory);
      const last = c.called?.[`${id}:${victory}`];
      if (!res || (last !== undefined && draft.turn - last < r.cooldown)) continue;
      c.called = { ...c.called, [`${id}:${victory}`]: draft.turn };
      c.session = { turn: draft.turn + 1, agenda: [res.id], emergency: { target: id, victory } };
      c.votes = {};
      emit({ type: 'containment_called', target: id, victory, percent, visibleTo: 'all' });
      emit({
        type: 'congress_session',
        turn: c.session.turn,
        agenda: c.session.agenda,
        visibleTo: 'all',
      });
      return;
    }
  }
}

/** How long a containment that passes this turn holds (scaled by speed). */
export function containmentTurns(ctx: EngineContext, state: Pick<GameState, 'settings'>): number {
  return Math.max(1, scaleCost(ctx, state, ctx.content.rules.congress.containment.turns));
}
