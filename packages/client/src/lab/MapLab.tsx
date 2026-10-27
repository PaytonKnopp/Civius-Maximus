import { type CompiledContent, resolveText } from '@cx/content';
import {
  createRng,
  generateMap,
  type MapSettings,
  makeRandom,
  MapGenerationError,
  type MapState,
  distance,
  scoreStarts,
  tilesWithin,
} from '@cx/engine';
import { useEffect, useMemo, useRef, useState } from 'react';
import { TileCard } from '../components/TileCard';
import { MapView } from '../map/MapView';
import {
  type MapRenderer,
  type MapViewOptions,
  PLAYER_COLORS,
  type Quality,
  type SettlementView,
  type TerritoryView,
  type UnitView,
} from '../map/renderer';
import { World3D } from '../map3d/World3D';

type Mode = '3d' | '2d';

function hasWebGL2() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

interface Generated {
  map: MapState;
  starts: Record<string, number>;
  players: string[];
  ms: number;
  seed: string;
}

const randomSeed = () => Math.random().toString(36).slice(2, 8);

function cssColor(n: number) {
  return `#${n.toString(16).padStart(6, '0')}`;
}

export function MapLab({ content, onBack }: { content: CompiledContent; onBack?: () => void }) {
  const sizes = useMemo(
    () =>
      [...content.ids.mapSize].sort(
        (a, b) => content.entities.mapSize[a]!.order - content.entities.mapSize[b]!.order,
      ),
    [content],
  );
  const [script, setScript] = useState('continents');
  const [size, setSize] = useState('small');
  const [players, setPlayers] = useState(content.entities.mapSize.small?.players ?? 6);
  const [seed, setSeed] = useState('civius');
  const [wrapX, setWrapX] = useState(true);
  const [resources, setResources] = useState<MapSettings['resources']>('standard');
  const [startBalance, setStartBalance] = useState<MapSettings['startBalance']>('normal');
  const [options, setOptions] = useState<MapViewOptions>({
    grid: false,
    yields: false,
    viewer: null,
    quality: 'medium',
  });
  const [mode, setMode] = useState<Mode>(() => (hasWebGL2() ? '3d' : '2d'));
  const [generated, setGenerated] = useState<Generated>();
  const [error, setError] = useState<string>();
  const [hover, setHover] = useState<number>();
  const [selected, setSelected] = useState<number>();
  const [fps, setFps] = useState(0);
  const [showModels, setShowModels] = useState(false);
  const [showTowns, setShowTowns] = useState(false);
  // Phones open on the map; the controls are one tap away.
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth > 640);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<MapRenderer>(undefined);

  const generate = (nextSeed = seed) => {
    const ids = Array.from({ length: players }, (_, i) => `p${i + 1}`);
    const start = performance.now();
    try {
      const { map, starts } = generateMap(
        {
          content,
          settings: { script, size, wrapX, resources, startBalance },
          players: ids.map((id) => ({ id })),
        },
        makeRandom(createRng(nextSeed)),
      );
      setGenerated({ map, starts, players: ids, ms: performance.now() - start, seed: nextSeed });
      setError(undefined);
      setSelected(undefined);
    } catch (e) {
      setError(
        e instanceof MapGenerationError
          ? `${e.message}. Try a bigger map or fewer players.`
          : String(e),
      );
    }
  };

  useEffect(() => {
    const view: MapRenderer =
      mode === '3d' ? new World3D(hostRef.current!) : new MapView(hostRef.current!);
    view.onHover = setHover;
    view.onSelect = setSelected;
    view.onFps = setFps;
    viewRef.current = view;
    return () => view.destroy();
  }, [mode]);

  // Generate once on open, so the lab starts with a map instead of an empty canvas.
  useEffect(() => generate(), []);

  useEffect(() => {
    if (generated) {
      void viewRef.current?.setData(
        { map: generated.map, content, starts: generated.starts, playerOrder: generated.players },
        options,
      );
    }
  }, [generated, mode]);

  useEffect(() => {
    void viewRef.current?.setOptions(options);
  }, [options]);

  // One unit of every 3D model family on the land around the first start, to look at the art.
  useEffect(() => {
    if (!generated) return;
    viewRef.current?.setUnits(
      showModels ? modelShowcase(content, generated.map, generated.starts.p1 ?? 0) : [],
    );
  }, [generated, mode, showModels, content]);

  // A capital in every architecture, and one style through every age, to look at the art.
  useEffect(() => {
    if (!generated) return;
    const { views, territory } = townShowcase(content, generated.map, generated.starts.p1 ?? 0);
    viewRef.current?.setSettlements(showTowns ? views : [], territory);
  }, [generated, mode, showTowns, content]);

  const inspected = selected ?? hover;
  const scores = useMemo(
    () => (generated ? scoreStarts(generated.map, content, generated.starts) : {}),
    [generated, content],
  );

  return (
    <div className="lab">
      <div
        className="lab-canvas"
        ref={hostRef}
        aria-label="Map. Drag to pan, scroll or pinch to zoom."
      />

      <header className="lab-bar">
        <div className="brand">
          <span className="brand-name">Civius Maximus</span>
          <span className="brand-sub">Map Lab</span>
        </div>
        <div className="bar-stats">
          {generated && (
            <span>
              {generated.map.width} × {generated.map.height} · {generated.players.length} players ·
              built in {generated.ms.toFixed(0)} ms
            </span>
          )}
          <span className="fps">{fps} fps</span>
        </div>
        {onBack && (
          <button type="button" className="panel-toggle" onClick={onBack}>
            Back to game
          </button>
        )}
        <button
          type="button"
          className="panel-toggle controls-toggle"
          onClick={() => setPanelOpen((o) => !o)}
        >
          {panelOpen ? 'Hide controls' : 'Controls'}
        </button>
      </header>

      <aside className="lab-panel" hidden={!panelOpen}>
        <section className="group">
          <h2>World</h2>
          <label htmlFor="script">Map type</label>
          <select id="script" value={script} onChange={(e) => setScript(e.target.value)}>
            {content.ids.mapScript.map((id) => (
              <option key={id} value={id}>
                {resolveText(content, content.entities.mapScript[id]!.name)}
              </option>
            ))}
          </select>
          <p className="hint">
            {resolveText(content, content.entities.mapScript[script]?.description ?? '')}
          </p>

          <div className="row">
            <div>
              <label htmlFor="size">Size</label>
              <select
                id="size"
                value={size}
                onChange={(e) => {
                  setSize(e.target.value);
                  setPlayers(content.entities.mapSize[e.target.value]!.players);
                }}
              >
                {sizes.map((id) => {
                  const s = content.entities.mapSize[id]!;
                  return (
                    <option key={id} value={id}>
                      {resolveText(content, s.name)} ({s.width}×{s.height})
                    </option>
                  );
                })}
              </select>
            </div>
            <div>
              <label htmlFor="players">Players</label>
              <input
                id="players"
                type="number"
                min={1}
                max={16}
                value={players}
                onChange={(e) => setPlayers(Math.max(1, Math.min(16, Number(e.target.value) || 1)))}
              />
            </div>
          </div>

          <div className="row">
            <div>
              <label htmlFor="resources">Resources</label>
              <select
                id="resources"
                value={resources}
                onChange={(e) => setResources(e.target.value as MapSettings['resources'])}
              >
                <option value="sparse">Sparse</option>
                <option value="standard">Standard</option>
                <option value="abundant">Abundant</option>
              </select>
            </div>
            <div>
              <label htmlFor="balance">Starts</label>
              <select
                id="balance"
                value={startBalance}
                onChange={(e) => setStartBalance(e.target.value as MapSettings['startBalance'])}
              >
                <option value="normal">Normal</option>
                <option value="balanced">Balanced</option>
              </select>
            </div>
          </div>

          <label className="check" htmlFor="wrap">
            <input
              id="wrap"
              type="checkbox"
              checked={wrapX}
              onChange={(e) => setWrapX(e.target.checked)}
            />
            Wrap east–west
          </label>

          <label htmlFor="seed">Seed</label>
          <div className="seed">
            <input
              id="seed"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              spellCheck={false}
            />
            <button
              type="button"
              className="ghost"
              onClick={() => {
                const s = randomSeed();
                setSeed(s);
                generate(s);
              }}
            >
              New seed
            </button>
          </div>
          <button type="button" className="primary" onClick={() => generate()}>
            Generate map
          </button>
          {error && <p className="error">{error}</p>}
        </section>

        <section className="group">
          <h2>View</h2>
          <div className="segmented" role="group" aria-label="Renderer">
            {(['3d', '2d'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                className={mode === m ? 'on' : ''}
                onClick={() => setMode(m)}
              >
                {m === '3d' ? '3D world' : '2D strategic'}
              </button>
            ))}
          </div>
          {mode === '3d' && (
            <>
              <label htmlFor="quality">Graphics quality</label>
              <select
                id="quality"
                value={options.quality}
                onChange={(e) => setOptions({ ...options, quality: e.target.value as Quality })}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High (painterly filter)</option>
              </select>
            </>
          )}
          <label className="check" htmlFor="grid">
            <input
              id="grid"
              type="checkbox"
              checked={options.grid}
              onChange={(e) => setOptions({ ...options, grid: e.target.checked })}
            />
            Hex grid
          </label>
          <label className="check" htmlFor="yields">
            <input
              id="yields"
              type="checkbox"
              checked={options.yields}
              onChange={(e) => setOptions({ ...options, yields: e.target.checked })}
            />
            Yield lens{mode === '3d' ? ' (2D view for now)' : ''}
          </label>
          <label className="check" htmlFor="models">
            <input
              id="models"
              type="checkbox"
              checked={showModels}
              onChange={(e) => setShowModels(e.target.checked)}
            />
            Unit models
          </label>
          <label className="check" htmlFor="towns">
            <input
              id="towns"
              type="checkbox"
              checked={showTowns}
              onChange={(e) => setShowTowns(e.target.checked)}
            />
            Buildings (every style and age)
          </label>
          <label htmlFor="viewer">See the map as</label>
          <select
            id="viewer"
            value={options.viewer ?? ''}
            onChange={(e) => setOptions({ ...options, viewer: e.target.value || null })}
          >
            <option value="">Everyone (no fog)</option>
            {generated?.players.map((p) => (
              <option key={p} value={p}>
                Player {p.slice(1)} at turn 1
              </option>
            ))}
          </select>
        </section>

        {generated && (
          <section className="group">
            <h2>Starts</h2>
            <ul className="starts">
              {generated.players.map((p, k) => (
                <li key={p}>
                  <button
                    type="button"
                    className="start"
                    onClick={() => viewRef.current?.focusPlayer(p)}
                  >
                    <span
                      className="swatch"
                      style={{ background: cssColor(PLAYER_COLORS[k % PLAYER_COLORS.length]!) }}
                    />
                    Player {p.slice(1)}
                    <span className="score">{scores[p]}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="hint">
              Start score: nearby yields, fresh water and coast. Click to fly there.
            </p>
          </section>
        )}
      </aside>

      {generated && inspected !== undefined && (
        <TileCard
          content={content}
          map={generated.map}
          tile={inspected}
          pinned={selected !== undefined}
          onClose={() => setSelected(undefined)}
        />
      )}
    </div>
  );
}

const STYLES = [
  'mediterranean',
  'european',
  'northern',
  'east_asian',
  'south_asian',
  'middle_eastern',
  'african',
  'american',
  'steppe',
];

/** European cities through the ages, a burning city, then a capital in every architecture. */
function townShowcase(
  content: CompiledContent,
  map: MapState,
  start: number,
): { views: SettlementView[]; territory: TerritoryView } {
  const n = map.tiles.length;
  const territory: TerritoryView = {
    settlement: Array<string | null>(n).fill(null),
    improvements: Array<string | null>(n).fill(null),
    districts: Array(n).fill(null),
    wonders: Array(n).fill(null),
    features: map.tiles.map((t) => t.feature ?? null),
    camps: Array<boolean>(n).fill(false),
    roads: Array<boolean>(n).fill(false),
  };
  const land = tilesWithin(map, start, 14).filter((t) => {
    const tile = map.tiles[t]!;
    return !content.entities.terrain[tile.terrain]?.water && tile.elevation !== 'mountain';
  });
  const spots: number[] = [];
  for (const t of land) {
    if (spots.every((s) => distance(map, s, t) >= 3)) spots.push(t);
    if (spots.length === STYLES.length + 6) break;
  }
  const looks = [
    ...[1, 2, 4, 5, 6].map((era) => ({
      style: 'european',
      era,
      capital: false,
      pop: 10,
      razing: false,
    })),
    { style: 'east_asian', era: 2, capital: false, pop: 6, razing: true },
    ...STYLES.map((style) => ({ style, era: 2, capital: true, pop: 7, razing: false })),
  ];
  const views = looks.flatMap((look, i) => {
    const tile = spots[i];
    if (tile === undefined) return [];
    const id = `town-${i}`;
    for (const t of [tile, ...tilesWithin(map, tile, 1)]) territory.settlement[t] ??= id;
    territory.roads[tile] = true;
    return [
      {
        id,
        owner: `p${i}`,
        color: PLAYER_COLORS[i % PLAYER_COLORS.length]!,
        accent: 0xf2e6c8,
        name: `${look.style} · era ${look.era}${look.razing ? ' · burning' : ''}`,
        population: look.pop,
        tile,
        kind: 'city' as const,
        capital: look.capital,
        mine: false,
        health: look.razing ? 50 : 200,
        maxHealth: 200,
        walls: look.capital ? 0 : 100,
        wallsMax: look.capital ? 0 : 100,
        architecture: look.style,
        era: look.era,
        razing: look.razing,
      },
    ];
  });
  return { views, territory };
}

/** A unit view per model family (named after the first unit that uses it) on nearby land. */
function modelShowcase(content: CompiledContent, map: MapState, start: number): UnitView[] {
  const firstOf = new Map<string, { name: string; icon: string; civilian: boolean }>();
  for (const id of Object.keys(content.entities.unit).sort()) {
    const def = content.entities.unit[id]!;
    if (firstOf.has(def.model)) continue;
    const civilian = content.entities.unitClass[def.class]?.layer === 'civilian';
    firstOf.set(def.model, { name: resolveText(content, def.name), icon: def.icon, civilian });
  }
  const land = tilesWithin(map, start, 4).filter(
    (t) => !content.entities.terrain[map.tiles[t]!.terrain]?.water,
  );
  const water = tilesWithin(map, start, 6).filter(
    (t) => content.entities.terrain[map.tiles[t]!.terrain]?.water,
  );
  return [...firstOf].flatMap(([model, u], i) => {
    const naval = model === 'ship' || model === 'steamship';
    const tile = naval ? water.shift() : land.shift();
    if (tile === undefined) return [];
    const color = PLAYER_COLORS[i % PLAYER_COLORS.length]!;
    return [
      {
        id: `model-${model}`,
        owner: 'p1',
        color,
        accent: 0xf2e6c8,
        name: `${u.name} (${model})`,
        icon: u.icon,
        model,
        layer: u.civilian ? ('civilian' as const) : ('military' as const),
        tile,
        mine: true,
        needsOrders: false,
        health: 100,
        promotable: false,
      },
    ];
  });
}
