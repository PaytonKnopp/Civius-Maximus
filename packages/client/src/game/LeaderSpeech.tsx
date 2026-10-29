import { resolveText } from '@cx/content';
import type { EngineContext, GameState, PlayerId } from '@cx/engine';
import { useEffect } from 'react';
import { LeaderCard, leaderArt } from '../ui/LeaderCard';
import { Kit } from './Diplomacy';

/**
 * The leader screens (docs/06-ui-ux.md, "Leaders"): the intro over your leader's portrait when
 * a game starts, and a rival leader speaking to you when they declare war, make peace or fall.
 */

export function LeaderIntro({
  ctx,
  state,
  player,
  onBegin,
}: {
  ctx: EngineContext;
  state: GameState;
  player: PlayerId;
  onBegin: () => void;
}) {
  const p = state.players[player]!;
  const art = leaderArt(ctx.content, p.leader, p.civ);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        onBegin();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onBegin]);
  return (
    <div className="modal-backdrop leader-backdrop">
      <div className="leader-intro" role="dialog" aria-label={`${art.name} of ${art.civName}`}>
        <LeaderCard content={ctx.content} leader={p.leader} civ={p.civ} size={230} />
        <div className="leader-intro-text">
          <p className="game-over-kicker">{art.civName}</p>
          <p className="leader-intro-body">{art.intro}</p>
          <Kit ctx={ctx} civ={p.civ} leader={p.leader} open />
          <button type="button" className="primary" onClick={onBegin} autoFocus>
            Begin your journey
          </button>
        </div>
      </div>
    </div>
  );
}

export type SpeechLine = 'greeting' | 'war' | 'peace' | 'defeat';

const HEADINGS: Record<SpeechLine, string> = {
  greeting: 'A message',
  war: 'War is declared',
  peace: 'Peace',
  defeat: 'A civilization falls',
};

export function LeaderSpeech({
  ctx,
  state,
  player,
  line,
  onClose,
}: {
  ctx: EngineContext;
  state: GameState;
  player: PlayerId;
  line: SpeechLine;
  onClose: () => void;
}) {
  const p = state.players[player]!;
  const art = leaderArt(ctx.content, p.leader, p.civ);
  const text = art.quotes ? resolveText(ctx.content, art.quotes[line]) : '';
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="modal-backdrop leader-backdrop" onClick={onClose} role="presentation">
      <div
        className={`leader-speech ${line}`}
        role="alertdialog"
        aria-label={`${art.name}: ${HEADINGS[line]}`}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="game-over-kicker">{HEADINGS[line]}</p>
        <LeaderCard
          content={ctx.content}
          leader={p.leader}
          civ={p.civ}
          size={190}
          {...(text ? { quote: text } : {})}
        />
        <button type="button" className="primary" onClick={onClose} autoFocus>
          {line === 'war' ? 'So be it' : 'Continue'}
        </button>
      </div>
    </div>
  );
}
