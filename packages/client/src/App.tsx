import type { CompiledContent } from '@cx/content';
import type { EngineContext, GameSetup, GameState, MapSettings } from '@cx/engine';
import { type LocalGame, makeSave, readSave } from '@cx/host';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadContent } from './content';
import { HomeScreen } from './HomeScreen';
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
import { MapLab } from './lab/MapLab';
import type { Quality } from './map/renderer';

const randomSeed = () => Math.random().toString(36).slice(2, 8);
let nextStart = 0;
const startId = () => `start-${++nextStart}`;

interface NewGameOptions {
  script: string;
  size: string;
  /** Human players' names: one for single player, more for hotseat. */
  humans: string[];
  rivals: number;
  seed: string;
  wrapX: boolean;
  resources: MapSettings['resources'];
  camps: boolean;
  domination: boolean;
  religion: boolean;
  cityStates: boolean;
  science: boolean;
  culture: boolean;
  turnLimit: number | null;
}

function makeSetup(o: NewGameOptions): GameSetup {
  return {
    gameId: `local-${o.seed}`,
    settings: {
      seed: o.seed,
      camps: o.camps,
      domination: o.domination,
      religion: o.religion,
      cityStates: o.cityStates,
      science: o.science,
      culture: o.culture,
      turnLimit: o.turnLimit,
      map: {
        script: o.script,
        size: o.size,
        wrapX: o.wrapX,
        resources: o.resources,
        startBalance: 'normal',
      },
    },
    players: [
      ...o.humans.map((name, i) => ({
        id: `p${i + 1}`,
        name: name.trim() || `Player ${i + 1}`,
        kind: 'human' as const,
      })),
      ...Array.from({ length: o.rivals }, (_, i) => ({
        id: `p${o.humans.length + i + 1}`,
        name: `Rival ${i + 1}`,
        kind: 'ai' as const,
      })),
    ],
  };
}

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
  const [screen, setScreenState] = useState<'game' | 'lab'>(() =>
    location.hash === '#lab' ? 'lab' : 'game',
  );
  const setScreen = (s: 'game' | 'lab') => {
    history.replaceState(null, '', s === 'lab' ? '#lab' : location.pathname + location.search);
    setScreenState(s);
  };
  const [options, setOptions] = useState<NewGameOptions>({
    script: 'continents',
    size: 'small',
    humans: ['You'],
    rivals: 3,
    seed: randomSeed(),
    wrapX: true,
    resources: 'standard',
    camps: true,
    domination: true,
    religion: true,
    cityStates: true,
    science: true,
    culture: true,
    turnLimit: null,
  });
  const [start, setStart] = useState<GameStart>(() => ({
    id: startId(),
    setup: makeSetup(options),
  }));
  const [dialog, setDialog] = useState<'new' | 'saves' | null>(null);
  // The title screen at startup (`#play` skips it, for scripts and links straight into a game).
  const [home, setHome] = useState(() => location.hash !== '#play');
  const [mode, setMode] = useState<'3d' | '2d'>(() => (hasWebGL2() ? '3d' : '2d'));
  const [quality, setQuality] = useState<Quality>('medium');
  const game = useRef<LocalGame>(undefined);
  const onGame = useCallback((g: LocalGame) => {
    game.current = g;
  }, []);

  if (screen === 'lab') return <MapLab content={content} onBack={() => setScreen('game')} />;

  return (
    <div className="app">
      <GameScreen
        key={start.id}
        content={content}
        start={start}
        mode={mode}
        quality={quality}
        onGame={onGame}
      />
      {home && !dialog && (
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
        />
      )}
      <header className="game-bar">
        <span className="brand-name">Civius Maximus</span>
        <div className="bar-actions">
          <button type="button" className="ghost small" onClick={() => setDialog('new')}>
            New game
          </button>
          <button type="button" className="ghost small" onClick={() => setDialog('saves')}>
            Save / Load
          </button>
          <button type="button" className="ghost small" onClick={() => setScreen('lab')}>
            Map Lab
          </button>
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
          {mode === '3d' && (
            <select
              aria-label="Graphics quality"
              className="compact-select"
              value={quality}
              onChange={(e) => setQuality(e.target.value as Quality)}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          )}
        </div>
      </header>
      {dialog === 'new' && (
        <NewGameDialog
          content={content}
          initial={options}
          onCancel={() => setDialog(null)}
          onStart={(o) => {
            setOptions(o);
            setStart({ id: startId(), setup: makeSetup(o) });
            setDialog(null);
            setHome(false);
          }}
        />
      )}
      {dialog === 'saves' && (
        <SavesDialog
          ctx={ctx}
          current={() => game.current?.state}
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

function NewGameDialog({
  content,
  initial,
  onCancel,
  onStart,
}: {
  content: CompiledContent;
  initial: NewGameOptions;
  onCancel: () => void;
  onStart: (o: NewGameOptions) => void;
}) {
  const [o, setO] = useState({ ...initial, seed: randomSeed() });
  const sizes = [...content.ids.mapSize].sort(
    (a, b) => content.entities.mapSize[a]!.order - content.entities.mapSize[b]!.order,
  );
  const total = o.humans.length + o.rivals;
  const hotseat = o.humans.length > 1;
  return (
    <div className="dialog-backdrop" role="presentation" onClick={onCancel}>
      <form
        className="dialog"
        role="dialog"
        aria-labelledby="new-game-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (total >= 2) onStart(o);
        }}
      >
        <h2 id="new-game-title">New game</h2>
        <fieldset className="players-field">
          <legend>
            Players{' '}
            <span className="muted small-text">
              {hotseat ? 'Hotseat: pass the device each turn' : 'Single player'}
            </span>
          </legend>
          {o.humans.map((name, i) => (
            <div key={i} className="player-row">
              <input
                aria-label={`Player ${i + 1} name`}
                value={name}
                maxLength={24}
                onChange={(e) =>
                  setO({ ...o, humans: o.humans.map((n, k) => (k === i ? e.target.value : n)) })
                }
              />
              {o.humans.length > 1 && (
                <button
                  type="button"
                  className="ghost small"
                  aria-label={`Remove ${name || `player ${i + 1}`}`}
                  onClick={() => setO({ ...o, humans: o.humans.filter((_, k) => k !== i) })}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {o.humans.length < 8 && (
            <button
              type="button"
              className="ghost small add-player"
              onClick={() => setO({ ...o, humans: [...o.humans, `Player ${o.humans.length + 1}`] })}
            >
              + Add a player (hotseat)
            </button>
          )}
        </fieldset>
        <label htmlFor="ng-script">Map type</label>
        <select
          id="ng-script"
          value={o.script}
          onChange={(e) => setO({ ...o, script: e.target.value })}
        >
          {content.ids.mapScript.map((id) => (
            <option key={id} value={id}>
              {content.entities.mapScript[id]!.name}
            </option>
          ))}
        </select>
        <div className="row">
          <div>
            <label htmlFor="ng-size">Map size</label>
            <select
              id="ng-size"
              value={o.size}
              onChange={(e) =>
                setO({
                  ...o,
                  size: e.target.value,
                  rivals: Math.max(
                    0,
                    content.entities.mapSize[e.target.value]!.players - o.humans.length,
                  ),
                })
              }
            >
              {sizes.map((id) => (
                <option key={id} value={id}>
                  {content.entities.mapSize[id]!.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ng-rivals">AI rivals</label>
            <input
              id="ng-rivals"
              type="number"
              min={0}
              max={15}
              value={o.rivals}
              onChange={(e) =>
                setO({ ...o, rivals: Math.max(0, Math.min(15, Number(e.target.value) || 0)) })
              }
            />
          </div>
        </div>
        <div className="row">
          <div>
            <label htmlFor="ng-resources">Resources</label>
            <select
              id="ng-resources"
              value={o.resources}
              onChange={(e) =>
                setO({ ...o, resources: e.target.value as MapSettings['resources'] })
              }
            >
              <option value="sparse">Sparse</option>
              <option value="standard">Standard</option>
              <option value="abundant">Abundant</option>
            </select>
          </div>
          <div>
            <label htmlFor="ng-limit">Turn limit</label>
            <select
              id="ng-limit"
              value={o.turnLimit ?? ''}
              onChange={(e) =>
                setO({ ...o, turnLimit: e.target.value ? Number(e.target.value) : null })
              }
            >
              <option value="">None</option>
              {[60, 100, 150, 200, 250].map((n) => (
                <option key={n} value={n}>
                  {n} turns
                </option>
              ))}
            </select>
          </div>
        </div>
        <label htmlFor="ng-seed">Seed</label>
        <input
          id="ng-seed"
          value={o.seed}
          onChange={(e) => setO({ ...o, seed: e.target.value })}
          spellCheck={false}
        />
        <label className="check" htmlFor="ng-wrap">
          <input
            id="ng-wrap"
            type="checkbox"
            checked={o.wrapX}
            onChange={(e) => setO({ ...o, wrapX: e.target.checked })}
          />
          Wrap east–west
        </label>
        <label className="check" htmlFor="ng-camps">
          <input
            id="ng-camps"
            type="checkbox"
            checked={o.camps}
            onChange={(e) => setO({ ...o, camps: e.target.checked })}
          />
          Hostile camps (raiders)
        </label>
        <label className="check" htmlFor="ng-city-states">
          <input
            id="ng-city-states"
            type="checkbox"
            checked={o.cityStates}
            onChange={(e) => setO({ ...o, cityStates: e.target.checked })}
          />
          City-states (envoys, suzerains and their bonuses)
        </label>
        <label className="check" htmlFor="ng-domination">
          <input
            id="ng-domination"
            type="checkbox"
            checked={o.domination}
            onChange={(e) => setO({ ...o, domination: e.target.checked })}
          />
          Domination victory (hold every rival&apos;s original capital)
        </label>
        <label className="check" htmlFor="ng-religion">
          <input
            id="ng-religion"
            type="checkbox"
            checked={o.religion}
            onChange={(e) => setO({ ...o, religion: e.target.checked })}
          />
          Religious victory (your religion followed in most of every rival&apos;s settlements)
        </label>
        <label className="check" htmlFor="ng-science">
          <input
            id="ng-science"
            type="checkbox"
            checked={o.science}
            onChange={(e) => setO({ ...o, science: e.target.checked })}
          />
          Science victory (the space projects)
        </label>
        <label className="check" htmlFor="ng-culture">
          <input
            id="ng-culture"
            type="checkbox"
            checked={o.culture}
            onChange={(e) => setO({ ...o, culture: e.target.checked })}
          />
          Culture victory (tourism)
        </label>
        <p className="hint">
          The last civilization standing always wins. With a turn limit, the highest score wins when
          it&apos;s reached.
        </p>
        {total < 2 && <p className="error">A game needs at least two players.</p>}
        <div className="dialog-actions">
          <button type="button" className="ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={total < 2}>
            Start game
          </button>
        </div>
      </form>
    </div>
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
