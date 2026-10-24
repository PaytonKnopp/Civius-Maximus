import { resolveText } from '@cx/content';
import {
  type Action,
  type EngineContext,
  type GameState,
  greatPersonCost,
  greatPersonRates,
  nextGreatPerson,
  type PlayerId,
  pointsOf,
  recruitCost,
  validateAction,
} from '@cx/engine';
import { useEffect } from 'react';
import { civName, whole } from './model';

interface Props {
  ctx: EngineContext;
  state: GameState;
  viewer: PlayerId;
  act: (action: Action) => boolean;
  onClose: () => void;
}

/** The great people race: who's next in each class, everyone's points, and recruiting. */
export function GreatPeopleScreen({ ctx, state, viewer, act, onClose }: Props) {
  const { content } = ctx;
  const t = (text: string) => resolveText(content, text);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const rates = greatPersonRates(ctx, state, viewer);
  const mine = state.players[viewer]!.greatPeople.map((id) => content.entities.greatPerson[id]!);

  return (
    <div className="screen" role="dialog" aria-label="Great people">
      <header className="screen-head">
        <h2>Great People</h2>
        <p className="screen-sub">
          Districts and buildings earn points toward each kind. The first to reach the next one's
          cost earns them; or buy them now for the points you're missing.
        </p>
        <button type="button" className="close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>
      <div className="gp-grid">
        {content.ids.greatPersonClass.map((cls) => {
          const def = content.entities.greatPersonClass[cls]!;
          const next = nextGreatPerson(ctx, state, cls);
          const cost = greatPersonCost(ctx, state, cls);
          const points = pointsOf(state, viewer, cls);
          const rivals = state.playerOrder
            .filter((p) => p !== viewer && state.players[p]!.alive)
            .map((p) => ({ p, points: pointsOf(state, p, cls) }))
            .sort((a, b) => b.points - a.points);
          const leader = rivals[0];
          const recruit: Action = { type: 'recruit_great_person', player: viewer, class: cls };
          const why = validateAction(state, recruit, ctx)?.message;
          return (
            <section className="gp-card" key={cls}>
              <h3>
                <span aria-hidden="true">{def.icon}</span> {t(def.name)}
              </h3>
              {next ? (
                <>
                  <p className="gp-name">
                    {t(next.name)}{' '}
                    <span className="muted">({t(content.entities.era[next.era]?.name ?? '')})</span>
                  </p>
                  <p className="gp-text">{t(next.description)}</p>
                  <div className="gp-bar" aria-hidden="true">
                    <span style={{ width: `${Math.min(100, (points * 100) / cost)}%` }} />
                  </div>
                  <p className="hint mono">
                    You {points}/{cost} (+{rates[cls] ?? 0} a turn)
                    {leader && leader.points > 0
                      ? ` · ${civName(content, state, leader.p)} ${leader.points}`
                      : ''}
                  </p>
                  <button type="button" disabled={!!why} title={why} onClick={() => act(recruit)}>
                    Recruit for 💰 {whole(recruitCost(ctx, state, viewer, cls))}
                  </button>
                </>
              ) : (
                <p className="hint">All of them have been earned.</p>
              )}
            </section>
          );
        })}
      </div>
      {mine.length > 0 && (
        <section className="gp-mine">
          <h3>Yours</h3>
          <ul>
            {mine.map((p) => (
              <li key={p.id}>
                <strong>{t(p.name)}</strong>: {t(p.description)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
