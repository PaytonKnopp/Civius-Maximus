import { resolveText } from '@cx/content';
import {
  type Action,
  type EngineContext,
  type GameState,
  type PlayerId,
  settlementsOf,
  titlesAvailable,
  titlesEarned,
} from '@cx/engine';
import { useEffect } from 'react';
import { Icon } from '../ui/Icon';
import { Portrait } from '../ui/Portrait';

/**
 * Governors (docs/04-advanced-systems.md, "Governors"): seven of them, each with an ability and
 * a tree of promotions. Titles come from civics; one appoints a governor or buys a promotion.
 * Each governor serves one settlement and takes a few turns to settle in.
 */
export function GovernorsScreen({
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
  const p = state.players[viewer]!;
  const titles = titlesAvailable(ctx, p);
  const mine = settlementsOf(state, viewer);
  const establish = content.rules.governors.establishTurns;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const nextTitle = content.rules.governors.titleCivics.find((c) => !p.civics.done.includes(c));

  return (
    <div className="screen governors-screen" role="dialog" aria-label="Governors">
      <header className="screen-head">
        <h2>
          <Icon name="capital" size={30} />
          Governors
        </h2>
        <p className="screen-sub">
          <strong>{titles}</strong> title{titles === 1 ? '' : 's'} to spend ({titlesEarned(ctx, p)}{' '}
          earned).{' '}
          {nextTitle
            ? `The next comes with ${t(content.entities.civic[nextTitle]?.name ?? nextTitle)}.`
            : 'Every title is earned.'}{' '}
          A governor takes {establish} turns to settle in.
        </p>
        <button type="button" className="close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>
      <div className="governor-grid">
        {content.ids.governor.map((id) => {
          const def = content.entities.governor[id]!;
          const g = p.governors?.[id];
          const where = g?.settlement ? state.settlements[g.settlement] : undefined;
          const turnsLeft =
            g && !g.established && g.settlement ? Math.max(0, g.activeOn - state.turn) : 0;
          return (
            <article
              key={id}
              className={`governor-card ${g ? 'appointed' : ''}`}
              style={{ borderTopColor: def.color }}
            >
              <div className="governor-head">
                <Portrait
                  portrait={def.portrait}
                  primary={def.color}
                  secondary="#f0e6cc"
                  size={84}
                  crop="head"
                />
                <div>
                  <h3>{t(def.name)}</h3>
                  <p className="governor-title">{t(def.title)}</p>
                </div>
              </div>
              <p className="governor-desc">{t(def.description)}</p>
              {!g ? (
                <button
                  type="button"
                  className="primary"
                  disabled={titles < 1}
                  onClick={() => act({ type: 'appoint_governor', player: viewer, governor: id })}
                >
                  Appoint (1 title)
                </button>
              ) : (
                <>
                  <p className="governor-status">
                    {where
                      ? g.established
                        ? `Serving in ${where.name}`
                        : `Settling into ${where.name}: ${turnsLeft} turn${turnsLeft === 1 ? '' : 's'}`
                      : 'Waiting for a post'}
                  </p>
                  <label className="setup-field">
                    <span>Post to</span>
                    <select
                      value={g.settlement ?? ''}
                      onChange={(e) =>
                        e.target.value &&
                        act({
                          type: 'assign_governor',
                          player: viewer,
                          governor: id,
                          settlement: e.target.value,
                        })
                      }
                    >
                      <option value="">Choose a settlement…</option>
                      {mine.map((s) => {
                        const other = Object.entries(p.governors ?? {}).find(
                          ([gid, x]) => gid !== id && x.settlement === s.id,
                        );
                        return (
                          <option key={s.id} value={s.id}>
                            {s.name}
                            {other
                              ? ` (replaces ${t(content.entities.governor[other[0]]!.name)})`
                              : ''}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                </>
              )}
              <ul className="promotions">
                {def.promotions.map((pr) => {
                  const taken = g?.promotions.includes(pr.id) ?? false;
                  const open = !!g && !taken && pr.requires.every((r) => g.promotions.includes(r));
                  return (
                    <li key={pr.id} className={taken ? 'taken' : open ? 'open' : 'locked'}>
                      <div>
                        <strong>{t(pr.name)}</strong>
                        <span>{t(pr.description)}</span>
                      </div>
                      {taken ? (
                        <Icon name="check" size={20} />
                      ) : (
                        <button
                          type="button"
                          className="ghost small"
                          disabled={!open || titles < 1}
                          title={
                            !g
                              ? 'Appoint first'
                              : !open
                                ? `Needs ${pr.requires
                                    .map((r) =>
                                      t(def.promotions.find((x) => x.id === r)?.name ?? r),
                                    )
                                    .join(', ')}`
                                : 'Spend a title'
                          }
                          onClick={() =>
                            act({
                              type: 'promote_governor',
                              player: viewer,
                              governor: id,
                              promotion: pr.id,
                            })
                          }
                        >
                          Promote
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </article>
          );
        })}
      </div>
    </div>
  );
}
