import { resolveText } from '@cx/content';
import { tilesWithin } from '@cx/engine';
import {
  ACESFilmicToneMapping,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  Fog,
  Group,
  HalfFloatType,
  HemisphereLight,
  InstancedMesh,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  Quaternion,
  Raycaster,
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
import {
  type MapRenderer,
  type MapViewData,
  type MapViewOptions,
  type PathView,
  PLAYER_COLORS,
  previewVisibility,
  type Quality,
  type UnitView,
} from '../map/renderer';
import { type PropKind, propGeometries, placeProps } from './props';
import { center3, type Sample, TerrainSampler } from './sampler';
import { UnitLayer } from './units3d';
import {
  mistFragment,
  mistVertex,
  paintPassFragment,
  paintPassVertex,
  terrainFragment,
  terrainVertex,
  waterFragment,
  waterVertex,
} from './shaders';

const CHUNK_W = 8 * Math.sqrt(3);
const CHUNK_H = 12;
const MARGIN = 16; // ocean drawn beyond the top/bottom edges so the map doesn't end abruptly
const FOV = 40;
/** Hidden (unexplored) land is flattened to this height so it gives nothing away. */
const FOG_FLOOR = 0.12;
const MIST_HEIGHT = 0.34;

// Palette (sRGB). Dusk: a low golden sun, cool blue sky light, deep water, dark fog.
const SUN = 0xffd6ad;
const SKY = 0x6a809c;
const GROUND = 0x3a3126;
const HAZE = 0x46586a;

const QUALITY: Record<
  Quality,
  {
    step: number;
    waterStep: number;
    pixelRatio: number;
    trees: number;
    scatter: number;
    post: boolean;
    paint: number;
    detail: boolean;
  }
> = {
  low: {
    step: 0.32,
    waterStep: 0.5,
    pixelRatio: 0.85,
    trees: 3,
    scatter: 0,
    post: false,
    paint: 0,
    detail: false,
  },
  medium: {
    step: 0.22,
    waterStep: 0.36,
    pixelRatio: 1.25,
    trees: 5,
    scatter: 2,
    post: true,
    paint: 0,
    detail: true,
  },
  high: {
    step: 0.17,
    waterStep: 0.28,
    pixelRatio: 2,
    trees: 8,
    scatter: 3,
    post: true,
    paint: 0.55,
    detail: true,
  },
};

interface Prop {
  mesh: InstancedMesh;
  tiles: Int32Array;
  matrices: Float32Array;
  colors: Color[];
}

interface Chunk {
  group: Group;
  /** Grid position, for finding neighbours when fog changes. */
  cx: number;
  cz: number;
  midX: number;
  midZ: number;
  terrain: BufferGeometry;
  terrainY: Float32Array;
  terrainVis: BufferAttribute;
  water: BufferGeometry;
  waterVis: BufferAttribute;
  mist: Mesh;
  mistVis: BufferAttribute;
  /** Tiles whose centers fall in this chunk. */
  tiles: number[];
  props: Prop[];
  sprites: { sprite: Sprite; tile: number }[];
  grid: LineSegments;
}

function skyTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#0b131d');
  g.addColorStop(0.35, '#1c2b3c');
  g.addColorStop(0.62, '#3b4c5d');
  g.addColorStop(0.8, '#5d6266');
  g.addColorStop(1, '#13283a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** Painted 3D map renderer (docs/10-art-direction.md). Same interface as the 2D MapView. */
export class World3D implements MapRenderer {
  onHover: (tile: number | undefined) => void = () => {};
  onSelect: (tile: number | undefined) => void = () => {};
  onCommand: (tile: number) => void = () => {};
  onFps: (fps: number) => void = () => {};

  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(FOV, 1, 0.3, 400);
  private uniforms = {
    uTime: { value: 0 },
    uLightDir: { value: new Vector3(-0.62, 0.48, 0.42).normalize() },
    uSunColor: { value: new Color(SUN).multiplyScalar(1.95) },
    uSkyColor: { value: new Color(SKY).multiplyScalar(0.95) },
    uGroundColor: { value: new Color(GROUND).multiplyScalar(0.9) },
    uHaze: { value: new Color(HAZE) },
    uFogDark: { value: new Color(0x080d13) },
    uMist: { value: new Color(0x223140) },
    uMistEdge: { value: new Color(0x5d6b78) },
    uRock: { value: new Color(0x55544f) },
    uSnow: { value: new Color(0xc9d1d8) },
    uShallow: { value: new Color(0x3f6e64) },
    uCoast: { value: new Color(0x204e5e) },
    uDeep: { value: new Color(0x143650) },
    uAbyss: { value: new Color(0x0b2136) },
    uFoam: { value: new Color(0xd6d1c0) },
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
    transparent: true,
    depthWrite: false,
  });
  private mistMaterial = new ShaderMaterial({
    vertexShader: mistVertex,
    fragmentShader: mistFragment,
    uniforms: this.uniforms,
    transparent: true,
    depthWrite: false,
  });
  private propMaterial = new MeshStandardMaterial({
    roughness: 0.92,
    metalness: 0,
    flatShading: true,
  });
  private propGeometry = propGeometries();
  private gridMaterial = new LineBasicMaterial({
    color: 0x0a0d0a,
    transparent: true,
    opacity: 0.3,
  });
  private highlight = new LineLoop(
    new BufferGeometry(),
    new LineBasicMaterial({ color: 0xd4a94e }),
  );
  private world = new Group();
  private chunks: Chunk[] = [];
  private data: MapViewData | undefined;
  private sampler: TerrainSampler | undefined;
  private options: MapViewOptions = { grid: false, yields: false, viewer: null, quality: 'medium' };
  private visibility: Uint8Array = new Uint8Array(0);
  /** Fog from the game; when null, the Map Lab preview fog (options.viewer) is used. */
  private gameFog: Uint8Array | null = null;
  private chunkOfTile = new Int32Array(0);
  private chunkGrid = { nx: 0, nz: 0 };
  private units: UnitLayer;
  private target = new Vector3();
  private dist = 22;
  private worldW = 1;
  private worldH = 1;
  private raf = 0;
  private resize: ResizeObserver;
  private cleanup: (() => void)[] = [];
  private post: {
    target: WebGLRenderTarget;
    scene: Scene;
    camera: PerspectiveCamera;
    material: ShaderMaterial;
  };
  private spriteCache = new Map<string, SpriteMaterial>();

  constructor(private host: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene.background = skyTexture();
    this.scene.fog = new Fog(HAZE, 38, 160);
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';

    const sun = new DirectionalLight(SUN, 6.2);
    sun.position.copy(this.uniforms.uLightDir.value).multiplyScalar(50);
    this.scene.add(sun, new HemisphereLight(SKY, GROUND, 2.2), this.world);
    this.highlight.renderOrder = 10;
    this.scene.add(this.highlight);
    this.units = new UnitLayer({
      center: (tile) =>
        center3(tile % this.data!.map.width, Math.floor(tile / this.data!.map.width)),
      height: (x, z) => this.heightAt(x, z),
      worldWidth: () => this.worldW,
      wrap: () => this.data?.map.wrapX ?? false,
    });
    this.scene.add(this.units.group);

    const material = new ShaderMaterial({
      vertexShader: paintPassVertex,
      fragmentShader: paintPassFragment,
      uniforms: { tScene: { value: null }, uTexel: { value: new Vector2() }, uPaint: { value: 0 } },
      depthTest: false,
    });
    const quadScene = new Scene();
    quadScene.add(new Mesh(new PlaneGeometry(2, 2), material));
    this.post = {
      target: new WebGLRenderTarget(1, 1, { type: HalfFloatType }),
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
    this.visibility =
      this.gameFog && this.gameFog.length === data.map.tiles.length
        ? this.gameFog
        : previewVisibility(data, options.viewer, (c, r) => tilesWithin(data.map, c, r));
    this.applyQuality();
    this.build();
    if (!sameSize) this.focusPlayer(data.playerOrder[0]);
  }

  async setOptions(options: MapViewOptions) {
    const prev = this.options;
    this.options = options;
    if (!this.data) return;
    if (options.quality !== prev.quality) {
      this.applyQuality();
      this.build();
      return;
    }
    if (options.viewer !== prev.viewer && !this.gameFog) {
      this.visibility = previewVisibility(this.data, options.viewer, (c, r) =>
        tilesWithin(this.data!.map, c, r),
      );
      for (const c of this.chunks) this.applyVisibility(c);
    }
    if (options.grid !== prev.grid) for (const c of this.chunks) c.grid.visible = options.grid;
  }

  setFog(fog: Uint8Array | null) {
    this.gameFog = fog;
    if (!this.data) return;
    const next =
      fog ??
      previewVisibility(this.data, this.options.viewer, (c, r) =>
        tilesWithin(this.data!.map, c, r),
      );
    const prev = this.visibility;
    this.visibility = next;
    if (prev.length !== next.length) {
      for (const c of this.chunks) this.applyVisibility(c);
      return;
    }
    // Only refresh chunks near tiles whose fog changed (fog blends across chunk edges).
    const dirty = new Set<number>();
    for (let t = 0; t < next.length; t++) {
      if (prev[t] === next[t]) continue;
      const c = this.chunks[this.chunkOfTile[t]!];
      if (!c) continue;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          let x = c.cx + dx;
          const z = c.cz + dz;
          if (z < 0 || z >= this.chunkGrid.nz) continue;
          if (x < 0 || x >= this.chunkGrid.nx) {
            if (!this.data.map.wrapX) continue;
            x = (x + this.chunkGrid.nx) % this.chunkGrid.nx;
          }
          dirty.add(z * this.chunkGrid.nx + x);
        }
      }
    }
    for (const i of dirty) this.applyVisibility(this.chunks[i]!);
  }

  setUnits(units: UnitView[], moves?: { unit: string; path: number[] }[]) {
    if (this.data) this.units.setUnits(units, moves);
  }

  setSelected(unit: string | null) {
    this.units.setSelected(unit);
  }

  setPath(path: PathView | null, from: number | null) {
    this.units.setPath(path, from);
  }

  focusTile(tile: number, close = false) {
    if (!this.data) return;
    const [x, z] = center3(tile % this.data.map.width, Math.floor(tile / this.data.map.width));
    this.target.set(x, 0, z);
    this.dist = Math.min(this.dist, close ? 13 : 26);
  }

  focusPlayer(player: string | undefined) {
    if (!this.data || player === undefined) return;
    const tile = this.data.starts[player];
    if (tile === undefined) return;
    const [x, z] = center3(tile % this.data.map.width, Math.floor(tile / this.data.map.width));
    this.target.set(x, 0, z);
    this.dist = Math.min(this.dist, 22);
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
        if ((o instanceof Mesh || o instanceof LineSegments) && !(o instanceof InstancedMesh)) {
          o.geometry.dispose();
        }
      });
      for (const p of c.props) p.mesh.dispose();
      this.world.remove(c.group);
    }
    this.chunks = [];
  }

  private build() {
    const { map } = this.data!;
    const q = QUALITY[this.options.quality];
    this.terrainMaterial.defines = q.detail ? { DETAIL: '' } : {};
    this.terrainMaterial.needsUpdate = true;
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
    this.chunkGrid = { nx, nz };
    this.chunkOfTile = new Int32Array(map.tiles.length);
    for (let cz = 0; cz < nz; cz++) {
      for (let cx = 0; cx < nx; cx++) {
        const x0 = cx * CHUNK_W;
        const x1 = Math.min(this.worldW, (cx + 1) * CHUNK_W);
        const z0 = cz * CHUNK_H - MARGIN;
        const z1 = Math.min(this.worldH + MARGIN, (cz + 1) * CHUNK_H - MARGIN);
        const tiles = tilesByChunk.get(key(cx, cz)) ?? [];
        for (const t of tiles) this.chunkOfTile[t] = this.chunks.length;
        const chunk = this.buildChunk(x0, x1, z0, z1, tiles, q);
        chunk.cx = cx;
        chunk.cz = cz;
        this.chunks.push(chunk);
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

  private flatPlane(x0: number, x1: number, z0: number, z1: number, step: number, y: number) {
    const g = this.grid(x0, x1, z0, z1, step);
    const pos = new Float32Array(g.nx * g.nz * 3);
    for (let j = 0; j < g.nz; j++) {
      for (let i = 0; i < g.nx; i++) pos.set([x0 + i * g.sx, y, z0 + j * g.sz], (j * g.nx + i) * 3);
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setIndex(g.index);
    return geo;
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
    const terrainY = new Float32Array(count);
    for (let j = 0; j < g.nz; j++) {
      for (let i = 0; i < g.nx; i++) {
        const k = j * g.nx + i;
        const x = x0 + i * g.sx;
        const z = z0 + j * g.sz;
        sampler.sample(x, z, sample);
        pos.set([x, sample.height, z], k * 3);
        terrainY[k] = sample.height;
        col.set([sample.color.r, sample.color.g, sample.color.b], k * 3);
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
    const water = this.flatPlane(x0, x1, z0, z1, q.waterStep, 0);
    const wPos = water.getAttribute('position');
    const depth = new Float32Array(wPos.count);
    for (let k = 0; k < wPos.count; k++) {
      depth[k] = Math.max(0, -sampler.sample(wPos.getX(k), wPos.getZ(k), sample).height);
    }
    water.setAttribute('aDepth', new BufferAttribute(depth, 1));
    const waterVis = new BufferAttribute(new Float32Array(wPos.count), 1);
    water.setAttribute('aVis', waterVis);
    const waterMesh = new Mesh(water, this.waterMaterial);
    waterMesh.frustumCulled = false;
    waterMesh.renderOrder = 1;
    group.add(waterMesh);

    // Fog of war mist (only shown when viewing as a player).
    const mistGeo = this.flatPlane(x0, x1, z0, z1, Math.max(q.waterStep, 0.4), MIST_HEIGHT);
    const mistVis = new BufferAttribute(
      new Float32Array(mistGeo.getAttribute('position').count),
      1,
    );
    mistGeo.setAttribute('aVis', mistVis);
    const mist = new Mesh(mistGeo, this.mistMaterial);
    mist.frustumCulled = false;
    mist.renderOrder = 2;
    group.add(mist);

    const chunk: Chunk = {
      group,
      cx: 0,
      cz: 0,
      midX: (x0 + x1) / 2,
      midZ: (z0 + z1) / 2,
      terrain,
      terrainY,
      terrainVis,
      water,
      waterVis,
      mist,
      mistVis,
      tiles,
      props: this.buildProps(group, tiles, q),
      sprites: [],
      grid: this.buildGrid(tiles),
    };
    group.add(chunk.grid);
    chunk.grid.visible = this.options.grid;
    this.buildMarkers(chunk);
    this.world.add(group);
    return chunk;
  }

  private heightAt(x: number, z: number) {
    return this.sampler!.sample(x, z, { height: 0, color: new Color() }).height;
  }

  private buildProps(group: Group, tiles: number[], q: (typeof QUALITY)[Quality]): Prop[] {
    const instances = placeProps(this.data!.map, tiles, { trees: q.trees, scatter: q.scatter });
    const byKind = new Map<PropKind, typeof instances>();
    for (const p of instances) {
      const list = byKind.get(p.kind) ?? [];
      list.push(p);
      byKind.set(p.kind, list);
    }
    const props: Prop[] = [];
    const m = new Matrix4();
    const quat = new Quaternion();
    const euler = new Euler();
    for (const [kind, list] of byKind) {
      const mesh = new InstancedMesh(this.propGeometry[kind], this.propMaterial, list.length);
      mesh.frustumCulled = false;
      const tileIds = new Int32Array(list.length);
      list.forEach((p, i) => {
        quat.setFromEuler(euler.set(0, p.rotation, 0));
        m.compose(
          new Vector3(p.x, Math.max(this.heightAt(p.x, p.z), -0.05) - 0.02, p.z),
          quat,
          new Vector3(...p.scale),
        );
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, p.color);
        tileIds[i] = p.tile;
      });
      group.add(mesh);
      props.push({
        mesh,
        tiles: tileIds,
        matrices: new Float32Array(mesh.instanceMatrix.array),
        colors: list.map((p) => p.color),
      });
    }
    return props;
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
        const metal = new MeshStandardMaterial({ color: 0xb8914a, roughness: 0.4, metalness: 0.8 });
        const pole = new Mesh(new CylinderGeometry(0.022, 0.022, 0.95, 6), metal);
        pole.position.set(0, 0.47, 0);
        const flag = new Mesh(
          new PlaneGeometry(0.42, 0.26),
          new MeshStandardMaterial({ color, roughness: 0.8, side: DoubleSide }),
        );
        flag.position.set(0.21, 0.8, 0);
        const base = new Mesh(new CylinderGeometry(0.15, 0.19, 0.07, 10), metal);
        base.position.set(0, 0.035, 0);
        banner.add(pole, flag, base);
        banner.position.set(cx, h, cz);
        chunk.group.add(banner);
      }
      if (tile.resource !== null) {
        const r = content.entities.resource[tile.resource]!;
        const sprite = new Sprite(this.resourceMaterial(resolveText(content, r.name), r.class));
        const x = cx + 0.42;
        const z = cz + 0.38;
        sprite.position.set(x, Math.max(0, this.heightAt(x, z)) + 0.34, z);
        sprite.scale.set(0.4, 0.4, 1);
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
    const ring = { bonus: '#c9b98a', luxury: '#b98ad6', strategic: '#d9785a' }[cls];
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
    ctx.fillStyle = ring;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 13, 0, Math.PI * 2);
    ctx.fillStyle = '#121a22';
    ctx.fill();
    ctx.fillStyle = '#eadfc4';
    ctx.font = '600 44px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.slice(0, 2), size / 2, size / 2 + 2);
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    const material = new SpriteMaterial({ map: tex, toneMapped: false, fog: true });
    this.spriteCache.set(key, material);
    return material;
  }

  /**
   * Fog of war: smooth per-vertex visibility (soft edges), unexplored land flattened under a
   * dark mist so it reveals nothing, remembered land darkened, props hidden or dimmed.
   */
  private applyVisibility(c: Chunk) {
    const vis = this.visibility;
    const sampler = this.sampler!;
    const fog = this.gameFog !== null || this.options.viewer !== null;
    const level = (t: number) => (vis[t] === 2 ? 1 : vis[t] === 1 ? 0.5 : 0);
    const outside = fog ? 0.5 : 1;
    const smooth = (x: number, z: number) => (fog ? sampler.blend(x, z, level, outside) : 1);

    const pos = c.terrain.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const v = smooth(pos.getX(i), pos.getZ(i));
      c.terrainVis.setX(i, v);
      const y = c.terrainY[i]!;
      const reveal = Math.min(1, Math.max(0, (v - 0.08) / 0.3));
      pos.setY(i, FOG_FLOOR + (y - FOG_FLOOR) * reveal);
    }
    pos.needsUpdate = true;
    c.terrainVis.needsUpdate = true;
    c.terrain.computeVertexNormals();

    const wPos = c.water.getAttribute('position');
    for (let i = 0; i < wPos.count; i++) c.waterVis.setX(i, smooth(wPos.getX(i), wPos.getZ(i)));
    c.waterVis.needsUpdate = true;

    const mPos = c.mist.geometry.getAttribute('position');
    for (let i = 0; i < mPos.count; i++) c.mistVis.setX(i, smooth(mPos.getX(i), mPos.getZ(i)));
    c.mistVis.needsUpdate = true;
    c.mist.visible = fog;

    const dim = new Color();
    for (const p of c.props) {
      const arr = p.mesh.instanceMatrix.array as Float32Array;
      for (let i = 0; i < p.tiles.length; i++) {
        const v = vis[p.tiles[i]!];
        if (v === 0) {
          arr.fill(0, i * 16, i * 16 + 16);
        } else {
          arr.set(p.matrices.subarray(i * 16, i * 16 + 16), i * 16);
        }
        const base = p.colors[i]!;
        const grey = base.r * 0.3 + base.g * 0.59 + base.b * 0.11;
        p.mesh.setColorAt(i, v === 1 ? dim.setRGB(grey * 0.22, grey * 0.24, grey * 0.3) : base);
      }
      p.mesh.instanceMatrix.needsUpdate = true;
      if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true;
    }
    for (const s of c.sprites) s.sprite.visible = vis[s.tile] !== 0;
  }

  // --- Camera & rendering --------------------------------------------------------------------

  private wrapX(x: number) {
    return this.data?.map.wrapX ? ((x % this.worldW) + this.worldW) % this.worldW : x;
  }

  private applyQuality() {
    const q = QUALITY[this.options.quality];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    this.post.material.uniforms.uPaint!.value = q.paint;
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
    this.post.target.setSize(Math.floor(w * pr), Math.floor(h * pr));
    this.post.material.uniforms.uTexel!.value.set(1 / (w * pr), 1 / (h * pr));
  }

  private maxDist() {
    const tan = Math.tan(((FOV / 2) * Math.PI) / 180);
    const wrapLimit = this.data?.map.wrapX
      ? (this.worldW * 0.85) / (2 * tan * this.camera.aspect)
      : Infinity;
    return Math.min(110, wrapLimit, (this.worldH * 1.0) / (2 * tan));
  }

  private updateCamera() {
    if (!this.data) return;
    const min = 6;
    this.dist = Math.min(this.maxDist(), Math.max(min, this.dist));
    if (this.data.map.wrapX) this.target.x = this.wrapX(this.target.x);
    else this.target.x = Math.min(this.worldW, Math.max(0, this.target.x));
    this.target.z = Math.min(this.worldH, Math.max(0, this.target.z));
    // Low and cinematic when close (you see the horizon), flatter and map-like when far.
    const t = Math.min(1, (this.dist - min) / Math.max(1, this.maxDist() - min));
    const pitch = ((36 + 32 * Math.sqrt(t)) * Math.PI) / 180;
    this.camera.position.set(
      this.target.x,
      this.dist * Math.sin(pitch),
      this.target.z + this.dist * Math.cos(pitch),
    );
    this.camera.lookAt(this.target);

    const tan = Math.tan(((FOV / 2) * Math.PI) / 180);
    const halfW = this.dist * tan * this.camera.aspect * 2.2 + CHUNK_W;
    const ahead = this.dist * (3.4 - 1.8 * t) + CHUNK_H;
    const showSprites = this.dist < 30;
    for (const c of this.chunks) {
      const shift = this.data.map.wrapX
        ? Math.round((this.target.x - c.midX) / this.worldW) * this.worldW
        : 0;
      c.group.position.x = shift;
      const dx = Math.abs(c.midX + shift - this.target.x);
      const dz = c.midZ - this.target.z;
      c.group.visible =
        dx < halfW + Math.max(0, -dz) * 0.8 && dz > -ahead && dz < this.dist + CHUNK_H;
      for (const s of c.sprites) s.sprite.visible = showSprites && this.visibility[s.tile] !== 0;
    }
  }

  private loop() {
    let frames = 0;
    let last = performance.now();
    let prevFrame = performance.now();
    const tick = () => {
      this.raf = requestAnimationFrame(tick);
      const frameStart = performance.now();
      const dt = Math.min(0.1, (frameStart - prevFrame) / 1000);
      prevFrame = frameStart;
      this.stepKeys();
      this.updateCamera();
      this.uniforms.uTime.value = frameStart / 1000;
      this.units.update(dt, this.target.x, frameStart / 1000);
      if (QUALITY[this.options.quality].post) {
        this.renderer.setRenderTarget(this.post.target);
        this.renderer.render(this.scene, this.camera);
        this.renderer.setRenderTarget(null);
        this.post.material.uniforms.tScene!.value = this.post.target.texture;
        this.renderer.render(this.post.scene, this.post.camera);
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
      // Right-clicks are commands (contextmenu below), not selections.
      if (e.button === 2) {
        this.pointers.delete(e.pointerId);
        this.drag = undefined;
        return;
      }
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
    on(canvas, 'contextmenu', (e) => {
      e.preventDefault();
      const t = this.tileUnder(e.clientX, e.clientY);
      if (t !== undefined) this.onCommand(t);
    });
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
