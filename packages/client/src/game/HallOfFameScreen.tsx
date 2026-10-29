import { useEffect, useState } from 'react';
import { Icon } from '../ui/Icon';
import { type FameEntry, hallOfFame } from './hallOfFame';
import { ReplayView } from './ReplayView';

const REASONS: Record<string, string> = {
  score: 'score',
  conquest: 'conquest',
  domination: 'domination',
  religion: 'religion',
  science: 'science',
  culture: 'culture',
  diplomatic: 'diplomacy',
};

/** The games finished in this browser, newest first, each with its replay when one was kept. */
export function HallOfFameScreen({ onClose }: { onClose: () => void }) {
  const [entries] = useState<FameEntry[]>(hallOfFame);
  const [open, setOpen] = useState<FameEntry | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (open) setOpen(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div className="screen fame-screen" role="dialog" aria-label="Hall of Fame">
      <header className="screen-head">
        <h2>
          <Icon name="trophy" size={30} />
          {open ? `${open.leader} of ${open.civ}` : 'Hall of Fame'}
        </h2>
        <p className="screen-sub">
          {open
            ? `${open.won ? 'Victory' : 'Defeat'} by ${REASONS[open.reason] ?? open.reason} on turn ${open.turn} · ${open.map} · ${open.difficulty}`
            : 'Every game finished in this browser. The newest keep a replay.'}
        </p>
        {open && (
          <button type="button" onClick={() => setOpen(null)}>
            ← All games
          </button>
        )}
        <button type="button" className="close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>
      <div className="fame-body">
        {open?.replay ? (
          <ReplayView replay={open.replay} />
        ) : entries.length === 0 ? (
          <p className="hint">
            No finished games yet. Win (or lose) one and it will be remembered here.
          </p>
        ) : (
          <table className="fame-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Leader</th>
                <th>Result</th>
                <th>Turn</th>
                <th>Score</th>
                <th>Map</th>
                <th>Difficulty</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className={e.won ? 'won' : 'lost'}>
                  <td>{new Date(e.date).toLocaleDateString()}</td>
                  <td>
                    {e.leader} <span className="muted">({e.civ})</span>
                  </td>
                  <td>
                    {e.won ? 'Victory' : 'Defeat'} · {REASONS[e.reason] ?? e.reason}
                    {!e.won && e.winner ? <span className="muted"> ({e.winner})</span> : null}
                  </td>
                  <td className="mono">{e.turn}</td>
                  <td className="mono">{e.score}</td>
                  <td>{e.map}</td>
                  <td>{e.difficulty}</td>
                  <td>
                    {e.replay && (
                      <button type="button" className="small" onClick={() => setOpen(e)}>
                        Replay
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
