import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runValidate } from './validate';

const fixture = (name: string) =>
  fileURLToPath(new URL(`../../content/test-fixtures/${name}`, import.meta.url));

describe('cx validate', () => {
  it('passes on the base game', () => {
    const { ok, lines } = runValidate([]);
    expect(ok).toBe(true);
    expect(lines[0]).toMatch(/^✓ base \d+\.\d+\.\d+ {2}Civius Maximus$/);
  });

  it('passes on a valid mod and lists it', () => {
    const { ok, lines } = runValidate([fixture('good-mod')]);
    expect(ok).toBe(true);
    expect(lines).toContain('✓ good-mod 1.0.0  Fertile Lands');
  });

  it('fails on a broken mod with a summary', () => {
    const { ok, lines } = runValidate([fixture('broken-mod')]);
    expect(ok).toBe(false);
    expect(lines.at(-1)).toBe('✗ 14 errors, 0 warnings');
  });
});
