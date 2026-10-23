/**
 * Tile bitsets stored as base64 text, so per-player data like "explored tiles" stays plain JSON
 * and small (a Standard map is ~760 characters per player). Own encoder: no browser globals.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Map([...ALPHABET].map((c, i) => [c, i]));

export function emptyBits(size: number): Uint8Array {
  return new Uint8Array(Math.ceil(size / 8));
}

export function getBit(bits: Uint8Array, i: number): boolean {
  return ((bits[i >> 3] ?? 0) & (1 << (i & 7))) !== 0;
}

export function setBit(bits: Uint8Array, i: number): void {
  bits[i >> 3] = (bits[i >> 3] ?? 0) | (1 << (i & 7));
}

export function encodeBits(bits: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bits.length; i += 3) {
    const a = bits[i]!;
    const b = bits[i + 1] ?? 0;
    const c = bits[i + 2] ?? 0;
    const n = (a << 16) | (b << 8) | c;
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]!;
    out += i + 1 < bits.length ? ALPHABET[(n >> 6) & 63]! : '=';
    out += i + 2 < bits.length ? ALPHABET[n & 63]! : '=';
  }
  return out;
}

export function decodeBits(text: string, size: number): Uint8Array {
  const bits = emptyBits(size);
  let j = 0;
  for (let i = 0; i < text.length; i += 4) {
    const n =
      ((LOOKUP.get(text[i]!) ?? 0) << 18) |
      ((LOOKUP.get(text[i + 1]!) ?? 0) << 12) |
      ((LOOKUP.get(text[i + 2]!) ?? 0) << 6) |
      (LOOKUP.get(text[i + 3]!) ?? 0);
    for (const shift of [16, 8, 0]) {
      if (j < bits.length) bits[j++] = (n >> shift) & 255;
    }
  }
  return bits;
}
