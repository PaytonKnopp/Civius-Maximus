import { ICONS } from './icons';
import { richParts } from './Icon';

const paths = new Map<string, Path2D>();
const path = (d: string) => {
  let p = paths.get(d);
  if (!p) {
    p = new Path2D(d);
    paths.set(d, p);
  }
  return p;
};

/**
 * Draws an icon on a 2D canvas (map labels, badges): the colored disc and the glyph, centered
 * at (x, y), `size` pixels across. Returns false for an unknown name.
 */
export function drawIcon(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  size: number,
  variant: 'badge' | 'glyph' = 'badge',
  glyphColor = '#fff',
): boolean {
  const def = ICONS[name];
  if (!def) return false;
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2);
  ctx.scale(size / 24, size / 24);
  if (variant === 'badge') {
    ctx.beginPath();
    ctx.arc(12, 12, 11.4, 0, Math.PI * 2);
    ctx.fillStyle = '#1b140a';
    ctx.fill();
    const g = ctx.createRadialGradient(9, 7.5, 1, 12, 12, 11);
    g.addColorStop(0, lighten(def.bg, 0.35));
    g.addColorStop(0.6, def.bg);
    g.addColorStop(1, darken(def.bg, 0.2));
    ctx.beginPath();
    ctx.arc(12, 12, 10.6, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = 'rgba(255,236,190,0.55)';
    ctx.stroke();
    ctx.translate(2.4, 2.4);
    ctx.scale(0.8, 0.8);
  }
  for (const sh of def.glyph) {
    ctx.fillStyle =
      sh.tone === 'dark'
        ? 'rgba(0,0,0,0.42)'
        : sh.tone === 'light'
          ? 'rgba(255,255,255,0.55)'
          : glyphColor;
    ctx.fill(path(sh.d), sh.holes ? 'evenodd' : 'nonzero');
  }
  ctx.restore();
  return true;
}

/** The width text with icons takes when drawn by `drawRichText` (in the context's font). */
export function measureRichText(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  text: string,
  iconSize: number,
): number {
  return richParts(text).reduce(
    (w, p) => w + (p.icon ? iconSize + 2 : ctx.measureText(p.text!).width),
    0,
  );
}

/** Draws text whose emoji are icons, starting at (x, y) on the text baseline's middle. */
export function drawRichText(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  iconSize: number,
) {
  let cx = x;
  const align = ctx.textAlign;
  ctx.textAlign = 'left';
  for (const p of richParts(text)) {
    if (p.icon) {
      drawIcon(ctx, p.icon, cx + iconSize / 2 + 1, y, iconSize);
      cx += iconSize + 2;
    } else {
      ctx.fillText(p.text!, cx, y);
      cx += ctx.measureText(p.text!).width;
    }
  }
  ctx.textAlign = align;
}

function channel(hex: string, i: number) {
  return parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
}
function mix(hex: string, to: number, t: number) {
  const c = [0, 1, 2].map((i) => Math.round(channel(hex, i) + (to - channel(hex, i)) * t));
  return `rgb(${c.join(',')})`;
}
const lighten = (hex: string, t: number) => mix(hex, 255, t);
const darken = (hex: string, t: number) => mix(hex, 0, t);
