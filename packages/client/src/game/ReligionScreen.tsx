import { type BeliefDef, resolveText } from '@cx/content';
import {
  type Action,
  type EngineContext,
  followersOf,
  freeBeliefs,
  type GameState,
  maxReligions,
  pantheonOf,
  type PlayerId,
  religionsOf,
  religiousProgress,
  validateAction,
} from '@cx/engine';
import { useEffect, useState } from 'react';
import { civName, whole } from './model';
import { Icon } from '../ui/Icon';

interface Props {
  ctx: EngineContext;
  state: GameState;
  viewer: PlayerId;
  act: (action: Action) => boolean;
  onClose: () => void;
  /** A great prophet about to found a religion: show the founding form. */
  prophet?: string | undefined;
}

const following = (n: number) =>
  n === 1 ? '1 settlement follows it' : `${n} settlements follow it`;

/** Pantheons, religions and their beliefs, followers, and the religious victory race. */
export function ReligionScreen({ ctx, state, viewer, act, onClose, prophet }: Props) {
  const { content } = ctx;
  const t = (text: string) => resolveText(content, text);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement)) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const me = state.players[viewer]!;
  const rules = content.rules.religion;
  const pantheon = pantheonOf(ctx, state, viewer);
  const mine = me.religion ? state.religions[me.religion] : undefined;
  const religions = religionsOf(state);
  const belief = (id: string) => content.entities.belief[id];

  return (
    <div className="screen" role="dialog" aria-label="Religion">
      <header className="screen-head">
        <h2>
          <Icon name="religion" size={30} />
          Religion
        </h2>
        <p className="screen-sub">
          🙏 {whole(me.faith)} faith. A pantheon costs {rules.pantheonFaith} faith. A Great Prophet
          used in a settlement with a {t(content.entities.district[rules.holyDistrict]?.name ?? '')}{' '}
          founds a religion ({religions.length} of {maxReligions(ctx, state)} founded).
        </p>
        <button type="button" className="close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>
      <div className="religion-body">
        {prophet && !mine && (
          <FoundReligion ctx={ctx} state={state} viewer={viewer} unit={prophet} act={act} />
        )}

        <section className="religion-section">
          <h3>Pantheon</h3>
          {pantheon ? (
            <p>
              <strong>{t(pantheon.name)}</strong>: {t(pantheon.description)}
            </p>
          ) : (
            <>
              <p className="hint">Pick one belief for your people. Each can be taken only once.</p>
              <div className="belief-grid">
                {freeBeliefs(ctx, state, 'pantheon').map((b) => {
                  const action: Action = { type: 'found_pantheon', player: viewer, belief: b.id };
                  const why = validateAction(state, action, ctx)?.message;
                  return (
                    <div className="belief-card" key={b.id}>
                      <strong>{t(b.name)}</strong>
                      <span>{t(b.description)}</span>
                      <button
                        type="button"
                        disabled={!!why}
                        title={why}
                        onClick={() => act(action)}
                      >
                        Take for 🙏 {rules.pantheonFaith}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>

        <section className="religion-section">
          <h3>Your religion</h3>
          {mine ? (
            <>
              <p>
                <strong>{mine.name}</strong>, founded on turn {mine.founded} in{' '}
                {state.settlements[mine.holyCity]?.name ?? 'a lost city'}.{' '}
                {following(followersOf(state, mine.id).length)}.
              </p>
              <ul className="belief-list">
                {mine.beliefs.map((id) => (
                  <li key={id}>
                    <strong>{t(belief(id)?.name ?? id)}</strong>{' '}
                    <span className="muted">({belief(id)?.kind})</span>:{' '}
                    {t(belief(id)?.description ?? '')}
                  </li>
                ))}
              </ul>
              <p className="hint">
                Buy missionaries with faith in a settlement that follows it, and send them to preach
                next to other settlements.
              </p>
            </>
          ) : (
            <p className="hint">
              None yet. Build a {t(content.entities.district[rules.holyDistrict]?.name ?? '')} to
              earn Great Prophet points (open Great People with P).
            </p>
          )}
        </section>

        <section className="religion-section">
          <h3>Religions of the world</h3>
          {religions.length === 0 ? (
            <p className="hint">No religion has been founded yet.</p>
          ) : (
            <table className="religion-table">
              <thead>
                <tr>
                  <th>Religion</th>
                  <th>Founder</th>
                  <th>Following</th>
                  <th>Victory</th>
                </tr>
              </thead>
              <tbody>
                {religions.map((r) => {
                  const progress = religiousProgress(state, r.id);
                  const won = progress.filter((x) => x.following >= x.needed).length;
                  return (
                    <tr key={r.id} className={r.id === me.religion ? 'mine' : ''}>
                      <td>
                        <strong>{r.name}</strong>
                        <div className="muted">
                          {r.beliefs.map((id) => t(belief(id)?.name ?? id)).join(', ')}
                        </div>
                      </td>
                      <td>{civName(content, state, r.founder)}</td>
                      <td className="mono">{followersOf(state, r.id).length}</td>
                      <td
                        className="mono"
                        title={progress
                          .map(
                            (x) =>
                              `${civName(content, state, x.player)}: ${x.following} of ${x.total} (needs ${x.needed})`,
                          )
                          .join('\n')}
                      >
                        {won}/{progress.length} civs
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {state.settings.religion !== false && (
            <p className="hint">
              A religion wins when it&apos;s followed in more than half the settlements of every
              other civilization.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

/** Naming a religion and picking its founder and follower beliefs. */
function FoundReligion({
  ctx,
  state,
  viewer,
  unit,
  act,
}: {
  ctx: EngineContext;
  state: GameState;
  viewer: PlayerId;
  unit: string;
  act: (action: Action) => boolean;
}) {
  const { content } = ctx;
  const t = (text: string) => resolveText(content, text);
  const founders = freeBeliefs(ctx, state, 'founder');
  const followers = freeBeliefs(ctx, state, 'follower');
  const civ = content.entities.civ[state.players[viewer]!.civ];
  const [name, setName] = useState(civ ? `${t(civ.adjective)} Faith` : 'The Faith');
  const [founder, setFounder] = useState(founders[0]?.id ?? '');
  const [follower, setFollower] = useState(followers[0]?.id ?? '');
  const action: Action = {
    type: 'found_religion',
    player: viewer,
    unit,
    name: name.trim(),
    founder,
    follower,
  };
  const why = name.trim() ? validateAction(state, action, ctx)?.message : 'Give it a name';
  const pick = (
    label: string,
    list: BeliefDef[],
    value: string,
    set: (id: string) => void,
    group: string,
  ) => (
    <fieldset className="belief-pick">
      <legend>{label}</legend>
      {list.map((b) => (
        <label key={b.id} className={`belief-card ${value === b.id ? 'chosen' : ''}`}>
          <input
            type="radio"
            name={group}
            value={b.id}
            checked={value === b.id}
            onChange={() => set(b.id)}
          />
          <strong>{t(b.name)}</strong>
          <span>{t(b.description)}</span>
        </label>
      ))}
    </fieldset>
  );
  return (
    <section className="religion-section found-religion">
      <h3>Found a religion</h3>
      <label className="field">
        Name
        <input value={name} maxLength={32} onChange={(e) => setName(e.target.value)} />
      </label>
      {pick('Founder belief (for you)', founders, founder, setFounder, 'founder')}
      {pick(
        'Follower belief (in every settlement that follows it)',
        followers,
        follower,
        setFollower,
        'follower',
      )}
      <button
        type="button"
        className="primary"
        disabled={!!why}
        title={why}
        onClick={() => act(action)}
      >
        Found {name.trim() || 'it'}
      </button>
      {why && <p className="hint">{why}</p>}
    </section>
  );
}
