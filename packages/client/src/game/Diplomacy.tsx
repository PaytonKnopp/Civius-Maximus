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
import { resolveText } from '@cx/content';
import { useEffect, useState } from 'react';
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
        ? `🤝 Allies until turn ${d.alliances[key]}`
        : rel === 'friends'
          ? `🙂 Friends until turn ${d.friends[key]}`
          : rel === 'war'
            ? `⚔ At war since turn ${since ?? '?'}`
            : (d.peaceUntil[key] ?? 0) > state.turn
              ? `☮ Peace treaty until turn ${d.peaceUntil[key]}`
              : '☮ At peace';
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <aside className="player-panel" aria-label={name}>
      <div className="player-panel-head">
        <span className="swatch big" style={{ background: cssColor(colors.main) }} />
        <div>
          <h3>{name}</h3>
          <p className="unit-sub">
            {p.alive
              ? `${leader ? resolveText(ctx.content, leader.name) : p.name} · ${settlements} settlement${settlements === 1 ? '' : 's'}`
              : 'Defeated'}
          </p>
        </div>
        <button type="button" className="close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <p className="hint" title={score.lines.map((l) => `${l.label}: ${l.amount}`).join('\n')}>
        Score {score.total}
        {domination.needed > 0 && ` · holds ${domination.held}/${domination.needed} rival capitals`}
      </p>
      <p className="hint" title="The total strength of their soldiers (yours in brackets)">
        Army strength {army} (yours {ours})
      </p>
      {leader && p.kind === 'ai' && other !== viewer && (
        <p className="hint" title={resolveText(ctx.content, leader.agenda.description)}>
          Agenda: {resolveText(ctx.content, leader.agenda.name)}
        </p>
      )}
      <Kit ctx={ctx} civ={p.civ} leader={p.leader} />
      {opinion && (
        <details className="opinion">
          <summary>
            Opinion of you:{' '}
            <strong className={opinion.total > 0 ? 'good' : opinion.total < 0 ? 'bad' : ''}>
              {opinion.total > 0 ? `+${opinion.total}` : opinion.total}
            </strong>
          </summary>
          <ul>
            {opinion.lines.map((l) => (
              <li key={l.label}>
                <span className={l.amount > 0 ? 'good' : 'bad'}>
                  {l.amount > 0 ? `+${l.amount}` : l.amount}
                </span>{' '}
                {l.label}
              </li>
            ))}
            {opinion.lines.length === 0 && <li className="muted">No strong feelings yet</li>}
          </ul>
        </details>
      )}
      {p.alive && other !== viewer && (
        <>
          <p className={`relation ${war ? 'war' : 'peace'}`}>{relationText}</p>
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
          {rel !== 'team' && (
            <button type="button" className="wide" onClick={() => setDealOpen(true)}>
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
              className="wide"
              disabled={!!block || rel === 'team'}
              title={block?.message}
              onClick={() => setConfirm(true)}
            >
              Declare war…
            </button>
          )}
          {war && (
            <p className="hint" title="The side behind in war support loses happiness everywhere">
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
    </aside>
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
  scores: { name: string; player: string; score: number; alive: boolean }[];
  /** The score over the game (the recap). */
  chart?: ReactNode;
  onGraphs?: () => void;
  onClose: () => void;
}

export function GameOver({ won, title, text, scores, chart, onGraphs, onClose }: GameOverProps) {
  return (
    <div className="modal-backdrop">
      <div className={`modal game-over ${won ? 'won' : 'lost'}`} role="alertdialog">
        <p className="game-over-kicker">{won ? 'Victory' : 'Defeat'}</p>
        <h2>{title}</h2>
        <p>{text}</p>
        <table className="scores">
          <tbody>
            {scores.map((s) => (
              <tr key={s.name + s.player} className={s.alive ? '' : 'dead'}>
                <td>{s.name}</td>
                <td className="muted">{s.player}</td>
                <td className="mono">{s.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {chart}
        <div className="modal-actions">
          {onGraphs && (
            <button type="button" onClick={onGraphs}>
              All graphs
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
