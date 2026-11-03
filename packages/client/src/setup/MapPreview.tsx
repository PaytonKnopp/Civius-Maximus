import type { CompiledContent } from '@cx/content';
import {
  createRng,
  generateMap,
  makeRandom,
  MapGenerationError,
  type MapSettings,
  type MapState,
} from '@cx/engine';
import { useEffect, useRef, useState } from 'react';

/**
 * A look at the world the setup will make: the same map generator the game uses, with the same
 * seed, so what you see is the map you get. It also tells the setup when a map can't fit its
 * civilizations. Drawn flat on one canvas; starts are dots in each seat's color.
 */

interface Props {
  content: CompiledContent;
  settings: MapSettings;
  seed: string;
  /** One color per seat (`p1`, `p2`...), or null when its civ isn't known yet. */
  seatColors: (string | null)[];
  /** The map can't be made (too many civs for it), or null when it can. */
  onProblem: (problem: string | null) => void;
}

const shade = (hex: string, amount: number) => {
  const n = Number.parseInt(hex.slice(1), 16);
  const ch = (shift: number) => {
    const v = (n >> shift) & 255;
    return Math.max(
      0,
      Math.min(255, Math.round(v + (amount >= 0 ? (255 - v) * amount : v * amount))),
    );
  };
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
};

export function MapPreview({ content, settings, seed, seatColors, onProblem }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [made, setMade] = useState<{ map: MapState; starts: Record<string, number> } | null>(null);
  const [busy, setBusy] = useState(true);
  const seats = seatColors.length;
  const key = JSON.stringify([settings, seed, seats]);
  const problem = useRef(onProblem);
  problem.current = onProblem;

  useEffect(() => {
    setBusy(true);
    const timer = setTimeout(() => {
      try {
        // Exactly what createGame does for a local game: same seed, same player order.
        const ids = Array.from({ length: seats }, (_, i) => `p${i + 1}`).sort();
        const { map, starts } = generateMap(
          { content, settings, players: ids.map((id) => ({ id })) },
          makeRandom(createRng(`${seed}:local-${seed}`)),
        );
        setMade({ map, starts });
        problem.current(null);
      } catch (e) {
        setMade(null);
        problem.current(
          e instanceof MapGenerationError
            ? `${e.message}. Pick a bigger map or fewer civilizations.`
            : String(e),
        );
      }
      setBusy(false);
    }, 140);
    return () => clearTimeout(timer);
    // `key` carries every input.
  }, [key, content]);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const g = c.getContext('2d');
    if (!g) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = 560;
    if (!made) {
      c.width = cssW * dpr;
      c.height = 200 * dpr;
      g.clearRect(0, 0, c.width, c.height);
      return;
    }
    const { map, starts } = made;
    const { width, height } = map;
    const size = cssW / ((width + 0.5) * Math.sqrt(3));
    const hx = Math.sqrt(3) * size;
    const hy = 1.5 * size;
    const cssH = Math.ceil(hy * (height - 1) + 2 * size);
    c.width = cssW * dpr;
    c.height = cssH * dpr;
    c.style.aspectRatio = `${cssW} / ${cssH}`;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cssW, cssH);
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
    const centre = (i: number): [number, number] => {
      const col = i % width;
      const row = Math.floor(i / width);
      return [hx * (col + 0.5 + (row % 2 ? 0.5 : 0)), size + hy * row];
    };
    map.tiles.forEach((tile, i) => {
      const [cx, cy] = centre(i);
      const base = content.entities.terrain[tile.terrain]?.color ?? '#333333';
      hex(cx, cy, size + 0.35);
      g.fillStyle =
        tile.elevation === 'mountain'
          ? '#8d867a'
          : tile.elevation === 'hills'
            ? shade(base, 0.14)
            : base;
      g.fill();
      if (tile.elevation === 'mountain') {
        g.beginPath();
        g.moveTo(cx - size * 0.45, cy + size * 0.35);
        g.lineTo(cx, cy - size * 0.5);
        g.lineTo(cx + size * 0.45, cy + size * 0.35);
        g.closePath();
        g.fillStyle = '#d9d4c6';
        g.fill();
      } else if (tile.feature && /forest|jungle|wood/.test(tile.feature)) {
        g.beginPath();
        g.arc(cx, cy, size * 0.32, 0, Math.PI * 2);
        g.fillStyle = shade(base, -0.38);
        g.fill();
      }
    });
    Object.entries(starts).forEach(([id, tile]) => {
      const seat = Number(id.slice(1)) - 1;
      const [cx, cy] = centre(tile);
      g.beginPath();
      g.arc(cx, cy, size * 1.25, 0, Math.PI * 2);
      g.fillStyle = seatColors[seat] ?? '#f4ecd8';
      g.fill();
      g.lineWidth = Math.max(1.4, size * 0.3);
      g.strokeStyle = '#0b1218';
      g.stroke();
      g.beginPath();
      g.arc(cx, cy, size * 1.25, 0, Math.PI * 2);
      g.lineWidth = Math.max(1, size * 0.16);
      g.strokeStyle = '#f4ecd8';
      g.stroke();
    });
  }, [made, content, seatColors]);

  return (
    <div className={`mx-preview ${busy ? 'busy' : ''}`}>
      <canvas ref={canvas} aria-label="Preview of the map" role="img" />
      {busy && <span className="mx-preview-busy">Drawing the world…</span>}
      {!busy && !made && <span className="mx-preview-busy">No map to show</span>}
    </div>
  );
}
