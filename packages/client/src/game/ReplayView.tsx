import { decodeOwners } from '@cx/engine';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Replay } from './hallOfFame';

/**
 * A game's replay (docs/06-ui-ux.md, "Replay"): the map's owners turn by turn, with a timeline,
 * play and pause, who held how much, and the historic moments up to that turn.
 */
export function ReplayView({ replay }: { replay: Replay }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const frames = useMemo(
    () => replay.frames.map((f) => ({ turn: f.turn, owners: decodeOwners(f.owners) })),
    [replay],
  );
  const [at, setAt] = useState(Math.max(0, frames.length - 1));
  const [playing, setPlaying] = useState(false);
  const frame = frames[at];

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setAt((i) => {
        if (i >= frames.length - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, 160);
    return () => clearInterval(id);
  }, [playing, frames.length]);

  useEffect(() => {
    const c = canvas.current;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    const { width, height } = replay;
    const w = c.width;
    // Pointy-top hexes: odd rows shifted half a tile right.
    const size = w / ((width + 0.5) * Math.sqrt(3));
    const hx = Math.sqrt(3) * size;
    const hy = 1.5 * size;
    c.height = Math.ceil(hy * (height - 1) + 2 * size);
    g.clearRect(0, 0, c.width, c.height);
    const hex = (cx: number, cy: number, r: number) => {
      g.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k - Math.PI / 6;
        const px = cx + r * Math.cos(a);
        const py = cy + r * Math.sin(a);
        if (k === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
    };
    const owners = frame?.owners ?? '';
    for (let i = 0; i < width * height; i++) {
      const col = i % width;
      const row = Math.floor(i / width);
      const cx = hx * (col + 0.5 + (row % 2 ? 0.5 : 0));
      const cy = size + hy * row;
      hex(cx, cy, size + 0.4);
      g.fillStyle = replay.colors[replay.terrain[i]!] ?? '#333';
      g.fill();
      const o = owners[i];
      if (!o || o === '.') continue;
      const lower = o.toLowerCase();
      const index = lower.charCodeAt(0) - 97;
      const color = o === '+' || o === '#' ? '#9a9a9a' : (replay.players[index]?.color ?? '#888');
      hex(cx, cy, size + 0.4);
      g.globalAlpha = 0.74;
      g.fillStyle = color;
      g.fill();
      g.globalAlpha = 1;
      if (o !== lower || o === '#') {
        g.beginPath();
        g.arc(cx, cy, size * 0.55, 0, Math.PI * 2);
        g.fillStyle = '#f4ecd8';
        g.fill();
        g.lineWidth = Math.max(1, size * 0.25);
        g.strokeStyle = color;
        g.stroke();
      }
    }
  }, [replay, frame]);

  const counts = replay.players.map((_, i) => {
    const lower = String.fromCharCode(97 + i);
    const upper = lower.toUpperCase();
    let tiles = 0;
    let cities = 0;
    for (const ch of frame?.owners ?? '') {
      if (ch === lower) tiles++;
      else if (ch === upper) {
        tiles++;
        cities++;
      }
    }
    return { tiles, cities };
  });
  const turn = frame?.turn ?? 0;
  const moments = replay.moments
    .filter((m) => m.turn <= turn)
    .slice(-8)
    .reverse();

  if (frames.length === 0) return <p className="hint">No replay was kept for this game.</p>;
  return (
    <div className="replay">
      <canvas
        ref={canvas}
        width={900}
        height={500}
        className="replay-map"
        aria-label={`The map on turn ${turn}`}
      />
      <div className="replay-controls">
        <button
          type="button"
          onClick={() =>
            at >= frames.length - 1 ? (setAt(0), setPlaying(true)) : setPlaying((p) => !p)
          }
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <input
          type="range"
          min={0}
          max={frames.length - 1}
          value={at}
          aria-label="Turn"
          onChange={(e) => {
            setPlaying(false);
            setAt(Number(e.target.value));
          }}
        />
        <span className="mono">Turn {turn}</span>
      </div>
      <div className="replay-side">
        <ul className="replay-legend">
          {replay.players.map((p, i) => (
            <li key={i}>
              <span className="swatch" style={{ background: p.color }} />
              <span>
                {p.leader} <span className="muted">({p.civ})</span>
              </span>
              <span className="mono">
                {counts[i]!.cities} · {counts[i]!.tiles}
              </span>
            </li>
          ))}
        </ul>
        <ul className="replay-moments">
          {moments.map((m, i) => (
            <li key={i}>
              <span className="mono">{m.turn}</span>{' '}
              <span style={{ color: replay.players[m.player]?.color }}>●</span> {m.text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
