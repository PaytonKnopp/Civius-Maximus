import { type GreatWorkKind, resolveText } from '@cx/content';
import {
  type Action,
  type EngineContext,
  freeHolder,
  type GameState,
  type GreatWorkState,
  holdersIn,
  holderWorks,
  type PlayerId,
  settlementsOf,
  storedWorks,
  WORK_KIND_NAMES,
} from '@cx/engine';
import { useEffect } from 'react';
import { Icon } from '../ui/Icon';

const KIND_ICON: Record<GreatWorkKind, string> = {
  writing: '📜',
  art: '🎨',
  music: '🎵',
  relic: '🏺',
};

/**
 * Great works (docs/04-advanced-systems.md, "Great works"): every slot in your settlements,
 * what's in it, which buildings are themed, and where each work could move.
 */
export function GreatWorksScreen({
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
  const mine = settlementsOf(state, viewer);
  const r = content.rules.greatWorks;
  const all = Object.values(state.greatWorks ?? {}).filter(
    (w) => state.settlements[w.settlement]?.owner === viewer,
  );
  const stored = storedWorks(ctx, state, viewer);

  const moveTo = (id: string, w: GreatWorkState) => {
    const places = mine.filter(
      (s) =>
        (s.id !== w.settlement || stored.some(([x]) => x === id)) &&
        freeHolder(ctx, state, s, w.kind),
    );
    const swaps = Object.entries(state.greatWorks ?? {}).filter(
      ([other, o]) =>
        other !== id &&
        o.kind === w.kind &&
        state.settlements[o.settlement]?.owner === viewer &&
        (o.settlement !== w.settlement || o.holder !== w.holder),
    );
    if (places.length === 0 && swaps.length === 0) return null;
    return (
      <select
        aria-label={`Move ${t(w.name)}`}
        value=""
        onChange={(e) => {
          const [how, target] = e.target.value.split(':');
          if (how === 'to' && target)
            act({ type: 'move_great_work', player: viewer, work: id, settlement: target });
          if (how === 'swap' && target)
            act({ type: 'swap_great_works', player: viewer, a: id, b: target });
        }}
      >
        <option value="">Move…</option>
        {places.map((s) => (
          <option key={s.id} value={`to:${s.id}`}>
            To {s.name}
          </option>
        ))}
        {swaps.map(([other, o]) => (
          <option key={other} value={`swap:${other}`}>
            Swap with {t(o.name)} ({state.settlements[o.settlement]?.name})
          </option>
        ))}
      </select>
    );
  };

  const work = (id: string, w: GreatWorkState) => {
    const person = content.entities.greatPerson[w.creator];
    return (
      <li key={id} className="great-work">
        <span className="work-kind" aria-hidden="true">
          {KIND_ICON[w.kind]}
        </span>
        <span className="work-text">
          <strong>{t(w.name)}</strong>
          <small>
            {person ? t(person.name) : w.creator} · turn {w.turn}
          </small>
        </span>
        {moveTo(id, w)}
      </li>
    );
  };

  return (
    <div className="screen great-works-screen" role="dialog" aria-label="Great works">
      <header className="screen-head">
        <h2>
          <Icon name="tourism" size={30} />
          Great Works
        </h2>
        <p className="screen-sub">
          {all.length} work{all.length === 1 ? '' : 's'}. Each yields culture and tourism where it
          hangs; a building full of works by different people is themed (+{r.themingPercent}%).
        </p>
        <button type="button" className="close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>
      <div className="great-works-body">
        {stored.length > 0 && (
          <section className="works-settlement">
            <h3>In storage (not displayed)</h3>
            <ul className="works">{stored.map(([id, w]) => work(id, w))}</ul>
          </section>
        )}
        {mine.map((s) => {
          const holders = holdersIn(ctx, s);
          if (holders.length === 0) return null;
          return (
            <section key={s.id} className="works-settlement">
              <h3>{s.name}</h3>
              {holders.map((h) => {
                const { works, themed } = holderWorks(state, s, h);
                const empty = h.total - works.length;
                const kinds = (Object.entries(h.slots) as [string, number][])
                  .filter(([, n]) => n > 0)
                  .map(
                    ([k, n]) =>
                      `${n} ${k === 'any' ? 'any kind' : WORK_KIND_NAMES[k as GreatWorkKind]}`,
                  )
                  .join(', ');
                return (
                  <div key={h.id} className={`works-holder ${themed ? 'themed' : ''}`}>
                    <h4>
                      {h.name}{' '}
                      <small>
                        {kinds}
                        {themed ? ' · themed' : ''}
                      </small>
                    </h4>
                    <ul className="works">
                      {works.map(([id, w]) => work(id, w))}
                      {Array.from({ length: Math.max(0, empty) }, (_, i) => (
                        <li key={`empty-${i}`} className="great-work empty">
                          Empty slot
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </section>
          );
        })}
        {mine.every((s) => holdersIn(ctx, s).length === 0) && (
          <p className="hint">
            No slots yet. Your Palace holds one work; Amphitheaters, Museums and Broadcast Centers
            (and a few wonders) hold more. Great Writers, Artists and Musicians make the works.
          </p>
        )}
      </div>
    </div>
  );
}
