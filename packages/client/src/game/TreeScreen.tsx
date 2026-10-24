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
import { useEffect, useMemo, useRef } from 'react';
import { showTurns, turnsFor, whole } from './model';

const COL_W = 250;
const ROW_H = 92;
const NODE_W = 218;
const NODE_H = 78;
const PAD = 24;

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
    return { x: PAD + columns[id]! * COL_W, y: PAD + 30 + node.row * ROW_H };
  };
  const width = PAD * 2 + (Math.max(0, ...Object.values(columns)) + 1) * COL_W;
  const height =
    PAD * 2 + 30 + (Math.max(0, ...ids.map((id) => treeNode(ctx, kind, id)!.row)) + 1) * ROW_H;

  // Era labels over the first column each era appears in.
  const eraStarts = new Map<string, number>();
  for (const id of ids) {
    const era = treeNode(ctx, kind, id)!.era;
    const col = columns[id]!;
    if (!eraStarts.has(era) || col < eraStarts.get(era)!) eraStarts.set(era, col);
  }

  const queue = [track.current, ...track.queue].filter((x): x is string => x !== null);
  const done = new Set(track.done);
  const name = (id: string) => resolveText(content, treeNode(ctx, kind, id)!.name);
  const icon = content.entities.yield[kind === 'tech' ? 'science' : 'culture']?.icon ?? '';

  // Start scrolled to the current choice (or the last thing finished).
  useEffect(() => {
    const focus = track.current ?? track.done[track.done.length - 1];
    if (focus && scroller.current) scroller.current.scrollLeft = Math.max(0, pos(focus).x - 200);
  }, [kind]);

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
            ? `${name(track.current)} · ${showTurns(
                turnsFor(
                  nodeCost(ctx, kind, track.current),
                  track.progress[track.current] ?? 0,
                  perTurn,
                ),
              )} turns`
            : 'Pick something to work toward. Clicking anything queues the path to it.'}
          <span className="muted">
            {' '}
            · {icon} +{whole(perTurn)} a turn
          </span>
        </p>
        <button type="button" className="close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>
      <div className="tree" ref={scroller}>
        <div className="tree-canvas" style={{ width, height }}>
          {[...eraStarts].map(([era, col]) => (
            <div key={era} className="era-label" style={{ left: PAD + col * COL_W, top: 6 }}>
              {resolveText(content, content.entities.era[era]?.name ?? era)}
            </div>
          ))}
          <svg className="tree-lines" width={width} height={height} aria-hidden="true">
            {ids.flatMap((id) =>
              treeNode(ctx, kind, id)!.requires.map((r) => {
                const a = pos(r);
                const b = pos(id);
                const x1 = a.x + NODE_W;
                const y1 = a.y + NODE_H / 2;
                const x2 = b.x;
                const y2 = b.y + NODE_H / 2;
                const mid = (x1 + x2) / 2;
                const lit = done.has(r);
                return (
                  <path
                    key={`${r}>${id}`}
                    d={`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`}
                    className={lit ? 'lit' : ''}
                  />
                );
              }),
            )}
          </svg>
          {ids.map((id) => {
            const node = treeNode(ctx, kind, id)!;
            const { x, y } = pos(id);
            const cost = nodeCost(ctx, kind, id);
            const progress = track.progress[id] ?? 0;
            const isDone = done.has(id);
            const order = queue.indexOf(id);
            const available = !isDone && node.requires.every((r) => done.has(r));
            const boosted = track.boosted.includes(id);
            const goal = node.boost ? goalProgress(ctx, facts, node.boost.goal) : undefined;
            const unlocks = unlocksOf(ctx, kind, id);
            const state = isDone
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
            return (
              <button
                key={id}
                type="button"
                className={`tree-node ${state}`}
                style={{ left: x, top: y, width: NODE_W, height: NODE_H }}
                disabled={isDone}
                onClick={() => choose(id)}
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
                    {isDone
                      ? '✓'
                      : order >= 0
                        ? `${order + 1} · ${showTurns(turns)}t`
                        : steps > 1
                          ? `${whole(cost)}${icon}`
                          : `${showTurns(turns)}t`}
                  </span>
                </span>
                {!isDone && progress > 0 && (
                  <span className="node-bar">
                    <span style={{ width: `${Math.min(100, (progress / cost) * 100)}%` }} />
                  </span>
                )}
                {node.boost && !isDone && (
                  <span className={`node-boost ${boosted ? 'got' : ''}`}>
                    ⚡ {resolveText(content, node.boost.text)}
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
                        {u.name}
                      </span>
                    ))}
                    {unlocks.length > 4 && <span className="unlock">+{unlocks.length - 4}</span>}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
