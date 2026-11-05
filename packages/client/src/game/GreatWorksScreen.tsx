import { type GreatWorkKind, resolveText } from '@cx/content';
import {
  type Action,
  type EngineContext,
  freeHolder,
  type GameState,
  type GreatWorkState,
  greatWorkYields,
  holdersIn,
  holderWorks,
  type PlayerId,
  settlementsOf,
  storedWorks,
  WORK_KIND_NAMES,
} from '@cx/engine';

import { fmt } from './model';
import { Icon } from '../ui/Icon';
import { useEscape } from '../ui/Menu';

const KIND_ICON: Record<GreatWorkKind, string> = {
  writing: 'gp_writer',
  art: 'gp_artist',
  music: 'gp_musician',
  relic: 'relic',
};

/**
 * Great works (docs/04-advanced-systems.md, "Great works"): every slot in your settlements as a
 * frame on a gallery wall, what's in it, which buildings are themed, and where each work could
 * move.
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
  useEscape(onClose);
  const mine = settlementsOf(state, viewer);
  const r = content.rules.greatWorks;
  const all = Object.values(state.greatWorks ?? {}).filter(
    (w) => state.settlements[w.settlement]?.owner === viewer,
  );
  const stored = storedWorks(ctx, state, viewer);
  const galleries = mine
    .map((s) => ({ s, holders: holdersIn(ctx, s) }))
    .filter((g) => g.holders.length > 0);
  const slots = galleries.reduce((n, g) => n + g.holders.reduce((m, h) => m + h.total, 0), 0);
  const shown = all.length - stored.length;
  const themed = galleries.reduce(
    (n, g) => n + g.holders.filter((h) => holderWorks(state, g.s, h).themed).length,
    0,
  );
  const totals: Record<string, number> = {};
  for (const { s } of galleries)
    for (const line of greatWorkYields(ctx, state, s))
      for (const [y, v] of Object.entries(line.yields)) totals[y] = (totals[y] ?? 0) + v;

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
        className="work-move"
        aria-label={`Move ${t(w.name)}`}
        title="Move it to another settlement, or swap it with another work of its kind"
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

  const yieldLine = (kind: GreatWorkKind) =>
    Object.entries(r.yields[kind])
      .map(([y, v]) => `+${v} ${y}`)
      .join(', ');

  const work = (id: string, w: GreatWorkState) => {
    const person = content.entities.greatPerson[w.creator];
    return (
      <li
        key={id}
        className={`work-frame ${w.kind}`}
        title={`${t(w.name)}\n${WORK_KIND_NAMES[w.kind]} by ${person ? t(person.name) : w.creator}, turn ${w.turn}\n${yieldLine(w.kind)}`}
      >
        <Icon name={KIND_ICON[w.kind]} size={34} />
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
          <Icon name="greatWorks" size={30} />
          Great Works
        </h2>
        <p className="screen-sub">
          Each work yields culture and tourism where it hangs; a building whose slots are all filled
          by different people is themed (+{r.themingPercent}%).
        </p>
        <button type="button" className="close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>
      <div className="screen-scroll">
        <div className="screen-band">
          <div className="band-stat">
            <Icon name="greatWorks" size={34} />
            <b>{shown}</b>
            <span>Works on display</span>
          </div>
          <div className="band-stat">
            <Icon name="building" size={34} />
            <b>
              {Math.max(0, slots - shown)}
              <small>/{slots}</small>
            </b>
            <span>Empty slots</span>
          </div>
          <div className="band-stat" title="Buildings with every slot filled by different people">
            <Icon name="trophy" size={34} />
            <b>{themed}</b>
            <span>Themed buildings</span>
          </div>
          <div className="band-stat">
            <Icon name="tourism" size={34} />
            <b>+{fmt(totals.tourism ?? 0)}</b>
            <span>
              Tourism · +{fmt(totals.culture ?? 0)} culture
              {totals.faith ? ` · +${fmt(totals.faith)} faith` : ''}
            </span>
          </div>
        </div>

        {galleries.length === 0 ? (
          <div className="screen-empty">
            <Icon name="greatWorks" size={40} />
            <strong>No slots yet</strong>
            <p>
              Your Palace holds one work; Amphitheaters, Museums and Broadcast Centers (and a few
              wonders) hold more. Great Writers, Artists and Musicians make the works.
            </p>
          </div>
        ) : (
          <div className="works-grid">
            {stored.length > 0 && (
              <section className="works-settlement stored">
                <h3>In storage</h3>
                <p className="hint">Their building is gone: move them somewhere to show them.</p>
                <ul className="works">{stored.map(([id, w]) => work(id, w))}</ul>
              </section>
            )}
            {galleries.map(({ s, holders }) => (
              <section key={s.id} className="works-settlement">
                <h3>{s.name}</h3>
                {holders.map((h) => {
                  const { works, themed: isThemed } = holderWorks(state, s, h);
                  const empty = Math.max(0, h.total - works.length);
                  const open = (Object.entries(h.slots) as [string, number][]).filter(
                    ([, n]) => n > 0,
                  );
                  return (
                    <div key={h.id} className={`works-holder ${isThemed ? 'themed' : ''}`}>
                      <h4>
                        {h.name}
                        <small>
                          {open
                            .map(
                              ([k, n]) =>
                                `${n} ${k === 'any' ? 'of any kind' : WORK_KIND_NAMES[k as GreatWorkKind].toLowerCase()}`,
                            )
                            .join(', ')}
                        </small>
                        {isThemed && <span className="badge">Themed</span>}
                      </h4>
                      <ul className="works">
                        {works.map(([id, w]) => work(id, w))}
                        {Array.from({ length: empty }, (_, i) => {
                          const kind = open.find(([k]) => k !== 'any')?.[0] as
                            GreatWorkKind | undefined;
                          return (
                            <li key={`empty-${i}`} className="work-frame empty">
                              <Icon
                                name={kind ? KIND_ICON[kind] : 'greatWorks'}
                                size={30}
                                variant="glyph"
                              />
                              <span className="work-text">
                                <strong>Empty slot</strong>
                                <small>
                                  {kind
                                    ? `For ${WORK_KIND_NAMES[kind].toLowerCase()}`
                                    : 'For any work'}
                                </small>
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
