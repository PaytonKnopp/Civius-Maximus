import { resolveText } from '@cx/content';
import {
  type Action,
  canRecruitWith,
  type Currency,
  type EngineContext,
  type GameState,
  greatPersonCost,
  greatPersonRates,
  inRace,
  nextGreatPerson,
  type PlayerId,
  pointsOf,
  recruitCost,
  validateAction,
} from '@cx/engine';
import { useEffect } from 'react';
import { civName, whole } from './model';
import { Icon } from '../ui/Icon';
import { EMOJI_ICONS, ICONS } from '../ui/icons';

/** A class's icon: its own if the set has one (gp_scientist...), else by its emoji. */
export function classIcon(cls: string, emoji: string | undefined): string {
  return ICONS[cls] ? cls : ((emoji && EMOJI_ICONS[emoji]) ?? 'greatPeople');
}

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
        <h2>
          <Icon name="greatPeople" size={30} />
          Great People
        </h2>
        <p className="screen-sub">
          Districts and buildings earn points toward each kind. The first to reach the next one's
          cost earns them; or buy them now, with gold or faith, for the points you're missing.
        </p>
        <button type="button" className="close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>
      <div className="screen-scroll">
        <div className="gp-grid">
          {content.ids.greatPersonClass.map((cls) => {
            const def = content.entities.greatPersonClass[cls]!;
            const next = nextGreatPerson(ctx, state, cls);
            if (!next) return null;
            const cost = greatPersonCost(ctx, state, cls);
            const points = pointsOf(state, viewer, cls);
            const rivals = state.playerOrder
              .filter((p) => p !== viewer && state.players[p]!.alive)
              .map((p) => ({ p, points: pointsOf(state, p, cls) }))
              .sort((a, b) => b.points - a.points);
            const leader = rivals[0];
            const recruit = (currency: Currency): Action => ({
              type: 'recruit_great_person',
              player: viewer,
              class: cls,
              currency,
            });
            const why = (currency: Currency) =>
              validateAction(state, recruit(currency), ctx)?.message;
            const rate = rates[cls] ?? 0;
            const turns = rate > 0 ? Math.ceil(Math.max(0, cost - points) / rate) : null;
            const out = !inRace(ctx, state, viewer, cls);
            return (
              <section className={`gp-card ${out ? 'out' : ''}`} key={cls}>
                <header className="gp-head">
                  <Icon name={classIcon(cls, def.icon)} size={46} />
                  <div>
                    <span className="gp-kind">{t(def.name)}</span>
                    <h3 className="gp-name">{t(next.name)}</h3>
                    <span className="gp-era">
                      {t(content.entities.era[next.era]?.name ?? '')} era
                    </span>
                  </div>
                </header>
                <p className="gp-text">{t(next.description)}</p>
                <div className="gp-race">
                  <div className="gp-racer you">
                    <span>You</span>
                    <i style={{ ['--v' as string]: Math.min(1, points / cost) }} />
                    <b className="mono">
                      {points}/{cost}
                    </b>
                  </div>
                  {leader && leader.points > 0 && (
                    <div className="gp-racer">
                      <span>{civName(content, state, leader.p)}</span>
                      <i style={{ ['--v' as string]: Math.min(1, leader.points / cost) }} />
                      <b className="mono">{leader.points}</b>
                    </div>
                  )}
                  <p className="gp-rate">
                    {out
                      ? 'You founded a religion: you\u2019re out of this race.'
                      : rate > 0
                        ? `+${rate} a turn${turns !== null ? ` · about ${turns} turns` : ''}`
                        : 'No points yet: build the district that earns them.'}
                  </p>
                </div>
                <div className="gp-actions">
                  <button
                    type="button"
                    disabled={!!why('gold')}
                    title={why('gold') ?? 'Buy now for the points you are missing'}
                    onClick={() => act(recruit('gold'))}
                  >
                    Recruit <Icon name="gold" /> {whole(recruitCost(ctx, state, viewer, cls))}
                  </button>
                  {canRecruitWith(ctx, cls, 'faith') && (
                    <button
                      type="button"
                      disabled={!!why('faith')}
                      title={why('faith') ?? 'Buy now with faith'}
                      onClick={() => act(recruit('faith'))}
                    >
                      <Icon name="faith" /> {whole(recruitCost(ctx, state, viewer, cls, 'faith'))}
                    </button>
                  )}
                </div>
              </section>
            );
          })}
        </div>
        {(() => {
          const done = content.ids.greatPersonClass.filter((c) => !nextGreatPerson(ctx, state, c));
          return done.length > 0 ? (
            <p className="gp-done">
              <span>Every one earned:</span>
              {done.map((c) => {
                const def = content.entities.greatPersonClass[c]!;
                return (
                  <span key={c} className="gp-done-chip">
                    <Icon name={classIcon(c, def.icon)} size={18} /> {t(def.name)}
                  </span>
                );
              })}
            </p>
          ) : null;
        })()}
        {mine.length > 0 && (
          <section className="gp-mine">
            <h3>Yours</h3>
            <ul>
              {mine.map((p) => (
                <li key={p.id}>
                  <Icon
                    name={classIcon(p.class, content.entities.greatPersonClass[p.class]?.icon)}
                    size={22}
                  />
                  <div>
                    <strong>{t(p.name)}</strong>
                    <span>{t(p.description)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
