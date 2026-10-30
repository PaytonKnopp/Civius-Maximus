import type { EngineContext, GameState } from '@cx/engine';
import { readSave, type SaveFile } from '@cx/host';
import { useEffect, useState } from 'react';
import { cloud } from './cloud/cloud';
import { newestAutosave } from './cloud/autosave';
import { newVersionOut, versionLabel } from './update';
import { AUTOSAVE, loadSave, ONLINE_AUTOSAVE } from './game/storage';

interface Props {
  ctx: EngineContext;
  /** Play the game that's already set up behind this screen. */
  onPlay: () => void;
  onNewGame: () => void;
  onLoadGame: () => void;
  onContinue: (state: GameState) => void;
  onMapLab: () => void;
  onOnline: () => void;
  onHallOfFame: () => void;
  onAccount: () => void;
  onPedia: () => void;
  /** Host the online game this browser hosted last (from its autosave). */
  onResumeOnline: (state: GameState) => void;
}

/** The title screen, over the live map: continue, a quick game, a new game, load, Map Lab. */
export function HomeScreen(props: Props) {
  const { ctx, onPlay, onNewGame, onLoadGame, onContinue, onMapLab, onOnline } = props;
  const [autosave, setAutosave] = useState<SaveFile | null>(null);
  const [onlineSave, setOnlineSave] = useState<SaveFile | null>(null);
  useEffect(() => {
    let live = true;
    // The browser's autosave shows at once; a newer one in the cloud (another device) replaces it.
    const read = async (id: string, set: (s: SaveFile) => void) => {
      let local: SaveFile | null = null;
      try {
        const save = await loadSave(id);
        const r = save ? readSave(JSON.stringify(save), ctx) : undefined;
        if (r?.ok && r.save.state.status === 'playing') local = r.save;
      } catch {
        // No browser storage: the cloud may still have one.
      }
      if (live && local) set(local);
      const newest = await newestAutosave(id, local, ctx);
      if (live && newest && newest !== local) set(newest);
    };
    void read(AUTOSAVE, setAutosave);
    void read(ONLINE_AUTOSAVE, setOnlineSave);
    return () => {
      live = false;
    };
  }, [ctx]);

  // A newer build on the website (this page was open a while, or it's the desktop app offline).
  const [updateOut, setUpdateOut] = useState(false);
  useEffect(() => {
    const check = () => void newVersionOut().then((out) => out && setUpdateOut(true));
    check();
    const timer = setInterval(check, 10 * 60_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="home" role="dialog" aria-label="Civius Maximus">
      <div className="home-card">
        <div className="home-brand">
          <h1 className="home-title">Civius Maximus</h1>
          <p className="home-sub">Build an empire to stand the test of time.</p>
        </div>
        <nav className="home-actions" aria-label="Main menu">
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
          <button type="button" onClick={onOnline}>
            Play online…
          </button>
          {onlineSave && (
            <button type="button" onClick={() => props.onResumeOnline(onlineSave.state)}>
              Host your online game again <span className="muted">· turn {onlineSave.turn}</span>
            </button>
          )}
          <button type="button" onClick={onLoadGame}>
            Load game…
          </button>
        </nav>
        <div className="home-links">
          <button type="button" className="ghost" onClick={props.onHallOfFame}>
            Hall of Fame
          </button>
          <button type="button" className="ghost" onClick={props.onPedia}>
            Civilopedia
          </button>
          <button type="button" className="ghost" onClick={props.onAccount}>
            {cloud()?.session ? `Account · ${cloud()!.session!.name}` : 'Account'}
          </button>
          <button type="button" className="ghost" onClick={onMapLab}>
            Map Lab
          </button>
        </div>
        <div className="home-bottom">
          <p className="hint home-foot">
            A quick game is you against three rivals on a small map. Your game saves itself every
            turn
            {cloud()?.signedIn ? ', here and to your account.' : ' in this browser.'}
          </p>
          {updateOut && (
            <button
              type="button"
              className="home-update"
              onClick={() => location.reload()}
              title="Everyone playing together needs the same version: reload between games."
            >
              A new version is out · <strong>Reload</strong>
            </button>
          )}
          <p className="home-version">{versionLabel()}</p>
        </div>
      </div>
    </div>
  );
}
