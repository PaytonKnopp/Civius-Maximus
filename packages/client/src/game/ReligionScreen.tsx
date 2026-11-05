import { type BeliefDef, resolveText } from '@cx/content';
import {
  type Action,
  type EngineContext,
  followersOf,
  freeBeliefs,
  type GameState,
  greatPersonCost,
  greatPersonRates,
  maxReligions,
  nextGreatPerson,
  pantheonOf,
  type PlayerId,
  pointsOf,
  religionsOf,
  religiousProgress,
  validateAction,
} from '@cx/engine';
import { useEffect, useState } from 'react';
import { civName, empireSummary, perTurn, whole } from './model';
import { religionColor } from './lenses';
import { Icon, Rich } from '../ui/Icon';
import { LeaderHead } from '../ui/LeaderCard';
import { Meter } from '../ui/Meter';

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
  const holy = t(content.entities.district[rules.holyDistrict]?.name ?? 'Holy Site');
  const faithRate = empireSummary(ctx, state, viewer).faithPerTurn;
  const room = maxReligions(ctx, state);
  const prophetClass = content.ids.greatPersonClass.find(
    (c) => content.entities.greatPersonClass[c]?.foundsReligion,
  );
  const prophetCost = prophetClass ? greatPersonCost(ctx, state, prophetClass) : 0;
  const prophetPoints = prophetClass ? pointsOf(state, viewer, prophetClass) : 0;
  const prophetRate = prophetClass ? (greatPersonRates(ctx, state, viewer)[prophetClass] ?? 0) : 0;
  const prophetsLeft = prophetClass ? !!nextGreatPerson(ctx, state, prophetClass) : false;
  const holdsProphet = Object.values(state.units).some((u) => {
    const person =
      u.owner === viewer && u.person ? content.entities.greatPerson[u.person] : undefined;
    return !!person && !!content.entities.greatPersonClass[person.class]?.foundsReligion;
  });
  const myFollowers = mine ? followersOf(state, mine.id).length : 0;
  const step = mine ? 4 : holdsProphet ? 3 : pantheon ? 2 : 1;
  const steps = [
    {
      title: 'Pantheon',
      text: pantheon ? t(pantheon.name) : `Take a belief for ${rules.pantheonFaith} faith.`,
    },
    {
      title: 'Great Prophet',
      text: mine
        ? 'Your prophet founded it.'
        : holdsProphet
          ? 'Ready: use it in a settlement with a ' + holy + '.'
          : `Earn one with a ${holy}, or recruit one.`,
    },
    {
      title: 'Religion',
      text: mine
        ? mine.name
        : religions.length >= room
          ? 'Every religion this world has room for is founded.'
          : 'Name it and choose its beliefs.',
    },
    {
      title: 'Spread it',
      text: mine
        ? `${myFollowers} settlement${myFollowers === 1 ? '' : 's'} follow it.`
        : 'Missionaries, trade routes and nearby followers convert settlements.',
    },
  ];

  return (
    <div className="screen" role="dialog" aria-label="Religion">
      <header className="screen-head">
        <h2>
          <Icon name="religion" size={30} />
          Religion
        </h2>
        <p className="screen-sub">
          A pantheon, then a religion of your own, then the world. {religions.length} of {room}{' '}
          religions founded.
        </p>
        <button type="button" className="close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>
      <div className="screen-scroll">
        <div className="screen-band">
          <div
            className="band-stat"
            title="Faith: spent on a pantheon, religious units and great people"
          >
            <Icon name="faith" size={34} />
            <b>{whole(me.faith)}</b>
            <span>Faith · {perTurn(faithRate)} a turn</span>
          </div>
          <div className="band-stat">
            <Icon name="religion" size={34} />
            <b
              className={
                (mine ? mine.name : pantheon ? t(pantheon.name) : '').length > 13 ? 'long' : ''
              }
            >
              {mine ? mine.name : pantheon ? t(pantheon.name) : 'None yet'}
            </b>
            <span>
              {mine
                ? `Founded on turn ${mine.founded}`
                : pantheon
                  ? 'Your pantheon'
                  : 'No pantheon'}
            </span>
          </div>
          {prophetClass && !mine && (
            <div
              className="band-stat"
              title={`Great Prophet points: ${prophetPoints} of ${prophetCost}, +${prophetRate} a turn`}
            >
              <Icon name="gp_prophet" size={34} />
              <b>
                {prophetsLeft
                  ? `${Math.min(prophetPoints, prophetCost)}/${prophetCost}`
                  : 'None left'}
              </b>
              <span>
                Great Prophet
                {prophetsLeft && prophetRate > 0
                  ? ` · ${Math.max(0, Math.ceil((prophetCost - prophetPoints) / prophetRate))} turns`
                  : prophetsLeft
                    ? ` · build a ${holy}`
                    : ''}
              </span>
            </div>
          )}
          <div className="band-stat">
            <Icon name="population" size={34} />
            <b>{myFollowers}</b>
            <span>Settlements following you</span>
          </div>
        </div>

        <ol className="rel-steps" aria-label="The way to a religion">
          {steps.map((x, i) => (
            <li
              key={x.title}
              className={
                i + 1 < step || (i + 1 === step && step === 4)
                  ? 'done'
                  : i + 1 === step
                    ? 'now'
                    : ''
              }
            >
              <span className="rel-step-n">
                {i + 1 < step || (i + 1 === step && step === 4) ? (
                  <Icon name="check" size={22} />
                ) : (
                  i + 1
                )}
              </span>
              <span className="rel-step-text">
                <strong>{x.title}</strong>
                <small>{x.text}</small>
              </span>
            </li>
          ))}
        </ol>

        {prophet && !mine && (
          <FoundReligion ctx={ctx} state={state} viewer={viewer} unit={prophet} act={act} />
        )}

        <section className="religion-section">
          <h3>Pantheon</h3>
          {pantheon ? (
            <div className="belief-grid">
              <BeliefCard
                kind="Pantheon"
                name={t(pantheon.name)}
                text={t(pantheon.description)}
                chosen
              />
            </div>
          ) : (
            <>
              <p className="hint">
                Pick one belief for your people; each can be taken by only one civilization.
                {me.faith < rules.pantheonFaith * 100 &&
                  ` You have ${whole(me.faith)} of the ${rules.pantheonFaith} faith it costs.`}
              </p>
              <div className="belief-grid">
                {freeBeliefs(ctx, state, 'pantheon').map((b) => {
                  const action: Action = { type: 'found_pantheon', player: viewer, belief: b.id };
                  const why = validateAction(state, action, ctx)?.message;
                  return (
                    <BeliefCard key={b.id} kind="Pantheon" name={t(b.name)} text={t(b.description)}>
                      <button
                        type="button"
                        className={why ? '' : 'primary'}
                        disabled={!!why}
                        title={why}
                        onClick={() => act(action)}
                      >
                        <Rich text={`Take · 🙏 ${rules.pantheonFaith}`} />
                      </button>
                    </BeliefCard>
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
              <div
                className="rel-mine"
                style={{ '--rel': religionColor(state, mine.id) } as React.CSSProperties}
              >
                <span className="rel-dot" aria-hidden="true" />
                <div>
                  <strong>{mine.name}</strong>
                  <small>
                    Founded on turn {mine.founded} in{' '}
                    {state.settlements[mine.holyCity]?.name ?? 'a lost city'} (its holy city) ·{' '}
                    {following(myFollowers)}
                  </small>
                </div>
              </div>
              <div className="belief-grid">
                {mine.beliefs.map((id) => (
                  <BeliefCard
                    key={id}
                    kind={belief(id)?.kind ?? ''}
                    name={t(belief(id)?.name ?? id)}
                    text={t(belief(id)?.description ?? '')}
                    chosen
                  />
                ))}
              </div>
              <p className="hint">
                Buy missionaries with faith in a settlement that follows it, and send them to preach
                next to other settlements.
              </p>
            </>
          ) : (
            <div className="screen-empty rel-empty">
              <Icon name="gp_prophet" size={40} />
              <strong>No religion yet</strong>
              <p>
                {religions.length >= room
                  ? 'Every religion this world has room for is founded; your people can still follow one of theirs.'
                  : `Build a ${holy} to earn Great Prophet points (Great People, P). Use the prophet in a settlement with a ${holy} to found your religion.`}
              </p>
            </div>
          )}
        </section>

        <section className="religion-section">
          <h3>Religions of the world</h3>
          {religions.length === 0 ? (
            <p className="hint">No religion has been founded yet.</p>
          ) : (
            <div className="rel-world">
              {religions.map((r) => {
                const progress = religiousProgress(state, r.id);
                const won = progress.filter((x) => x.following >= x.needed).length;
                const founder = state.players[r.founder];
                return (
                  <article
                    key={r.id}
                    className={`rel-card ${r.id === me.religion ? 'mine' : ''}`}
                    style={{ '--rel': religionColor(state, r.id) } as React.CSSProperties}
                  >
                    <header>
                      <span className="rel-dot" aria-hidden="true" />
                      <div>
                        <strong>{r.name}</strong>
                        <small>
                          {civName(content, state, r.founder)} · holy city{' '}
                          {state.settlements[r.holyCity]?.name ?? 'lost'}
                        </small>
                      </div>
                      {founder && (
                        <LeaderHead
                          content={content}
                          leader={founder.leader}
                          civ={founder.civ}
                          size={34}
                        />
                      )}
                    </header>
                    <div className="rel-card-stats">
                      <span>
                        <b>{followersOf(state, r.id).length}</b> settlements follow it
                      </span>
                      {state.settings.religion !== false && (
                        <span
                          title={progress
                            .map(
                              (x) =>
                                `${civName(content, state, x.player)}: ${x.following} of ${x.total} (needs ${x.needed})`,
                            )
                            .join('\n')}
                        >
                          <Meter
                            value={won}
                            max={progress.length}
                            tone="#5fd0c0"
                            label={`${won}/${progress.length} civs won over`}
                          />
                        </span>
                      )}
                    </div>
                    <ul className="rel-beliefs">
                      {r.beliefs.map((id) => (
                        <li key={id} title={t(belief(id)?.description ?? '')}>
                          {t(belief(id)?.name ?? id)}
                        </li>
                      ))}
                    </ul>
                  </article>
                );
              })}
            </div>
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

/** A belief: its kind, name and what it does, with an action under it when it can be taken. */
function BeliefCard({
  kind,
  name,
  text,
  chosen = false,
  children,
}: {
  kind: string;
  name: string;
  text: string;
  chosen?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={`belief-card ${chosen ? 'chosen' : ''}`}>
      <span className="belief-top">
        <Icon name="faith" size={22} />
        <span className="belief-kind">{kind}</span>
      </span>
      <strong>{name}</strong>
      <span className="belief-text">{text}</span>
      {children}
    </div>
  );
}

/** Naming a religion and picking its founder, follower and worship beliefs. */
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
  const worships = freeBeliefs(ctx, state, 'worship');
  const civ = content.entities.civ[state.players[viewer]!.civ];
  const [name, setName] = useState(civ ? `${t(civ.adjective)} Faith` : 'The Faith');
  const [founder, setFounder] = useState(founders[0]?.id ?? '');
  const [follower, setFollower] = useState(followers[0]?.id ?? '');
  const [worship, setWorship] = useState(worships[0]?.id ?? '');
  const action: Action = {
    type: 'found_religion',
    player: viewer,
    unit,
    name: name.trim(),
    founder,
    follower,
    ...(worship ? { worship } : {}),
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
      {worships.length > 0 &&
        pick(
          'Worship belief (a building its followers can raise)',
          worships,
          worship,
          setWorship,
          'worship',
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
