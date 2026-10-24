import type { CompiledContent } from '@cx/content';
import type { GameSetup, MapSettings } from '@cx/engine';
import { useMemo, useState } from 'react';
import { loadContent } from './content';
import { GameScreen } from './game/GameScreen';
import { MapLab } from './lab/MapLab';
import type { Quality } from './map/renderer';

const randomSeed = () => Math.random().toString(36).slice(2, 8);

interface NewGameOptions {
  script: string;
  size: string;
  rivals: number;
  seed: string;
  wrapX: boolean;
  resources: MapSettings['resources'];
  camps: boolean;
}

function makeSetup(o: NewGameOptions): GameSetup {
  return {
    gameId: `local-${o.seed}`,
    settings: {
      seed: o.seed,
      camps: o.camps,
      turnLimit: null,
      map: {
        script: o.script,
        size: o.size,
        wrapX: o.wrapX,
        resources: o.resources,
        startBalance: 'normal',
      },
    },
    players: [
      { id: 'p1', name: 'You', kind: 'human' },
      ...Array.from({ length: o.rivals }, (_, i) => ({
        id: `p${i + 2}`,
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
    rivals: 3,
    seed: randomSeed(),
    wrapX: true,
    resources: 'standard',
    camps: true,
  });
  const [setup, setSetup] = useState(() => makeSetup(options));
  const [dialog, setDialog] = useState(false);
  const [mode, setMode] = useState<'3d' | '2d'>(() => (hasWebGL2() ? '3d' : '2d'));
  const [quality, setQuality] = useState<Quality>('medium');

  if (screen === 'lab') return <MapLab content={content} onBack={() => setScreen('game')} />;

  return (
    <div className="app">
      <GameScreen
        key={setup.gameId}
        content={content}
        setup={setup}
        mode={mode}
        quality={quality}
      />
      <header className="game-bar">
        <span className="brand-name">Civius Maximus</span>
        <div className="bar-actions">
          <button type="button" className="ghost small" onClick={() => setDialog(true)}>
            New game
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
      {dialog && (
        <NewGameDialog
          content={content}
          initial={options}
          onCancel={() => setDialog(false)}
          onStart={(o) => {
            setOptions(o);
            setSetup(makeSetup(o));
            setDialog(false);
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
  return (
    <div className="dialog-backdrop" role="presentation" onClick={onCancel}>
      <form
        className="dialog"
        role="dialog"
        aria-labelledby="new-game-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onStart(o);
        }}
      >
        <h2 id="new-game-title">New game</h2>
        <p className="hint">
          The full setup screen (speeds, victories, every option) comes with the hotseat milestone.
        </p>
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
                  rivals: content.entities.mapSize[e.target.value]!.players - 1,
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
            <label htmlFor="ng-rivals">Rivals</label>
            <input
              id="ng-rivals"
              type="number"
              min={1}
              max={15}
              value={o.rivals}
              onChange={(e) =>
                setO({ ...o, rivals: Math.max(1, Math.min(15, Number(e.target.value) || 1)) })
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
            <label htmlFor="ng-seed">Seed</label>
            <input
              id="ng-seed"
              value={o.seed}
              onChange={(e) => setO({ ...o, seed: e.target.value })}
              spellCheck={false}
            />
          </div>
        </div>
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
        <div className="dialog-actions">
          <button type="button" className="ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="primary">
            Start game
          </button>
        </div>
      </form>
    </div>
  );
}
