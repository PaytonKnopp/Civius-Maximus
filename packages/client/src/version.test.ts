import { describe, expect, it } from 'vitest';
import { RELEASE_MERGES, formatVersion } from './version';

describe('formatVersion', () => {
  it('is 1.0 at the release and for anything before it', () => {
    expect(formatVersion(RELEASE_MERGES)).toBe('1.0');
    expect(formatVersion(RELEASE_MERGES - 5)).toBe('1.0');
    expect(formatVersion(0)).toBe('1.0');
  });

  it('goes up 0.01 for every merge after it', () => {
    expect(formatVersion(RELEASE_MERGES + 1)).toBe('1.01');
    expect(formatVersion(RELEASE_MERGES + 2)).toBe('1.02');
    expect(formatVersion(RELEASE_MERGES + 10)).toBe('1.10');
    expect(formatVersion(RELEASE_MERGES + 99)).toBe('1.99');
  });

  it('rolls over to the next whole number after 99 merges', () => {
    expect(formatVersion(RELEASE_MERGES + 100)).toBe('2.0');
    expect(formatVersion(RELEASE_MERGES + 101)).toBe('2.01');
  });
});
