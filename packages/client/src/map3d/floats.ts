import {
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { FLASH_COLORS, type FlashTone } from '../map/renderer';

/**
 * Short-lived effects over the map: numbers that rise and fade (damage, "Captured!") and shots
 * that arc from an archer or a settlement to their target.
 */

export interface FloatWorld {
  center(tile: number): [number, number];
  height(x: number, z: number): number;
  worldWidth(): number;
  wrap(): boolean;
}

interface Floating {
  sprite: Sprite;
  x: number;
  y: number;
  age: number;
}

interface Shot {
  mesh: Mesh;
  from: Vector3;
  to: Vector3;
  age: number;
}

const RISE_TIME = 1.4;
const SHOT_TIME = 0.45;
const shotGeometry = new SphereGeometry(0.035, 6, 4);
const shotMaterial = new MeshBasicMaterial({ color: 0xffe2a0, toneMapped: false });

function textMaterial(text: string, tone: FlashTone): SpriteMaterial {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const font = '800 64px "IBM Plex Sans", sans-serif';
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width + 24);
  canvas.width = w;
  canvas.height = 84;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 10;
  ctx.strokeStyle = 'rgba(10, 12, 16, 0.9)';
  ctx.strokeText(text, w / 2, 44);
  ctx.fillStyle = FLASH_COLORS[tone];
  ctx.fillText(text, w / 2, 44);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  const m = new SpriteMaterial({
    map: tex,
    toneMapped: false,
    depthTest: false,
    transparent: true,
  });
  (m.userData as { aspect: number }).aspect = w / 84;
  return m;
}

export class FloatLayer {
  readonly group = new Group();
  private floating: Floating[] = [];
  private shots: Shot[] = [];

  constructor(private world: FloatWorld) {}

  private at(tile: number): Vector3 {
    const [x, z] = this.world.center(tile);
    return new Vector3(x, Math.max(0, this.world.height(x, z)), z);
  }

  flash(tile: number, text: string, tone: FlashTone) {
    const p = this.at(tile);
    const m = textMaterial(text, tone);
    const sprite = new Sprite(m);
    const h = 0.26;
    sprite.scale.set(h * (m.userData as { aspect: number }).aspect, h, 1);
    sprite.renderOrder = 40;
    // Several flashes on one tile stack upward instead of overlapping.
    const stacked = this.floating.filter((f) => Math.abs(f.x - p.x) < 0.01).length;
    this.floating.push({ sprite, x: p.x, y: p.y + 0.7 + stacked * 0.22, age: 0 });
    sprite.position.set(p.x, p.y + 0.7, p.z);
    this.group.add(sprite);
  }

  shot(from: number, to: number) {
    const a = this.at(from).add(new Vector3(0, 0.3, 0));
    const b = this.at(to).add(new Vector3(0, 0.2, 0));
    if (this.world.wrap()) {
      const w = this.world.worldWidth();
      b.x += Math.round((a.x - b.x) / w) * w;
    }
    const mesh = new Mesh(shotGeometry, shotMaterial);
    mesh.renderOrder = 35;
    this.group.add(mesh);
    this.shots.push({ mesh, from: a, to: b, age: 0 });
  }

  update(dt: number, cameraX: number) {
    const w = this.world.worldWidth();
    const shift = (x: number) => (this.world.wrap() ? Math.round((cameraX - x) / w) * w : 0);
    this.floating = this.floating.filter((f) => {
      f.age += dt;
      if (f.age >= RISE_TIME) {
        this.group.remove(f.sprite);
        f.sprite.material.map?.dispose();
        f.sprite.material.dispose();
        return false;
      }
      const t = f.age / RISE_TIME;
      f.sprite.position.x = f.x + shift(f.x);
      f.sprite.position.y = f.y + t * 0.45;
      f.sprite.material.opacity = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
      return true;
    });
    this.shots = this.shots.filter((s) => {
      s.age += dt;
      if (s.age >= SHOT_TIME) {
        this.group.remove(s.mesh);
        return false;
      }
      const t = s.age / SHOT_TIME;
      const p = s.from.clone().lerp(s.to, t);
      p.y += Math.sin(t * Math.PI) * 0.6;
      s.mesh.position.set(p.x + shift(p.x), p.y, p.z);
      return true;
    });
  }

  isAnimating(): boolean {
    return this.floating.length > 0 || this.shots.length > 0;
  }
}
