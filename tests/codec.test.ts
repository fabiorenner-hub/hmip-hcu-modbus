import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  decodeNumeric,
  encodeNumeric,
  wordsToBytes,
  bytesToWords,
  decodeString,
  applyScale,
  removeScale,
  extractBit,
  applyBit,
  registerCount,
  DecodeError,
} from '../src/plugin/engine/codec.js';

const swaps = fc.record({ wordSwap: fc.boolean(), byteSwap: fc.boolean() });

describe('registerCount', () => {
  it('maps data types to word counts', () => {
    expect(registerCount('uint16')).toBe(1);
    expect(registerCount('int32')).toBe(2);
    expect(registerCount('float32')).toBe(2);
    expect(registerCount('uint64')).toBe(4);
    expect(registerCount('string', 5)).toBe(5);
  });
});

describe('wordsToBytes / bytesToWords round-trip', () => {
  it('is its own inverse for any swap combination', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 0xffff }), { minLength: 1, maxLength: 4 }), swaps, (words, s) => {
        const bytes = wordsToBytes(words, s.wordSwap, s.byteSwap);
        const back = bytesToWords(bytes, s.wordSwap, s.byteSwap);
        expect(back).toEqual(words);
      }),
    );
  });
});

describe('encodeNumeric -> decodeNumeric round-trip', () => {
  it('reproduces uint16 values', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffff }), swaps, (v, s) => {
        const words = encodeNumeric(v, 'uint16', s.wordSwap, s.byteSwap);
        expect(decodeNumeric(words, 'uint16', s.wordSwap, s.byteSwap)).toBe(v);
      }),
    );
  });

  it('reproduces int32 values', () => {
    fc.assert(
      fc.property(fc.integer({ min: -0x80000000, max: 0x7fffffff }), swaps, (v, s) => {
        const words = encodeNumeric(v, 'int32', s.wordSwap, s.byteSwap);
        expect(decodeNumeric(words, 'int32', s.wordSwap, s.byteSwap)).toBe(v);
      }),
    );
  });

  it('reproduces uint32 values', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), swaps, (v, s) => {
        const words = encodeNumeric(v, 'uint32', s.wordSwap, s.byteSwap);
        expect(decodeNumeric(words, 'uint32', s.wordSwap, s.byteSwap)).toBe(v);
      }),
    );
  });

  it('reproduces float32 values within float precision', () => {
    fc.assert(
      fc.property(fc.float({ min: -1e6, max: 1e6, noNaN: true }), swaps, (v, s) => {
        const words = encodeNumeric(v, 'float32', s.wordSwap, s.byteSwap);
        const back = decodeNumeric(words, 'float32', s.wordSwap, s.byteSwap);
        expect(Math.abs(back - v)).toBeLessThanOrEqual(Math.abs(v) * 1e-3 + 1e-2);
      }),
    );
  });
});

describe('applyScale / removeScale', () => {
  it('removeScale inverts applyScale (no rounding)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1000, max: 1000 }),
        fc.float({ min: Math.fround(0.001), max: 100, noNaN: true }),
        fc.integer({ min: -50, max: 50 }),
        (raw, scale, offset) => {
          const scaled = applyScale(raw, scale, offset);
          const back = removeScale(scaled, scale, offset);
          expect(Math.abs(back - raw)).toBeLessThanOrEqual(1e-6 + Math.abs(raw) * 1e-9);
        },
      ),
    );
  });

  it('rounds to the configured precision', () => {
    expect(applyScale(12345, 0.001, 0, 2)).toBe(12.35);
    expect(applyScale(1, 1 / 3, 0, 3)).toBe(0.333);
  });
});

describe('bit helpers', () => {
  it('extractBit reads the configured bit', () => {
    expect(extractBit(0b1010, 1)).toBe(true);
    expect(extractBit(0b1010, 0)).toBe(false);
  });
  it('applyBit sets and clears within 16 bits', () => {
    expect(applyBit(0, 3, true)).toBe(0b1000);
    expect(applyBit(0xffff, 0, false)).toBe(0xfffe);
  });
});

describe('DecodeError on invalid input', () => {
  it('throws when too few registers are supplied', () => {
    expect(() => decodeNumeric([1], 'uint32', false, false)).toThrowError(DecodeError);
  });
  it('throws on out-of-range register words', () => {
    expect(() => decodeNumeric([0x1ffff], 'uint16', false, false)).toThrowError(DecodeError);
    expect(() => decodeNumeric([-1], 'uint16', false, false)).toThrowError(DecodeError);
  });
});

describe('decodeString', () => {
  it('decodes ASCII two chars per register', () => {
    const words = [(0x48 << 8) | 0x49, (0x21 << 8) | 0x00]; // "HI!"
    expect(decodeString(words, false)).toBe('HI!');
  });
});
