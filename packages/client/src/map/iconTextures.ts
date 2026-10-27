import { Texture } from 'pixi.js';
import { drawIcon, drawRichText, measureRichText } from '../ui/drawIcon';

/** Icons and icon labels as PixiJS textures for the 2D map, drawn at 2× for crispness. */
const SCALE = 2;
const cache = new Map<string, Texture>();

export function iconTexture(
  name: string,
  px: number,
  variant: 'badge' | 'glyph' = 'badge',
  color = '#fff',
): Texture | null {
  const key = `${name}:${px}:${variant}:${color}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px * SCALE;
  const ctx = canvas.getContext('2d')!;
  if (!drawIcon(ctx, name, (px * SCALE) / 2, (px * SCALE) / 2, px * SCALE, variant, color))
    return null;
  const tex = Texture.from(canvas);
  cache.set(key, tex);
  return tex;
}

/** A dark rounded label with text and icons (the map's highlight labels). */
export function labelTexture(text: string, fontPx: number): Texture {
  const key = `label:${fontPx}:${text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const f = fontPx * SCALE;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const font = `600 ${f}px "IBM Plex Sans", sans-serif`;
  ctx.font = font;
  const icon = Math.round(f * 1.15);
  const w = Math.ceil(measureRichText(ctx, text, icon) + f);
  const h = Math.round(f * 1.7);
  canvas.width = w;
  canvas.height = h;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, f * 0.45);
  ctx.fillStyle = 'rgba(14, 20, 27, 0.88)';
  ctx.fill();
  ctx.font = font;
  ctx.fillStyle = '#f0e6cc';
  ctx.textBaseline = 'middle';
  drawRichText(ctx, text, f / 2, h / 2 + 1, icon);
  const tex = Texture.from(canvas);
  cache.set(key, tex);
  return tex;
}

/** Sprites built from these textures are drawn at half size (they're 2×). */
export const ICON_TEXTURE_SCALE = 1 / SCALE;
