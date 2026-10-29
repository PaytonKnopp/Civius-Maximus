import { resolveText } from '@cx/content';
import {
  type Action,
  type EngineContext,
  type GameState,
  type PlayerId,
  thresholds,
} from '@cx/engine';
import { useEffect, useState } from 'react';
import { Icon } from '../ui/Icon';

/**
 * Eras and ages (docs/04-advanced-systems.md, "Eras and ages"): this era's age and what it
 * gives, era score toward the next age with the dark and golden marks, the dedications (chosen
 * here when it's time), and the timeline of every historic moment so far.
 */
export function AgesScreen({
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
  const a = state.players[viewer]!.ages;
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (!a) return null;
  const age = content.entities.age[a.age];
  const era = content.entities.era[a.era];
  const { dark, golden } = thresholds(ctx, era?.order ?? 1);
  const max = Math.max(golden + 6, a.score + 2);
  const pct = (n: number) => `${Math.min(100, (n / max) * 100)}%`;
  const nextKind =
    a.score < dark
      ? 'Dark Age'
      : a.score >= golden
        ? age?.kind === 'dark'
          ? 'Heroic Age'
          : 'Golden Age'
        : 'Normal Age';
  const choosing = a.pending > 0;
  const eras = Object.values(content.entities.era).sort((x, y) => x.order - y.order);

  return (
    <div className="screen ages-screen" role="dialog" aria-label="Eras and ages">
      <header className="screen-head">
        <h2>
          <Icon name="victory" size={30} />
          Eras and Ages
        </h2>
        <p className="screen-sub">
          {era ? `${t(era.name)} Era` : ''} · {age ? t(age.name) : ''}
        </p>
        <button type="button" className="close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>
      <div className="ages-body">
        <section className="age-card" style={{ borderColor: age?.color }}>
          <h3 style={{ color: age?.color }}>{age ? t(age.name) : 'No age'}</h3>
          <p>{age ? t(age.description) : ''}</p>
          <h4>Era score this era</h4>
          <div className="era-meter" aria-label={`Era score ${a.score}`}>
            <span className="era-fill" style={{ width: pct(a.score) }} />
            <span
              className="era-mark dark"
              style={{ left: pct(dark) }}
              title={`Dark age below ${dark}`}
            />
            <span
              className="era-mark golden"
              style={{ left: pct(golden) }}
              title={`Golden age at ${golden}`}
            />
          </div>
          <p className="hint">
            <strong>{a.score}</strong> so far. Below {dark} the next era is a dark age; {golden} or
            more makes it golden (heroic, after a dark age). Right now that is a{' '}
            <strong>{nextKind}</strong>.
          </p>
          <h4>Dedications</h4>
          {a.dedications.length === 0 && !choosing && <p className="hint">None this era.</p>}
          <ul className="dedication-list">
            {a.dedications.map((id) => {
              const d = content.entities.dedication[id];
              return d ? (
                <li key={id}>
                  <strong>{t(d.name)}</strong> {t(d.description)}
                </li>
              ) : null;
            })}
          </ul>
        </section>

        {choosing && (
          <section className="dedication-choice">
            <h3>
              Choose {a.pending} dedication{a.pending > 1 ? 's' : ''} for this era
            </h3>
            <div className="dedication-cards">
              {content.ids.dedication
                .filter((id) => !a.dedications.includes(id))
                .map((id) => {
                  const d = content.entities.dedication[id]!;
                  const on = picked.includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`dedication-card ${on ? 'on' : ''}`}
                      aria-pressed={on}
                      disabled={!on && picked.length >= a.pending}
                      onClick={() =>
                        setPicked(on ? picked.filter((x) => x !== id) : [...picked, id])
                      }
                    >
                      <strong>{t(d.name)}</strong>
                      <span>{t(d.description)}</span>
                    </button>
                  );
                })}
            </div>
            <button
              type="button"
              className="primary"
              disabled={picked.length === 0}
              onClick={() => {
                if (act({ type: 'choose_dedications', player: viewer, dedications: picked }))
                  setPicked([]);
              }}
            >
              Dedicate the era
            </button>
          </section>
        )}

        <section className="timeline">
          <h3>Timeline</h3>
          <ol className="era-history">
            {eras.map((e) => {
              const past = a.history[e.id];
              const current = e.id === a.era;
              if (!past && !current) return null;
              const ag = content.entities.age[current ? a.age : past!];
              return (
                <li key={e.id} style={{ borderColor: ag?.color }}>
                  <span>{t(e.name)}</span>
                  <strong style={{ color: ag?.color }}>{ag ? t(ag.name) : ''}</strong>
                </li>
              );
            })}
          </ol>
          {a.timeline.length === 0 ? (
            <p className="hint">
              Historic moments earn era score: new settlements, wonders, great people, religions,
              governments, districts, victories in battle, city-state friends, trade routes and
              natural wonders found, and being the first into a new era.
            </p>
          ) : (
            <ul className="moments">
              {[...a.timeline].reverse().map((m, i) => {
                const def = content.entities.moment[m.moment];
                return (
                  <li key={i}>
                    <span className="mono muted">Turn {m.turn}</span>
                    <span>{def ? t(def.name) : m.moment}</span>
                    <span className="mono moment-score">+{m.score}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
