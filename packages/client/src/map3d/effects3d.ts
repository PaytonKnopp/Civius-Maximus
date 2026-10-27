import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  NormalBlending,
  Points,
  ShaderMaterial,
} from 'three';

/**
 * Particle effects in the 3D world (docs/10-art-direction.md, "Effects"): smoke from chimneys
 * and factories, fire and thick smoke over burning or badly damaged settlements. One pool of
 * points per blend mode, drawn in two draw calls, with soft round sprites from the shader (no
 * textures). Emitters belong to an owner id (a settlement), so they follow it in and out.
 */

export type EmitterKind = 'smoke' | 'chimney' | 'fire' | 'dust' | 'spark';

export interface Emitter {
  kind: EmitterKind;
  at: [number, number, number];
}

interface Particle {
  x: number;
  y: number;
  z: number;
  /** World x of its emitter, for keeping it in the copy of the world nearest the camera. */
  ex: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  size: number;
  grow: number;
  color: Color;
  alpha: number;
  additive: boolean;
}

const KINDS: Record<
  EmitterKind,
  {
    rate: number;
    life: [number, number];
    size: [number, number];
    grow: number;
    rise: number;
    spread: number;
    colors: number[];
    alpha: number;
    additive: boolean;
  }
> = {
  chimney: {
    rate: 2.2,
    life: [2.6, 3.6],
    size: [0.05, 0.08],
    grow: 0.09,
    rise: 0.16,
    spread: 0.03,
    colors: [0xc8c4bc, 0xb0aca4, 0xd8d4cc],
    alpha: 0.4,
    additive: false,
  },
  smoke: {
    rate: 5,
    life: [2.4, 3.4],
    size: [0.1, 0.16],
    grow: 0.16,
    rise: 0.28,
    spread: 0.08,
    colors: [0x3a3632, 0x4a4540, 0x2a2724],
    alpha: 0.62,
    additive: false,
  },
  fire: {
    rate: 14,
    life: [0.45, 0.8],
    size: [0.07, 0.12],
    grow: -0.06,
    rise: 0.34,
    spread: 0.05,
    colors: [0xffb347, 0xff7b2e, 0xffd27a, 0xe8501e],
    alpha: 0.9,
    additive: true,
  },
  dust: {
    rate: 0,
    life: [0.7, 1.2],
    size: [0.08, 0.13],
    grow: 0.2,
    rise: 0.12,
    spread: 0.12,
    colors: [0xb8a07a, 0xa08a66, 0xc8b490],
    alpha: 0.55,
    additive: false,
  },
  spark: {
    rate: 0,
    life: [0.2, 0.45],
    size: [0.04, 0.07],
    grow: -0.05,
    rise: 0.5,
    spread: 0.06,
    colors: [0xfff0b0, 0xffc860, 0xff9a3c],
    alpha: 1,
    additive: true,
  },
};

const MAX = 900;

function pool(additive: boolean) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(MAX * 3), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(MAX * 3), 3));
  geometry.setAttribute('size', new BufferAttribute(new Float32Array(MAX), 1));
  geometry.setAttribute('alpha', new BufferAttribute(new Float32Array(MAX), 1));
  geometry.setDrawRange(0, 0);
  const material = new ShaderMaterial({
    uniforms: { uScale: { value: 600 } },
    vertexShader: /* glsl */ `
      attribute float size;
      attribute float alpha;
      attribute vec3 color;
      varying vec3 vColor;
      varying float vAlpha;
      uniform float uScale;
      void main() {
        vColor = color;
        vAlpha = alpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.12, d) * vAlpha;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vColor, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: additive ? AdditiveBlending : NormalBlending,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = additive ? 21 : 20;
  return points;
}

/** Deterministic-enough jitter for looks (not game state, so Math.random is fine here). */
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class EffectsLayer {
  readonly group = new Group();
  private emitters = new Map<string, Emitter[]>();
  private debt = new WeakMap<Emitter, number>();
  private particles: Particle[] = [];
  private soft = pool(false);
  private glow = pool(true);

  constructor(
    private world: { worldWidth(): number; wrap(): boolean },
    private enabled = true,
  ) {
    this.group.add(this.soft, this.glow);
  }

  /** Replaces the emitters that belong to `owner`. */
  set(owner: string, list: Emitter[]) {
    if (list.length === 0) this.emitters.delete(owner);
    else this.emitters.set(owner, list);
  }

  clear() {
    this.emitters.clear();
    this.particles = [];
  }

  /** A one-off puff: dust and sparks where a blow lands. */
  burst(kind: EmitterKind, at: [number, number, number], count: number) {
    for (let i = 0; i < count; i++) this.spawn(kind, at, 2.5);
  }

  private spawn(kind: EmitterKind, at: [number, number, number], push = 1) {
    if (this.particles.length >= MAX * 2) return;
    const k = KINDS[kind];
    this.particles.push({
      x: at[0] + rand(-k.spread, k.spread),
      y: at[1],
      z: at[2] + rand(-k.spread, k.spread),
      ex: at[0],
      vx: rand(-0.02, 0.05) * push + (push > 1 ? rand(-0.15, 0.15) : 0),
      vy: k.rise * rand(0.7, 1.2),
      vz: rand(-0.02, 0.02) * push + (push > 1 ? rand(-0.15, 0.15) : 0),
      age: 0,
      life: rand(k.life[0], k.life[1]),
      size: rand(k.size[0], k.size[1]),
      grow: k.grow,
      color: new Color(k.colors[Math.floor(Math.random() * k.colors.length)]!),
      alpha: k.alpha,
      additive: k.additive,
    });
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    this.group.visible = on;
  }

  /** Point size scale from the viewport height (so puffs keep their size when resized). */
  setViewport(height: number) {
    for (const p of [this.soft, this.glow])
      (p.material as ShaderMaterial).uniforms.uScale!.value = height;
  }

  update(dt: number, cameraX: number) {
    if (!this.enabled) return;
    // Emit.
    for (const list of this.emitters.values()) {
      for (const e of list) {
        const k = KINDS[e.kind];
        const due = (this.debt.get(e) ?? Math.random()) + k.rate * dt;
        let n = Math.floor(due);
        this.debt.set(e, due - n);
        while (n-- > 0) this.spawn(e.kind, e.at);
      }
    }
    // Move and draw.
    const w = this.world.worldWidth();
    const wrap = this.world.wrap();
    let soft = 0;
    let glow = 0;
    const sp = this.soft.geometry.attributes;
    const gp = this.glow.geometry.attributes;
    const next: Particle[] = [];
    for (const p of this.particles) {
      p.age += dt;
      if (p.age >= p.life) continue;
      next.push(p);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.size = Math.max(0.01, p.size + p.grow * dt);
      const t = p.age / p.life;
      // Fade in quickly, out slowly.
      const a = p.alpha * Math.min(1, t * 6) * (1 - t);
      const attrs = p.additive ? gp : sp;
      const i = p.additive ? glow++ : soft++;
      if (i >= MAX) continue;
      const x = wrap ? p.x + Math.round((cameraX - p.ex) / w) * w : p.x;
      (attrs.position as BufferAttribute).setXYZ(i, x, p.y, p.z);
      (attrs.color as BufferAttribute).setXYZ(i, p.color.r, p.color.g, p.color.b);
      (attrs.size as BufferAttribute).setX(i, p.size);
      (attrs.alpha as BufferAttribute).setX(i, a);
    }
    this.particles = next;
    for (const [pts, n] of [
      [this.soft, Math.min(MAX, soft)],
      [this.glow, Math.min(MAX, glow)],
    ] as const) {
      pts.geometry.setDrawRange(0, n);
      for (const name of ['position', 'color', 'size', 'alpha'])
        (pts.geometry.attributes[name] as BufferAttribute).needsUpdate = true;
    }
  }
}
