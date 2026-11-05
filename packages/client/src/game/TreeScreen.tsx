import { resolveText } from '@cx/content';
import {
  type Action,
  empireFacts,
  type EngineContext,
  type GameState,
  goalProgress,
  nodeCost,
  pathTo,
  type PlayerId,
  trackOf,
  treeColumns,
  treeIds,
  type TreeKind,
  treeNode,
  unlocksOf,
} from '@cx/engine';
import { Icon } from '../ui/Icon';
import { buildingIcon, ICONS } from '../ui/icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { turnsFor, turnsLabel, whole } from './model';

const NODE_W = 264;
const NODE_H = 138;
const COL_W = NODE_W + 60;
const ROW_H = NODE_H + 16;
const PAD = 28;
const HEAD = 46;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 1.25;

interface Props {
  ctx: EngineContext;
  state: GameState;
  viewer: PlayerId;
  kind: TreeKind;
  /** Science (techs) or culture (civics) per turn, in hundredths. */
  perTurn: number;
  act: (action: Action) => boolean;
  onKind: (kind: TreeKind) => void;
  onClose: () => void;
}

/** "Needs A, B", or "Needs A +2" when the names wouldn't fit on one line. */
function needsText(names: string[]): string {
  const all = names.join(', ');
  return `Needs ${all.length <= 30 || names.length === 1 ? all : `${names[0]} +${names.length - 1}`}`;
}

/** The tech tree or the civics tree: a zoomable-by-scroll graph of cards with their prerequisites. */
export function TreeScreen({ ctx, state, viewer, kind, perTurn, act, onKind, onClose }: Props) {
  const { content } = ctx;
  const p = state.players[viewer]!;
  const track = trackOf(p, kind);
  const columns = useMemo(() => treeColumns(ctx, kind), [ctx, kind]);
  const ids = treeIds(ctx, kind);
  const facts = useMemo(() => empireFacts(ctx, state, viewer), [ctx, state, viewer]);
  const scroller = useRef<HTMLDivElement>(null);

  const pos = (id: string) => {
    const node = treeNode(ctx, kind, id)!;
    return { x: PAD + columns[id]! * COL_W, y: PAD + HEAD + node.row * ROW_H };
  };
  const width = PAD * 2 + (Math.max(0, ...Object.values(columns)) + 1) * COL_W;
  const height =
    PAD * 2 + HEAD + (Math.max(0, ...ids.map((id) => treeNode(ctx, kind, id)!.row)) + 1) * ROW_H;

  // Each era is a band over the columns it spans, with its name on top.
  const eraSpans = new Map<string, [number, number]>();
  for (const id of ids) {
    const era = treeNode(ctx, kind, id)!.era;
    const col = columns[id]!;
    const span = eraSpans.get(era);
    if (!span) eraSpans.set(era, [col, col]);
    else eraSpans.set(era, [Math.min(span[0], col), Math.max(span[1], col)]);
  }

  // Everything a card needs (before it) and everything it leads to (after it), for the hover path.
  const { before, after } = useMemo(() => {
    const parents = new Map<string, string[]>();
    const children = new Map<string, string[]>();
    for (const id of ids) {
      const requires = treeNode(ctx, kind, id)!.requires;
      parents.set(id, requires);
      for (const r of requires) children.set(r, [...(children.get(r) ?? []), id]);
    }
    const walk = (start: string, edges: Map<string, string[]>) => {
      const seen = new Set<string>();
      const stack = [...(edges.get(start) ?? [])];
      while (stack.length > 0) {
        const id = stack.pop()!;
        if (seen.has(id)) continue;
        seen.add(id);
        stack.push(...(edges.get(id) ?? []));
      }
      return seen;
    };
    return {
      before: (id: string) => walk(id, parents),
      after: (id: string) => walk(id, children),
    };
  }, [ctx, kind, ids]);
  const [focus, setFocus] = useState<string | null>(null);
  const focusBefore = useMemo(() => (focus ? before(focus) : new Set<string>()), [focus, before]);
  const focusAfter = useMemo(() => (focus ? after(focus) : new Set<string>()), [focus, after]);

  const [zoom, setZoom] = useState(() => (window.innerWidth < 700 ? 0.7 : 1));
  const setZoomTo = (z: number) =>
    setZoom(Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z)) * 100) / 100);

  const queue = [track.current, ...track.queue].filter((x): x is string => x !== null);
  const done = new Set(track.done);
  const name = (id: string) => resolveText(content, treeNode(ctx, kind, id)!.name);
  const icon = <Icon name={kind === 'tech' ? 'science' : 'culture'} />;
  const unlockIcon = (u: { kind: string; id: string }) =>
    u.kind === 'unit'
      ? (content.entities.unit[u.id]?.model ?? 'generic')
      : u.kind === 'building'
        ? buildingIcon(u.id, content.entities.building[u.id]?.district)
        : u.kind === 'improvement'
          ? ICONS[u.id]
            ? u.id
            : 'improvement_farm'
          : u.kind === 'government'
            ? 'government'
            : 'civic';

  // Scroll so the current choice (or the last thing finished) is in view.
  const showCurrent = () => {
    const target = track.current ?? track.done[track.done.length - 1];
    const box = scroller.current;
    if (!target || !box) return;
    const at = pos(target);
    box.scrollTo({
      left: Math.max(0, (at.x - 60) * zoom),
      top: Math.max(0, ((at.y - box.clientHeight / 3) / 1) * zoom),
    });
  };
  useEffect(showCurrent, [kind]);

  // Ctrl or pinch + wheel zooms, like a map.
  useEffect(() => {
    const box = scroller.current;
    if (!box) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom(
        (z) => Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z - e.deltaY * 0.002)) * 100) / 100,
      );
    };
    box.addEventListener('wheel', onWheel, { passive: false });
    return () => box.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const choose = (id: string) =>
    act(
      kind === 'tech'
        ? { type: 'set_research', player: viewer, tech: id }
        : { type: 'set_civic', player: viewer, civic: id },
    );

  return (
    <div className="screen" role="dialog" aria-label={kind === 'tech' ? 'Technologies' : 'Civics'}>
      <header className="screen-head">
        <div className="segmented tabs" role="tablist">
          {(['tech', 'civic'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={k === kind}
              className={k === kind ? 'on' : ''}
              onClick={() => onKind(k)}
            >
              {k === 'tech' ? 'Technologies' : 'Civics'}
            </button>
          ))}
        </div>
        <p className="screen-sub">
          {track.current
            ? `${name(track.current)} · ${turnsLabel(
                turnsFor(
                  nodeCost(ctx, state, kind, track.current),
                  track.progress[track.current] ?? 0,
                  perTurn,
                ),
              )}`
            : 'Pick something to work toward. Clicking anything queues the path to it.'}
          <span className="muted">
            {' '}
            · {icon} +{whole(perTurn)} a turn
          </span>
        </p>
        <div className="tree-tools" role="group" aria-label="View">
          <button
            type="button"
            className="ghost small"
            onClick={() => setZoomTo(zoom - 0.15)}
            disabled={zoom <= MIN_ZOOM}
            aria-label="Zoom out"
          >
            −
          </button>
          <span className="tree-zoom mono">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            className="ghost small"
            onClick={() => setZoomTo(zoom + 0.15)}
            disabled={zoom >= MAX_ZOOM}
            aria-label="Zoom in"
          >
            +
          </button>
          <button type="button" className="ghost small" onClick={showCurrent}>
            Find current
          </button>
        </div>
        <button type="button" className="close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>
      <div className="tree" ref={scroller}>
        <div className="tree-sizer" style={{ width: width * zoom, height: height * zoom }}>
          <div
            className="tree-canvas"
            style={{ width, height, transform: `scale(${zoom})`, transformOrigin: '0 0' }}
            onMouseLeave={() => setFocus(null)}
          >
            {[...eraSpans].map(([era, [from, to]], i) => (
              <div
                key={era}
                className={`era-band ${i % 2 ? 'odd' : ''}`}
                style={{
                  left: PAD + from * COL_W - 22,
                  width: (to - from + 1) * COL_W - 16,
                  height,
                }}
              >
                <span className="era-label">
                  {resolveText(content, content.entities.era[era]?.name ?? era)}
                </span>
              </div>
            ))}
            <svg className="tree-lines" width={width} height={height} aria-hidden="true">
              {ids.flatMap((id) =>
                treeNode(ctx, kind, id)!.requires.map((r, k) => {
                  const a = pos(r);
                  const b = pos(id);
                  const x1 = a.x + NODE_W;
                  const y1 = a.y + NODE_H / 2;
                  const x2 = b.x;
                  const y2 = b.y + NODE_H / 2;
                  // Out of the card, along its row, then up or down in the empty gutter before the
                  // next card, so a wire never cuts across a card it isn't joined to.
                  const turn = x2 - 14 - (k % 4) * 7;
                  const dy = Math.sign(y2 - y1);
                  const rad = Math.min(10, Math.abs(y2 - y1) / 2);
                  const d =
                    dy === 0
                      ? `M${x1},${y1} H${x2}`
                      : `M${x1},${y1} H${turn - rad} Q${turn},${y1} ${turn},${y1 + dy * rad} V${y2 - dy * rad} Q${turn},${y2} ${turn + rad},${y2} H${x2}`;
                  const lit = done.has(r);
                  const onPath =
                    focus !== null &&
                    ((focusBefore.has(id) || id === focus) && (focusBefore.has(r) || r === focus)
                      ? 'before'
                      : (focusAfter.has(r) || r === focus) && focusAfter.has(id)
                        ? 'after'
                        : '');
                  return (
                    <path
                      key={`${r}>${id}`}
                      d={d}
                      className={`${lit ? 'lit' : ''} ${onPath || (focus ? 'dim' : '')}`}
                    />
                  );
                }),
              )}
            </svg>
            {ids.map((id) => {
              const node = treeNode(ctx, kind, id)!;
              const { x, y } = pos(id);
              const cost = nodeCost(ctx, state, kind, id);
              const progress = track.progress[id] ?? 0;
              const isDone = done.has(id);
              const order = queue.indexOf(id);
              const available = !isDone && node.requires.every((r) => done.has(r));
              const boosted = track.boosted.includes(id);
              const goal = node.boost ? goalProgress(ctx, facts, node.boost.goal) : undefined;
              const unlocks = unlocksOf(ctx, kind, id);
              const status = isDone
                ? 'done'
                : order === 0
                  ? 'current'
                  : order > 0
                    ? 'queued'
                    : available
                      ? 'available'
                      : 'locked';
              const turns = turnsFor(cost, progress, perTurn);
              const steps = isDone ? 0 : pathTo(ctx, p, kind, id).length;
              const missing = node.requires.filter((r) => !done.has(r));
              const related =
                focus === null
                  ? ''
                  : id === focus
                    ? 'focus'
                    : focusBefore.has(id)
                      ? 'before'
                      : focusAfter.has(id)
                        ? 'after'
                        : 'dim';
              return (
                <button
                  key={id}
                  type="button"
                  className={`tree-node ${status} ${related}`}
                  style={{ left: x, top: y, width: NODE_W, height: NODE_H }}
                  disabled={isDone}
                  onClick={() => choose(id)}
                  onMouseEnter={() => setFocus(id)}
                  onFocus={() => setFocus(id)}
                  onBlur={() => setFocus(null)}
                  title={[
                    name(id),
                    node.description ? resolveText(content, node.description) : '',
                    node.boost
                      ? `Boost (${content.rules.progress.boostPercent}%): ${resolveText(content, node.boost.text)}`
                      : '',
                    unlocks.length > 0 ? `Unlocks: ${unlocks.map((u) => u.name).join(', ')}` : '',
                  ]
                    .filter(Boolean)
                    .join('\n')}
                >
                  <span className="node-top">
                    <span className="node-name">{name(id)}</span>
                    <span className="node-meta mono">
                      {isDone ? (
                        <Icon name="check" size={18} title="Done" />
                      ) : order >= 0 || steps <= 1 ? (
                        turnsLabel(turns)
                      ) : (
                        <>
                          {whole(cost)}
                          {icon}
                        </>
                      )}
                    </span>
                  </span>
                  <span className="node-state">
                    {isDone
                      ? 'Done'
                      : order === 0
                        ? 'In progress'
                        : order > 0
                          ? `Queued, number ${order + 1}`
                          : available
                            ? 'Ready'
                            : needsText(missing.map((r) => name(r)))}
                  </span>
                  {!isDone && progress > 0 && (
                    <span className="node-bar">
                      <span style={{ width: `${Math.min(100, (progress / cost) * 100)}%` }} />
                    </span>
                  )}
                  {node.boost && !isDone && (
                    <span className={`node-boost ${boosted ? 'got' : ''}`}>
                      <Icon name="boost" size={15} /> {resolveText(content, node.boost.text)}
                      {!boosted && goal && goal.need > 1 && (
                        <span className="mono">
                          {' '}
                          {Math.min(goal.have, goal.need)}/{goal.need}
                        </span>
                      )}
                    </span>
                  )}
                  {unlocks.length > 0 && (
                    <span className="node-unlocks">
                      {unlocks.slice(0, 4).map((u) => (
                        <span key={u.id} className={`unlock ${u.kind}`}>
                          <Icon name={unlockIcon(u)} size={14} />
                          {u.name}
                        </span>
                      ))}
                      {unlocks.length > 3 && (
                        <span className="unlock more">+{unlocks.length - 3}</span>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
