import type { EngineContext, GameState, PlayerId, TurnStats } from '@cx/engine';
import { useEffect, useMemo, useRef, useState } from 'react';
import { civName } from './model';
import { Icon } from '../ui/Icon';

/**
 * Series colors for the graphs: a categorical palette validated for colorblind separation on
 * the dark panel (dataviz method), given to civs in turn order. Past eight, gray (with labels).
 */
const SERIES = [
  '#3987e5',
  '#d95926',
  '#199e70',
  '#c98500',
  '#d55181',
  '#008300',
  '#9085e9',
  '#e66767',
];
const OVERFLOW = '#8b928f';

const MEASURES: { key: keyof TurnStats; label: string }[] = [
  { key: 'score', label: 'Score' },
  { key: 'science', label: 'Science / turn' },
  { key: 'culture', label: 'Culture / turn' },
  { key: 'tourism', label: 'Tourism / turn' },
  { key: 'military', label: 'Military' },
  { key: 'citizens', label: 'Citizens' },
  { key: 'settlements', label: 'Settlements' },
];

interface Props {
  ctx: EngineContext;
  state: GameState;
  viewer: PlayerId;
  onClose: () => void;
}

/** Everyone's numbers over the game, one measure at a time. */
export function GraphsScreen({ ctx, state, viewer, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const [measure, setMeasure] = useState<keyof TurnStats>('score');
  return (
    <div className="screen" role="dialog" aria-label="Graphs">
      <header className="screen-head">
        <h2>
          <Icon name="graphs" size={30} />
          Graphs
        </h2>
        <button type="button" className="close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>
      <div className="graph-body">
        <div className="segmented compact graph-tabs" role="group" aria-label="Measure">
          {MEASURES.map((m) => (
            <button
              key={m.key}
              type="button"
              aria-pressed={measure === m.key}
              className={measure === m.key ? 'on' : ''}
              onClick={() => setMeasure(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <HistoryChart ctx={ctx} state={state} viewer={viewer} measure={measure} />
      </div>
    </div>
  );
}

/** A line chart of one measure for every civ, with a legend, end labels and a hover readout. */
export function HistoryChart({
  ctx,
  state,
  viewer,
  measure,
}: {
  ctx: EngineContext;
  state: GameState;
  viewer: PlayerId;
  measure: keyof TurnStats;
}) {
  const [hover, setHover] = useState<number | null>(null);
  // Drawn at its real size, so text stays readable at any width.
  const frame = useRef<HTMLDivElement>(null);
  const ready = state.history.length >= 2;
  const [W, setW] = useState(720);
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const fit = () => setW(Math.max(280, Math.floor(el.clientWidth)));
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    return () => watch.disconnect();
  }, [ready]);
  // As tall as the screen allows (under the header, tabs and legend), within a sensible shape.
  const room = typeof innerHeight === 'number' ? innerHeight - 230 : 420;
  const H = Math.round(Math.max(220, Math.min(room, W * 0.55)));
  const history = state.history;
  const series = useMemo(
    () =>
      state.playerOrder.map((p, i) => ({
        player: p,
        name: civName(ctx.content, state, p),
        color: SERIES[i] ?? OVERFLOW,
        points: history.flatMap((h) =>
          h.stats[p] ? [{ turn: h.turn, value: h.stats[p][measure] }] : [],
        ),
      })),
    [ctx, state, history, measure],
  );
  if (!ready)
    return <p className="hint">Graphs fill in as turns go by. Come back in a few turns.</p>;
  const first = history[0]!.turn;
  const last = history[history.length - 1]!.turn;
  const max = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.value)));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1]!;
  const x = (turn: number) =>
    PAD.left + ((turn - first) / Math.max(1, last - first)) * (W - PAD.left - PAD.right);
  const y = (v: number) => H - PAD.bottom - (v / top) * (H - PAD.top - PAD.bottom);
  const label = series.length <= 4;
  const PAD = { left: 44, right: label ? 110 : 16, top: 12, bottom: 28 };
  const at = hover === null ? undefined : history.find((h) => h.turn === hover);
  const lastValue = (s: (typeof series)[number]) => s.points[s.points.length - 1]?.value;

  // End labels, nudged apart so they don't overlap.
  const ends = series
    .filter((s) => s.points.length > 0)
    .map((s) => ({ s, y: y(lastValue(s)!) }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++)
    if (ends[i]!.y - ends[i - 1]!.y < 14) ends[i]!.y = ends[i - 1]!.y + 14;

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const t = first + ((px - PAD.left) / (W - PAD.left - PAD.right)) * (last - first);
    setHover(Math.max(first, Math.min(last, Math.round(t))));
  };

  return (
    <div className="history-chart">
      <ul className="graph-legend" aria-label="Civilizations">
        {series.map((s) => (
          <li key={s.player} className={s.player === viewer ? 'mine' : ''}>
            <span className="swatch" style={{ background: s.color }} aria-hidden="true" />
            {s.name} <span className="mono muted">{lastValue(s) ?? '—'}</span>
          </li>
        ))}
      </ul>
      <div className="graph-frame" ref={frame}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${measure} by turn`}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
              <text className="axis" x={PAD.left - 6} y={y(t) + 4} textAnchor="end">
                {t}
              </text>
            </g>
          ))}
          {[first, Math.round((first + last) / 2), last].map((t) => (
            <text key={t} className="axis" x={x(t)} y={H - 8} textAnchor="middle">
              {t}
            </text>
          ))}
          {series.map((s) => (
            <polyline
              key={s.player}
              className="series"
              points={s.points.map((p) => `${x(p.turn)},${y(p.value)}`).join(' ')}
              stroke={s.color}
              strokeWidth={s.player === viewer ? 3 : 2}
            />
          ))}
          {(label ? ends : []).map(({ s, y: ly }) => (
            <text key={s.player} className="end-label" x={W - PAD.right + 8} y={ly + 4}>
              {s.name}
            </text>
          ))}
          {at && (
            <g>
              <line
                className="crosshair"
                x1={x(at.turn)}
                x2={x(at.turn)}
                y1={PAD.top}
                y2={H - PAD.bottom}
              />
              {series.map((s) =>
                at.stats[s.player] ? (
                  <circle
                    key={s.player}
                    cx={x(at.turn)}
                    cy={y(at.stats[s.player]![measure])}
                    r={4}
                    fill={s.color}
                    className="dot"
                  />
                ) : null,
              )}
            </g>
          )}
          <rect
            className="hit"
            x={PAD.left}
            y={PAD.top}
            width={W - PAD.left - PAD.right}
            height={H - PAD.top - PAD.bottom}
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
        {at && (
          <div
            className={`graph-tip ${x(at.turn) > W / 2 ? 'flip' : ''}`}
            style={{ left: `${(x(at.turn) / W) * 100}%` }}
            role="status"
          >
            <strong>Turn {at.turn}</strong>
            {series
              .filter((s) => at.stats[s.player])
              .sort((a, b) => at.stats[b.player]![measure] - at.stats[a.player]![measure])
              .map((s) => (
                <div key={s.player}>
                  <span className="swatch" style={{ background: s.color }} aria-hidden="true" />
                  {s.name} <span className="mono">{at.stats[s.player]![measure]}</span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Round axis ticks from 0 up to at least `max` (about four steps). */
function niceTicks(max: number): number[] {
  const rough = max / 4;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= rough) ?? 10 * mag;
  const out = [];
  for (let v = 0; v < max + step; v += step) out.push(Math.round(v));
  return out.length > 1 ? out : [0, step];
}
