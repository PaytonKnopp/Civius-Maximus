import { compileContent, contentHash } from '@cx/content';
import { BASE_CONTENT_DIR, compileFromDirs, readPackageDir } from '@cx/content/node';
import { describe, expect, it } from 'vitest';
import { createRng } from '../rng';
import { generateMap, MapGenerationError, scoreStarts } from './generate';
import {
  DIRECTIONS,
  distance,
  type Grid,
  hasRiverEdge,
  neighbor,
  neighbors,
  NO_TILE,
  opposite,
  setRiverEdge,
  tileIndex,
  tilesWithin,
  vertexNeighbors,
  vertexTiles,
} from './hex';
import { makeRandom } from './random';
import type { MapSettings, StartBias } from './types';
import { validateMap } from './validate';

const content = compileFromDirs().content!;

const grids: Grid[] = [
  { width: 10, height: 8, wrapX: true },
  { width: 11, height: 7, wrapX: true },
  { width: 10, height: 8, wrapX: false },
];

describe('hex grid', () => {
  it('neighbors are symmetric on wrapping and non-wrapping grids, odd and even widths', () => {
    for (const g of grids) {
      for (let i = 0; i < g.width * g.height; i++) {
        for (const d of DIRECTIONS) {
          const n = neighbor(g, i, d);
          if (n !== NO_TILE) expect(neighbor(g, n, opposite(d))).toBe(i);
        }
      }
    }
  });

  it('wraps east-west only when asked', () => {
    const wrap = grids[0]!;
    const flat = grids[2]!;
    const westEdge = tileIndex(wrap, 0, 2);
    expect(neighbor(wrap, westEdge, 3)).toBe(tileIndex(wrap, 9, 2));
    expect(neighbor(flat, westEdge, 3)).toBe(NO_TILE);
    expect(neighbor(wrap, tileIndex(wrap, 3, 0), 1)).toBe(NO_TILE); // nothing north of row 0
  });

  it('measures distance the short way around', () => {
    const g = grids[0]!;
    const a = tileIndex(g, 0, 4);
    expect(distance(g, a, tileIndex(g, 9, 4))).toBe(1);
    expect(distance(grids[2]!, a, tileIndex(g, 9, 4))).toBe(9);
    for (const n of neighbors(g, a)) expect(distance(g, a, n)).toBe(1);
  });

  it('distance is symmetric and matches BFS rings', () => {
    const g = grids[1]!;
    const center = tileIndex(g, 5, 3);
    expect(tilesWithin(g, center, 0)).toHaveLength(1);
    expect(tilesWithin(g, center, 1)).toHaveLength(7);
    expect(tilesWithin(g, center, 2)).toHaveLength(19);
    for (const t of tilesWithin(g, center, 3)) {
      expect(distance(g, center, t)).toBeLessThanOrEqual(3);
      expect(distance(g, t, center)).toBe(distance(g, center, t));
    }
  });

  it('stores each river edge once, visible from both sides', () => {
    for (const g of grids) {
      for (let i = 0; i < g.width * g.height; i++) {
        for (const d of DIRECTIONS) {
          const n = neighbor(g, i, d);
          if (n === NO_TILE) continue;
          const rivers = new Array<number>(g.width * g.height).fill(0);
          setRiverEdge(g, rivers, i, d);
          expect(hasRiverEdge(g, rivers, n, opposite(d))).toBe(true);
          expect(rivers.filter((r) => r !== 0)).toHaveLength(1);
        }
      }
    }
  });

  it('has a consistent corner graph (rivers flow along it)', () => {
    for (const g of grids) {
      for (let v = 0; v < g.width * g.height * 2; v++) {
        const tiles = vertexTiles(g, v);
        for (const { vertex, between } of vertexNeighbors(g, v)) {
          expect(vertexNeighbors(g, vertex).map((x) => x.vertex)).toContain(v);
          // The edge between two corners separates the two tiles both corners touch.
          for (const t of between) {
            expect(tiles).toContain(t);
            expect(vertexTiles(g, vertex)).toContain(t);
          }
          expect(distance(g, between[0], between[1])).toBe(1);
        }
      }
    }
  });
});

function settings(script: string, size: string, over: Partial<MapSettings> = {}): MapSettings {
  return { script, size, wrapX: true, resources: 'standard', startBalance: 'normal', ...over };
}

const players = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}` }));

function generate(
  script: string,
  size: string,
  seed: string,
  over: Partial<MapSettings> = {},
  n?: number,
) {
  return generateMap(
    {
      content,
      settings: settings(script, size, over),
      players: players(n ?? content.entities.mapSize[size]!.players),
    },
    makeRandom(createRng(seed)),
  );
}

describe('map generation', () => {
  const scripts = content.ids.mapScript;
  // Twelve map types × sizes × seeds: these generate a few hundred maps.
  const LONG = { timeout: 30_000 };

  it('produces valid maps for every script (duel and tiny, 8 seeds each)', LONG, () => {
    for (const script of scripts) {
      for (const size of ['duel', 'tiny']) {
        for (let s = 0; s < 8; s++) {
          const { map, starts } = generate(script, size, `seed-${s}`);
          expect(validateMap(map, starts, content), `${script} ${size} seed-${s}`).toEqual([]);
        }
      }
    }
  });

  it('places 8 players on a Standard map, in well under a second', LONG, () => {
    for (const script of scripts) {
      const start = performance.now();
      const { map, starts } = generate(script, 'standard', 'eight');
      expect(performance.now() - start).toBeLessThan(1000);
      expect(Object.keys(starts)).toHaveLength(8);
      expect(validateMap(map, starts, content)).toEqual([]);
    }
  });

  it('is deterministic', () => {
    const a = generate('continents', 'tiny', 'same');
    const b = generate('continents', 'tiny', 'same');
    expect(contentHash(a)).toBe(contentHash(b));
    expect(contentHash(generate('continents', 'tiny', 'different'))).not.toBe(contentHash(a));
  });

  it('hits the land percentage and makes coasts, lakes, rivers, hills and mountains', () => {
    const { map } = generate('continents', 'standard', 'mix');
    const count = (pred: (t: (typeof map.tiles)[number]) => boolean) =>
      map.tiles.filter(pred).length;
    const land = count((t) => !content.entities.terrain[t.terrain]!.water);
    const landPercent = (land * 100) / map.tiles.length;
    expect(landPercent).toBeGreaterThan(28);
    expect(landPercent).toBeLessThan(36);
    expect(count((t) => t.terrain === 'coast')).toBeGreaterThan(100);
    expect(count((t) => t.terrain === 'lake')).toBeGreaterThan(0);
    expect(count((t) => t.river !== 0)).toBeGreaterThan(50);
    expect(count((t) => t.elevation === 'hills')).toBeGreaterThan(land / 10);
    expect(count((t) => t.elevation === 'mountain')).toBeGreaterThan(land / 25);
    for (const terrain of ['grassland', 'plains', 'desert', 'tundra']) {
      expect(
        count((t) => t.terrain === terrain),
        terrain,
      ).toBeGreaterThan(20);
    }
    expect(count((t) => t.resource !== null)).toBeGreaterThan(100);
  });

  it('works on non-wrapping maps', () => {
    const { map, starts } = generate('pangaea', 'tiny', 'flat', { wrapX: false });
    expect(map.wrapX).toBe(false);
    expect(validateMap(map, starts, content)).toEqual([]);
  });

  it('scales resources with the density setting', () => {
    const resources = (density: MapSettings['resources']) =>
      generate('continents', 'small', 'res', { resources: density }).map.tiles.filter(
        (t) => t.resource !== null,
      ).length;
    expect(resources('sparse')).toBeLessThan(resources('standard'));
    expect(resources('standard')).toBeLessThan(resources('abundant'));
  });

  it('gives biased players a start that fits their bias', () => {
    const coastal: StartBias[] = [{ coastal: true, weight: 10 }];
    for (let s = 0; s < 5; s++) {
      const { map, starts } = generateMap(
        {
          content,
          settings: settings('continents', 'tiny'),
          players: [{ id: 'p1' }, { id: 'p2', startBias: coastal }, { id: 'p3' }, { id: 'p4' }],
        },
        makeRandom(createRng(`bias-${s}`)),
      );
      const coastNear = (tile: number) =>
        tilesWithin(map, tile, 2).filter(
          (t) =>
            !content.entities.terrain[map.tiles[t]!.terrain]!.water &&
            neighbors(map, t).some((n) => content.entities.terrain[map.tiles[n]!.terrain]!.water),
        ).length;
      const others = ['p1', 'p3', 'p4'].map((id) => coastNear(starts[id]!));
      expect(coastNear(starts.p2!)).toBeGreaterThanOrEqual(Math.max(...others));
    }
  });

  it('balanced starts bring weaker starts closer to the best one', () => {
    const fairness = (balance: MapSettings['startBalance']) => {
      let sum = 0;
      for (let s = 0; s < 6; s++) {
        const { map, starts } = generate('fractal', 'tiny', `bal-${s}`, { startBalance: balance });
        const scores = Object.values(scoreStarts(map, content, starts));
        sum += (Math.min(...scores) * 100) / Math.max(...scores);
      }
      return sum / 6;
    };
    const balanced = fairness('balanced');
    expect(balanced).toBeGreaterThan(fairness('normal'));
    expect(balanced).toBeGreaterThan(85);
  });

  it('refuses maps that cannot fit the players', () => {
    expect(() => generate('archipelago', 'duel', 'crowded', {}, 16)).toThrow(MapGenerationError);
  });

  it('places modded terrain that declares where it belongs', () => {
    const base = readPackageDir(BASE_CONTENT_DIR);
    const modded = compileContent([
      base,
      {
        source: 'steppe-mod',
        manifest: { id: 'steppe-mod', name: 'Steppe', version: '1.0.0' },
        files: [
          {
            path: 'steppe.json',
            data: {
              type: 'terrain',
              id: 'steppe',
              name: 'Steppe',
              yields: { food: 1, production: 1 },
              elevations: ['flat', 'hills'],
              color: '#a0a060',
              generation: { temperature: [27, 100], moisture: [25, 50], priority: 50 },
            },
          },
        ],
      },
    ]).content!;
    const { map, starts } = generateMap(
      { content: modded, settings: settings('continents', 'tiny'), players: players(4) },
      makeRandom(createRng('steppe')),
    );
    expect(map.tiles.filter((t) => t.terrain === 'steppe').length).toBeGreaterThan(20);
    expect(validateMap(map, starts, modded)).toEqual([]);
  });
});

describe('map breadth (F7)', () => {
  const players = ['p1', 'p2', 'p3', 'p4'].map((id) => ({ id }));
  const gen = (extra: Partial<MapSettings> = {}, seed = 'breadth') =>
    generateMap(
      {
        content,
        settings: {
          script: 'continents',
          size: 'small',
          wrapX: true,
          resources: 'standard',
          startBalance: 'normal',
          ...extra,
        },
        players,
      },
      makeRandom(createRng(seed)),
    );
  const isWonder = (f: string | null) => !!f && !!content.entities.feature[f]?.naturalWonder;

  it('places natural wonders apart from each other and from every start', () => {
    const { map, starts } = gen();
    const wonders = map.tiles.flatMap((t, i) => (isWonder(t.feature) ? [i] : []));
    expect(wonders.length).toBe(content.entities.mapSize.small!.naturalWonders);
    const spacing = content.rules.mapgen.naturalWonderSpacing;
    for (const a of wonders) {
      for (const b of wonders)
        if (a !== b) expect(distance(map, a, b)).toBeGreaterThanOrEqual(spacing);
      for (const s of Object.values(starts)) expect(distance(map, a, s)).toBeGreaterThanOrEqual(3);
      expect(map.tiles[a]!.resource).toBeNull();
    }
  });

  it('moves land, mountains and climate with the world settings', () => {
    const land = (m: ReturnType<typeof gen>['map']) =>
      m.tiles.filter((t) => !content.entities.terrain[t.terrain]!.water).length;
    const mountains = (m: ReturnType<typeof gen>['map']) =>
      m.tiles.filter((t) => t.elevation === 'mountain').length;
    expect(land(gen({ seaLevel: 'low' }).map)).toBeGreaterThan(land(gen({ seaLevel: 'high' }).map));
    expect(mountains(gen({ age: 'new' }).map)).toBeGreaterThan(mountains(gen({ age: 'old' }).map));
    const count = (m: ReturnType<typeof gen>['map'], terrain: string) =>
      m.tiles.filter((t) => t.terrain === terrain).length;
    expect(count(gen({ temperature: 'hot' }).map, 'desert')).toBeGreaterThan(
      count(gen({ temperature: 'cool' }).map, 'desert'),
    );
  });

  it(
    'generates every map type validly, and shuffle the same way from the same seed',
    { timeout: 30_000 },
    () => {
      for (const script of content.ids.mapScript) {
        const { map, starts } = gen({ script });
        expect(validateMap(map, starts, content), script).toEqual([]);
      }
      expect(gen({ script: 'shuffle' }, 'same').map).toEqual(
        gen({ script: 'shuffle' }, 'same').map,
      );
    },
  );
});
