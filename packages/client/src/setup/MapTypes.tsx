import { type CompiledContent, resolveText } from '@cx/content';
import { createRng, generateMap, makeRandom } from '@cx/engine';
import { useEffect, useState } from 'react';

/**
 * The map types as cards with a small picture of each, like Civ's setup. Each picture is a
 * Duel-size map made by the game's own generator from a fixed seed, so a mod's map type gets its
 * own picture too. They're made one at a time after the screen opens (about 25 ms each) and kept
 * for the rest of the session.
 */

const thumbs = new Map<string, string | null>();
const waiting = new Set<() => void>();
let queue: { content: CompiledContent; id: string }[] = [];
let running = false;

function pump() {
  if (running) return;
  const next = queue.shift();
  if (!next) return;
  running = true;
  setTimeout(() => {
    if (!thumbs.has(next.id)) thumbs.set(next.id, draw(next.content, next.id));
    running = false;
    for (const f of waiting) f();
    pump();
  }, 16);
}

function draw(content: CompiledContent, script: string): string | null {
  try {
    const size = content.entities.mapSize.duel ? 'duel' : content.ids.mapSize[0]!;
    const { map } = generateMap(
      {
        content,
        settings: { script, size, wrapX: false, resources: 'standard', startBalance: 'normal' },
        players: [{ id: 'p1' }, { id: 'p2' }],
      },
      makeRandom(createRng(`thumbnail:${script}`)),
    );
    const { width, height } = map;
    const W = 176;
    const r = W / ((width + 0.5) * Math.sqrt(3));
    const hx = Math.sqrt(3) * r;
    const hy = 1.5 * r;
    const H = Math.ceil(hy * (height - 1) + 2 * r);
    const c = document.createElement('canvas');
    c.width = W * 2;
    c.height = H * 2;
    const g = c.getContext('2d');
    if (!g) return null;
    g.scale(2, 2);
    map.tiles.forEach((tile, i) => {
      const col = i % width;
      const row = Math.floor(i / width);
      const cx = hx * (col + 0.5 + (row % 2 ? 0.5 : 0));
      const cy = r + hy * row;
      g.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k - Math.PI / 6;
        const px = cx + (r + 0.4) * Math.cos(a);
        const py = cy + (r + 0.4) * Math.sin(a);
        if (k === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
      g.fillStyle =
        tile.elevation === 'mountain'
          ? '#a49d90'
          : (content.entities.terrain[tile.terrain]?.color ?? '#333');
      g.fill();
    });
    return c.toDataURL();
  } catch {
    return null;
  }
}

function useThumb(content: CompiledContent, id: string): string | null | undefined {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    waiting.add(f);
    if (!thumbs.has(id) && !queue.some((q) => q.id === id)) {
      queue = [...queue, { content, id }];
      pump();
    }
    return () => {
      waiting.delete(f);
    };
  }, [content, id]);
  return thumbs.get(id);
}

function Card({
  content,
  id,
  on,
  onPick,
}: {
  content: CompiledContent;
  id: string;
  on: boolean;
  onPick: () => void;
}) {
  const s = content.entities.mapScript[id]!;
  const src = useThumb(content, id);
  return (
    <button
      type="button"
      className={`mx-card mx-map-card ${on ? 'on' : ''}`}
      aria-pressed={on}
      onClick={onPick}
      title={resolveText(content, s.description ?? '')}
    >
      <span className={`mx-map-thumb ${src === undefined ? 'loading' : ''}`} aria-hidden="true">
        {src && <img src={src} alt="" draggable={false} />}
      </span>
      <strong>{resolveText(content, s.name)}</strong>
    </button>
  );
}

export function MapTypeCards({
  content,
  value,
  onChange,
}: {
  content: CompiledContent;
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="mx-cards maps">
      {content.ids.mapScript.map((id) => (
        <Card key={id} content={content} id={id} on={value === id} onPick={() => onChange(id)} />
      ))}
    </div>
  );
}
