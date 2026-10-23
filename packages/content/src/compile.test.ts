import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compileContent, type RawPackage } from './compile';
import { formatDiagnostic } from './diagnostics';
import { contentFileJsonSchema, manifestJsonSchema } from './json-schema';
import { BASE_CONTENT_DIR, compileFromDirs, readPackageDir } from './node/index';

const fixture = (name: string) =>
  fileURLToPath(new URL(`../test-fixtures/${name}`, import.meta.url));

function messages(modDirs: string[]): string[] {
  return compileFromDirs(modDirs).diagnostics.map(formatDiagnostic);
}

function pkg(id: string, extra: Record<string, unknown> = {}, files: RawPackage['files'] = []) {
  return { source: id, manifest: { id, name: id, version: '1.0.0', ...extra }, files };
}

describe('base content', () => {
  const result = compileFromDirs();

  it('compiles with no diagnostics', () => {
    expect(result.diagnostics.map(formatDiagnostic)).toEqual([]);
    expect(result.content).toBeDefined();
  });

  it('has the core yields, terrains and rules', () => {
    const c = result.content!;
    expect(c.ids.yield).toEqual(
      expect.arrayContaining(['food', 'production', 'gold', 'science', 'culture', 'happiness']),
    );
    expect(c.entities.terrain.grassland?.yields).toEqual({ food: 2 });
    expect(c.rules.movement.canAlwaysMoveOneTile).toBe(true);
    expect(c.packages.map((p) => p.id)).toEqual(['base']);
  });

  it('lists ids sorted, for deterministic iteration', () => {
    const ids = result.content!.ids.terrain;
    expect(ids).toEqual([...ids].sort());
  });

  it('hashes deterministically', () => {
    expect(compileFromDirs().content!.hash).toBe(result.content!.hash);
  });
});

describe('a valid mod', () => {
  const result = compileFromDirs([fixture('good-mod')]);
  const c = result.content!;

  it('compiles, loading after base', () => {
    expect(result.diagnostics).toEqual([]);
    expect(c.packages.map((p) => p.id)).toEqual(['base', 'good-mod']);
  });

  it('adds new content', () => {
    expect(c.entities.terrain.savanna?.yields).toEqual({ food: 1, production: 1, gold: 1 });
    expect(c.entities.ability.ability_sea_raiders?.effects).toHaveLength(2);
  });

  it('applies set, append and delete patches', () => {
    expect(c.entities.terrain.grassland?.yields).toEqual({ food: 2, gold: 1 });
    expect(c.entities.feature.woods?.validTerrains).toContain('savanna');
    expect(c.entities.resource.uranium).toBeUndefined();
    expect(c.ids.resource).not.toContain('uranium');
  });

  it('fills in schema defaults', () => {
    expect(c.entities.terrain.savanna?.moveCost).toBe(1);
    expect(c.entities.ability.ability_sea_raiders?.effects[1]).toMatchObject({
      params: { every: 1 },
      target: { owner: 'self' },
    });
  });

  it('changes the content hash', () => {
    expect(c.hash).not.toBe(compileFromDirs().content!.hash);
  });
});

describe('a broken mod', () => {
  const out = messages([fixture('broken-mod')]);
  const expectMessage = (where: string, text: string) =>
    expect(
      out.some((m) => m.includes(where) && m.includes(text)),
      `${where} / ${text}\n${out.join('\n')}`,
    ).toBe(true);

  it('does not compile', () => {
    expect(compileFromDirs([fixture('broken-mod')]).content).toBeUndefined();
  });

  it('reports invalid JSON with the file name', () => {
    expectMessage('broken-mod/bad.json', 'not valid JSON');
  });

  it('reports wrong types with the value it got', () => {
    expectMessage('[0].moveCost', 'must be a number, got "2"');
  });

  it('reports duplicate ids and suggests a patch', () => {
    expectMessage('[2].id', 'duplicate id "grassland" (already defined in base/terrain.json)');
    expectMessage('[2].id', 'use a patch');
  });

  it('reports unknown content types', () => {
    expectMessage('[3].type', 'unknown type "unit"');
  });

  it('reports bad ids and unknown fields', () => {
    expectMessage('[4].id', 'must be snake_case');
    expectMessage('[4]', 'unknown field "colour"');
  });

  it('suggests close matches for unknown references', () => {
    expectMessage('[1].validTerrains[0]', 'unknown terrain "grasland" (did you mean "grassland"?)');
  });

  it('reports references to the wrong kind of content', () => {
    expectMessage('[5].validTerrains[0]', '"woods" is a feature, not a terrain');
  });

  it('reports missing display text', () => {
    expectMessage('[5].name', 'missing text for "@broken.glade"');
  });

  it('reports patches whose target does not exist', () => {
    expectMessage('[6].target', 'patch target "warrior" not found');
  });

  it('reports patch operations that cannot apply', () => {
    expectMessage('[7].ops[0]', '"yields" is not a list');
  });

  it('re-validates patched content', () => {
    expectMessage('[8].ops', 'after patching, "plains" is invalid: moveCost must be at least 1');
  });

  it('reports unknown effects and conditions, listing what is allowed', () => {
    expectMessage(
      '[9].effects[0].effect',
      'unknown effect "teleport" (expected one of: modify_yield',
    );
    expectMessage(
      '[9].effects[1].condition',
      'unknown "tile_is_cool" (expected one of: all, any, not',
    );
  });

  it('reports every problem in one pass', () => {
    expect(out).toHaveLength(14);
  });
});

describe('load order', () => {
  const base = readPackageDir(BASE_CONTENT_DIR);

  it('puts dependencies first and breaks ties alphabetically', () => {
    const result = compileContent([
      pkg('zeta'),
      pkg('alpha', { dependsOn: ['zeta'] }),
      base,
      pkg('beta'),
    ]);
    expect(result.content!.packages.map((p) => p.id)).toEqual(['base', 'beta', 'zeta', 'alpha']);
  });

  it('honors loadAfter only for packages that are present', () => {
    const result = compileContent([base, pkg('a', { loadAfter: ['b', 'missing'] }), pkg('b')]);
    expect(result.diagnostics).toEqual([]);
    expect(result.content!.packages.map((p) => p.id)).toEqual(['base', 'b', 'a']);
  });

  it('reports missing dependencies', () => {
    const out = compileContent([base, pkg('a', { dependsOn: ['ghost'] })]).diagnostics.map(
      formatDiagnostic,
    );
    expect(out).toEqual([expect.stringContaining('depends on "ghost", which isn\'t loaded')]);
  });

  it('reports cycles', () => {
    const out = compileContent([
      base,
      pkg('a', { dependsOn: ['b'] }),
      pkg('b', { dependsOn: ['a'] }),
    ]).diagnostics.map(formatDiagnostic);
    expect(out).toEqual([expect.stringContaining('load order cycle between: a, b')]);
  });

  it('reports broken manifests', () => {
    const out = compileContent([
      base,
      { source: 'my folder', manifest: { id: 'Bad Id' }, files: [] },
    ]).diagnostics.map(formatDiagnostic);
    expect(out).toEqual(
      expect.arrayContaining([
        expect.stringContaining('my folder/mod.json  id  must be kebab-case'),
        expect.stringContaining('my folder/mod.json  version  is required'),
      ]),
    );
  });

  it('lets a later package patch content from an earlier one', () => {
    const result = compileContent([
      base,
      pkg('first', {}, [
        {
          path: 'a.json',
          data: { type: 'terrain', id: 'steppe', name: 'Steppe', color: '#999966' },
        },
      ]),
      pkg('second', { dependsOn: ['first'] }, [
        {
          path: 'b.json',
          data: {
            type: 'patch',
            target: 'steppe',
            ops: [{ op: 'set', path: 'moveCost', value: 2 }],
          },
        },
      ]),
    ]);
    expect(result.diagnostics).toEqual([]);
    expect(result.content!.entities.terrain.steppe?.moveCost).toBe(2);
  });

  it('reports references to content a patch deleted', () => {
    const out = compileContent([
      base,
      pkg('m', {}, [
        { path: 'p.json', data: { type: 'patch', target: 'desert', ops: [{ op: 'delete' }] } },
      ]),
    ]).diagnostics.map(formatDiagnostic);
    expect(out).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'base/features.json  [3].validTerrains[0]  unknown terrain "desert"',
        ),
      ]),
    );
  });
});

describe('json schema export', () => {
  it('produces schemas for content files and manifests', () => {
    expect(JSON.stringify(contentFileJsonSchema())).toContain('yield_per_adjacent');
    expect(manifestJsonSchema()).toMatchObject({ type: 'object' });
  });
});
