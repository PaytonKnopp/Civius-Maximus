import { CanvasTexture, LinearFilter, RepeatWrapping, ClampToEdgeWrapping, Vector4 } from 'three';

/**
 * Soft ground shadows for everything that stands on the land: trees, rocks, shrubs and towns.
 *
 * They are baked into one small world-space texture (a 2D canvas, about a dozen pixels per tile
 * unit) that the terrain shader reads, so a shadow follows every slope exactly, costs no extra
 * draw call, and the map can hold thousands of casters. Two channels:
 *   red   = the cast shadow, thrown away from the low sun, longer for taller things;
 *   green = ambient occlusion, a soft dark pool right at the foot of each thing.
 * The painted look lives or dies on things looking planted in the ground rather than pasted on
 * it, and this is what plants them.
 */
export interface Caster {
  x: number;
  z: number;
  /** Radius of the crown or footprint, in world units. */
  r: number;
  /** Height, in world units. */
  h: number;
  /** 0..1: how dark. */
  k: number;
}

/** Pixels per world unit (one hex is about 1.7 across), lowered on huge maps to cap memory. */
const PX = 12;
const MAX_SIDE = 4096;
const PAD = 2;

/** A soft radial sprite: one channel bright in the middle, fading to nothing. */
function sprite(channel: 'r' | 'g'): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 64, 64);
  const rgb = (v: number) => (channel === 'r' ? `rgb(${v},0,0)` : `rgb(0,${v},0)`);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, rgb(255));
  g.addColorStop(0.45, rgb(190));
  g.addColorStop(0.8, rgb(60));
  g.addColorStop(1, rgb(0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return c;
}

export class GroundShade {
  /** Uniform value for the terrain shader: where the texture sits in the world (x0, z0, 1/w, 1/d). */
  readonly rect = new Vector4(0, 0, 1, 1);
  texture: CanvasTexture;
  private readonly shadowSprite = sprite('r');
  private readonly occlusionSprite = sprite('g');
  private px = PX;
  private x0 = 0;
  private z0 = -PAD;
  private w = 1;
  private d = 1;
  private wrapX = false;

  constructor() {
    this.texture = this.blank(1, 1);
  }

  private blank(w: number, h: number): CanvasTexture {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    return this.make(c);
  }

  private make(canvas: HTMLCanvasElement): CanvasTexture {
    const t = new CanvasTexture(canvas);
    // Data, not a picture: no flip (row 0 is the world's north edge) and no mipmaps.
    t.flipY = false;
    t.generateMipmaps = false;
    t.minFilter = LinearFilter;
    t.magFilter = LinearFilter;
    t.wrapS = this.wrapX ? RepeatWrapping : ClampToEdgeWrapping;
    t.wrapT = ClampToEdgeWrapping;
    return t;
  }

  /** Redraw the whole texture for a world of this size and these casters. */
  bake(
    worldW: number,
    worldD: number,
    wrapX: boolean,
    sunDir: [number, number],
    casters: Caster[],
  ) {
    this.wrapX = wrapX;
    this.x0 = wrapX ? 0 : -PAD;
    this.z0 = -PAD;
    this.w = wrapX ? worldW : worldW + PAD * 2;
    this.d = worldD + PAD * 2;
    this.px = Math.min(PX, MAX_SIDE / Math.max(this.w, this.d));
    const cw = Math.max(1, Math.ceil(this.w * this.px));
    const ch = Math.max(1, Math.ceil(this.d * this.px));

    const canvas = this.texture.image as HTMLCanvasElement;
    const resized = canvas.width !== cw || canvas.height !== ch;
    if (resized) {
      this.texture.dispose();
      const fresh = document.createElement('canvas');
      fresh.width = cw;
      fresh.height = ch;
      this.texture = this.make(fresh);
    }
    const target = this.texture.image as HTMLCanvasElement;
    const ctx = target.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cw, ch);
    ctx.globalCompositeOperation = 'lighter';

    // Shadows fall away from the sun.
    const len = Math.hypot(sunDir[0], sunDir[1]) || 1;
    const dx = -sunDir[0] / len;
    const dz = -sunDir[1] / len;
    const angle = Math.atan2(dz, dx);

    const draw = (c: Caster, ox: number) => {
      const px = (c.x + ox - this.x0) * this.px;
      const pz = (c.z - this.z0) * this.px;
      // Cast shadow: an ellipse running down-sun from the foot, as long as the thing is tall.
      const shadowLen = c.h * 1.4;
      const a = (shadowLen * 0.55 + c.r * 0.55) * this.px;
      const b = c.r * 0.95 * this.px;
      const off = shadowLen * 0.42 * this.px;
      ctx.save();
      ctx.translate(px + dx * off, pz + dz * off);
      ctx.rotate(angle);
      ctx.globalAlpha = c.k;
      ctx.drawImage(this.shadowSprite, -a, -b, a * 2, b * 2);
      ctx.restore();
      // Ambient occlusion: a pool at the foot.
      const o = c.r * 1.2 * this.px;
      ctx.globalAlpha = c.k * 0.75;
      ctx.drawImage(this.occlusionSprite, px - o, pz - o, o * 2, o * 2);
    };
    for (const c of casters) {
      draw(c, 0);
      // Things near the seam of a wrapping world also shade the other side of it.
      if (wrapX) {
        if (c.x < c.h * 2 + 1) draw(c, worldW);
        if (c.x > worldW - c.h * 2 - 1) draw(c, -worldW);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    this.texture.needsUpdate = true;
    this.rect.set(this.x0, this.z0, 1 / this.w, 1 / this.d);
  }

  dispose() {
    this.texture.dispose();
  }
}
