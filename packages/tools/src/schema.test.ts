import { readFileSync } from 'node:fs';
import { contentFileJsonSchema, manifestJsonSchema } from '@cx/content';
import { describe, expect, it } from 'vitest';

const committed = (name: string) =>
  JSON.parse(readFileSync(new URL(`../../../schemas/${name}`, import.meta.url), 'utf8')) as unknown;

describe('committed JSON schemas', () => {
  it('are up to date (run `pnpm cx schema` if this fails)', () => {
    expect(committed('content-file.schema.json')).toEqual(contentFileJsonSchema());
    expect(committed('mod.schema.json')).toEqual(manifestJsonSchema());
  });
});
