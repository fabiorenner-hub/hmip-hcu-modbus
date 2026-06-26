import type { ModbusDataType } from '../../shared/schema.js';

/**
 * Pure Modbus value codec. No I/O, no globals — deterministic functions that
 * map between raw 16-bit register words and decoded numbers / strings.
 *
 * Modbus registers are 16-bit big-endian by convention. Multi-word values use
 * `wordSwap` (reverse the word order, CDAB) and `byteSwap` (swap the two bytes
 * inside each word, BADC). The two flags combine for the four common layouts.
 */

/** Number of 16-bit registers a data type occupies (0 means variable/string). */
export function registerCount(dataType: ModbusDataType, stringLength = 1): number {
  switch (dataType) {
    case 'bool':
    case 'int16':
    case 'uint16':
      return 1;
    case 'int32':
    case 'uint32':
    case 'float32':
      return 2;
    case 'int64':
    case 'uint64':
    case 'float64':
      return 4;
    case 'string':
      return Math.max(1, stringLength);
    default:
      return 1;
  }
}

function clampWord(w: number): number {
  // Normalise to an unsigned 16-bit integer.
  return ((Math.trunc(w) % 0x10000) + 0x10000) % 0x10000;
}

/** Turn register words into a big-endian byte array applying swap options. */
export function wordsToBytes(words: number[], wordSwap: boolean, byteSwap: boolean): number[] {
  const ordered = wordSwap ? [...words].reverse() : words;
  const bytes: number[] = [];
  for (const raw of ordered) {
    const w = clampWord(raw);
    const hi = (w >> 8) & 0xff;
    const lo = w & 0xff;
    if (byteSwap) {
      bytes.push(lo, hi);
    } else {
      bytes.push(hi, lo);
    }
  }
  return bytes;
}

/** Inverse of {@link wordsToBytes}. */
export function bytesToWords(bytes: number[], wordSwap: boolean, byteSwap: boolean): number[] {
  const words: number[] = [];
  for (let i = 0; i < bytes.length; i += 2) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const hi = byteSwap ? b : a;
    const lo = byteSwap ? a : b;
    words.push(((hi & 0xff) << 8) | (lo & 0xff));
  }
  return wordSwap ? words.reverse() : words;
}

/** Raised when register input cannot be decoded without silent corruption. */
export class DecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecodeError';
  }
}

/** Validate that every word is a finite unsigned 16-bit integer. */
export function assertValidWords(words: number[]): void {
  for (const w of words) {
    if (!Number.isFinite(w) || !Number.isInteger(w) || w < 0 || w > 0xffff) {
      throw new DecodeError(`invalid register word: ${w}`);
    }
  }
}

/** Decode register words into a raw numeric value (before scale/offset). */
export function decodeNumeric(
  words: number[],
  dataType: ModbusDataType,
  wordSwap: boolean,
  byteSwap: boolean,
): number {
  const needed = registerCount(dataType);
  if (words.length < needed) {
    throw new DecodeError(`expected ${needed} registers for ${dataType}, got ${words.length}`);
  }
  assertValidWords(words.slice(0, needed));
  const bytes = wordsToBytes(words.slice(0, needed), wordSwap, byteSwap);
  const buf = new ArrayBuffer(bytes.length);
  const view = new DataView(buf);
  bytes.forEach((b, i) => view.setUint8(i, b & 0xff));

  switch (dataType) {
    case 'int16':
      return view.getInt16(0, false);
    case 'uint16':
    case 'bool':
      return view.getUint16(0, false);
    case 'int32':
      return view.getInt32(0, false);
    case 'uint32':
      return view.getUint32(0, false);
    case 'float32':
      return view.getFloat32(0, false);
    case 'int64':
      return Number(view.getBigInt64(0, false));
    case 'uint64':
      return Number(view.getBigUint64(0, false));
    case 'float64':
      return view.getFloat64(0, false);
    default:
      return view.getUint16(0, false);
  }
}

/** Encode a raw numeric value back into register words. */
export function encodeNumeric(
  value: number,
  dataType: ModbusDataType,
  wordSwap: boolean,
  byteSwap: boolean,
): number[] {
  const count = registerCount(dataType);
  const buf = new ArrayBuffer(count * 2);
  const view = new DataView(buf);
  switch (dataType) {
    case 'int16':
      view.setInt16(0, clampInt(value, -0x8000, 0x7fff), false);
      break;
    case 'uint16':
    case 'bool':
      view.setUint16(0, clampInt(value, 0, 0xffff), false);
      break;
    case 'int32':
      view.setInt32(0, clampInt(value, -0x80000000, 0x7fffffff), false);
      break;
    case 'uint32':
      view.setUint32(0, clampInt(value, 0, 0xffffffff), false);
      break;
    case 'float32':
      view.setFloat32(0, value, false);
      break;
    case 'int64':
      view.setBigInt64(0, BigInt(Math.trunc(value)), false);
      break;
    case 'uint64':
      view.setBigUint64(0, BigInt(Math.max(0, Math.trunc(value))), false);
      break;
    case 'float64':
      view.setFloat64(0, value, false);
      break;
    default:
      view.setUint16(0, clampInt(value, 0, 0xffff), false);
  }
  const bytes: number[] = [];
  for (let i = 0; i < count * 2; i++) bytes.push(view.getUint8(i));
  return bytesToWords(bytes, wordSwap, byteSwap);
}

function clampInt(value: number, min: number, max: number): number {
  const v = Math.round(value);
  if (Number.isNaN(v)) return 0;
  return Math.max(min, Math.min(max, v));
}

/** Decode an ASCII string from register words (2 chars per register). */
export function decodeString(words: number[], byteSwap: boolean): string {
  let out = '';
  for (const raw of words) {
    const w = clampWord(raw);
    const hi = (w >> 8) & 0xff;
    const lo = w & 0xff;
    const first = byteSwap ? lo : hi;
    const second = byteSwap ? hi : lo;
    if (first !== 0) out += String.fromCharCode(first);
    if (second !== 0) out += String.fromCharCode(second);
  }
  return out;
}

/** Apply scale, offset and optional rounding to a raw numeric value. */
export function applyScale(raw: number, scale: number, offset: number, precision?: number): number {
  const scaled = raw * scale + offset;
  if (precision === undefined) return scaled;
  const f = Math.pow(10, precision);
  return Math.round(scaled * f) / f;
}

/** Inverse of {@link applyScale}: turn a scaled value back into a raw value. */
export function removeScale(value: number, scale: number, offset: number): number {
  if (scale === 0) return 0;
  return (value - offset) / scale;
}

/** Extract a single bit out of a register value. */
export function extractBit(registerValue: number, bitIndex: number): boolean {
  return ((clampWord(registerValue) >> bitIndex) & 1) === 1;
}

/** Set / clear a bit inside a register value. */
export function applyBit(registerValue: number, bitIndex: number, on: boolean): number {
  const w = clampWord(registerValue);
  return on ? w | (1 << bitIndex) : w & ~(1 << bitIndex) & 0xffff;
}
