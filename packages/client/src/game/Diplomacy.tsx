import {
  type Action,
  atWar,
  dominationProgress,
  type EngineContext,
  type GameState,
  liberateProblem,
  militaryStrength,
  peaceProblem,
  type PlayerId,
  razeProblem,
  scoreOf,
  warKey,
  warWeariness,
} from '@cx/engine';
import { resolveText } from '@cx/content';
import { useEffect, useState } from 'react';
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

/** War and peace with one rival (the full diplomacy screen arrives later). */
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
      {leader && p.kind === 'ai' && (
        <p className="hint" title={resolveText(ctx.content, leader.agenda.description)}>
          Agenda: {resolveText(ctx.content, leader.agenda.name)}
        </p>
      )}
      {p.alive && (
        <>
          <p className={`relation ${war ? 'war' : 'peace'}`}>
            {war ? `⚔ At war since turn ${since ?? '?'}` : '☮ At peace'}
          </p>
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
              <span>Declare war on {name}?</span>
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
            <button type="button" className="wide" onClick={() => setConfirm(true)}>
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
    </aside>
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
  onClose: () => void;
}

export function GameOver({ won, title, text, scores, onClose }: GameOverProps) {
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
        <div className="modal-actions">
          <button type="button" className="primary" onClick={onClose}>
            Look at the map
          </button>
        </div>
      </div>
    </div>
  );
}
