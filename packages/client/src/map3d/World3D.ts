import { resolveText } from '@cx/content';
import { tilesWithin } from '@cx/engine';
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DataTexture,
  DoubleSide,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
  Matrix4,
  Mesh,
  MeshToonMaterial,
  NearestFilter,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  RedFormat,
  Scene,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  type MapRenderer,
  type MapViewData,
  type MapViewOptions,
  PLAYER_COLORS,
  previewVisibility,
  type Quality,
} from '../map/renderer';
import { center3, type Sample, TerrainSampler } from './sampler';
import {
  paintPassFragment,
  paintPassVertex,
  terrainFragment,
  terrainVertex,
  waterFragment,
  waterVertex,
} from './shaders';

const CHUNK_W = 8 * Math.sqrt(3);
const CHUNK_H = 12;
const MARGIN = 6; // ocean drawn beyond the top/bottom edges so the map doesn't end abruptly
const FOV = 35;
const HAZE = 0x9db6c6;

const QUALITY: Record<
  Quality,
  { step: number; waterStep: number; pixelRatio: number; trees: number; paint: boolean }
> = {
  low: { step: 0.34, waterStep: 0.5, pixelRatio: 0.85, trees: 2, paint: false },
  medium: { step: 0.24, waterStep: 0.38, pixelRatio: 1.5, trees: 3, paint: false },
  high: { step: 0.18, waterStep: 0.3, pixelRatio: 2, trees: 4, paint: true },
};

interface Chunk {
  group: Group;
  midX: number;
  midZ: number;
  terrainTiles: Int32Array;
  terrainVis: BufferAttribute;
  waterTiles: Int32Array;
  waterVis: BufferAttribute;
  /** Tiles whose centers fall in this chunk. */
  tiles: number[];
  trees: InstancedMesh[];
  treeTiles: number[][];
  clouds: InstancedMesh | undefined;
  sprites: { sprite: Sprite; tile: number }[];
  grid: LineSegments;
}

/** Merging needs every part non-indexed; some primitives (icosahedrons) already are. */
const flat = (g: BufferGeometry) => (g.index ? g.toNonIndexed() : g);

function toonGradient(): DataTexture {
  const tex = new DataTexture(new Uint8Array([90, 170, 255]), 3, 1, RedFormat);
  tex.minFilter = NearestFilter;
  tex.magFilter = NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Painterly 3D map renderer (docs/10-art-direction.md). Same interface as the 2D MapView. */
export class World3D implements MapRenderer {
  onHover: (tile: number | undefined) => void = () => {};
  onSelect: (tile: number | undefined) => void = () => {};
  onFps: (fps: number) => void = () => {};

  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(FOV, 1, 0.5, 400);
  private uniforms = {
    uTime: { value: 0 },
    uLightDir: { value: new Vector3(-0.45, 0.8, 0.35).normalize() },
    uHaze: { value: new Color(HAZE) },
    uCloud: { value: new Color(0xdfe3ea) },
    uShallow: { value: new Color(0x6fd0c4) },
    uCoast: { value: new Color(0x3a9cc0) },
    uDeep: { value: new Color(0x2a66a6) },
    uAbyss: { value: new Color(0x1d4580) },
    uFoam: { value: new Color(0xf7f3e6) },
  };
  private terrainMaterial = new ShaderMaterial({
    vertexShader: terrainVertex,
    fragmentShader: terrainFragment,
    uniforms: this.uniforms,
  });
  private waterMaterial = new ShaderMaterial({
    vertexShader: waterVertex,
    fragmentShader: waterFragment,
    uniforms: this.uniforms,
  });
  private gradient = toonGradient();
  private treeMaterial = new MeshToonMaterial({ gradientMap: this.gradient, vertexColors: true });
  private cloudMaterial = new MeshToonMaterial({ gradientMap: this.gradient, color: 0xf2f0ea });
  private gridMaterial = new LineBasicMaterial({
    color: 0x1a1a10,
    transparent: true,
    opacity: 0.22,
  });
  private highlight = new LineLoop(
    new BufferGeometry(),
    new LineBasicMaterial({ color: 0xd4a94e }),
  );
  private world = new Group();
  private chunks: Chunk[] = [];
  private data: MapViewData | undefined;
  private sampler: TerrainSampler | undefined;
  private options: MapViewOptions = { grid: true, yields: false, viewer: null, quality: 'medium' };
  private visibility: Uint8Array = new Uint8Array(0);
  private target = new Vector3();
  private dist = 30;
  private worldW = 1;
  private worldH = 1;
  private raf = 0;
  private resize: ResizeObserver;
  private cleanup: (() => void)[] = [];
  private paint: {
    target: WebGLRenderTarget;
    scene: Scene;
    camera: PerspectiveCamera;
    material: ShaderMaterial;
  };
  private spriteCache = new Map<string, SpriteMaterial>();

  constructor(private host: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setClearColor(HAZE);
    this.scene.background = new Color(HAZE);
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';

    const sun = new DirectionalLight(0xfff1d6, 2.4);
    sun.position.copy(this.uniforms.uLightDir.value).multiplyScalar(50);
    this.scene.add(sun, new HemisphereLight(0xcfe3ff, 0x6a5a40, 1.3), this.world);
    this.highlight.renderOrder = 10;
    this.scene.add(this.highlight);

    const material = new ShaderMaterial({
      vertexShader: paintPassVertex,
      fragmentShader: paintPassFragment,
      uniforms: { tScene: { value: null }, uTexel: { value: new Vector2() } },
      depthTest: false,
    });
    const quadScene = new Scene();
    quadScene.add(new Mesh(new PlaneGeometry(2, 2), material));
    this.paint = {
      target: new WebGLRenderTarget(1, 1),
      scene: quadScene,
      camera: new PerspectiveCamera(),
      material,
    };

    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(host);
    this.fit();
    this.bindInput(this.renderer.domElement);
    this.loop();
  }

  async setData(data: MapViewData, options: MapViewOptions) {
    const sameSize =
      this.data &&
      this.data.map.width === data.map.width &&
      this.data.map.height === data.map.height;
    this.data = data;
    this.options = options;
    this.sampler = new TerrainSampler(data.map, data.content);
    [this.worldW, this.worldH] = [this.sampler.width, this.sampler.depth];
    this.visibility = previewVisibility(data, options.viewer, (c, r) =>
      tilesWithin(data.map, c, r),
    );
    this.applyPixelRatio();
    this.build();
    if (!sameSize) this.focusPlayer(data.playerOrder[0]);
  }

  async setOptions(options: MapViewOptions) {
    const prev = this.options;
    this.options = options;
    if (!this.data) return;
    if (options.quality !== prev.quality) {
      this.applyPixelRatio();
      this.build();
      return;
    }
    if (options.viewer !== prev.viewer) {
      this.visibility = previewVisibility(this.data, options.viewer, (c, r) =>
        tilesWithin(this.data!.map, c, r),
      );
      for (const c of this.chunks) this.applyVisibility(c);
    }
    if (options.grid !== prev.grid) for (const c of this.chunks) c.grid.visible = options.grid;
  }

  focusPlayer(player: string | undefined) {
    if (!this.data || player === undefined) return;
    const tile = this.data.starts[player];
    if (tile === undefined) return;
    const [x, z] = center3(tile % this.data.map.width, Math.floor(tile / this.data.map.width));
    this.target.set(x, 0, z);
    this.dist = Math.min(this.dist, 26);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.resize.disconnect();
    for (const fn of this.cleanup) fn();
    this.clearChunks();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // --- Building ------------------------------------------------------------------------------

  private clearChunks() {
    for (const c of this.chunks) {
      c.group.traverse((o) => {
        if (o instanceof Mesh || o instanceof LineSegments) o.geometry.dispose();
      });
      this.world.remove(c.group);
    }
    this.chunks = [];
  }

  private build() {
    const { map } = this.data!;
    const q = QUALITY[this.options.quality];
    this.clearChunks();
    const tilesByChunk = new Map<string, number[]>();
    const key = (cx: number, cz: number) => `${cx},${cz}`;
    map.tiles.forEach((_, i) => {
      const [x, z] = center3(i % map.width, Math.floor(i / map.width));
      const k = key(Math.floor(x / CHUNK_W), Math.floor((z + MARGIN) / CHUNK_H));
      const list = tilesByChunk.get(k) ?? [];
      list.push(i);
      tilesByChunk.set(k, list);
    });
    const nx = Math.ceil(this.worldW / CHUNK_W);
    const nz = Math.ceil((this.worldH + 2 * MARGIN) / CHUNK_H);
    for (let cz = 0; cz < nz; cz++) {
      for (let cx = 0; cx < nx; cx++) {
        const x0 = cx * CHUNK_W;
        const x1 = Math.min(this.worldW, (cx + 1) * CHUNK_W);
        const z0 = cz * CHUNK_H - MARGIN;
        const z1 = Math.min(this.worldH + MARGIN, (cz + 1) * CHUNK_H - MARGIN);
        this.chunks.push(this.buildChunk(x0, x1, z0, z1, tilesByChunk.get(key(cx, cz)) ?? [], q));
      }
    }
    for (const c of this.chunks) this.applyVisibility(c);
  }

  private grid(x0: number, x1: number, z0: number, z1: number, step: number) {
    const nx = Math.max(2, Math.ceil((x1 - x0) / step) + 1);
    const nz = Math.max(2, Math.ceil((z1 - z0) / step) + 1);
    const index: number[] = [];
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i;
        index.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1);
      }
    }
    return { nx, nz, index, sx: (x1 - x0) / (nx - 1), sz: (z1 - z0) / (nz - 1) };
  }

  private buildChunk(
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    tiles: number[],
    q: (typeof QUALITY)[Quality],
  ): Chunk {
    const sampler = this.sampler!;
    const sample: Sample = { height: 0, color: new Color() };
    const group = new Group();

    // Terrain.
    const g = this.grid(x0, x1, z0, z1, q.step);
    const count = g.nx * g.nz;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const terrainTiles = new Int32Array(count);
    for (let j = 0; j < g.nz; j++) {
      for (let i = 0; i < g.nx; i++) {
        const k = j * g.nx + i;
        const x = x0 + i * g.sx;
        const z = z0 + j * g.sz;
        sampler.sample(x, z, sample);
        pos.set([x, sample.height, z], k * 3);
        col.set([sample.color.r, sample.color.g, sample.color.b], k * 3);
        terrainTiles[k] = sampler.tileAt(this.wrapX(x), z) ?? -1;
      }
    }
    const terrain = new BufferGeometry();
    terrain.setAttribute('position', new BufferAttribute(pos, 3));
    terrain.setAttribute('aColor', new BufferAttribute(col, 3));
    const terrainVis = new BufferAttribute(new Float32Array(count), 1);
    terrain.setAttribute('aVis', terrainVis);
    terrain.setIndex(g.index);
    terrain.computeVertexNormals();
    const terrainMesh = new Mesh(terrain, this.terrainMaterial);
    terrainMesh.frustumCulled = false;
    group.add(terrainMesh);

    // Water.
    const w = this.grid(x0, x1, z0, z1, q.waterStep);
    const wCount = w.nx * w.nz;
    const wPos = new Float32Array(wCount * 3);
    const depth = new Float32Array(wCount);
    const waterTiles = new Int32Array(wCount);
    for (let j = 0; j < w.nz; j++) {
      for (let i = 0; i < w.nx; i++) {
        const k = j * w.nx + i;
        const x = x0 + i * w.sx;
        const z = z0 + j * w.sz;
        sampler.sample(x, z, sample);
        wPos.set([x, 0, z], k * 3);
        depth[k] = Math.max(0, -sample.height);
        waterTiles[k] = sampler.tileAt(this.wrapX(x), z) ?? -1;
      }
    }
    const water = new BufferGeometry();
    water.setAttribute('position', new BufferAttribute(wPos, 3));
    water.setAttribute('aDepth', new BufferAttribute(depth, 1));
    const waterVis = new BufferAttribute(new Float32Array(wCount), 1);
    water.setAttribute('aVis', waterVis);
    water.setIndex(w.index);
    const waterMesh = new Mesh(water, this.waterMaterial);
    waterMesh.frustumCulled = false;
    group.add(waterMesh);

    const chunk: Chunk = {
      group,
      midX: (x0 + x1) / 2,
      midZ: (z0 + z1) / 2,
      terrainTiles,
      terrainVis,
      waterTiles,
      waterVis,
      tiles,
      trees: [],
      treeTiles: [],
      clouds: undefined,
      sprites: [],
      grid: this.buildGrid(tiles),
    };
    group.add(chunk.grid);
    chunk.grid.visible = this.options.grid;
    this.buildClouds(chunk);
    this.buildMarkers(chunk);
    this.world.add(group);
    return chunk;
  }

  private heightAt(x: number, z: number) {
    return this.sampler!.sample(x, z, { height: 0, color: new Color() }).height;
  }

  private buildGrid(tiles: number[]): LineSegments {
    const { map } = this.data!;
    const pts: number[] = [];
    for (const t of tiles) {
      const [cx, cz] = center3(t % map.width, Math.floor(t / map.width));
      for (let i = 0; i < 6; i++) {
        const a1 = (Math.PI / 180) * (60 * i - 30);
        const a2 = (Math.PI / 180) * (60 * (i + 1) - 30);
        const p1 = [cx + Math.cos(a1), cz + Math.sin(a1)] as const;
        const p2 = [cx + Math.cos(a2), cz + Math.sin(a2)] as const;
        pts.push(
          p1[0],
          Math.max(0, this.heightAt(p1[0], p1[1])) + 0.03,
          p1[1],
          p2[0],
          Math.max(0, this.heightAt(p2[0], p2[1])) + 0.03,
          p2[1],
        );
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pts, 3));
    const lines = new LineSegments(geo, this.gridMaterial);
    lines.frustumCulled = false;
    return lines;
  }

  private treeGeometry(kind: 'woods' | 'rainforest') {
    const paint = (geo: BufferGeometry, color: number) => {
      const c = new Color(color);
      const n = geo.getAttribute('position').count;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
      geo.setAttribute('color', new BufferAttribute(arr, 3));
      return geo;
    };
    const trunk = paint(new CylinderGeometry(0.035, 0.05, 0.22, 5).translate(0, 0.11, 0), 0xe6c29a);
    if (kind === 'woods') {
      const low = paint(new ConeGeometry(0.2, 0.36, 7).translate(0, 0.32, 0), 0xffffff);
      const high = paint(new ConeGeometry(0.15, 0.3, 7).translate(0, 0.5, 0), 0xffffff);
      return mergeGeometries([flat(trunk), flat(low), flat(high)])!;
    }
    const tall = paint(new CylinderGeometry(0.03, 0.045, 0.42, 5).translate(0, 0.21, 0), 0xd9b48a);
    const crown = paint(
      new IcosahedronGeometry(0.2, 0).scale(1.2, 0.7, 1.2).translate(0, 0.48, 0),
      0xffffff,
    );
    return mergeGeometries([flat(tall), flat(crown)])!;
  }

  private buildTrees(chunk: Chunk, perTile: number) {
    const { map } = this.data!;
    for (const kind of ['woods', 'rainforest'] as const) {
      const tiles = chunk.tiles.filter((t) => map.tiles[t]!.feature === kind);
      if (tiles.length === 0) continue;
      const n = kind === 'rainforest' ? perTile + 1 : perTile;
      const mesh = new InstancedMesh(this.treeGeometry(kind), this.treeMaterial, tiles.length * n);
      mesh.frustumCulled = false;
      const m = new Matrix4();
      const quat = new Quaternion();
      const owners: number[] = [];
      let k = 0;
      for (const t of tiles) {
        const [cx, cz] = center3(t % map.width, Math.floor(t / map.width));
        for (let i = 0; i < n; i++) {
          const a = ((t * 7 + i * 2.39) % 6.283) + i;
          const r = 0.18 + ((t * 13 + i * 5) % 7) / 14;
          const x = cx + Math.cos(a) * r;
          const z = cz + Math.sin(a) * r;
          const s = 0.85 + ((t + i * 3) % 5) * 0.09;
          m.compose(new Vector3(x, this.heightAt(x, z) - 0.02, z), quat, new Vector3(s, s, s));
          mesh.setMatrixAt(k++, m);
          owners.push(t);
        }
      }
      chunk.group.add(mesh);
      chunk.trees.push(mesh);
      chunk.treeTiles.push(owners);
    }
  }

  private buildClouds(chunk: Chunk) {
    const geo = new IcosahedronGeometry(1, 1);
    const mesh = new InstancedMesh(geo, this.cloudMaterial, chunk.tiles.length * 2);
    mesh.frustumCulled = false;
    mesh.count = 0;
    chunk.clouds = mesh;
    chunk.group.add(mesh);
  }

  private buildMarkers(chunk: Chunk) {
    const { map, content, starts, playerOrder } = this.data!;
    const owner = new Map(Object.entries(starts).map(([p, t]) => [t, p]));
    for (const t of chunk.tiles) {
      const tile = map.tiles[t]!;
      const [cx, cz] = center3(t % map.width, Math.floor(t / map.width));
      const p = owner.get(t);
      if (p !== undefined) {
        const color = PLAYER_COLORS[playerOrder.indexOf(p) % PLAYER_COLORS.length]!;
        const h = Math.max(0, this.heightAt(cx, cz));
        const banner = new Group();
        const pole = new Mesh(
          new CylinderGeometry(0.025, 0.025, 0.9, 6),
          new MeshToonMaterial({ color: 0x3b2f22, gradientMap: this.gradient }),
        );
        pole.position.set(0, 0.45, 0);
        const flag = new Mesh(
          new PlaneGeometry(0.42, 0.26),
          new MeshToonMaterial({ color, gradientMap: this.gradient, side: DoubleSide }),
        );
        flag.position.set(0.21, 0.76, 0);
        const base = new Mesh(
          new CylinderGeometry(0.16, 0.2, 0.08, 8),
          new MeshToonMaterial({ color: 0xd4a94e, gradientMap: this.gradient }),
        );
        base.position.set(0, 0.04, 0);
        banner.add(pole, flag, base);
        banner.position.set(cx, h, cz);
        chunk.group.add(banner);
      }
      if (tile.resource !== null) {
        const r = content.entities.resource[tile.resource]!;
        const sprite = new Sprite(this.resourceMaterial(resolveText(content, r.name), r.class));
        const x = cx + 0.42;
        const z = cz + 0.38;
        sprite.position.set(x, Math.max(0, this.heightAt(x, z)) + 0.32, z);
        sprite.scale.set(0.42, 0.42, 1);
        chunk.group.add(sprite);
        chunk.sprites.push({ sprite, tile: t });
      }
    }
  }

  private resourceMaterial(name: string, cls: 'bonus' | 'luxury' | 'strategic'): SpriteMaterial {
    const key = `${name}:${cls}`;
    const cached = this.spriteCache.get(key);
    if (cached) return cached;
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const fill = { bonus: '#efe3b8', luxury: '#d9a0f2', strategic: '#f2876a' }[cls];
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 6, 0, Math.PI * 2);
    ctx.fillStyle = '#14202b';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 14, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.fillStyle = '#14202b';
    ctx.font = '600 46px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.slice(0, 2), size / 2, size / 2 + 2);
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    const material = new SpriteMaterial({ map: tex, depthTest: true });
    this.spriteCache.set(key, material);
    return material;
  }

  /** Fog of war: per-vertex visibility, cloud puffs over unexplored tiles, hidden props. */
  private applyVisibility(c: Chunk) {
    const vis = this.visibility;
    const level = (t: number) =>
      t < 0 ? (this.options.viewer === null ? 1 : 0.5) : vis[t] === 2 ? 1 : vis[t] === 1 ? 0.5 : 0;
    for (let i = 0; i < c.terrainTiles.length; i++) c.terrainVis.setX(i, level(c.terrainTiles[i]!));
    c.terrainVis.needsUpdate = true;
    for (let i = 0; i < c.waterTiles.length; i++) c.waterVis.setX(i, level(c.waterTiles[i]!));
    c.waterVis.needsUpdate = true;

    // Trees are rebuilt so trees hidden by an earlier fog view come back.
    for (const mesh of c.trees) {
      c.group.remove(mesh);
      mesh.geometry.dispose();
      mesh.dispose();
    }
    c.trees = [];
    c.treeTiles = [];
    this.buildTrees(c, QUALITY[this.options.quality].trees);
    const green = [
      new Color(0x5e8f3a),
      new Color(0x4f7f34),
      new Color(0x6d9a40),
      new Color(0x3f6f3a),
    ];
    const memory = new Color(0x7d857e);
    const hidden = new Matrix4().makeScale(0, 0, 0);
    c.trees.forEach((mesh, m) => {
      c.treeTiles[m]!.forEach((t, i) => {
        const v = vis[t];
        mesh.setColorAt(i, v === 1 ? memory : green[(t + i) % green.length]!);
        if (v === 0) mesh.setMatrixAt(i, hidden);
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.instanceMatrix.needsUpdate = true;
    });
    for (const s of c.sprites) s.sprite.visible = vis[s.tile] !== 0;

    const clouds = c.clouds!;
    const { map } = this.data!;
    let k = 0;
    const m = new Matrix4();
    for (const t of c.tiles) {
      if (vis[t] !== 0) continue;
      const [cx, cz] = center3(t % map.width, Math.floor(t / map.width));
      for (let i = 0; i < 2; i++) {
        const ox = ((t * 31 + i * 17) % 10) / 10 - 0.5;
        const oz = ((t * 17 + i * 29) % 10) / 10 - 0.5;
        const s = 0.9 + ((t + i) % 4) * 0.15;
        m.compose(
          new Vector3(cx + ox * 0.8, 1.0 + i * 0.15, cz + oz * 0.8),
          new Quaternion(),
          new Vector3(s * 1.15, s * 0.55, s),
        );
        clouds.setMatrixAt(k++, m);
      }
    }
    clouds.count = k;
    clouds.instanceMatrix.needsUpdate = true;
  }

  // --- Camera & rendering --------------------------------------------------------------------

  private wrapX(x: number) {
    return this.data?.map.wrapX ? ((x % this.worldW) + this.worldW) % this.worldW : x;
  }

  private applyPixelRatio() {
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, QUALITY[this.options.quality].pixelRatio),
    );
    this.fit();
  }

  private fit() {
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const pr = this.renderer.getPixelRatio();
    this.paint.target.setSize(Math.floor(w * pr), Math.floor(h * pr));
    this.paint.material.uniforms.uTexel!.value.set(1 / (w * pr), 1 / (h * pr));
  }

  private maxDist() {
    const tan = Math.tan(((FOV / 2) * Math.PI) / 180);
    const wrapLimit = this.data?.map.wrapX
      ? (this.worldW * 0.9) / (2 * tan * this.camera.aspect)
      : Infinity;
    return Math.min(130, wrapLimit, (this.worldH * 1.1) / (2 * tan));
  }

  private updateCamera() {
    if (!this.data) return;
    this.dist = Math.min(this.maxDist(), Math.max(5, this.dist));
    if (this.data.map.wrapX) this.target.x = this.wrapX(this.target.x);
    else this.target.x = Math.min(this.worldW, Math.max(0, this.target.x));
    this.target.z = Math.min(this.worldH, Math.max(0, this.target.z));
    const t = (this.dist - 5) / Math.max(1, this.maxDist() - 5);
    const pitch = ((50 + 22 * Math.min(1, t)) * Math.PI) / 180;
    this.camera.position.set(
      this.target.x,
      this.dist * Math.sin(pitch),
      this.target.z + this.dist * Math.cos(pitch),
    );
    this.camera.lookAt(this.target);

    const tan = Math.tan(((FOV / 2) * Math.PI) / 180);
    const halfW = this.dist * tan * this.camera.aspect * 1.7 + CHUNK_W;
    for (const c of this.chunks) {
      const shift = this.data.map.wrapX
        ? Math.round((this.target.x - c.midX) / this.worldW) * this.worldW
        : 0;
      c.group.position.x = shift;
      const dx = Math.abs(c.midX + shift - this.target.x);
      const dz = c.midZ - this.target.z;
      c.group.visible =
        dx < halfW && dz > -this.dist * 2.2 - CHUNK_H && dz < this.dist * 0.9 + CHUNK_H;
      const showSprites = this.dist < 34;
      for (const s of c.sprites) s.sprite.visible = showSprites && this.visibility[s.tile] !== 0;
    }
  }

  private loop() {
    let frames = 0;
    let last = performance.now();
    const tick = () => {
      this.raf = requestAnimationFrame(tick);
      this.stepKeys();
      this.updateCamera();
      this.uniforms.uTime.value = performance.now() / 1000;
      if (QUALITY[this.options.quality].paint) {
        this.renderer.setRenderTarget(this.paint.target);
        this.renderer.render(this.scene, this.camera);
        this.renderer.setRenderTarget(null);
        this.paint.material.uniforms.tScene!.value = this.paint.target.texture;
        this.renderer.render(this.paint.scene, this.paint.camera);
      } else {
        this.renderer.render(this.scene, this.camera);
      }
      frames++;
      const now = performance.now();
      if (now - last >= 500) {
        this.onFps(Math.round((frames * 1000) / (now - last)));
        frames = 0;
        last = now;
      }
    };
    tick();
  }

  // --- Input ---------------------------------------------------------------------------------

  private raycaster = new Raycaster();
  private ground = new Plane(new Vector3(0, 1, 0), 0);
  private pointers = new Map<number, { x: number; y: number }>();
  private drag: { anchor: Vector3; moved: boolean; sx: number; sy: number } | undefined;
  private pinch: { distance: number; dist: number } | undefined;
  private keys = new Set<string>();

  private groundAt(sx: number, sy: number): Vector3 | undefined {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new Vector2(
      ((sx - rect.left) / rect.width) * 2 - 1,
      -((sy - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new Vector3();
    return this.raycaster.ray.intersectPlane(this.ground, hit) ?? undefined;
  }

  private tileUnder(sx: number, sy: number): number | undefined {
    const p = this.groundAt(sx, sy);
    if (!p || !this.sampler) return undefined;
    return this.sampler.tileAt(this.wrapX(p.x), p.z);
  }

  private setHighlight(tile: number | undefined) {
    if (tile === undefined || !this.data) {
      this.highlight.visible = false;
      return;
    }
    const [cx, cz] = center3(tile % this.data.map.width, Math.floor(tile / this.data.map.width));
    const x =
      cx + (this.data.map.wrapX ? Math.round((this.target.x - cx) / this.worldW) * this.worldW : 0);
    const pts: number[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (60 * i - 30);
      const px = x + Math.cos(a) * 0.96;
      const pz = cz + Math.sin(a) * 0.96;
      pts.push(px, Math.max(0, this.heightAt(px, pz)) + 0.05, pz);
    }
    this.highlight.geometry.dispose();
    this.highlight.geometry = new BufferGeometry();
    this.highlight.geometry.setAttribute('position', new Float32BufferAttribute(pts, 3));
    this.highlight.visible = true;
  }

  private stepKeys() {
    const speed = this.dist * 0.012;
    if (this.keys.has('ArrowLeft') || this.keys.has('a')) this.target.x -= speed;
    if (this.keys.has('ArrowRight') || this.keys.has('d')) this.target.x += speed;
    if (this.keys.has('ArrowUp') || this.keys.has('w')) this.target.z -= speed;
    if (this.keys.has('ArrowDown') || this.keys.has('s')) this.target.z += speed;
  }

  private bindInput(canvas: HTMLCanvasElement) {
    canvas.style.touchAction = 'none';
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
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 1) {
        const anchor = this.groundAt(e.clientX, e.clientY);
        if (anchor) this.drag = { anchor, moved: false, sx: e.clientX, sy: e.clientY };
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch = { distance: Math.hypot(a!.x - b!.x, a!.y - b!.y), dist: this.dist };
        this.drag = undefined;
      }
    });
    on(canvas, 'pointermove', (e) => {
      if (this.pointers.has(e.pointerId))
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinch && this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.dist =
          (this.pinch.dist * this.pinch.distance) /
          Math.max(1, Math.hypot(a!.x - b!.x, a!.y - b!.y));
        return;
      }
      if (this.drag) {
        if (Math.abs(e.clientX - this.drag.sx) + Math.abs(e.clientY - this.drag.sy) > 3)
          this.drag.moved = true;
        if (this.drag.moved) {
          this.updateCamera();
          const now = this.groundAt(e.clientX, e.clientY);
          if (now) {
            this.target.x += this.drag.anchor.x - now.x;
            this.target.z += this.drag.anchor.z - now.z;
          }
        }
        return;
      }
      if (e.pointerType === 'mouse') {
        const t = this.tileUnder(e.clientX, e.clientY);
        this.setHighlight(t);
        this.onHover(t);
      }
    });
    const end = (e: PointerEvent) => {
      const wasDrag = this.drag?.moved ?? true;
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = undefined;
      if (this.pointers.size === 0) {
        if (!wasDrag && e.type === 'pointerup') {
          const t = this.tileUnder(e.clientX, e.clientY);
          this.setHighlight(t);
          this.onSelect(t);
        }
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
      const before = this.groundAt(e.clientX, e.clientY);
      this.dist *= Math.exp(e.deltaY * 0.0012);
      this.updateCamera();
      const after = this.groundAt(e.clientX, e.clientY);
      if (before && after) {
        this.target.x += before.x - after.x;
        this.target.z += before.z - after.z;
      }
    });
    on(window, 'keydown', (e) => {
      if ((e.target as HTMLElement)?.closest?.('input, select, textarea')) return;
      if (e.key === '+' || e.key === '=') this.dist /= 1.2;
      else if (e.key === '-') this.dist *= 1.2;
      else this.keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    });
    on(window, 'keyup', (e) => this.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
    on(window, 'blur', () => this.keys.clear());
  }
}
