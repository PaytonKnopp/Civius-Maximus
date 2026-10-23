import { type CompiledContent, resolveText } from '@cx/content';
import {
  type Action,
  developCandidates,
  type EngineContext,
  findPath,
  fogOfWar,
  formatFixed,
  type GameEvent,
  type GameSetup,
  type GameState,
  improvementsFor,
  purchasableTiles,
  tilePurchaseCost,
  unitIds,
  workableTiles,
} from '@cx/engine';
import { LocalGame } from '@cx/host';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TileCard } from '../components/TileCard';
import { MapView } from '../map/MapView';
import type { MapRenderer, PathView, Quality, TileHighlight } from '../map/renderer';
import { World3D } from '../map3d/World3D';
import {
  civName,
  cssColor,
  empireSummary,
  itemName,
  nextAction,
  perTurn,
  playerColors,
  settlementViews,
  territoryView,
  unitViews,
  whole,
} from './model';
import { type PanelMode, SettlementPanel } from './SettlementPanel';
import { UnitPanel } from './UnitPanel';

const ME = 'p1';

type Selection = { kind: 'unit'; id: string } | { kind: 'settlement'; id: string } | null;

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

/** A notification for the viewer, or undefined if the event isn't worth one. */
function noticeFor(content: CompiledContent, state: GameState, e: GameEvent): string | undefined {
  const name = (id: string) => state.settlements[id]?.name ?? 'A settlement';
  switch (e.type) {
    case 'turn_started':
      return `Turn ${e.turn}`;
    case 'settlement_founded':
      return e.owner === ME
        ? `${e.name} founded`
        : `${civName(content, state, e.owner)} founded ${e.name}`;
    case 'settlement_grew':
      return e.owner === ME ? `${name(e.settlement)} grew to ${e.population}` : undefined;
    case 'settlement_starved':
      return e.owner === ME ? `${name(e.settlement)} is starving` : undefined;
    case 'item_completed':
      return e.owner === ME
        ? `${name(e.settlement)} finished ${itemName(content, e.item)}`
        : undefined;
    case 'town_upgraded':
      return e.owner === ME ? `${name(e.settlement)} is now a city` : undefined;
    default:
      return undefined;
  }
}

interface Props {
  content: CompiledContent;
  setup: GameSetup;
  mode: '3d' | '2d';
  quality: Quality;
}

/** The main game view: the map, your units and settlements, and the controls to play a turn. */
export function GameScreen({ content, setup, mode, quality }: Props) {
  const ctx: EngineContext = useMemo(() => ({ content }), [content]);
  const game = useMemo(() => new LocalGame(setup, ctx), [setup, ctx]);
  const [state, setState] = useState<GameState>(game.state);
  const [selection, setSelection] = useState<Selection>(null);
  const [hover, setHover] = useState<number>();
  const [pinned, setPinned] = useState<number | null>(null);
  const [inspect, setInspect] = useState<number>();
  const [panelMode, setPanelMode] = useState<PanelMode>('citizens');
  const [notices, setNotices] = useState<{ id: number; text: string }[]>([]);
  const [fps, setFps] = useState(0);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<MapRenderer>(undefined);
  const pendingMoves = useRef<{ unit: string; path: number[] }[]>([]);
  const noticeId = useRef(0);

  const notify = useCallback((text: string) => {
    const id = ++noticeId.current;
    setNotices((n) => [...n.slice(-2), { id, text }]);
    setTimeout(() => setNotices((n) => n.filter((x) => x.id !== id)), 2600);
  }, []);

  const colors = useMemo(() => playerColors(content, state), [content, state.playerOrder]);
  const fog = useMemo(() => fogOfWar(ctx, state, ME), [ctx, state]);
  const units = useMemo(() => unitViews(ctx, state, ME, fog, colors), [ctx, state, fog, colors]);
  const territory = useMemo(() => territoryView(ctx, state, fog), [ctx, state, fog]);
  const settlements = useMemo(
    () => settlementViews(ctx, state, ME, territory, colors),
    [ctx, state, territory, colors],
  );
  const empire = useMemo(() => empireSummary(ctx, state, ME), [ctx, state]);
  const unit = selection?.kind === 'unit' ? state.units[selection.id] : undefined;
  const settlement = selection?.kind === 'settlement' ? state.settlements[selection.id] : undefined;
  const next = nextAction(state, ME, selection?.kind === 'unit' ? selection.id : null);

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
        view.setUnits(units);
        view.setSettlements(settlements, territory);
        view.setHighlights(highlights);
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
        for (const e of events) {
          if (e.visibleTo !== 'all' && !e.visibleTo.includes(ME)) continue;
          const text = noticeFor(content, s, e);
          if (text) notify(text);
        }
        setState(s);
      }),
    [game, content, notify],
  );

  useEffect(() => {
    viewRef.current?.setFog(fog);
  }, [fog]);
  useEffect(() => {
    viewRef.current?.setUnits(units, pendingMoves.current.splice(0));
  }, [units]);
  useEffect(() => {
    viewRef.current?.setSettlements(settlements, territory);
  }, [settlements, territory]);

  // Keep the selection valid.
  useEffect(() => {
    if (selection?.kind === 'unit' && !state.units[selection.id]) setSelection(null);
    if (selection?.kind === 'settlement' && !state.settlements[selection.id]) setSelection(null);
  }, [state, selection]);

  // The planned path to the hovered (or pinned) tile.
  const pathTarget = pinned ?? hover;
  const path = useMemo(() => {
    if (!unit || unit.owner !== ME || pathTarget === undefined || pathTarget === unit.tile)
      return null;
    return toPathView(findPath(ctx, state, unit, pathTarget));
  }, [ctx, state, unit, pathTarget]);
  useEffect(() => {
    viewRef.current?.setSelected(selection?.kind === 'unit' ? selection.id : null);
  }, [selection, units]);
  useEffect(() => {
    viewRef.current?.setPath(path, unit?.tile ?? null);
  }, [path, unit?.tile]);

  // Tiles to mark for the selected settlement: growth choices, tiles to buy, worked tiles.
  const highlights = useMemo((): TileHighlight[] => {
    if (!settlement || settlement.owner !== ME) return [];
    const out: TileHighlight[] = [{ tile: settlement.tile, tone: 'selected' }];
    if (settlement.pendingDevelop > 0) {
      for (const tile of developCandidates(ctx, state, settlement)) {
        const imp = content.entities.improvement[improvementsFor(ctx, state, tile)[0]!]!;
        const gain = Object.entries(imp.yields)
          .map(([y, v]) => `+${v}${content.entities.yield[y]?.icon ?? ''}`)
          .join(' ');
        out.push({ tile, tone: 'develop', label: `${resolveText(content, imp.name)} ${gain}` });
      }
      return out;
    }
    if (panelMode === 'buy') {
      for (const tile of purchasableTiles(ctx, state, settlement)) {
        const cost = tilePurchaseCost(ctx, state, settlement, tile);
        out.push({ tile, tone: 'buy', label: `💰 ${formatFixed(cost)}` });
      }
      return out;
    }
    for (const tile of settlement.worked) {
      out.push({ tile, tone: 'worked', label: settlement.locked.includes(tile) ? '📌' : '●' });
    }
    return out;
  }, [ctx, content, state, settlement, panelMode]);
  useEffect(() => {
    viewRef.current?.setHighlights(highlights);
  }, [highlights]);

  const act = useCallback(
    (action: Action) => {
      const r = game.act(action);
      if (!r.ok) notify(r.error.message);
      return r.ok;
    },
    [game, notify],
  );

  const select = useCallback(
    (next: Selection, focus = false) => {
      setSelection(next);
      setPinned(null);
      setPanelMode('citizens');
      if (!next || !focus) return;
      const tile =
        next.kind === 'unit'
          ? game.state.units[next.id]?.tile
          : game.state.settlements[next.id]?.tile;
      if (tile !== undefined) viewRef.current?.focusTile(tile);
    },
    [game],
  );

  const doNext = useCallback(() => {
    const n = nextAction(game.state, ME, selection?.kind === 'unit' ? selection.id : null);
    if (n.kind === 'unit') select({ kind: 'unit', id: n.id }, true);
    else if (n.kind === 'develop' || n.kind === 'production')
      select({ kind: 'settlement', id: n.id }, true);
    else if (n.kind === 'end') {
      act({ type: 'end_turn', player: ME });
      select(null);
    }
  }, [game, selection, select, act]);

  /** After a unit is done for the turn: on to the next unit, like Civ's auto-cycling (D32). */
  const selectNextUnit = useCallback(
    (after: string) => {
      const n = nextAction(game.state, ME, after);
      if (n.kind === 'unit') select({ kind: 'unit', id: n.id }, true);
      else select(null);
    },
    [game, select],
  );

  const skip = useCallback(
    (id: string) => {
      act({ type: 'skip_unit', player: ME, unit: id });
      selectNextUnit(id);
    },
    [act, selectNextUnit],
  );

  const found = useCallback(
    (id: string) => {
      const tile = game.state.units[id]?.tile;
      if (!act({ type: 'found_settlement', player: ME, unit: id })) return;
      const s = Object.values(game.state.settlements).find((x) => x.tile === tile);
      if (s) select({ kind: 'settlement', id: s.id }, true);
    },
    [game, act, select],
  );

  const moveTo = useCallback(
    (tile: number) => {
      if (!unit || unit.owner !== ME) return;
      if (!act({ type: 'move_unit', player: ME, unit: unit.id, to: tile })) return;
      setPinned(null);
      const after = game.state.units[unit.id];
      if (!after || after.moves === 0 || after.orders) selectNextUnit(unit.id);
    },
    [game, unit, act, selectNextUnit],
  );

  // Map input.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.onHover = setHover;
    view.onSelect = (tile) => {
      if (tile === undefined) return;
      const s = game.state;
      // A choice the selected settlement is making takes the click first.
      if (settlement && settlement.owner === ME) {
        if (settlement.pendingDevelop > 0 && developCandidates(ctx, s, settlement).includes(tile)) {
          const improvement = improvementsFor(ctx, s, tile)[0]!;
          act({ type: 'develop_tile', player: ME, settlement: settlement.id, tile, improvement });
          return;
        }
        if (panelMode === 'buy' && purchasableTiles(ctx, s, settlement).includes(tile)) {
          act({ type: 'buy_tile', player: ME, settlement: settlement.id, tile });
          return;
        }
      }
      // Cycle through your units on the tile, then the settlement there.
      const here = s.map.tiles[tile]!;
      const center = Object.values(s.settlements).find((x) => x.tile === tile);
      const cycle: Selection[] = [
        ...unitIds(s)
          .filter((id) => s.units[id]!.owner === ME && s.units[id]!.tile === tile)
          .map((id) => ({ kind: 'unit' as const, id })),
        ...(center ? [{ kind: 'settlement' as const, id: center.id }] : []),
      ];
      const planning = unit !== undefined && unit.owner === ME && unit.tile !== tile;
      if (cycle.length > 0 && !(planning && pinned === tile)) {
        const i = cycle.findIndex((c) => c?.kind === selection?.kind && c?.id === selection?.id);
        select(cycle[(i + 1) % cycle.length]!);
        setInspect(undefined);
        return;
      }
      if (planning) {
        if (pinned === tile) moveTo(tile);
        else setPinned(tile);
        return;
      }
      if (
        settlement &&
        settlement.owner === ME &&
        here.settlement === settlement.id &&
        workableTiles(ctx, s, settlement).includes(tile)
      ) {
        act({
          type: 'lock_tile',
          player: ME,
          settlement: settlement.id,
          tile,
          locked: !settlement.locked.includes(tile),
        });
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
      if (e.key === 'Enter') doNext();
      else if (e.key === 'Escape') select(null);
      else if (!unit || unit.owner !== ME) return;
      else if (e.key === ' ') {
        e.preventDefault();
        skip(unit.id);
      } else if (e.key === 'z') act({ type: 'sleep_unit', player: ME, unit: unit.id });
      else if (e.key === 'f') act({ type: 'fortify_unit', player: ME, unit: unit.id });
      else if (e.key === 'b') found(unit.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [unit, act, doNext, select, skip, found]);

  const icon = (y: string) => content.entities.yield[y]?.icon ?? '';
  const inspected = selection?.kind === 'settlement' ? undefined : (pathTarget ?? inspect);

  return (
    <div className="game">
      <div
        className="lab-canvas"
        ref={hostRef}
        aria-label="Map. Drag to pan, scroll or pinch to zoom."
      />

      <ul className="resource-bar" aria-label="Your empire">
        <li title="Gold (per turn)">
          {icon('gold')} <span className="mono">{whole(empire.gold)}</span>
          <span className="delta mono">({perTurn(empire.goldPerTurn)})</span>
        </li>
        <li title="Science per turn">
          {icon('science')} <span className="mono">{perTurn(empire.science)}</span>
        </li>
        <li title="Culture per turn">
          {icon('culture')} <span className="mono">{perTurn(empire.culture)}</span>
        </li>
        <li title="Faith (per turn)">
          {icon('faith')} <span className="mono">{whole(empire.faith)}</span>
          <span className="delta mono">({perTurn(empire.faithPerTurn)})</span>
        </li>
      </ul>

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
            <span className="swatch" style={{ background: cssColor(colors[p]!.main) }} />
            {p === ME ? `You · ${civName(content, state, p)}` : civName(content, state, p)}
          </span>
        ))}
      </div>

      <div className="notices" aria-live="polite">
        {notices.map((n) => (
          <div key={n.id} className="notice">
            {n.text}
          </div>
        ))}
      </div>

      {unit && (
        <UnitPanel
          key={unit.id}
          ctx={ctx}
          state={state}
          viewer={ME}
          unit={unit}
          colors={colors[unit.owner]!}
          planned={pinned !== null ? { reachable: path !== null } : null}
          act={(a) => {
            if (a.type !== 'found_settlement') return act(a);
            found(a.unit);
            return true;
          }}
          onSkip={() => skip(unit.id)}
        />
      )}

      {settlement && (
        <SettlementPanel
          ctx={ctx}
          state={state}
          viewer={ME}
          id={settlement.id}
          mode={panelMode}
          onMode={setPanelMode}
          act={act}
          onClose={() => select(null)}
          onFocusTile={(t) => setHover(t)}
        />
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
        className={`next-action ${next.kind === 'end' ? 'end' : ''}`}
        onClick={doNext}
        disabled={next.kind === 'waiting'}
      >
        <span className="next-label">{next.label}</span>
        <kbd>Enter</kbd>
      </button>
    </div>
  );
}
