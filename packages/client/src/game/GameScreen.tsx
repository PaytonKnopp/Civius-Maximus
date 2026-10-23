import { type CompiledContent, resolveText } from '@cx/content';
import {
  type Action,
  type EngineContext,
  findPath,
  fogOfWar,
  type GameEvent,
  type GameSetup,
  type GameState,
  MP,
  unitClassOf,
  unitDef,
  unitIds,
  unitsNeedingOrders,
} from '@cx/engine';
import { LocalGame } from '@cx/host';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TileCard } from '../components/TileCard';
import { MapView } from '../map/MapView';
import {
  type MapRenderer,
  type PathView,
  PLAYER_COLORS,
  type Quality,
  type UnitView,
} from '../map/renderer';
import { World3D } from '../map3d/World3D';

const ME = 'p1';
const coarsePointer = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

function cssColor(n: number) {
  return `#${n.toString(16).padStart(6, '0')}`;
}

function toPathView(steps: ReturnType<typeof findPath>): PathView | null {
  if (!steps) return null;
  return {
    steps: steps.map((s, i) => ({
      tile: s.tile,
      turn: s.turn,
      endsTurn: i < steps.length - 1 && steps[i + 1]!.turn > s.turn,
    })),
  };
}

interface Props {
  content: CompiledContent;
  setup: GameSetup;
  mode: '3d' | '2d';
  quality: Quality;
}

/** The main game view: the map, your units, and the controls to play a turn. */
export function GameScreen({ content, setup, mode, quality }: Props) {
  const ctx: EngineContext = useMemo(() => ({ content }), [content]);
  const game = useMemo(() => new LocalGame(setup, ctx), [setup, ctx]);
  const [state, setState] = useState<GameState>(game.state);
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<number>();
  const [pinned, setPinned] = useState<number | null>(null);
  const [inspect, setInspect] = useState<number>();
  const [notice, setNotice] = useState<string>();
  const [confirmDisband, setConfirmDisband] = useState(false);
  const [fps, setFps] = useState(0);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<MapRenderer>(undefined);
  const pendingMoves = useRef<{ unit: string; path: number[] }[]>([]);

  const playerIndex = (id: string) => state.playerOrder.indexOf(id);
  const fog = useMemo(() => fogOfWar(ctx, state, ME), [ctx, state]);
  const needing = useMemo(() => unitsNeedingOrders(state, ME), [state]);

  const unitViews: UnitView[] = useMemo(
    () =>
      unitIds(state)
        .map((id) => state.units[id]!)
        .filter((u) => u.owner === ME || fog[u.tile] === 2)
        .map((u) => {
          const def = unitDef(ctx, u);
          return {
            id: u.id,
            owner: u.owner,
            color: playerIndex(u.owner),
            name: resolveText(content, def.name),
            icon: def.icon,
            model: def.model,
            layer: unitClassOf(ctx, u).layer,
            tile: u.tile,
            mine: u.owner === ME,
            needsOrders: needing.includes(u.id),
          };
        }),
    [state, fog, needing],
  );

  // Renderer lifecycle (recreated when switching 2D/3D).
  useEffect(() => {
    const view: MapRenderer =
      mode === '3d' ? new World3D(hostRef.current!) : new MapView(hostRef.current!);
    view.onFps = setFps;
    viewRef.current = view;
    view.setFog(fog);
    void view
      .setData(
        { map: game.state.map, content, starts: {}, playerOrder: game.state.playerOrder },
        { grid: false, yields: false, viewer: null, quality },
      )
      .then(() => {
        view.setUnits(unitViews);
        const mine = Object.values(game.state.units).find((u) => u.owner === ME);
        if (mine) view.focusTile(mine.tile, true);
      });
    return () => view.destroy();
  }, [game, mode]);

  useEffect(() => {
    void viewRef.current?.setOptions({ grid: false, yields: false, viewer: null, quality });
  }, [quality]);

  useEffect(
    () =>
      game.subscribe((s, events) => {
        pendingMoves.current.push(
          ...events.flatMap((e) =>
            e.type === 'unit_moved' && (e.visibleTo === 'all' || e.visibleTo.includes(ME))
              ? [{ unit: e.unit, path: e.path }]
              : [],
          ),
        );
        const started = events.find(
          (e): e is Extract<GameEvent, { type: 'turn_started' }> => e.type === 'turn_started',
        );
        if (started) setNotice(`Turn ${started.turn}`);
        setState(s);
      }),
    [game],
  );

  useEffect(() => {
    viewRef.current?.setFog(fog);
  }, [fog]);

  useEffect(() => {
    viewRef.current?.setUnits(unitViews, pendingMoves.current.splice(0));
  }, [unitViews]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(undefined), 1800);
    return () => clearTimeout(t);
  }, [notice]);

  // Keep the selection valid; show the planned path to the hovered (or pinned) tile.
  const unit = selected ? state.units[selected] : undefined;
  useEffect(() => {
    if (selected && !state.units[selected]) setSelected(null);
  }, [state, selected]);
  const pathTarget = pinned ?? hover;
  const path = useMemo(() => {
    if (!unit || unit.owner !== ME || pathTarget === undefined || pathTarget === unit.tile)
      return null;
    return toPathView(findPath(ctx, state, unit, pathTarget));
  }, [ctx, state, unit, pathTarget]);
  useEffect(() => {
    viewRef.current?.setSelected(selected);
  }, [selected, unitViews]);
  useEffect(() => {
    viewRef.current?.setPath(path, unit?.tile ?? null);
  }, [path, unit?.tile]);

  const act = useCallback(
    (action: Action) => {
      const r = game.act(action);
      if (!r.ok) setNotice(r.error.message);
      return r.ok;
    },
    [game],
  );

  const select = useCallback(
    (id: string | null, focus = false) => {
      setSelected(id);
      setPinned(null);
      setConfirmDisband(false);
      if (id && focus) viewRef.current?.focusTile(game.state.units[id]!.tile);
    },
    [game],
  );

  /** Selects the next unit that needs orders (after the current one); false if there are none. */
  const selectNext = useCallback(() => {
    const list = unitsNeedingOrders(game.state, ME);
    if (list.length === 0) {
      select(null);
      return false;
    }
    const after = selected
      ? list.find((id) => Number(id.slice(1)) > Number(selected.slice(1)))
      : undefined;
    select(after ?? list[0]!, true);
    return true;
  }, [game, selected, select]);

  // The Next Action button: units needing orders first, then End Turn.
  const nextAction = useCallback(() => {
    if (!selectNext()) act({ type: 'end_turn', player: ME });
  }, [selectNext, act]);

  const skip = useCallback(
    (id: string) => {
      act({ type: 'skip_unit', player: ME, unit: id });
      selectNext();
    },
    [act, selectNext],
  );

  const moveTo = useCallback(
    (tile: number) => {
      if (!unit || unit.owner !== ME) return;
      if (!act({ type: 'move_unit', player: ME, unit: unit.id, to: tile })) return;
      setPinned(null);
      // Out of moves (or still travelling): on to the next unit, like Civ's auto-cycling.
      if (!unitsNeedingOrders(game.state, ME).includes(unit.id)) selectNext();
    },
    [game, unit, act, selectNext],
  );

  // Map input: click selects your unit (cycling through a stack) or plans a move; a second click on
  // the planned tile (or a right-click) moves there.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.onHover = setHover;
    view.onSelect = (tile) => {
      if (tile === undefined) return;
      const mine = unitIds(game.state).filter((id) => {
        const u = game.state.units[id]!;
        return u.owner === ME && u.tile === tile;
      });
      if (mine.length > 0 && !(unit && pinned === tile)) {
        const i = selected ? mine.indexOf(selected) : -1;
        select(mine[(i + 1) % mine.length]!);
        setInspect(undefined);
        return;
      }
      if (unit && unit.owner === ME && tile !== unit.tile) {
        if (pinned === tile) moveTo(tile);
        else setPinned(tile);
        return;
      }
      setInspect(tile);
      select(null);
    };
    view.onCommand = (tile) => {
      if (unit && unit.owner === ME) moveTo(tile);
    };
  });

  // Keyboard shortcuts (Civ-like).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input, select, textarea')) return;
      if (e.key === 'Enter') nextAction();
      else if (e.key === 'Escape') select(null);
      else if (!unit || unit.owner !== ME) return;
      else if (e.key === ' ') {
        e.preventDefault();
        skip(unit.id);
      } else if (e.key === 'z') act({ type: 'sleep_unit', player: ME, unit: unit.id });
      else if (e.key === 'f') act({ type: 'fortify_unit', player: ME, unit: unit.id });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [unit, act, nextAction, select, skip]);

  const me = state.players[ME]!;
  const waiting = me.turnEnded;
  const def = unit ? unitDef(ctx, unit) : undefined;
  const cls = unit ? unitClassOf(ctx, unit) : undefined;
  const status = !unit
    ? ''
    : unit.orders?.kind === 'move'
      ? 'Moving'
      : unit.orders?.kind === 'sleep'
        ? 'Asleep'
        : unit.orders?.kind === 'fortify'
          ? 'Fortified'
          : unit.moves === 0
            ? 'Out of moves'
            : 'Ready';
  const inspected = pathTarget ?? inspect;

  return (
    <div className="game">
      <div
        className="lab-canvas"
        ref={hostRef}
        aria-label="Map. Drag to pan, scroll or pinch to zoom."
      />

      <div className="turn-pill" aria-live="polite">
        <span className="turn-label">Turn</span>
        <span className="turn-number">{state.turn}</span>
        <span className="era">Ancient Era</span>
        <span className="fps">{fps} fps</span>
      </div>

      <div className="players">
        {state.playerOrder.map((p) => (
          <span
            key={p}
            className={`player-chip ${state.players[p]!.turnEnded ? 'done' : ''}`}
            title={`${state.players[p]!.name}${state.players[p]!.turnEnded ? ' (turn ended)' : ''}`}
          >
            <span
              className="swatch"
              style={{
                background: cssColor(PLAYER_COLORS[playerIndex(p) % PLAYER_COLORS.length]!),
              }}
            />
            {p === ME ? 'You' : state.players[p]!.name}
          </span>
        ))}
      </div>

      {notice && <div className="notice">{notice}</div>}

      {unit && def && cls && (
        <aside className="unit-panel">
          <div className="unit-head">
            <span
              className="unit-icon"
              style={{
                background: cssColor(
                  PLAYER_COLORS[playerIndex(unit.owner) % PLAYER_COLORS.length]!,
                ),
              }}
            >
              {def.icon}
            </span>
            <div>
              <h3>{resolveText(content, def.name)}</h3>
              <p className="unit-sub">
                {resolveText(content, cls.name)} · {status}
              </p>
            </div>
            {unit.owner === ME &&
              (confirmDisband ? (
                <button
                  type="button"
                  className="disband danger"
                  onClick={() => {
                    act({ type: 'disband_unit', player: ME, unit: unit.id });
                    setConfirmDisband(false);
                  }}
                >
                  Confirm disband
                </button>
              ) : (
                <button
                  type="button"
                  className="disband"
                  title="Disband this unit"
                  onClick={() => setConfirmDisband(true)}
                >
                  Disband
                </button>
              ))}
          </div>
          <dl className="unit-stats">
            <div>
              <dt>Moves</dt>
              <dd>
                {unit.moves / MP}/{def.movement}
              </dd>
            </div>
            <div>
              <dt>Strength</dt>
              <dd>{def.strength || '—'}</dd>
            </div>
            <div>
              <dt>Sight</dt>
              <dd>{def.sight}</dd>
            </div>
            <div>
              <dt>Health</dt>
              <dd>{unit.health}</dd>
            </div>
          </dl>
          {unit.owner === ME && (
            <div className="unit-actions">
              {def.actions.includes('found_settlement') && (
                <button
                  type="button"
                  disabled
                  title="Founding settlements arrives in the next milestone"
                >
                  Found settlement
                </button>
              )}
              <button type="button" onClick={() => skip(unit.id)}>
                Skip <kbd>Space</kbd>
              </button>
              {unit.orders ? (
                <button
                  type="button"
                  onClick={() => act({ type: 'wake_unit', player: ME, unit: unit.id })}
                >
                  {unit.orders.kind === 'move' ? 'Cancel move' : 'Wake'}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => act({ type: 'sleep_unit', player: ME, unit: unit.id })}
                  >
                    Sleep <kbd>Z</kbd>
                  </button>
                  {cls.combat && (
                    <button
                      type="button"
                      onClick={() => act({ type: 'fortify_unit', player: ME, unit: unit.id })}
                    >
                      Fortify <kbd>F</kbd>
                    </button>
                  )}
                </>
              )}
            </div>
          )}
          {unit.owner === ME && (
            <p className="hint">
              {pinned !== null
                ? path
                  ? 'Tap the marked tile again to move there.'
                  : "Can't get there."
                : coarsePointer
                  ? 'Tap a tile to plan a move, then tap it again to go.'
                  : 'Right-click a tile to move there, or click it twice.'}
            </p>
          )}
        </aside>
      )}

      {inspected !== undefined && fog[inspected] !== 0 && (
        <div className="game-tile">
          <TileCard
            content={content}
            map={state.map}
            tile={inspected}
            pinned={inspect !== undefined && pinned === null && hover === undefined}
            onClose={() => setInspect(undefined)}
          />
        </div>
      )}

      <button
        type="button"
        className={`next-action ${needing.length === 0 && !waiting ? 'end' : ''}`}
        onClick={nextAction}
        disabled={waiting}
      >
        <span className="next-label">
          {waiting
            ? 'Waiting for others'
            : needing.length > 0
              ? `${needing.length} unit${needing.length === 1 ? '' : 's'} need${needing.length === 1 ? 's' : ''} orders`
              : 'End turn'}
        </span>
        <kbd>Enter</kbd>
      </button>
    </div>
  );
}
