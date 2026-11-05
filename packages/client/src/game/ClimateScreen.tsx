import { resolveText } from '@cx/content';
import {
  climateOf,
  distance,
  type EngineContext,
  emissionsPerTurn,
  type GameState,
  type PlayerId,
} from '@cx/engine';

import { Icon } from '../ui/Icon';
import { civName } from './model';
import { useEscape } from '../ui/Menu';

/**
 * Climate and disasters (docs/04-advanced-systems.md, "Climate & disasters"): world emissions
 * and the climate phase, who emits what, the latest disasters, and what each kind does.
 */
export function ClimateScreen({
  ctx,
  state,
  viewer,
  onClose,
}: {
  ctx: EngineContext;
  state: GameState;
  viewer: PlayerId;
  onClose: () => void;
}) {
  const { content } = ctx;
  const t = (text: string) => resolveText(content, text);
  useEscape(onClose);
  const c = climateOf(ctx, state);
  const per = emissionsPerTurn(ctx, state);
  const total = Object.values(per).reduce((a, b) => a + b, 0);
  const phases = content.rules.climate.phases;
  const goal = c.next?.at ?? phases[phases.length - 1]?.at ?? 1;
  const near = (tile: number) => {
    const known = Object.values(state.settlements).sort(
      (a, b) =>
        distance(state.map, a.tile, tile) - distance(state.map, b.tile, tile) ||
        (a.id < b.id ? -1 : 1),
    )[0];
    return known && distance(state.map, known.tile, tile) <= 6
      ? `near ${known.name}`
      : 'in the wilds';
  };
  const log = [...(state.disasterLog ?? [])].reverse().slice(0, 12);

  return (
    <div className="screen climate-screen" role="dialog" aria-label="Climate">
      <header className="screen-head">
        <h2>
          <Icon name="climate" size={30} />
          Climate
        </h2>
        <p className="screen-sub">
          {c.name}
          {c.disasters > 0 ? ` · disasters ${c.disasters}% more likely` : ''} · {c.emissions}{' '}
          emissions so far ({total >= 0 ? '+' : ''}
          {total} a turn)
        </p>
        <button type="button" className="close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>
      <div className="screen-scroll">
        <div className="screen-band">
          <div className="band-stat">
            <Icon name="climate" size={34} />
            <b className={c.name.length > 12 ? 'long' : ''}>{c.name}</b>
            <span>Climate</span>
          </div>
          <div className="band-stat">
            <Icon name="production" size={34} />
            <b>{c.emissions}</b>
            <span>
              Emissions so far · {total >= 0 ? '+' : ''}
              {total} a turn
            </span>
          </div>
          <div className="band-stat">
            <Icon name="boost" size={34} />
            <b>+{c.disasters}%</b>
            <span>Disasters more likely</span>
          </div>
          <div className="band-stat">
            <Icon name="water" size={34} />
            <b>{c.next ? c.next.at - c.emissions : 0}</b>
            <span>{c.next ? `Emissions until ${c.next.name}` : 'The last phase is reached'}</span>
          </div>
        </div>
        <ol className="climate-track" aria-label="Climate phases">
          <li className={c.emissions < (phases[0]?.at ?? 0) ? 'now' : 'past'}>
            <strong>Stable</strong>
            <small>0</small>
          </li>
          {phases.map((ph, i) => {
            const reached = c.emissions >= ph.at;
            const nextAt = phases[i + 1]?.at;
            const now = reached && (nextAt === undefined || c.emissions < nextAt);
            return (
              <li
                key={ph.name}
                className={now ? 'now' : reached ? 'past' : ''}
                title={`${ph.name} at ${ph.at} emissions: disasters ${ph.disasters}% more likely, the sea rises over more low coast`}
              >
                <strong>{ph.name}</strong>
                <small>{ph.at}</small>
              </li>
            );
          })}
        </ol>
        <div className="climate-grid">
          <section className="congress-card">
            <h3>Emissions</h3>
            <div className="dvp-bar climate-bar" aria-label={`Emissions ${c.emissions} of ${goal}`}>
              <span style={{ width: `${Math.min(100, (c.emissions / goal) * 100)}%` }} />
            </div>
            <p className="hint">
              {c.next
                ? `${c.next.name} at ${c.next.at}: more disasters, and the sea rises over more low coastal land.`
                : 'The last phase is reached.'}{' '}
              Factories, power plants and electronics works emit; coastal settlements and districts
              stay above water.
            </p>
            <ul className="dvp-list">
              {state.playerOrder
                .filter((p) => state.players[p]!.alive)
                .map((p) => (
                  <li key={p} className={p === viewer ? 'mine' : ''}>
                    <span>{civName(content, state, p)}</span>
                    <span className="dvp-bar climate-bar">
                      <span
                        style={{ width: `${total > 0 ? ((per[p] ?? 0) / total) * 100 : 0}%` }}
                      />
                    </span>
                    <span className="mono">+{per[p] ?? 0}</span>
                  </li>
                ))}
            </ul>
          </section>
          <section className="congress-card">
            <h3>Latest disasters</h3>
            {log.length === 0 ? (
              <p className="hint">None yet.</p>
            ) : (
              <ul className="passed-list">
                {log.map((d, i) => {
                  const def = content.entities.disaster[d.disaster];
                  return (
                    <li key={i}>
                      <strong>
                        {def ? t(def.name) : d.disaster} {near(d.tile)}
                      </strong>
                      <span>Turn {d.turn}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <section className="congress-card">
            <h3>What can strike</h3>
            <ul className="passed-list">
              {content.ids.disaster.map((id) => {
                const def = content.entities.disaster[id]!;
                return (
                  <li key={id}>
                    <strong>{t(def.name)}</strong>
                    <span>{t(def.description)}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
