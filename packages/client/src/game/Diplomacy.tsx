import type { ReactNode } from 'react';
import {
  type Action,
  atWar,
  denounceProblem,
  dominationProgress,
  isSurpriseWar,
  opinionOf,
  relation,
  warBlock,
  type EngineContext,
  type GameState,
  liberateProblem,
  militaryStrength,
  peaceProblem,
  type PlayerId,
  razeProblem,
  scoreOf,
  uniquesOf,
  warKey,
  warWeariness,
} from '@cx/engine';
import { type CompiledContent, resolveText } from '@cx/content';
import { useEffect, useState } from 'react';
import { Icon } from '../ui/Icon';
import { LeaderCard, LeaderHead } from '../ui/LeaderCard';
import { DealDialog, describeDeal } from './DealDialog';
import { civName, type Colors, cssColor } from './model';

interface PlayerProps {
  ctx: EngineContext;
  state: GameState;
  viewer: PlayerId;
  other: PlayerId;
  colors: Colors;
  act: (action: Action) => boolean;
  onClose: () => void;
}

/** One player's panel: who they are, how they feel about you, deals, war and peace. */
export function PlayerPanel({ ctx, state, viewer, other, colors, act, onClose }: PlayerProps) {
  const [confirm, setConfirm] = useState(false);
  const p = state.players[other]!;
  const name = civName(ctx.content, state, other);
  const war = atWar(state, viewer, other);
  const since = state.warStarted[warKey(viewer, other)];
  const theyOffer = state.peaceOffers.includes(`${other}>${viewer}`);
  const weOffered = state.peaceOffers.includes(`${viewer}>${other}`);
  const peace = peaceProblem(ctx, state, viewer, other);
  const score = scoreOf(ctx, state, other);
  const domination = dominationProgress(state, other);
  const support = state.warSupport[warKey(viewer, other)] ?? {};
  const weariness = warWeariness(ctx, state, viewer);
  const settlements = Object.values(state.settlements).filter((s) => s.owner === other).length;
  const leader = ctx.content.entities.leader[p.leader];
  const army = militaryStrength(ctx, state, other);
  const ours = militaryStrength(ctx, state, viewer);
  const [dealOpen, setDealOpen] = useState(false);
  const [denouncing, setDenouncing] = useState(false);
  const d = state.diplomacy;
  const rel = relation(state, viewer, other);
  const key = warKey(viewer, other);
  const opinion = p.kind === 'ai' && other !== viewer ? opinionOf(ctx, state, other, viewer) : null;
  const incoming = d.proposals.filter((x) => x.from === other && x.to === viewer);
  const outgoing = d.proposals.filter((x) => x.from === viewer && x.to === other);
  const denounce = denounceProblem(ctx, state, viewer, other);
  const block = warBlock(state, viewer, other);
  const theyDenounced = d.denounced[`${other}>${viewer}`];
  const relationText =
    rel === 'team'
      ? 'Teammates'
      : rel === 'allies'
        ? `Allies until turn ${d.alliances[key]}`
        : rel === 'friends'
          ? `Friends until turn ${d.friends[key]}`
          : rel === 'war'
            ? `At war since turn ${since ?? '?'}`
            : (d.peaceUntil[key] ?? 0) > state.turn
              ? `Peace treaty until turn ${d.peaceUntil[key]}`
              : 'At peace';
  const relationIcon =
    rel === 'team' || rel === 'allies'
      ? 'alliance'
      : rel === 'friends'
        ? 'friends'
        : rel === 'war'
          ? 'war'
          : 'peace';
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const quote =
    leader?.quotes && p.kind === 'ai' && other !== viewer && p.alive
      ? resolveText(ctx.content, war ? leader.quotes.war : leader.quotes.greeting)
      : null;
  return (
    <div
      className="modal-backdrop diplo-backdrop"
      role="presentation"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        className={`player-panel diplo ${war ? 'at-war' : ''}`}
        role="dialog"
        aria-label={`${name}: diplomacy`}
        style={{ '--civ': cssColor(colors.main) } as React.CSSProperties}
      >
        <div className="diplo-portrait">
          <LeaderCard content={ctx.content} leader={p.leader} civ={p.civ} size={200} />
          {quote && <q className="leader-quote panel-quote">{quote}</q>}
        </div>
        <div className="diplo-main">
          <div className="player-panel-head">
            <span className="panel-head-portrait" style={{ borderColor: cssColor(colors.main) }}>
              <LeaderHead content={ctx.content} leader={p.leader} civ={p.civ} size={52} />
            </span>
            <div>
              <h3>{name}</h3>
              <p className="unit-sub">
                {p.alive
                  ? `${leader ? resolveText(ctx.content, leader.name) : p.name}${other === viewer ? ' (you)' : ''}`
                  : 'Defeated'}
              </p>
            </div>
            <button type="button" className="close" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
          {quote && <q className="leader-quote panel-quote diplo-quote-small">{quote}</q>}
          {p.alive && other !== viewer && (
            <p
              className={`relation-pill ${rel === 'war' ? 'war' : rel === 'allies' || rel === 'friends' || rel === 'team' ? 'pact' : 'peace'}`}
            >
              <Icon name={relationIcon} size={18} />
              {relationText}
            </p>
          )}
          <div className="diplo-stats">
            <div
              className="diplo-stat"
              title={['Score', ...score.lines.map((l) => `${l.label}: ${l.amount}`)].join('\n')}
            >
              <span>Score</span>
              <b>{score.total}</b>
              {domination.needed > 0 && (
                <small>
                  {domination.held}/{domination.needed} rival capitals
                </small>
              )}
            </div>
            <div
              className="diplo-stat"
              title={'Army strength\nThe total strength of their soldiers, beside yours.'}
            >
              <span>Army</span>
              <b>{army}</b>
              {other !== viewer && <small>yours {ours}</small>}
            </div>
            <div className="diplo-stat">
              <span>Settlements</span>
              <b>{settlements}</b>
            </div>
            {opinion && (
              <div
                className="diplo-stat"
                title={[
                  'Their opinion of you',
                  ...opinion.lines.map((l) => `${l.amount > 0 ? '+' : ''}${l.amount} ${l.label}`),
                ].join('\n')}
              >
                <span>Opinion</span>
                <b className={opinion.total > 0 ? 'good' : opinion.total < 0 ? 'bad' : ''}>
                  {opinion.total > 0 ? `+${opinion.total}` : opinion.total}
                </b>
                <small>
                  {opinion.total >= ctx.content.rules.diplomacy.allianceOpinion
                    ? 'open to an alliance'
                    : opinion.total >= ctx.content.rules.diplomacy.friendshipOpinion
                      ? 'open to friendship'
                      : opinion.total > 0
                        ? 'friendly'
                        : opinion.total === 0
                          ? 'neutral'
                          : opinion.total > ctx.content.rules.diplomacy.opinion.atWar
                            ? 'wary'
                            : 'hostile'}
                </small>
              </div>
            )}
          </div>
          {leader && p.kind === 'ai' && other !== viewer && (
            <p className="diplo-agenda">
              <span className="diplo-agenda-label">Agenda</span>{' '}
              <strong>{resolveText(ctx.content, leader.agenda.name)}</strong>
              <span className="muted">
                {' '}
                · {resolveText(ctx.content, leader.agenda.description)}
              </span>
            </p>
          )}
          {opinion && opinion.lines.length > 0 && (
            <details className="opinion">
              <summary>Why they feel this way</summary>
              <ul>
                {opinion.lines.map((l) => (
                  <li key={l.label}>
                    <span className={l.amount > 0 ? 'good' : 'bad'}>
                      {l.amount > 0 ? `+${l.amount}` : l.amount}
                    </span>{' '}
                    {l.label}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <Kit ctx={ctx} civ={p.civ} leader={p.leader} />
          {p.alive && other !== viewer && (
            <>
              {theyDenounced !== undefined && (
                <p className="hint bad">They denounced you on turn {theyDenounced}.</p>
              )}
              {incoming.map((x) => (
                <div className="callout" key={x.id}>
                  <p>
                    <strong>{name} offers:</strong> {describeDeal(ctx, state, x, viewer)}
                  </p>
                  <div className="row-inline">
                    <button
                      type="button"
                      className="primary"
                      onClick={() =>
                        act({ type: 'answer_deal', player: viewer, deal: x.id, accept: true })
                      }
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        act({ type: 'answer_deal', player: viewer, deal: x.id, accept: false })
                      }
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
              {outgoing.map((x) => (
                <div className="callout" key={x.id}>
                  <p>
                    <strong>You offered:</strong> {describeDeal(ctx, state, x, viewer)}
                  </p>
                  <button
                    type="button"
                    onClick={() => act({ type: 'withdraw_deal', player: viewer, deal: x.id })}
                  >
                    Withdraw
                  </button>
                </div>
              ))}
              <div className="diplo-actions">
                {rel !== 'team' && (
                  <button type="button" className="wide primary" onClick={() => setDealOpen(true)}>
                    Propose a deal…
                  </button>
                )}
                {!war &&
                  rel !== 'team' &&
                  (denouncing ? (
                    <div className="confirm-row">
                      <span>Denounce {name}?</span>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => {
                          act({ type: 'denounce', player: viewer, target: other });
                          setDenouncing(false);
                        }}
                      >
                        Denounce
                      </button>
                      <button type="button" onClick={() => setDenouncing(false)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="wide"
                      disabled={!!denounce}
                      title={
                        denounce?.message ??
                        `Costs ${ctx.content.rules.diplomacy.denounceCost} influence. Everyone hears it, and a war within ${ctx.content.rules.diplomacy.denounceWarning} turns isn't a surprise war.`
                      }
                      onClick={() => setDenouncing(true)}
                    >
                      Denounce…
                    </button>
                  ))}
                {theyOffer && (
                  <div className="callout">
                    {name} offers peace.{' '}
                    <button
                      type="button"
                      className="primary"
                      onClick={() => act({ type: 'accept_peace', player: viewer, from: other })}
                    >
                      Accept peace
                    </button>
                  </div>
                )}
                {war ? (
                  <button
                    type="button"
                    className="wide"
                    disabled={!!peace || theyOffer}
                    title={peace?.message}
                    onClick={() => act({ type: 'offer_peace', player: viewer, target: other })}
                  >
                    {weOffered ? 'Peace offered' : 'Offer peace'}
                  </button>
                ) : confirm ? (
                  <div className="confirm-row">
                    <span>
                      Declare war on {name}?
                      {isSurpriseWar(ctx, state, viewer, other) &&
                        ' It would be a surprise war: everyone will remember it.'}
                    </span>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => {
                        act({ type: 'declare_war', player: viewer, target: other });
                        setConfirm(false);
                      }}
                    >
                      Declare war
                    </button>
                    <button type="button" onClick={() => setConfirm(false)}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="wide danger"
                    disabled={!!block || rel === 'team'}
                    title={block?.message}
                    onClick={() => setConfirm(true)}
                  >
                    Declare war…
                  </button>
                )}
              </div>
              {war && (
                <p
                  className="hint"
                  title="The side behind in war support loses happiness everywhere"
                >
                  War support: you {support[viewer] ?? 0} · them {support[other] ?? 0}
                  {weariness > 0 ? ` (war weariness −${weariness} happiness)` : ''}
                </p>
              )}
              {war && peace && !weOffered && <p className="hint">{peace.message}.</p>}
            </>
          )}
          {dealOpen && (
            <DealDialog
              ctx={ctx}
              state={state}
              viewer={viewer}
              other={other}
              act={act}
              onClose={() => setDealOpen(false)}
            />
          )}
        </div>
      </section>
    </div>
  );
}

/** A leader's and civ's abilities and unique items (docs/09-base-roster.md). */
export function Kit({
  ctx,
  civ,
  leader,
  open = false,
}: {
  ctx: EngineContext;
  civ: string;
  leader: string;
  open?: boolean;
}) {
  const c = ctx.content;
  const l = c.entities.leader[leader];
  const cv = c.entities.civ[civ];
  const t = (text: string) => resolveText(c, text);
  const nameOf = (kind: 'unit' | 'building' | 'district' | 'improvement', id: string) =>
    t((c.entities[kind] as Record<string, { name: string }>)[id]?.name ?? id);
  const uniques = uniquesOf(ctx, civ);
  return (
    <details className="kit" open={open}>
      <summary>Abilities and uniques</summary>
      {l && (
        <p>
          <strong>{t(l.ability.name)}</strong> ({t(l.name)}). {t(l.ability.description)}
        </p>
      )}
      {cv?.ability && (
        <p>
          <strong>{t(cv.ability.name)}</strong> ({t(cv.name)}). {t(cv.ability.description)}
        </p>
      )}
      {uniques.length > 0 && (
        <ul>
          {uniques.map((u) => (
            <li key={u.id}>
              <strong>{nameOf(u.kind, u.id)}</strong>
              {u.replaces ? ` (replaces ${nameOf(u.kind, u.replaces)})` : ` (unique ${u.kind})`}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

interface WarPromptProps {
  name: string;
  /** Turns a war must last before peace can be offered. */
  minTurns: number;
  onDeclare: () => void;
  onCancel: () => void;
}

/** "You're at peace with them: declare war?" before an attack. */
export function WarPrompt({ name, minTurns, onDeclare, onCancel }: WarPromptProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div className="modal-backdrop">
      <div className="modal" role="alertdialog" aria-label="Declare war">
        <h3>Declare war on {name}?</h3>
        <p>
          You're at peace with {name}. Attacking means war: their units and settlements become
          targets, and yours become theirs. Peace can be offered after {minTurns} turns.
        </p>
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="danger" onClick={onDeclare}>
            Declare war and attack
          </button>
        </div>
      </div>
    </div>
  );
}

interface CaptureProps {
  ctx: EngineContext;
  state: GameState;
  viewer: PlayerId;
  id: string;
  act: (action: Action) => boolean;
}

/** After taking a settlement: keep it, raze it, or give it back to the civ that founded it. */
export function CaptureDialog({ ctx, state, viewer, id, act }: CaptureProps) {
  const s = state.settlements[id]!;
  const raze = razeProblem(s);
  const liberate = liberateProblem(state, s);
  const from = s.capturedFrom ? civName(ctx.content, state, s.capturedFrom) : 'its owner';
  const founder = civName(ctx.content, state, s.founder);
  const choose = (choice: 'keep' | 'raze' | 'liberate') =>
    act({ type: 'capture_choice', player: viewer, settlement: id, choice });
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-label={`${s.name} captured`}>
        <h3>You took {s.name}</h3>
        <p>
          Taken from {from}. It has {s.population} citizen{s.population === 1 ? '' : 's'} left
          {s.wonders.length > 0
            ? ` and ${s.wonders.length} wonder${s.wonders.length === 1 ? '' : 's'}`
            : ''}
          .
        </p>
        <div className="modal-choices">
          <button type="button" className="primary" onClick={() => choose('keep')}>
            <strong>Keep it</strong>
            <span>It becomes one of your settlements.</span>
          </button>
          <button
            type="button"
            className="danger"
            disabled={!!raze}
            title={raze?.message}
            onClick={() => choose('raze')}
          >
            <strong>Raze it</strong>
            <span>{raze ? raze.message : 'Burn it to the ground. Its land becomes free.'}</span>
          </button>
          <button
            type="button"
            disabled={!!liberate}
            title={liberate?.message}
            onClick={() => choose('liberate')}
          >
            <strong>Liberate it</strong>
            <span>
              {liberate ? liberate.message : `Give it back to ${founder}, who founded it.`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

interface GameOverProps {
  won: boolean;
  title: string;
  text: string;
  scores: {
    name: string;
    player: string;
    score: number;
    alive: boolean;
    leader?: string;
    civ?: string;
    you?: boolean;
  }[];
  /** The score over the game (the recap). */
  chart?: ReactNode;
  /** The winner's leader and civ, for their portrait. */
  winner?: { leader: string; civ: string; fallen?: boolean } | undefined;
  /** An icon for how the game ended (science, culture...). */
  icon?: string | undefined;
  content?: CompiledContent;
  onGraphs?: () => void;
  /** Opens the replay of the game. */
  onReplay?: () => void;
  onClose: () => void;
}

export function GameOver({
  won,
  title,
  text,
  scores,
  chart,
  winner,
  icon,
  content,
  onGraphs,
  onReplay,
  onClose,
}: GameOverProps) {
  return (
    <div className="modal-backdrop game-over-backdrop">
      <div className={`modal game-over ${won ? 'won' : 'lost'}`} role="alertdialog">
        <header className="game-over-hero">
          {content && winner ? (
            <span className={winner.fallen ? 'fallen-portrait' : ''}>
              <LeaderCard content={content} leader={winner.leader} civ={winner.civ} size={150} />
            </span>
          ) : (
            icon && <Icon name={icon} size={96} />
          )}
          <div className="game-over-title">
            <p className="game-over-kicker">
              {icon && <Icon name={icon} size={22} />}
              {won ? 'Victory' : 'Defeat'}
            </p>
            <h2>{title}</h2>
            <p>{text}</p>
          </div>
        </header>
        <div className="game-over-body">
          <ol className="game-over-scores">
            {scores.map((s, i) => (
              <li
                key={s.name + s.player}
                className={`${s.alive ? '' : 'dead'} ${s.you ? 'you' : ''}`}
              >
                <span className="rank">{i + 1}</span>
                {content && s.leader ? (
                  <LeaderHead
                    content={content}
                    leader={s.leader}
                    {...(s.civ ? { civ: s.civ } : {})}
                    size={30}
                  />
                ) : (
                  <span className="head-gap" />
                )}
                <span className="who">
                  <strong>{s.name}</strong>
                  <small>{s.you ? 'You' : s.player}</small>
                </span>
                <b className="mono">{s.score}</b>
              </li>
            ))}
          </ol>
          {chart && <div className="game-over-chart">{chart}</div>}
        </div>
        <div className="modal-actions">
          {onGraphs && (
            <button type="button" onClick={onGraphs}>
              All graphs
            </button>
          )}
          {onReplay && (
            <button type="button" onClick={onReplay}>
              Watch the replay
            </button>
          )}
          <button type="button" className="primary" onClick={onClose}>
            Look at the map
          </button>
        </div>
      </div>
    </div>
  );
}
