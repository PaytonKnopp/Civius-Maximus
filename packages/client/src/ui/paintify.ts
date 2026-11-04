import canvasUrl from '../assets/portrait/canvas.webp';

/**
 * Turns a drawn portrait (an SVG) into an oil painting, the same family of look as the 3D
 * world's brush filter: pigment drifting across flat color, a Kuwahara filter that melts edges
 * into brush-sized patches, dry-brush streaks, a canvas weave (CC0 photograph, see
 * docs/ART-CREDITS.md) and the world's split-tone grade with a dark vignette. Done once per
 * portrait in the browser and cached, so it costs nothing to draw afterwards.
 */

const cache = new Map<string, Promise<string>>();
let chain: Promise<unknown> = Promise.resolve();

let weave: Promise<HTMLImageElement> | undefined;
function loadWeave(): Promise<HTMLImageElement> {
  weave ??= new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = canvasUrl;
  });
  return weave;
}

function hash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** Smooth value noise on a coarse lattice (deterministic). */
function lattice(seed: number) {
  const n = (x: number, y: number) => {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  return (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);
    return (
      n(xi, yi) * (1 - u) * (1 - v) +
      n(xi + 1, yi) * u * (1 - v) +
      n(xi, yi + 1) * (1 - u) * v +
      n(xi + 1, yi + 1) * u * v
    );
  };
}

/** Kuwahara filter with summed-area tables: O(pixels), whatever the radius. */
function kuwahara(src: Uint8ClampedArray, w: number, h: number, r: number): Float32Array {
  const W = w + 1;
  // Per channel sums, plus the sum of luminance squared (for the variance).
  const sums = [0, 1, 2].map(() => new Float64Array(W * (h + 1)));
  const lum = new Float64Array(W * (h + 1));
  const lum2 = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let rs = 0;
    let gs = 0;
    let bs = 0;
    let ls = 0;
    let l2 = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const rr = src[i]!;
      const gg = src[i + 1]!;
      const bb = src[i + 2]!;
      const l = 0.299 * rr + 0.587 * gg + 0.114 * bb;
      rs += rr;
      gs += gg;
      bs += bb;
      ls += l;
      l2 += l * l;
      const k = (y + 1) * W + (x + 1);
      const up = y * W + (x + 1);
      sums[0]![k] = sums[0]![up]! + rs;
      sums[1]![k] = sums[1]![up]! + gs;
      sums[2]![k] = sums[2]![up]! + bs;
      lum[k] = lum[up]! + ls;
      lum2[k] = lum2[up]! + l2;
    }
  }
  const box = (t: Float64Array, x0: number, y0: number, x1: number, y1: number) =>
    t[y1 * W + x1]! - t[y0 * W + x1]! - t[y1 * W + x0]! + t[y0 * W + x0]!;
  const out = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let best = Infinity;
      let br = 0;
      let bg = 0;
      let bb = 0;
      for (let q = 0; q < 4; q++) {
        const x0 = Math.max(0, q & 1 ? x : x - r);
        const x1 = Math.min(w, q & 1 ? x + r + 1 : x + 1);
        const y0 = Math.max(0, q & 2 ? y : y - r);
        const y1 = Math.min(h, q & 2 ? y + r + 1 : y + 1);
        const n = (x1 - x0) * (y1 - y0);
        const ml = box(lum, x0, y0, x1, y1) / n;
        const v = box(lum2, x0, y0, x1, y1) / n - ml * ml;
        if (v < best) {
          best = v;
          br = box(sums[0]!, x0, y0, x1, y1) / n;
          bg = box(sums[1]!, x0, y0, x1, y1) / n;
          bb = box(sums[2]!, x0, y0, x1, y1) / n;
        }
      }
      const o = (y * w + x) * 3;
      out[o] = br;
      out[o + 1] = bg;
      out[o + 2] = bb;
    }
  }
  return out;
}

async function paint(markup: string, w: number, h: number): Promise<string> {
  const img = new Image();
  const blobUrl = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('portrait failed to render'));
    img.src = blobUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  URL.revokeObjectURL(blobUrl);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;

  const unit = w / 200;
  const slow = lattice(7);
  const streak = lattice(19);

  // 1. Pigment: broad drifts of lighter and darker, warmer and cooler, so flat areas breathe.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = slow(x / (unit * 26), y / (unit * 26)) - 0.5;
      const b = slow(x / (unit * 9) + 40, y / (unit * 9)) - 0.5;
      const k = 1 + a * 0.16 + b * 0.07;
      const warm = a * 7;
      px[i] = Math.max(0, Math.min(255, px[i]! * k + warm));
      px[i + 1] = Math.max(0, Math.min(255, px[i + 1]! * k));
      px[i + 2] = Math.max(0, Math.min(255, px[i + 2]! * k - warm));
    }
  }

  // 2. Oil: melt edges into brush-sized patches, keeping some of the fine drawing.
  const radius = Math.max(2, Math.round(unit * 1.15));
  const soft = kuwahara(px, w, h, radius);

  // 3. Dry-brush streaks along a slanted stroke direction, then the grade.
  const cos = Math.cos(-0.5);
  const sin = Math.sin(-0.5);
  const cx = w / 2;
  const cy = h * 0.42;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const o = (y * w + x) * 3;
      let r = px[i]! * 0.45 + soft[o]! * 0.55;
      let g = px[i + 1]! * 0.45 + soft[o + 1]! * 0.55;
      let b = px[i + 2]! * 0.45 + soft[o + 2]! * 0.55;
      // Stretch the noise along the stroke so it reads as bristle marks.
      const u = (x - cx) * cos - (y - cy) * sin;
      const v = (x - cx) * sin + (y - cy) * cos;
      const s = streak(u / (unit * 34), v / (unit * 2.2)) - 0.5;
      const m = 1 + s * 0.085;
      r *= m;
      g *= m;
      b *= m;
      // Split tone: cool shadows, warm light.
      const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const warm = Math.min(1, Math.max(0, (l - 0.15) / 0.6));
      r *= 0.94 + 0.12 * warm;
      g *= 0.985 + 0.03 * warm;
      b *= 1.06 - 0.16 * warm;
      // Vignette toward the edges, the world's dark frame.
      const dx = (x - cx) / (w * 0.62);
      const dy = (y - cy) / (h * 0.62);
      const vg = 1 - Math.min(1, Math.max(0, Math.hypot(dx, dy) - 0.55) / 0.7) * 0.5;
      px[i] = Math.max(0, Math.min(255, r * vg));
      px[i + 1] = Math.max(0, Math.min(255, g * vg));
      px[i + 2] = Math.max(0, Math.min(255, b * vg));
    }
  }
  ctx.putImageData(data, 0, 0);

  // 4. Canvas weave over everything.
  try {
    const tile = await loadWeave();
    const pattern = ctx.createPattern(tile, 'repeat');
    if (pattern) {
      ctx.save();
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = 0.85;
      const s = (64 * unit) / tile.width;
      ctx.scale(s, s);
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, w / s, h / s);
      ctx.restore();
    }
  } catch {
    // The weave is a finish; without it the painting still stands.
  }

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', 0.92),
  );
  return blob ? URL.createObjectURL(blob) : canvas.toDataURL('image/png');
}

/**
 * The painted version of a drawn portrait, as an image URL. Jobs run one after another (idle
 * gaps between them) so a screen of portraits never stalls the page.
 */
export function paintedPortrait(
  svg: SVGSVGElement,
  key: string,
  width: number,
  height: number,
): Promise<string> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll('[data-finish]').forEach((n) => n.remove());
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.removeAttribute('class');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  const markup = new XMLSerializer().serializeToString(clone);
  const cacheKey = `${width}x${height}:${hash(key)}`;
  let job = cache.get(cacheKey);
  if (!job) {
    job = new Promise<string>((resolve, reject) => {
      chain = chain
        .then(() => new Promise((r) => setTimeout(r, 30)))
        .then(() => paint(markup, width, height))
        .then(resolve, reject);
    });
    cache.set(cacheKey, job);
  }
  return job;
}
