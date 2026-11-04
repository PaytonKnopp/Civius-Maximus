import { drawIcon } from '../ui/drawIcon';

/**
 * The medal a resource wears on the map (docs/10-art-direction.md, "Resources"): a dark plate in
 * a metal rim whose color tells the class at a glance (bonus brass, luxury amethyst, strategic
 * copper), the resource's glyph in the middle, and a soft shadow on the ground. Clean and
 * heraldic, in the same family as the unit shields and the UI's gold trim.
 */

export type ResourceClass = 'bonus' | 'luxury' | 'strategic';

interface Look {
  rimLight: string;
  rimMid: string;
  rimDark: string;
  plateLight: string;
  plateDark: string;
  glyph: string;
  glow: string;
}

const LOOKS: Record<ResourceClass, Look> = {
  bonus: {
    rimLight: '#f2dc9a',
    rimMid: '#c29d4e',
    rimDark: '#6e5224',
    plateLight: '#2a3a2a',
    plateDark: '#0f1712',
    glyph: '#f7edcb',
    glow: 'rgba(255, 233, 170, 0.35)',
  },
  luxury: {
    rimLight: '#dcc3f6',
    rimMid: '#9a6cc8',
    rimDark: '#4b2a78',
    plateLight: '#33264a',
    plateDark: '#130d20',
    glyph: '#f5e8ff',
    glow: 'rgba(210, 170, 255, 0.35)',
  },
  strategic: {
    rimLight: '#f5b184',
    rimMid: '#c4673c',
    rimDark: '#6a2a16',
    plateLight: '#40251c',
    plateDark: '#170c08',
    glyph: '#ffe6cc',
    glow: 'rgba(255, 170, 110, 0.35)',
  },
};

/** Draws the badge into a square canvas; returns false when the resource has no glyph. */
export function drawResourceBadge(
  ctx: CanvasRenderingContext2D,
  id: string,
  cls: ResourceClass,
  size: number,
): boolean {
  const look = LOOKS[cls];
  const c = size / 2;
  const r = size * 0.4;

  // Ground shadow.
  ctx.save();
  ctx.translate(c, size * 0.88);
  ctx.scale(1, 0.3);
  const sh = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.95);
  sh.addColorStop(0, 'rgba(0,0,0,0.5)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sh;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.95, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const cy = size * 0.45;
  // Metal rim: light from the upper left.
  const rim = ctx.createLinearGradient(c - r, cy - r, c + r, cy + r);
  rim.addColorStop(0, look.rimLight);
  rim.addColorStop(0.45, look.rimMid);
  rim.addColorStop(1, look.rimDark);
  ctx.beginPath();
  ctx.arc(c, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = rim;
  ctx.fill();
  ctx.lineWidth = size * 0.012;
  ctx.strokeStyle = 'rgba(8,6,3,0.85)';
  ctx.stroke();

  // A thin bevel line inside the rim.
  ctx.beginPath();
  ctx.arc(c, cy, r * 0.88, 0, Math.PI * 2);
  ctx.lineWidth = size * 0.01;
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.stroke();

  // The dark plate, lit from above.
  const plate = ctx.createRadialGradient(c - r * 0.25, cy - r * 0.35, r * 0.1, c, cy, r * 0.84);
  plate.addColorStop(0, look.plateLight);
  plate.addColorStop(1, look.plateDark);
  ctx.beginPath();
  ctx.arc(c, cy, r * 0.82, 0, Math.PI * 2);
  ctx.fillStyle = plate;
  ctx.fill();

  // Soft glow behind the glyph.
  const glow = ctx.createRadialGradient(c, cy, 0, c, cy, r * 0.7);
  glow.addColorStop(0, look.glow);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fill();

  const ok = drawIcon(ctx, id, c, cy, r * 1.5, 'glyph', look.glyph);

  // Gloss across the top of the plate.
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, cy, r * 0.82, 0, Math.PI * 2);
  ctx.clip();
  const gloss = ctx.createLinearGradient(0, cy - r, 0, cy);
  gloss.addColorStop(0, 'rgba(255,255,255,0.16)');
  gloss.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gloss;
  ctx.fillRect(c - r, cy - r, r * 2, r);
  ctx.restore();
  return ok;
}
