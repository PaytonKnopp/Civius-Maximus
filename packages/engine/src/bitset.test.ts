import { describe, expect, it } from 'vitest';
import { decodeBits, emptyBits, encodeBits, getBit, setBit, testBit } from './bitset';

describe('testBit', () => {
  it('answers like decoding the whole set, for every bit, at awkward sizes', () => {
    for (const size of [1, 7, 8, 9, 23, 24, 25, 100, 4536]) {
      const bits = emptyBits(size);
      // A fixed pattern (no randomness in the engine's tests either).
      for (let i = 0; i < size; i++) if ((i * 7 + (i >> 2)) % 3 === 0) setBit(bits, i);
      const text = encodeBits(bits);
      const decoded = decodeBits(text, size);
      for (let i = 0; i < size; i++) expect(testBit(text, i)).toBe(getBit(decoded, i));
    }
  });

  it('says no for bits past the end and for empty text', () => {
    expect(testBit('', 5)).toBe(false);
    expect(testBit(encodeBits(emptyBits(8)), 4000)).toBe(false);
  });
});
