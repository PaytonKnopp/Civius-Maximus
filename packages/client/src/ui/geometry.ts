/**
 * SVG path builders for the icon set (docs/10-art-direction.md, "Icons"). Every icon is drawn on
 * a 24×24 grid as plain path data, so the same shapes render as inline SVG in the UI and as
 * `Path2D` on the map canvases.
 */

const n = (v: number) => Number(v.toFixed(2));

/** A circle. */
export function circle(cx: number, cy: number, r: number): string {
  return `M${n(cx - r)} ${n(cy)}a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0Z`;
}

/** An ellipse turned `deg` degrees. */
export function ellipse(cx: number, cy: number, rx: number, ry: number, deg = 0): string {
  const a = (deg * Math.PI) / 180;
  const dx = rx * Math.cos(a);
  const dy = rx * Math.sin(a);
  return `M${n(cx - dx)} ${n(cy - dy)}A${n(rx)} ${n(ry)} ${n(deg)} 1 0 ${n(cx + dx)} ${n(cy + dy)}A${n(rx)} ${n(ry)} ${n(deg)} 1 0 ${n(cx - dx)} ${n(cy - dy)}Z`;
}

/** A rectangle, with rounded corners if `r` is given. */
export function rect(x: number, y: number, w: number, h: number, r = 0): string {
  if (r <= 0) return `M${n(x)} ${n(y)}h${n(w)}v${n(h)}h${n(-w)}Z`;
  const q = Math.min(r, w / 2, h / 2);
  return (
    `M${n(x + q)} ${n(y)}h${n(w - 2 * q)}a${n(q)} ${n(q)} 0 0 1 ${n(q)} ${n(q)}` +
    `v${n(h - 2 * q)}a${n(q)} ${n(q)} 0 0 1 ${n(-q)} ${n(q)}h${n(-(w - 2 * q))}` +
    `a${n(q)} ${n(q)} 0 0 1 ${n(-q)} ${n(-q)}v${n(-(h - 2 * q))}a${n(q)} ${n(q)} 0 0 1 ${n(q)} ${n(-q)}Z`
  );
}

/** A polygon through the points `[x, y, x, y, ...]`. */
export function poly(...pts: number[]): string {
  let d = '';
  for (let i = 0; i < pts.length; i += 2)
    d += `${i === 0 ? 'M' : 'L'}${n(pts[i]!)} ${n(pts[i + 1]!)}`;
  return `${d}Z`;
}

/** A star with `points` tips. */
export function star(cx: number, cy: number, outer: number, inner: number, points = 5): string {
  const pts: number[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI * i) / points - Math.PI / 2;
    pts.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  return poly(...pts);
}

/** A cog with `teeth` teeth (fill with even-odd to keep the hole). */
export function gear(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  teeth: number,
  hole: number,
): string {
  const pts: number[] = [];
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step - Math.PI / 2;
    const w = step * 0.22;
    for (const [r, da] of [
      [inner, -step / 2 + w],
      [outer, -w],
      [outer, w],
      [inner, step / 2 - w],
    ] as const)
      pts.push(cx + r * Math.cos(a + da), cy + r * Math.sin(a + da));
  }
  return poly(...pts) + (hole > 0 ? circle(cx, cy, hole) : '');
}

/** A ring (fill with even-odd). */
export function ring(cx: number, cy: number, outer: number, inner: number): string {
  return circle(cx, cy, outer) + circle(cx, cy, inner);
}

/** A thick line from one point to another, as a filled shape (so it works as a fill path). */
export function bar(x1: number, y1: number, x2: number, y2: number, w: number): string {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const ox = (-(y2 - y1) / len) * (w / 2);
  const oy = ((x2 - x1) / len) * (w / 2);
  return poly(x1 + ox, y1 + oy, x2 + ox, y2 + oy, x2 - ox, y2 - oy, x1 - ox, y1 - oy);
}
