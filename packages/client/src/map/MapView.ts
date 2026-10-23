import { type CompiledContent, resolveText } from '@cx/content';
import { computeTileYields, isOnRiver, type MapState, tilesWithin } from '@cx/engine';
import { Application, Container, Graphics, Text } from 'pixi.js';
import {
  corner,
  EDGE_CORNERS,
  HEX,
  HEX_W,
  hexPoints,
  ROW_H,
  tileAt,
  tileCenter,
  worldSize,
} from './geometry';

/** Tiles per chunk side. Each chunk is drawn once into its own Graphics and culled as a unit. */
const CHUNK = 8;

export const PLAYER_COLORS = [
  0xe0b040, 0x4aa3df, 0xd9534f, 0x5cb85c, 0xb07cd8, 0xf08a3c, 0x41c7b9, 0xe46fae, 0x8d9db6,
  0xc9d65a, 0x7f6fd6, 0xd98f8f, 0x6ea86e, 0xc4a484, 0x5b8fb0, 0xbfbfbf,
];

export interface MapViewOptions {
  grid: boolean;
  yields: boolean;
  /** `null` = see everything; otherwise only what this player's start can see. */
  viewer: string | null;
}

export interface MapViewData {
  map: MapState;
  content: CompiledContent;
  starts: Record<string, number>;
  playerOrder: string[];
}

interface Chunk {
  container: Container;
  terrain: Graphics;
  overlay: Graphics;
  labels: Container;
  fog: Graphics;
  /** Unshifted world-space bounds. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  tiles: number[];
}

const hex = (s: string) => Number.parseInt(s.slice(1), 16);

function shade(color: number, factor: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 255) * factor));
  const g = Math.min(255, Math.round(((color >> 8) & 255) * factor));
  const b = Math.min(255, Math.round((color & 255) * factor));
  return (r << 16) | (g << 8) | b;
}

const RESOURCE_COLORS = { bonus: 0xe8dcb0, luxury: 0xd18cf0, strategic: 0xf07a5a } as const;
const YIELD_PIPS: [string, number][] = [
  ['food', 0x8fd16a],
  ['production', 0xe8a04a],
  ['gold', 0xf2d24b],
  ['science', 0x5fb8f0],
  ['culture', 0xd47ae0],
  ['faith', 0xe8e8f0],
];
const RIVER = 0x3d8fdb;

/**
 * Renders a map with PixiJS: chunked static geometry, an east-west wrapping camera with pan and
 * zoom, culling, overlays and fog. Input is plain pointer/wheel events on the canvas.
 */
export class MapView {
  private app = new Application();
  private world = new Container();
  private chunks: Chunk[] = [];
  private data: MapViewData | undefined;
  private options: MapViewOptions = { grid: true, yields: false, viewer: null };
  private worldW = 1;
  private worldH = 1;
  private cam = { x: 0, y: 0, zoom: 0.6 };
  private pointers = new Map<number, { x: number; y: number }>();
  private drag: { x: number; y: number; moved: boolean } | undefined;
  private pinch: { distance: number; zoom: number } | undefined;
  private destroyed = false;
  private ready: Promise<void>;
  private keys = new Set<string>();
  private cleanup: (() => void)[] = [];

  onHover: (tile: number | undefined) => void = () => {};
  onSelect: (tile: number | undefined) => void = () => {};
  onFps: (fps: number) => void = () => {};

  constructor(private host: HTMLElement) {
    this.ready = this.init();
  }

  private async init() {
    await this.app.init({
      resizeTo: this.host,
      antialias: true,
      background: 0x0b1620,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    if (this.destroyed) {
      this.app.destroy(true);
      return;
    }
    this.host.appendChild(this.app.canvas);
    this.app.stage.addChild(this.world);
    this.bindInput(this.app.canvas);
    let frames = 0;
    let last = performance.now();
    this.app.ticker.add(() => {
      this.stepKeys();
      this.updateCamera();
      frames++;
      const now = performance.now();
      if (now - last >= 500) {
        this.onFps(Math.round((frames * 1000) / (now - last)));
        frames = 0;
        last = now;
      }
    });
  }

  async setData(data: MapViewData, options: MapViewOptions) {
    await this.ready;
    if (this.destroyed) return;
    const keepCamera =
      this.data &&
      this.data.map.width === data.map.width &&
      this.data.map.height === data.map.height;
    this.data = data;
    this.options = options;
    [this.worldW, this.worldH] = worldSize(data.map.width, data.map.height);
    this.build();
    if (!keepCamera) this.focusPlayer(data.playerOrder[0]);
  }

  async setOptions(options: MapViewOptions) {
    await this.ready;
    const rebuildOverlay =
      options.grid !== this.options.grid || options.yields !== this.options.yields;
    const rebuildFog = options.viewer !== this.options.viewer;
    this.options = options;
    if (!this.data) return;
    for (const c of this.chunks) {
      if (rebuildOverlay) this.drawOverlay(c);
      if (rebuildFog) this.drawFog(c);
    }
  }

  /** Centers the camera on a player's start. */
  focusPlayer(player: string | undefined) {
    if (!this.data || player === undefined) return;
    const tile = this.data.starts[player];
    if (tile === undefined) return;
    const [x, y] = tileCenter(tile % this.data.map.width, Math.floor(tile / this.data.map.width));
    this.cam.x = x;
    this.cam.y = y;
    this.cam.zoom = Math.max(this.cam.zoom, 0.7);
  }

  zoomBy(factor: number) {
    this.zoomAt(this.app.screen.width / 2, this.app.screen.height / 2, factor);
  }

  destroy() {
    this.destroyed = true;
    for (const fn of this.cleanup) fn();
    // If init hasn't finished, init() destroys the app when it does.
    void this.ready.then(() => {
      if (this.app.renderer) this.app.destroy(true, { children: true });
    });
  }

  // --- Building ------------------------------------------------------------------------------

  private build() {
    for (const c of this.chunks) c.container.destroy({ children: true });
    this.chunks = [];
    const { map } = this.data!;
    for (let r0 = 0; r0 < map.height; r0 += CHUNK) {
      for (let c0 = 0; c0 < map.width; c0 += CHUNK) {
        const tiles: number[] = [];
        for (let r = r0; r < Math.min(r0 + CHUNK, map.height); r++) {
          for (let c = c0; c < Math.min(c0 + CHUNK, map.width); c++) tiles.push(r * map.width + c);
        }
        const container = new Container();
        const chunk: Chunk = {
          container,
          terrain: new Graphics(),
          overlay: new Graphics(),
          labels: new Container(),
          fog: new Graphics(),
          x0: HEX_W * c0,
          y0: ROW_H * r0,
          x1: HEX_W * (Math.min(c0 + CHUNK, map.width) + 0.5),
          y1: ROW_H * Math.min(r0 + CHUNK, map.height) + HEX,
          tiles,
        };
        container.addChild(chunk.terrain, chunk.overlay, chunk.labels, chunk.fog);
        this.world.addChild(container);
        this.drawTerrain(chunk);
        this.drawOverlay(chunk);
        this.drawFog(chunk);
        this.chunks.push(chunk);
      }
    }
  }

  private drawTerrain(chunk: Chunk) {
    const { map, content, starts, playerOrder } = this.data!;
    const g = chunk.terrain;
    const startOwner = new Map(Object.entries(starts).map(([p, t]) => [t, p]));
    for (const i of chunk.tiles) {
      const t = map.tiles[i]!;
      const col = i % map.width;
      const row = Math.floor(i / map.width);
      const [cx, cy] = tileCenter(col, row);
      const terrain = content.entities.terrain[t.terrain]!;
      let base = hex(terrain.color);
      if (t.elevation === 'hills') base = shade(base, 0.86);
      if (t.elevation === 'mountain') base = shade(base, 0.62);
      g.poly(hexPoints(cx, cy, HEX + 0.6)).fill(base);

      if (t.elevation === 'hills') {
        const bump = shade(base, 0.78);
        // Each arc needs its own starting point, or Pixi joins it to the previous shape.
        for (const [x, y, r] of [
          [cx - 9, cy + 6, 9],
          [cx + 8, cy - 4, 8],
        ] as [number, number, number][]) {
          g.moveTo(x - r, y)
            .arc(x, y, r, Math.PI, 0)
            .stroke({ width: 3, color: bump });
        }
      } else if (t.elevation === 'mountain') {
        g.poly([cx - 18, cy + 12, cx - 3, cy - 16, cx + 12, cy + 12]).fill(0x7d8288);
        g.poly([cx - 3, cy - 16, cx - 8, cy - 7, cx + 2, cy - 7]).fill(0xe9edf0);
        g.poly([cx + 2, cy + 12, cx + 12, cy - 6, cx + 22, cy + 12]).fill(0x6b7076);
      }

      if (t.feature !== null) this.drawFeature(g, t.feature, cx, cy);

      for (const [d, bit] of [
        [0, 1],
        [4, 2],
        [5, 4],
      ] as const) {
        if ((t.river & bit) === 0) continue;
        const [a, b] = EDGE_CORNERS[d]!;
        const [x1, y1] = corner(cx, cy, a);
        const [x2, y2] = corner(cx, cy, b);
        g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 5, color: RIVER, cap: 'round' });
      }

      const player = startOwner.get(i);
      if (player !== undefined) {
        const color = PLAYER_COLORS[playerOrder.indexOf(player) % PLAYER_COLORS.length]!;
        g.circle(cx, cy, 13).fill(0x0b1620).circle(cx, cy, 11).fill(color);
        g.poly(star(cx, cy, 7, 3)).fill(0x0b1620);
      }
    }
  }

  private drawFeature(g: Graphics, id: string, cx: number, cy: number) {
    const f = this.data!.content.entities.feature[id];
    const color = f?.color ? hex(f.color) : 0x355e3b;
    switch (id) {
      case 'woods':
        for (const [dx, dy] of [
          [-12, 4],
          [0, -8],
          [11, 5],
        ] as [number, number][]) {
          g.poly([cx + dx - 7, cy + dy + 8, cx + dx, cy + dy - 8, cx + dx + 7, cy + dy + 8]).fill(
            color,
          );
        }
        break;
      case 'rainforest':
        for (const [dx, dy] of [
          [-11, -4],
          [2, -11],
          [11, 2],
          [-3, 9],
          [-14, 10],
        ] as [number, number][]) {
          g.circle(cx + dx, cy + dy, 6).fill(color);
        }
        break;
      case 'marsh':
        for (const dy of [-8, 0, 8]) {
          g.moveTo(cx - 13, cy + dy)
            .lineTo(cx + 13, cy + dy)
            .stroke({ width: 2, color });
        }
        break;
      case 'ice':
        g.poly(hexPoints(cx, cy, HEX - 2)).fill({ color, alpha: 0.85 });
        break;
      case 'oasis':
        g.circle(cx, cy + 3, 9).fill(color);
        g.circle(cx + 8, cy - 7, 5).fill(0x3e8e4a);
        break;
      case 'reef':
        for (const [dx, dy] of [
          [-9, -6],
          [6, -9],
          [10, 6],
          [-4, 8],
        ] as [number, number][]) {
          g.circle(cx + dx, cy + dy, 4).fill(color);
        }
        break;
      default:
        if (id.startsWith('floodplains')) {
          for (const dy of [-6, 4]) {
            g.moveTo(cx - 15, cy + dy)
              .lineTo(cx + 15, cy + dy)
              .stroke({ width: 3, color, alpha: 0.9 });
          }
        } else {
          for (const [dx, dy] of [
            [-8, -6],
            [8, -6],
            [0, 8],
          ] as [number, number][]) {
            g.circle(cx + dx, cy + dy, 5).fill(color);
          }
        }
    }
  }

  private drawOverlay(chunk: Chunk) {
    const { map, content } = this.data!;
    const g = chunk.overlay;
    g.clear();
    for (const child of chunk.labels.removeChildren()) child.destroy();
    const rivers = map.tiles.map((t) => t.river);
    for (const i of chunk.tiles) {
      const t = map.tiles[i]!;
      const [cx, cy] = tileCenter(i % map.width, Math.floor(i / map.width));
      if (this.options.grid)
        g.poly(hexPoints(cx, cy)).stroke({ width: 1, color: 0x000000, alpha: 0.18 });

      if (t.resource !== null) {
        const r = content.entities.resource[t.resource]!;
        g.circle(cx + 14, cy + 14, 9)
          .fill(0x0b1620)
          .circle(cx + 14, cy + 14, 7.5)
          .fill(RESOURCE_COLORS[r.class]);
        const label = new Text({
          text: resolveText(content, r.name).slice(0, 2),
          style: {
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 9,
            fontWeight: '600',
            fill: 0x0b1620,
          },
        });
        label.anchor.set(0.5);
        label.position.set(cx + 14, cy + 14);
        chunk.labels.addChild(label);
      }

      if (this.options.yields) {
        const total = computeTileYields({
          content,
          tile: { ...t, river: isOnRiver(map, rivers, i), ownerId: null },
          neighbors: [],
          playerId: '',
        }).total;
        const pips: number[] = [];
        for (const [id, color] of YIELD_PIPS) {
          for (let k = 0; k < Math.floor((total[id] ?? 0) / 100); k++) pips.push(color);
        }
        const shown = pips.slice(0, 8);
        shown.forEach((color, k) => {
          const x = cx - ((shown.length - 1) * 7) / 2 + k * 7;
          g.circle(x, cy - 15, 3.6)
            .fill(0x0b1620)
            .circle(x, cy - 15, 2.8)
            .fill(color);
        });
      }
    }
  }

  private drawFog(chunk: Chunk) {
    const { map, starts } = this.data!;
    const g = chunk.fog;
    g.clear();
    const viewer = this.options.viewer;
    if (viewer === null || starts[viewer] === undefined) return;
    const visible = new Set(tilesWithin(map, starts[viewer]!, 3));
    for (const i of chunk.tiles) {
      if (visible.has(i)) continue;
      const [cx, cy] = tileCenter(i % map.width, Math.floor(i / map.width));
      g.poly(hexPoints(cx, cy, HEX + 0.8)).fill(0x05090d);
    }
  }

  // --- Camera --------------------------------------------------------------------------------

  private minZoom() {
    // Never zoom out so far that the wrapped world would need to show twice side by side.
    return Math.max(
      0.12,
      this.app.screen.width / this.worldW,
      this.app.screen.height / (this.worldH * 1.6),
    );
  }

  private updateCamera() {
    if (!this.data) return;
    const { width, height } = this.app.screen;
    const cam = this.cam;
    cam.zoom = Math.min(3, Math.max(this.minZoom(), cam.zoom));
    if (this.data.map.wrapX) cam.x = ((cam.x % this.worldW) + this.worldW) % this.worldW;
    else cam.x = Math.min(this.worldW, Math.max(0, cam.x));
    const halfH = height / 2 / cam.zoom;
    cam.y =
      this.worldH > 2 * halfH
        ? Math.min(this.worldH - halfH, Math.max(halfH, cam.y))
        : this.worldH / 2;

    this.world.scale.set(cam.zoom);
    this.world.position.set(width / 2 - cam.x * cam.zoom, height / 2 - cam.y * cam.zoom);
    const view = {
      x0: cam.x - width / 2 / cam.zoom,
      x1: cam.x + width / 2 / cam.zoom,
      y0: cam.y - halfH,
      y1: cam.y + halfH,
    };
    const showLabels = cam.zoom >= 0.55;
    for (const c of this.chunks) {
      // Put each chunk in the copy of the world nearest the camera (east-west wrap).
      let shift = 0;
      if (this.data.map.wrapX) {
        const mid = (c.x0 + c.x1) / 2;
        shift = Math.round((cam.x - mid) / this.worldW) * this.worldW;
      }
      c.container.x = shift;
      c.container.visible =
        c.x1 + shift >= view.x0 && c.x0 + shift <= view.x1 && c.y1 >= view.y0 && c.y0 <= view.y1;
      c.labels.visible = showLabels;
    }
  }

  private zoomAt(sx: number, sy: number, factor: number) {
    const { width, height } = this.app.screen;
    const before = this.screenToWorld(sx, sy);
    this.cam.zoom = Math.min(3, Math.max(this.minZoom(), this.cam.zoom * factor));
    this.cam.x = before.x - (sx - width / 2) / this.cam.zoom;
    this.cam.y = before.y - (sy - height / 2) / this.cam.zoom;
  }

  private screenToWorld(sx: number, sy: number) {
    const { width, height } = this.app.screen;
    return {
      x: this.cam.x + (sx - width / 2) / this.cam.zoom,
      y: this.cam.y + (sy - height / 2) / this.cam.zoom,
    };
  }

  private tileUnder(sx: number, sy: number): number | undefined {
    if (!this.data) return undefined;
    const { x, y } = this.screenToWorld(sx, sy);
    const map = this.data.map;
    const wx = map.wrapX ? ((x % this.worldW) + this.worldW) % this.worldW : x;
    const hit = tileAt(wx, y, map);
    return hit ? hit.row * map.width + hit.col : undefined;
  }

  private stepKeys() {
    const speed = 12 / this.cam.zoom;
    if (this.keys.has('ArrowLeft') || this.keys.has('a')) this.cam.x -= speed;
    if (this.keys.has('ArrowRight') || this.keys.has('d')) this.cam.x += speed;
    if (this.keys.has('ArrowUp') || this.keys.has('w')) this.cam.y -= speed;
    if (this.keys.has('ArrowDown') || this.keys.has('s')) this.cam.y += speed;
  }

  private bindInput(canvas: HTMLCanvasElement) {
    canvas.style.touchAction = 'none';
    const local = (e: PointerEvent | WheelEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const on = <K extends keyof HTMLElementEventMap>(
      target: HTMLElement | Window,
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
    ) => {
      target.addEventListener(type, fn as EventListener, { passive: false });
      this.cleanup.push(() => target.removeEventListener(type, fn as EventListener));
    };

    on(canvas, 'pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      const p = local(e);
      this.pointers.set(e.pointerId, p);
      if (this.pointers.size === 1) this.drag = { ...p, moved: false };
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch = { distance: Math.hypot(a!.x - b!.x, a!.y - b!.y), zoom: this.cam.zoom };
        this.drag = undefined;
      }
    });
    on(canvas, 'pointermove', (e) => {
      const p = local(e);
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, p);
      if (this.pinch && this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        const target = (this.pinch.zoom * d) / this.pinch.distance;
        this.zoomAt((a!.x + b!.x) / 2, (a!.y + b!.y) / 2, target / this.cam.zoom);
        return;
      }
      if (this.drag) {
        const dx = p.x - this.drag.x;
        const dy = p.y - this.drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) this.drag.moved = true;
        if (this.drag.moved) {
          this.cam.x -= dx / this.cam.zoom;
          this.cam.y -= dy / this.cam.zoom;
          this.drag.x = p.x;
          this.drag.y = p.y;
        }
        return;
      }
      if (e.pointerType === 'mouse') this.onHover(this.tileUnder(p.x, p.y));
    });
    const end = (e: PointerEvent) => {
      const p = local(e);
      const wasDrag = this.drag?.moved ?? true;
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = undefined;
      if (this.pointers.size === 0) {
        if (!wasDrag && e.type === 'pointerup') this.onSelect(this.tileUnder(p.x, p.y));
        this.drag = undefined;
      }
    };
    on(canvas, 'pointerup', end);
    on(canvas, 'pointercancel', end);
    on(canvas, 'pointerleave', (e) => {
      if (e.pointerType === 'mouse') this.onHover(undefined);
    });
    on(canvas, 'wheel', (e) => {
      e.preventDefault();
      const p = local(e);
      this.zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015));
    });
    on(window, 'keydown', (e) => {
      if ((e.target as HTMLElement)?.closest?.('input, select, textarea')) return;
      if (e.key === '+' || e.key === '=') this.zoomBy(1.2);
      else if (e.key === '-') this.zoomBy(1 / 1.2);
      else this.keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    });
    on(window, 'keyup', (e) => this.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
    on(window, 'blur', () => this.keys.clear());
  }
}

function star(cx: number, cy: number, outer: number, inner: number): number[] {
  const pts: number[] = [];
  for (let k = 0; k < 10; k++) {
    const r = k % 2 === 0 ? outer : inner;
    const a = (Math.PI / 5) * k - Math.PI / 2;
    pts.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  return pts;
}
