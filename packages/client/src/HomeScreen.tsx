import type { EngineContext, GameState } from '@cx/engine';
import { readSave, type SaveFile } from '@cx/host';
import { useEffect, useState } from 'react';
import { AUTOSAVE, loadSave } from './game/storage';

interface Props {
  ctx: EngineContext;
  /** Play the game that's already set up behind this screen. */
  onPlay: () => void;
  onNewGame: () => void;
  onLoadGame: () => void;
  onContinue: (state: GameState) => void;
  onMapLab: () => void;
}

/** The title screen, over the live map: continue, a quick game, a new game, load, Map Lab. */
export function HomeScreen({ ctx, onPlay, onNewGame, onLoadGame, onContinue, onMapLab }: Props) {
  const [autosave, setAutosave] = useState<SaveFile | null>(null);
  useEffect(() => {
    let live = true;
    loadSave(AUTOSAVE)
      .then((save) => {
        if (!live || !save) return;
        const read = readSave(JSON.stringify(save), ctx);
        if (read.ok) setAutosave(read.save);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [ctx]);

  return (
    <div className="home" role="dialog" aria-label="Civius Maximus">
      <div className="home-card">
        <h1 className="home-title">Civius Maximus</h1>
        <p className="home-sub">Build an empire to stand the test of time.</p>
        <div className="home-actions">
          {autosave && (
            <button type="button" className="primary" onClick={() => onContinue(autosave.state)}>
              Continue <span className="muted">· turn {autosave.turn}</span>
            </button>
          )}
          <button type="button" className={autosave ? '' : 'primary'} onClick={onPlay}>
            Quick game
          </button>
          <button type="button" onClick={onNewGame}>
            New game…
          </button>
          <button type="button" onClick={onLoadGame}>
            Load game…
          </button>
          <button type="button" className="ghost" onClick={onMapLab}>
            Map Lab
          </button>
        </div>
        <p className="hint home-foot">
          A quick game is you against three rivals on a small map. Your game saves itself every turn
          in this browser.
        </p>
      </div>
    </div>
  );
}
