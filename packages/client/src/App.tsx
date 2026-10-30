import type { EngineContext, GameSetup, GameState } from '@cx/engine';
import { type GameHandle, makeSave, readSave } from '@cx/host';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadContent } from './content';
import { HomeScreen } from './HomeScreen';
import { AccountDialog } from './cloud/AccountDialog';
import { cloud, type CloudSave } from './cloud/cloud';
import { CivilopediaScreen } from './game/CivilopediaScreen';
import { HallOfFameScreen } from './game/HallOfFameScreen';
import { type GameStart, GameScreen } from './game/GameScreen';
import {
  AUTOSAVE,
  deleteSave,
  downloadSave,
  listSaves,
  loadSave,
  type SaveSummary,
  storeSave,
} from './game/storage';
import { Gallery } from './Gallery';
import {
  DEFAULT_OPTIONS,
  loadLastOptions,
  makeSetup,
  type NewGameOptions,
  randomSeed,
  sanitize,
  saveLastOptions,
} from './setup/options';
import { SetupScreen } from './setup/SetupScreen';
import { SoundSettings } from './ui/SoundSettings';
import { MapLab } from './lab/MapLab';
import { Icon } from './ui/Icon';
import type { Quality } from './map/renderer';
import { inviteLink, OnlineDialog, type OnlineOptions } from './online/OnlineDialog';
import { networkFromUrl } from './online/transports';

let nextStart = 0;
const startId = () => `start-${++nextStart}`;

/** A new online game: the humans (host first, with their lobby leader picks) and AI rivals. */
function makeOnlineSetup(
  names: string[],
  o: OnlineOptions,
  leaders: (string | null)[] = [],
): GameSetup {
  const rules = o.rules;
  return makeSetup({
    ...DEFAULT_OPTIONS,
    script: o.script,
    size: o.size,
    humans: names,
    rivals: o.rivals,
    seed: randomSeed(),
    camps: rules?.camps ?? true,
    domination: rules?.domination ?? true,
    religion: rules?.religion ?? true,
    cityStates: rules?.cityStates ?? true,
    science: rules?.science ?? true,
    culture: rules?.culture ?? true,
    loyalty: rules?.loyalty ?? true,
    espionage: rules?.espionage ?? true,
    congress: rules?.congress ?? true,
    diplomatic: rules?.diplomatic ?? true,
    disasters: rules?.disasters ?? true,
    nukes: rules?.nukes ?? true,
    theologicalCombat: rules?.theologicalCombat ?? false,
    huts: rules?.huts ?? true,
    turnLimit: o.turnLimit ?? null,
    speed: o.speed,
    difficulty: o.difficulty,
    ...(o.startEra ? { startEra: o.startEra } : {}),
    picks: Object.fromEntries(leaders.flatMap((leader, i) => (leader ? [[i, { leader }]] : []))),
  });
}

/** `#join=ABC123` (an invite link) opens the Join screen with the code. */
const joinCodeFromUrl = () => /^#join=(\w+)$/.exec(location.hash)?.[1];

function hasWebGL2() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

export function App() {
  const content = useMemo(loadContent, []);
  const ctx: EngineContext = useMemo(() => ({ content }), [content]);
  // `#lab` opens the Map Lab directly (handy for sharing a map, and for the screenshot scripts).
  // `#gallery` shows every leader portrait and civ emblem.
  const [screen, setScreenState] = useState<'game' | 'lab' | 'gallery' | 'fame' | 'pedia'>(() =>
    location.hash === '#lab' ? 'lab' : location.hash === '#gallery' ? 'gallery' : 'game',
  );
  const setScreen = (s: 'game' | 'lab' | 'fame' | 'pedia') => {
    history.replaceState(null, '', s === 'lab' ? '#lab' : location.pathname + location.search);
    setScreenState(s);
  };
  // The setup screen opens on the last setup used; a quick game always uses the defaults.
  const [options, setOptions] = useState<NewGameOptions>(() =>
    sanitize(content, { ...DEFAULT_OPTIONS, ...loadLastOptions(), seed: randomSeed() }),
  );
  const [start, setStart] = useState<GameStart>(() => ({
    id: startId(),
    setup: makeSetup({ ...DEFAULT_OPTIONS, seed: randomSeed() }),
  }));
  const [dialog, setDialog] = useState<'new' | 'saves' | 'account' | null>(null);
  // Online play: the host/join dialog, opened from the home screen or an invite link.
  const [online, setOnline] = useState<{ joinCode?: string; resume?: GameState } | null>(() => {
    const code = joinCodeFromUrl();
    return code ? { joinCode: code } : null;
  });
  // The title screen at startup (`#play` skips it, for scripts and links straight into a game).
  const [home, setHome] = useState(() => location.hash !== '#play' && !joinCodeFromUrl());
  const [mode, setMode] = useState<'3d' | '2d'>(() => (hasWebGL2() ? '3d' : '2d'));
  const [quality, setQuality] = useState<Quality>('medium');
  const game = useRef<GameHandle>(undefined);
  const onGame = useCallback((g: GameHandle) => {
    game.current = g;
  }, []);
  const onOnlineGame = useCallback((handle: GameHandle) => {
    history.replaceState(null, '', location.pathname + location.search);
    setStart({ id: startId(), handle });
    setOnline(null);
    setHome(false);
  }, []);
  const backHome = useCallback(() => {
    setStart({ id: startId(), setup: makeSetup({ ...options, seed: randomSeed() }) });
    setHome(true);
  }, [options]);
  // Leaving an online game any way (a new game, a load, the menu) closes its connections.
  useEffect(() => () => ('handle' in start ? start.handle.online?.leave() : undefined), [start]);

  if (screen === 'lab') return <MapLab content={content} onBack={() => setScreen('game')} />;
  if (screen === 'gallery') return <Gallery content={content} onBack={() => setScreen('game')} />;
  if (screen === 'fame') return <HallOfFameScreen onClose={() => setScreen('game')} />;
  if (screen === 'pedia')
    return <CivilopediaScreen content={content} onClose={() => setScreen('game')} />;

  return (
    <div className="app">
      <GameScreen
        key={start.id}
        content={content}
        start={start}
        mode={mode}
        quality={quality}
        onGame={onGame}
        onExit={backHome}
        covered={home || dialog !== null || online !== null}
      />
      {home && !dialog && !online && (
        <HomeScreen
          ctx={ctx}
          onPlay={() => setHome(false)}
          onNewGame={() => setDialog('new')}
          onLoadGame={() => setDialog('saves')}
          onContinue={(state) => {
            setStart({ id: startId(), state });
            setHome(false);
          }}
          onMapLab={() => setScreen('lab')}
          onOnline={() => setOnline({})}
          onHallOfFame={() => setScreen('fame')}
          onAccount={() => setDialog('account')}
          onPedia={() => setScreen('pedia')}
          onResumeOnline={(state) => setOnline({ resume: state })}
        />
      )}
      {online && (
        <OnlineDialog
          content={content}
          ctx={ctx}
          net={networkFromUrl()}
          {...(online.joinCode ? { joinCode: online.joinCode } : {})}
          {...(online.resume ? { resume: online.resume } : {})}
          makeSetup={makeOnlineSetup}
          onGame={onOnlineGame}
          onCancel={() => {
            history.replaceState(null, '', location.pathname + location.search);
            setOnline(null);
            setHome(true);
          }}
        />
      )}
      <header className="game-bar">
        <div className="bar-actions">
          {'handle' in start && start.handle.online && (
            <OnlineCode code={start.handle.online.code} />
          )}
          <GameMenu
            onNewGame={() => setDialog('new')}
            onSaves={() => setDialog('saves')}
            onAccount={() => setDialog('account')}
            onMapLab={() => setScreen('lab')}
            onHome={() => setHome(true)}
            quality={mode === '3d' ? quality : null}
            onQuality={setQuality}
          />
          <div className="segmented compact" role="group" aria-label="View">
            {(['3d', '2d'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                className={mode === m ? 'on' : ''}
                onClick={() => setMode(m)}
              >
                {m === '3d' ? '3D' : '2D'}
              </button>
            ))}
          </div>
        </div>
      </header>
      {dialog === 'new' && (
        <SetupScreen
          content={content}
          initial={options}
          onCancel={() => setDialog(null)}
          onStart={(o) => {
            setOptions(o);
            saveLastOptions(o);
            setStart({ id: startId(), setup: makeSetup(o) });
            setDialog(null);
            setHome(false);
          }}
        />
      )}
      {dialog === 'account' && <AccountDialog onClose={() => setDialog(null)} />}
      {dialog === 'saves' && (
        <SavesDialog
          ctx={ctx}
          current={() => (game.current?.saves ? game.current.state : undefined)}
          onClose={() => setDialog(null)}
          onLoad={(state) => {
            setStart({ id: startId(), state });
            setDialog(null);
            setHome(false);
          }}
        />
      )}
    </div>
  );
}

/** The ☰ menu at the top right: new game, saves, Map Lab, the title screen. */
function GameMenu(props: {
  onNewGame: () => void;
  onSaves: () => void;
  onAccount: () => void;
  onMapLab: () => void;
  onHome: () => void;
  /** The 3D view's graphics quality (null in the 2D view). */
  quality: Quality | null;
  onQuality: (q: Quality) => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);
  const pick = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <div className="game-menu">
      <button
        type="button"
        className="menu-button"
        aria-expanded={open}
        aria-label="Menu"
        title="Menu"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="menu" size={30} />
      </button>
      {open && (
        <div className="menu-pop" role="menu">
          <button type="button" role="menuitem" onClick={pick(props.onNewGame)}>
            New game…
          </button>
          <button type="button" role="menuitem" onClick={pick(props.onSaves)}>
            Save / Load…
          </button>
          <button type="button" role="menuitem" onClick={pick(props.onAccount)}>
            Account…
          </button>
          <button type="button" role="menuitem" onClick={pick(props.onMapLab)}>
            Map Lab
          </button>
          <button type="button" role="menuitem" onClick={pick(props.onHome)}>
            Title screen
          </button>
          {props.quality && (
            <div className="menu-section">
              <h4>Graphics</h4>
              <div className="segmented" role="group" aria-label="Graphics quality">
                {(['low', 'medium', 'high'] as const).map((q) => (
                  <button
                    key={q}
                    type="button"
                    aria-pressed={props.quality === q}
                    className={props.quality === q ? 'on' : ''}
                    onClick={() => props.onQuality(q)}
                  >
                    {q === 'low' ? 'Low' : q === 'medium' ? 'Medium' : 'High'}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="menu-section">
            <h4>Sound</h4>
            <SoundSettings />
          </div>
        </div>
      )}
    </div>
  );
}

/** The online game's join code; a click copies the invite link. */
function OnlineCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="ghost small online-chip"
      title="Online game: copy the invite link"
      onClick={() => {
        void navigator.clipboard
          ?.writeText(inviteLink(code, networkFromUrl()))
          .then(() => setCopied(true))
          .catch(() => {});
      }}
    >
      {copied ? 'Link copied' : `🌐 ${code}`}
    </button>
  );
}

function SavesDialog({
  ctx,
  current,
  onClose,
  onLoad,
}: {
  ctx: EngineContext;
  current: () => GameState | undefined;
  onClose: () => void;
  onLoad: (state: GameState) => void;
}) {
  const [saves, setSaves] = useState<SaveSummary[] | null>(null);
  // Cloud saves, when signed in (cloud/cloud.ts).
  const remote = cloud();
  const [cloudSaves, setCloudSaves] = useState<CloudSave[] | null>(null);
  const refreshCloud = useCallback(() => {
    if (!remote?.signedIn) return;
    remote
      .listSaves()
      .then(setCloudSaves)
      .catch((e: Error) => setMessage(e.message));
  }, [remote]);
  useEffect(refreshCloud, [refreshCloud]);
  const saveToCloud = async () => {
    const state = current();
    if (!state || !remote) return;
    try {
      const label = name.trim() || `Turn ${state.turn}`;
      await remote.putSave(`save-${Date.now()}`, label, state.turn, makeSave(state, label));
      setMessage('Saved to the cloud.');
      refreshCloud();
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  const loadFromCloud = async (id: string) => {
    try {
      const data = await remote!.getSave(id);
      const read = readSave(JSON.stringify(data), ctx);
      if (!read.ok) setMessage(read.message);
      else onLoad(read.save.state);
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  const [name, setName] = useState(() => `Turn ${current()?.turn ?? 1}`);
  const [message, setMessage] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const refresh = useCallback(() => {
    listSaves()
      .then(setSaves)
      .catch(() => {
        setSaves([]);
        setMessage("This browser can't keep saved games here; use Export file instead.");
      });
  }, []);
  useEffect(refresh, [refresh]);

  const save = async () => {
    const state = current();
    if (!state) return;
    try {
      await storeSave(`save-${Date.now()}`, makeSave(state, name.trim() || `Turn ${state.turn}`));
      setMessage('Saved.');
      refresh();
    } catch {
      setMessage('Saving failed (is the browser out of space?). Try Export file.');
    }
  };
  const load = async (id: string) => {
    const s = await loadSave(id).catch(() => undefined);
    const read = s ? readSave(JSON.stringify(s), ctx) : undefined;
    if (!read) setMessage('That save is gone.');
    else if (!read.ok) setMessage(read.message);
    else onLoad(read.save.state);
  };
  const importFile = async (f: File) => {
    const read = readSave(await f.text(), ctx);
    if (!read.ok) setMessage(read.message);
    else onLoad(read.save.state);
  };

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="dialog saves"
        role="dialog"
        aria-labelledby="saves-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="saves-title">Save / Load</h2>
        <form
          className="save-row"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <input aria-label="Save name" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="primary">
            Save game
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              const state = current();
              if (state) downloadSave(makeSave(state, name.trim() || `Turn ${state.turn}`));
            }}
          >
            Export file
          </button>
        </form>
        {message && <p className="hint">{message}</p>}
        <h3>Saved games</h3>
        {saves === null ? (
          <p className="hint">Loading…</p>
        ) : saves.length === 0 ? (
          <p className="hint">No saved games yet. An autosave is made at the start of each turn.</p>
        ) : (
          <ul className="save-list">
            {saves.map((s) => (
              <li key={s.id}>
                <span className="save-name">
                  <strong>{s.id === AUTOSAVE ? 'Autosave' : s.name}</strong>
                  <span className="muted small-text">
                    turn {s.turn} · {new Date(s.savedAt).toLocaleString()}
                  </span>
                </span>
                <button type="button" className="primary small" onClick={() => void load(s.id)}>
                  Load
                </button>
                <button
                  type="button"
                  className="ghost small"
                  aria-label={`Delete ${s.name}`}
                  onClick={() => void deleteSave(s.id).then(refresh)}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        {remote?.signedIn && (
          <>
            <h3>
              Cloud saves{' '}
              <button type="button" className="ghost small" onClick={() => void saveToCloud()}>
                Save to the cloud
              </button>
            </h3>
            {cloudSaves === null ? (
              <p className="hint">Loading…</p>
            ) : cloudSaves.length === 0 ? (
              <p className="hint">Nothing in the cloud yet.</p>
            ) : (
              <ul className="save-list">
                {cloudSaves.map((s) => (
                  <li key={s.id}>
                    <span className="save-name">
                      <strong>{s.name}</strong>
                      <span className="muted small-text">
                        turn {s.turn} · {new Date(s.updatedAt).toLocaleString()}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="primary small"
                      onClick={() => void loadFromCloud(s.id)}
                    >
                      Load
                    </button>
                    <button
                      type="button"
                      className="ghost small"
                      aria-label={`Delete ${s.name} from the cloud`}
                      onClick={() =>
                        void remote
                          .deleteSave(s.id)
                          .then(refreshCloud)
                          .catch((e: Error) => setMessage(e.message))
                      }
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <div className="dialog-actions">
          <input
            ref={file}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importFile(f);
            }}
          />
          <button type="button" className="ghost" onClick={() => file.current?.click()}>
            Import file…
          </button>
          <button type="button" className="primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
