import { resolveText } from '@cx/content';
import {
  type Action,
  type Ballot,
  ballotCost,
  diplomaticOn,
  diplomaticPoints,
  type EngineContext,
  favorPerTurn,
  type GameState,
  type PlayerId,
  voteCost,
  votingProblem,
} from '@cx/engine';
import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../ui/Icon';
import { civName } from './model';

/**
 * The World Congress (docs/04-advanced-systems.md, "World Congress"): favor, everyone's
 * diplomatic victory points, what's in force, and the ballot when a session meets.
 */
export function CongressScreen({
  ctx,
  state,
  viewer,
  act,
  onClose,
}: {
  ctx: EngineContext;
  state: GameState;
  viewer: PlayerId;
  act: (action: Action) => boolean;
  onClose: () => void;
}) {
  const { content } = ctx;
  const t = (text: string) => resolveText(content, text);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const r = content.rules.congress;
  const c = state.congress;
  const p = state.players[viewer]!;
  const favor = p.favor ?? 0;
  const income = favorPerTurn(ctx, state, viewer);
  const civs = state.playerOrder.filter((id) => state.players[id]!.alive);
  const open = !!c?.session && c.session.turn === state.turn;
  const cast = c?.votes[viewer];

  const initial = useMemo<Ballot[]>(
    () =>
      (open ? c!.session!.agenda : []).map((res) => {
        const prior = cast?.find((b) => b.resolution === res);
        if (prior) return { ...prior };
        const def = content.entities.resolution[res]!;
        return {
          resolution: res,
          option: def.options[0]!.id,
          target: def.target === 'player' ? viewer : null,
          votes: 1,
        };
      }),
    // A fresh ballot for each session.
    [open, c?.session?.turn],
  );
  const [ballots, setBallots] = useState<Ballot[]>(initial);
  useEffect(() => setBallots(initial), [initial]);
  const set = (i: number, patch: Partial<Ballot>) =>
    setBallots((bs) => bs.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const cost = ballotCost(ctx, ballots);
  const problem = open ? votingProblem(ctx, state, viewer, ballots) : undefined;

  const standings = civs
    .map((id) => ({ id, points: diplomaticPoints(ctx, state, id) }))
    .sort((a, b) => b.points - a.points || (a.id < b.id ? -1 : 1));

  return (
    <div className="screen congress-screen" role="dialog" aria-label="World Congress">
      <header className="screen-head">
        <h2>
          <Icon name="congress" size={30} />
          World Congress
        </h2>
        <p className="screen-sub">
          {!c
            ? `It forms when the first civilization reaches the ${t(content.entities.era[r.foundingEra]?.name ?? r.foundingEra)} era.`
            : open
              ? 'In session: vote this turn.'
              : `Next session: turn ${c.nextSession}.`}{' '}
          <span title={income.lines.map((l) => `${l.label}: +${l.amount}`).join('\n')}>
            <strong>{favor}</strong> favor (+{income.total} a turn)
          </span>
        </p>
        <button type="button" className="close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>
      <div className="congress-body">
        <section className="congress-card">
          <h3>Diplomatic victory</h3>
          {diplomaticOn(state) ? (
            <>
              <p className="hint">
                {r.victoryPoints} points win. Being named World Leader gives 2; putting the most
                votes behind a resolution that passes gives {r.agendaPoints}; some wonders give
                more.
              </p>
              <ul className="dvp-list">
                {standings.map((x) => (
                  <li key={x.id} className={x.id === viewer ? 'mine' : ''}>
                    <span>{civName(content, state, x.id)}</span>
                    <span className="dvp-bar">
                      <span
                        style={{ width: `${Math.min(100, (x.points / r.victoryPoints) * 100)}%` }}
                      />
                    </span>
                    <span className="mono">
                      {x.points}/{r.victoryPoints}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="hint">Diplomatic victory is off in this game.</p>
          )}
        </section>

        {open && (
          <section className="congress-card ballot">
            <h3>Your ballot{cast ? ' (cast; you can change it this turn)' : ''}</h3>
            {ballots.map((b, i) => {
              const def = content.entities.resolution[b.resolution]!;
              const next = voteCost(ctx, b.votes + 1) - voteCost(ctx, b.votes);
              return (
                <div key={b.resolution} className="resolution">
                  <h4>{t(def.name)}</h4>
                  <p className="hint">{t(def.description)}</p>
                  <div className="resolution-options">
                    {def.options.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        className={`resolution-option ${b.option === o.id ? 'on' : ''}`}
                        aria-pressed={b.option === o.id}
                        onClick={() =>
                          set(i, {
                            option: o.id,
                            // A bane is for someone else.
                            ...(def.target === 'player' && o.tone === 'bane' && b.target === viewer
                              ? { target: civs.find((x) => x !== viewer) ?? viewer }
                              : {}),
                          })
                        }
                      >
                        <strong>{t(o.name)}</strong>
                        <span>{t(o.description)}</span>
                      </button>
                    ))}
                  </div>
                  <div className="resolution-row">
                    {def.target === 'player' && (
                      <label className="setup-field">
                        <span>Civ</span>
                        <select
                          value={b.target ?? ''}
                          onChange={(e) => set(i, { target: e.target.value })}
                        >
                          {civs.map((id) => (
                            <option key={id} value={id}>
                              {civName(content, state, id)}
                              {id === viewer ? ' (you)' : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <div className="votes">
                      <button
                        type="button"
                        className="ghost small"
                        disabled={b.votes <= 1}
                        onClick={() => set(i, { votes: b.votes - 1 })}
                        aria-label="One vote fewer"
                      >
                        −
                      </button>
                      <span className="mono">
                        {b.votes} vote{b.votes === 1 ? '' : 's'}
                      </span>
                      <button
                        type="button"
                        className="ghost small"
                        disabled={cost + next > favor}
                        title={`One more vote: ${next} favor`}
                        onClick={() => set(i, { votes: b.votes + 1 })}
                        aria-label="One vote more"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            <p className="hint">
              Extra votes cost {cost} favor of your {favor}.{problem ? ` ${problem.message}.` : ''}
            </p>
            <button
              type="button"
              className="primary"
              disabled={!!problem}
              onClick={() => act({ type: 'cast_votes', player: viewer, ballots })}
            >
              {cast ? 'Change my votes' : 'Cast my votes'}
            </button>
          </section>
        )}

        {c && c.passed.length > 0 && (
          <section className="congress-card">
            <h3>In force until the next session</h3>
            <ul className="passed-list">
              {c.passed.map((x) => {
                const def = content.entities.resolution[x.resolution];
                const o = def?.options.find((y) => y.id === x.option);
                if (!def || !o) return null;
                return (
                  <li key={x.resolution}>
                    <strong>
                      {t(def.name)}: {t(o.name)}
                    </strong>
                    {x.target ? ` (${civName(content, state, x.target)})` : ''}
                    <span>{t(o.description)}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
