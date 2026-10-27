import type { EngineContext, GameState, PlayerId } from '@cx/engine';
import { useEffect, useRef } from 'react';
import { Icon } from '../ui/Icon';
import { type Lens, LENS_NAMES, LENSES } from './lenses';
import { type Colors, cssColor } from './model';

interface Props {
  ctx: EngineContext;
  state: GameState;
  viewer: PlayerId;
  fog: Uint8Array;
  colors: Record<PlayerId, Colors>;
  lens: Lens;
  onLens: (lens: Lens) => void;
  /** A click on the minimap: move the camera there. */
  onPick: (tile: number) => void;
}

const W = 236;
const H = 148;

/**
 * The whole map in the corner (docs/06-ui-ux.md, "HUD"): terrain, borders in civ colors, fog,
 * settlements and your units, as far as you know them. A click moves the camera there; the
 * lens picker sits on its frame.
 */
export function Minimap({ ctx, state, viewer, fog, colors, lens, onLens, onPick }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { width, height } = state.map;
  const cw = Math.min(W / (width + 0.5), H / (height * 0.866 + 0.5));
  const ch = cw * 0.866;
  const pw = Math.ceil((width + 0.5) * cw);
  const ph = Math.ceil(height * ch + ch * 0.5);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    el.width = pw * dpr;
    el.height = ph * dpr;
    const g = el.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#05090d';
    g.fillRect(0, 0, pw, ph);
    const terrain = ctx.content.entities.terrain;
    state.map.tiles.forEach((t, i) => {
      const seen = fog[i]!;
      if (seen === 0) return;
      const col = i % width;
      const row = Math.floor(i / width);
      const x = (col + (row % 2) * 0.5) * cw;
      const y = row * ch;
      g.globalAlpha = seen === 1 ? 0.55 : 1;
      g.fillStyle = terrain[t.terrain]?.color ?? '#333';
      g.fillRect(x, y, cw + 0.6, ch + 0.6);
      if (t.owner) {
        g.fillStyle = cssColor(colors[t.owner]?.main ?? 0x888888);
        g.globalAlpha = seen === 1 ? 0.35 : 0.62;
        g.fillRect(x, y, cw + 0.6, ch + 0.6);
      }
    });
    g.globalAlpha = 1;
    for (const s of Object.values(state.settlements)) {
      if (fog[s.tile] === 0) continue;
      const col = s.tile % width;
      const row = Math.floor(s.tile / width);
      const x = (col + (row % 2) * 0.5 + 0.5) * cw;
      const y = (row + 0.5) * ch;
      g.beginPath();
      g.arc(x, y, Math.max(2.4, cw * 0.9), 0, Math.PI * 2);
      g.fillStyle = '#f5ecd6';
      g.fill();
      g.lineWidth = 1.2;
      g.strokeStyle = cssColor(colors[s.owner]?.main ?? 0x888888);
      g.stroke();
    }
    g.fillStyle = '#ffe9a8';
    for (const u of Object.values(state.units)) {
      if (u.owner !== viewer) continue;
      const col = u.tile % width;
      const row = Math.floor(u.tile / width);
      g.fillRect((col + (row % 2) * 0.5 + 0.25) * cw, (row + 0.25) * ch, cw * 0.6, ch * 0.6);
    }
  }, [ctx, state, viewer, fog, colors, cw, ch, pw, ph, width]);

  const pick = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const y = ((e.clientY - box.top) / box.height) * ph;
    const row = Math.max(0, Math.min(height - 1, Math.floor(y / ch)));
    const x = ((e.clientX - box.left) / box.width) * pw;
    const col = Math.max(0, Math.min(width - 1, Math.floor(x / cw - (row % 2) * 0.5)));
    onPick(row * width + col);
  };

  return (
    <div className="minimap">
      <canvas
        ref={canvas}
        style={{ width: pw, height: ph }}
        onPointerDown={pick}
        aria-label="Minimap: click to move the camera"
      />
      <label className="lens-picker" title="Map lens (L)">
        <Icon name="lens" size={22} />
        <select aria-label="Map lens" value={lens} onChange={(e) => onLens(e.target.value as Lens)}>
          {LENSES.map((l) => (
            <option key={l} value={l}>
              {LENS_NAMES[l]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
