import { resolveText } from '@cx/content';
import { computeTileYields, isOnRiver, neighbor, NO_TILE, tilesWithin } from '@cx/engine';
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

import {
  type MapRenderer,
  type MapViewData,
  type MapViewOptions,
  type PathView,
  PLAYER_COLORS,
  type SettlementView,
  type TerritoryView,
  type TileHighlight,
  type UnitView,
} from './renderer';

export type { MapViewData, MapViewOptions };

interface Chunk {
  container: Container;
  terrain: Graphics;
  /** Borders, territory tint and improvements. */
  territory: Graphics;
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
export class MapView implements MapRenderer {
  private app = new Application();
  private world = new Container();
  private chunks: Chunk[] = [];
  private data: MapViewData | undefined;
  private options: MapViewOptions = { grid: true, yields: false, viewer: null, quality: 'medium' };
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
  private gameFog: Uint8Array | null = null;
  /** Units and path preview, drawn above the map in the world copy nearest the camera. */
  private overlay = new Container();
  private unitTokens = new Map<string, { node: Container; view: UnitView; baseX: number }>();
  private selectedUnit: string | null = null;
  private pathLayer = new Graphics();
  private pathLabels = new Container();
  private pathOrigin = 0;
  private settlementData: { views: SettlementView[]; territory: TerritoryView } | undefined;
  /** Settlement badges and choice highlights, each with its unwrapped x. */
  private markers: { node: Container; baseX: number }[] = [];
  private highlightMarkers: { node: Container; baseX: number }[] = [];

  onHover: (tile: number | undefined) => void = () => {};
  onSelect: (tile: number | undefined) => void = () => {};
  onCommand: (tile: number) => void = () => {};
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
    this.overlay.addChild(this.pathLayer, this.pathLabels);
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
    this.drawSettlements();
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
  setFog(fog: Uint8Array | null) {
    this.gameFog = fog;
    if (this.data) {
      for (const c of this.chunks) {
        this.drawFog(c);
        this.drawTerritory(c);
      }
      this.drawSettlements();
    }
  }

  setSettlements(views: SettlementView[], territory: TerritoryView) {
    this.settlementData = { views, territory };
    void this.ready.then(() => {
      if (!this.data) return;
      for (const c of this.chunks) this.drawTerritory(c);
      this.drawSettlements();
    });
  }

  setHighlights(highlights: TileHighlight[]) {
    void this.ready.then(() => {
      for (const m of this.highlightMarkers) m.node.destroy({ children: true });
      this.highlightMarkers = [];
      if (!this.data) return;
      const tones = { develop: 0x9fd36a, buy: 0xd4a94e, worked: 0xe8dcc0, selected: 0xe6c070 };
      for (const h of highlights) {
        const node = new Container();
        const [cx, cy] = tileCenter(
          h.tile % this.data.map.width,
          Math.floor(h.tile / this.data.map.width),
        );
        const g = new Graphics();
        if (h.tone === 'worked') g.circle(0, -12, 4).fill(tones.worked);
        else g.poly(hexPoints(0, 0, HEX - 3)).stroke({ width: 3, color: tones[h.tone] });
        node.addChild(g);
        if (h.label && h.tone !== 'worked') {
          const t = new Text({
            text: h.label,
            style: {
              fontFamily: 'IBM Plex Sans, sans-serif',
              fontSize: 10,
              fontWeight: '600',
              fill: 0xf0e6cc,
            },
          });
          t.anchor.set(0.5);
          t.position.set(0, -2);
          const bg = new Graphics()
            .roundRect(-t.width / 2 - 4, -10, t.width + 8, 16, 4)
            .fill({ color: 0x0e141b, alpha: 0.88 });
          node.addChild(bg, t);
        }
        node.position.set(cx, cy);
        this.overlay.addChild(node);
        this.highlightMarkers.push({ node, baseX: cx });
      }
      if (this.overlay.parent !== this.world) this.world.addChild(this.overlay);
    });
  }

  private drawSettlements() {
    for (const m of this.markers) m.node.destroy({ children: true });
    this.markers = [];
    const d = this.settlementData;
    if (!d || !this.data) return;
    const w = this.data.map.width;
    for (const view of d.views) {
      const fog = this.gameFog?.[view.tile] ?? 2;
      if (fog === 0) continue;
      const [cx, cy] = tileCenter(view.tile % w, Math.floor(view.tile / w));
      const node = new Container();
      const g = new Graphics();
      // A small walled town: houses inside a ring in the owner's color.
      g.circle(0, 0, 15).fill(0x10161d).circle(0, 0, 15).stroke({ width: 3, color: view.color });
      g.poly([-8, 1, 0, -7, 8, 1, 8, 8, -8, 8]).fill(view.kind === 'city' ? 0xe0d2b0 : 0xb8a888);
      if (view.capital) g.star(0, -11, 5, 4.5, 2).fill(0xd4a94e);
      const label = new Text({
        text: `${view.population}  ${view.name}`,
        style: { fontFamily: 'Marcellus SC, Georgia, serif', fontSize: 12, fill: 0xf0e6cc },
      });
      label.anchor.set(0.5, 0);
      label.position.set(0, 19);
      const bg = new Graphics()
        .roundRect(-label.width / 2 - 6, 17, label.width + 12, 18, 5)
        .fill({ color: 0x0e141b, alpha: 0.9 })
        .roundRect(-label.width / 2 - 6, 17, label.width + 12, 18, 5)
        .stroke({ width: 1.5, color: view.mine ? 0xd4a94e : view.color });
      node.addChild(g, bg, label);
      if (fog === 1) node.alpha = 0.6;
      node.position.set(cx, cy);
      this.overlay.addChildAt(node, 0);
      this.markers.push({ node, baseX: cx });
    }
    if (this.overlay.parent !== this.world) this.world.addChild(this.overlay);
  }

  private drawTerritory(chunk: Chunk) {
    const g = chunk.territory;
    g.clear();
    const d = this.settlementData;
    if (!d || !this.data) return;
    const { map } = this.data;
    const byId = new Map(d.views.map((v) => [v.id, v]));
    const ownerOf = (t: number) => {
      const sid = d.territory.settlement[t];
      return sid ? (byId.get(sid)?.owner ?? null) : null;
    };
    for (const i of chunk.tiles) {
      const fog = this.gameFog?.[i] ?? 2;
      if (fog === 0) continue;
      const sid = d.territory.settlement[i];
      const view = sid ? byId.get(sid) : undefined;
      const [cx, cy] = tileCenter(i % map.width, Math.floor(i / map.width));
      const model = d.territory.improvements[i];
      if (model) this.drawImprovement(g, model, cx, cy);
      if (!view) continue;
      g.poly(hexPoints(cx, cy, HEX)).fill({ color: view.color, alpha: 0.12 });
      for (let dir = 0; dir < 6; dir++) {
        const n = neighbor(map, i, dir as 0 | 1 | 2 | 3 | 4 | 5);
        if (n !== NO_TILE && ownerOf(n) === view.owner) continue;
        const [a, b] = EDGE_CORNERS[dir]!;
        const [x1, y1] = corner(cx, cy, a, HEX - 2.5);
        const [x2, y2] = corner(cx, cy, b, HEX - 2.5);
        g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 3.5, color: view.color, cap: 'round' });
      }
    }
  }

  private drawImprovement(g: Graphics, model: string, cx: number, cy: number) {
    const x = cx - 13;
    const y = cy + 11;
    switch (model) {
      case 'farm':
        for (const dy of [-4, 0, 4])
          g.moveTo(x - 7, y + dy)
            .lineTo(x + 7, y + dy)
            .stroke({ width: 2, color: 0xc9a74a });
        break;
      case 'mine':
        g.poly([x - 7, y + 5, x, y - 6, x + 7, y + 5])
          .fill(0x2a2622)
          .stroke({ width: 1.5, color: 0x8a6a44 });
        break;
      case 'quarry':
        g.rect(x - 7, y - 3, 6, 6)
          .fill(0xbdb5a2)
          .rect(x + 1, y - 1, 6, 6)
          .fill(0xa8a090);
        break;
      case 'pasture':
        g.rect(x - 7, y - 5, 14, 10)
          .stroke({ width: 1.5, color: 0x8a6a44 })
          .circle(x, y, 2.5)
          .fill(0xe8e2d4);
        break;
      case 'plantation':
        for (const dx of [-5, 0, 5]) g.circle(x + dx, y, 2.6).fill(0x4f8a34);
        break;
      case 'camp':
        g.poly([x - 6, y + 5, x, y - 6, x + 6, y + 5]).fill(0xa08a62);
        break;
      case 'boats':
        g.poly([x - 7, y, x + 7, y, x + 4, y + 4, x - 4, y + 4])
          .fill(0x6b4a2e)
          .moveTo(x, y)
          .lineTo(x, y - 8)
          .stroke({ width: 1.5, color: 0xd8d0bc });
        break;
      case 'woodcutter':
        g.roundRect(x - 7, y - 4, 14, 3.5, 1.5)
          .fill(0x7a5236)
          .roundRect(x - 6, y + 1, 12, 3.5, 1.5)
          .fill(0x6b4a2e);
        break;
      default:
        g.circle(x, y, 3).fill(0xb8914a);
    }
  }

  setUnits(units: UnitView[]) {
    void this.ready.then(() => {
      if (!this.data) return;
      const keep = new Set(units.map((u) => u.id));
      for (const [id, t] of this.unitTokens) {
        if (!keep.has(id)) {
          t.node.destroy({ children: true });
          this.unitTokens.delete(id);
        }
      }
      for (const view of units) {
        this.unitTokens.get(view.id)?.node.destroy({ children: true });
        const node = new Container();
        const color = view.color;
        const g = new Graphics();
        g.circle(0, 0, 13).fill(0x0b1620);
        g.circle(0, 0, 11).fill(color);
        if (view.id === this.selectedUnit) g.circle(0, 0, 16).stroke({ width: 3, color: 0xe6c070 });
        if (view.needsOrders) g.circle(10, -10, 4).fill(0xd4a94e);
        const label = new Text({
          text: view.icon,
          style: {
            fontFamily: 'IBM Plex Sans, sans-serif',
            fontSize: 11,
            fontWeight: '700',
            fill: view.accent,
          },
        });
        label.anchor.set(0.5);
        node.addChild(g, label);
        const [cx, cy] = tileCenter(
          view.tile % this.data.map.width,
          Math.floor(view.tile / this.data.map.width),
        );
        const dx = view.layer === 'civilian' ? 11 : view.layer === 'support' ? 0 : -9;
        node.position.set(cx + dx, cy + (view.layer === 'support' ? 12 : 0));
        this.overlay.addChild(node);
        this.unitTokens.set(view.id, { node, view, baseX: node.x });
      }
      if (this.overlay.parent !== this.world) this.world.addChild(this.overlay);
    });
  }

  setSelected(unit: string | null) {
    this.selectedUnit = unit;
    this.setUnits([...this.unitTokens.values()].map((t) => t.view));
  }

  setPath(path: PathView | null, from: number | null) {
    void this.ready.then(() => {
      const g = this.pathLayer;
      g.clear();
      for (const child of this.pathLabels.removeChildren()) child.destroy();
      if (!this.data || !path || from === null) return;
      const w = this.data.map.width;
      const near = (x: number, ref: number) =>
        this.data!.map.wrapX ? x + Math.round((ref - x) / this.worldW) * this.worldW : x;
      const [fx, fy] = tileCenter(from % w, Math.floor(from / w));
      let px = fx;
      this.pathOrigin = fx;
      g.moveTo(fx, fy);
      const points: [number, number, (typeof path.steps)[number]][] = [];
      for (const step of path.steps) {
        const [x0, y] = tileCenter(step.tile % w, Math.floor(step.tile / w));
        const x = near(x0, px);
        g.lineTo(x, y);
        points.push([x, y, step]);
        px = x;
      }
      g.stroke({ width: 3, color: 0xe6c070, alpha: 0.8 });
      points.forEach(([x, y, step], i) => {
        const final = i === points.length - 1;
        if (!step.endsTurn && !final) {
          g.circle(x, y, 4).fill(step.turn === 0 ? 0xe6c070 : 0x9fb0bf);
          return;
        }
        g.circle(x, y, 11)
          .fill(final ? 0xd4a94e : 0x10161d)
          .circle(x, y, 11)
          .stroke({ width: 2, color: 0xd4a94e });
        const t = new Text({
          text: String(step.turn + 1),
          style: {
            fontFamily: 'IBM Plex Sans, sans-serif',
            fontSize: 12,
            fontWeight: '700',
            fill: final ? 0x10161d : 0xecdcb4,
          },
        });
        t.anchor.set(0.5);
        t.position.set(x, y);
        this.pathLabels.addChild(t);
      });
    });
  }

  focusTile(tile: number, close = false) {
    if (!this.data) return;
    const [x, y] = tileCenter(tile % this.data.map.width, Math.floor(tile / this.data.map.width));
    this.cam.x = x;
    this.cam.y = y;
    this.cam.zoom = Math.max(this.cam.zoom, close ? 1.1 : 0.6);
  }

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
    for (const c of this.chunks) {
      c.container.destroy({ children: true });
      c.fog.destroy();
    }
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
          territory: new Graphics(),
          overlay: new Graphics(),
          labels: new Container(),
          fog: new Graphics(),
          x0: HEX_W * c0,
          y0: ROW_H * r0,
          x1: HEX_W * (Math.min(c0 + CHUNK, map.width) + 0.5),
          y1: ROW_H * Math.min(r0 + CHUNK, map.height) + HEX,
          tiles,
        };
        container.addChild(chunk.terrain, chunk.territory, chunk.overlay, chunk.labels);
        this.world.addChild(container);
        this.drawTerrain(chunk);
        this.drawTerritory(chunk);
        this.drawOverlay(chunk);
        this.drawFog(chunk);
        this.chunks.push(chunk);
      }
    }
    // Fog goes above every chunk's terrain: river strokes and hex edges spill a little into
    // neighbouring chunks and must not show through it.
    for (const c of this.chunks) this.world.addChild(c.fog);
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
    if (this.gameFog) {
      for (const i of chunk.tiles) {
        const v = this.gameFog[i];
        if (v === 2) continue;
        const [cx, cy] = tileCenter(i % map.width, Math.floor(i / map.width));
        if (v === 0) g.poly(hexPoints(cx, cy, HEX + 0.8)).fill(0x05090d);
        else g.poly(hexPoints(cx, cy, HEX + 0.8)).fill({ color: 0x0b1118, alpha: 0.55 });
      }
      return;
    }
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
      c.fog.x = shift;
      c.fog.visible = c.container.visible;
    }
    // Units and the path preview follow the same east-west wrap.
    const near = (x: number) =>
      this.data!.map.wrapX ? Math.round((cam.x - x) / this.worldW) * this.worldW : 0;
    for (const t of this.unitTokens.values()) t.node.x = t.baseX + near(t.baseX);
    for (const m of this.markers) m.node.x = m.baseX + near(m.baseX);
    for (const m of this.highlightMarkers) m.node.x = m.baseX + near(m.baseX);
    this.pathLayer.x = near(this.pathOrigin);
    this.pathLabels.x = this.pathLayer.x;
    if (this.overlay.parent === this.world)
      this.world.setChildIndex(this.overlay, this.world.children.length - 1);
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
        if (!wasDrag && e.type === 'pointerup' && e.button !== 2)
          this.onSelect(this.tileUnder(p.x, p.y));
        this.drag = undefined;
      }
    };
    on(canvas, 'pointerup', end);
    on(canvas, 'contextmenu', (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const t = this.tileUnder(e.clientX - rect.left, e.clientY - rect.top);
      if (t !== undefined) this.onCommand(t);
    });
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
