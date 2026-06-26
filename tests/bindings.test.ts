import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { decodeBinding, encodeBinding, clampSafety, assembleFeatures } from '../src/plugin/engine/bindings.js';
import type { Binding, ModbusDevice } from '../src/shared/schema.js';

function binding(over: Partial<Binding>): Binding {
  return {
    id: 'b',
    featureType: 'actualTemperature',
    field: 'actualTemperature',
    registerKind: 'holding',
    address: 10,
    dataType: 'uint16',
    scale: 1,
    offset: 0,
    wordSwap: false,
    byteSwap: false,
    access: 'ro',
    invert: false,
    verify: false,
    ...over,
  };
}

function device(bindings: Binding[]): ModbusDevice {
  return {
    id: 'd', hubId: 'h', unitId: 1, deviceType: 'THERMOSTAT', friendlyName: 'D',
    modelType: 'M', firmwareVersion: '1', pollMs: 1000, snapTolerance: 0, enabled: true, bindings,
  };
}

describe('decodeBinding', () => {
  it('decodes a scaled holding register', () => {
    const b = binding({ scale: 0.1, precision: 1 });
    expect(decodeBinding(b, [235])).toBe(23.5);
  });
  it('decodes a coil as boolean with inversion', () => {
    expect(decodeBinding(binding({ registerKind: 'coil' }), [1])).toBe(true);
    expect(decodeBinding(binding({ registerKind: 'coil', invert: true }), [1])).toBe(false);
  });
  it('extracts a bit', () => {
    expect(decodeBinding(binding({ dataType: 'bool', bitIndex: 2 }), [0b100])).toBe(true);
  });
});

describe('clampSafety', () => {
  it('clamps to nearest boundary', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1000, max: 1000 }), (v) => {
        const out = clampSafety(v, 0, 100);
        expect(out).toBeGreaterThanOrEqual(0);
        expect(out).toBeLessThanOrEqual(100);
        if (v < 0) expect(out).toBe(0);
        if (v > 100) expect(out).toBe(100);
      }),
    );
  });
});

describe('encodeBinding', () => {
  it('rejects read-only bindings', () => {
    expect(encodeBinding(device([]), binding({ access: 'ro' }), 1)).toBeNull();
  });
  it('encodes a writable coil', () => {
    const op = encodeBinding(device([]), binding({ registerKind: 'coil', access: 'rw' }), true);
    expect(op).toEqual({ bindingId: 'b', hubId: 'h', unitId: 1, address: 10, kind: 'coil', coil: true });
  });
  it('clamps before encoding and round-trips through decode', () => {
    const b = binding({ access: 'rw', scale: 0.1, writeMin: 0, writeMax: 50, precision: 1 });
    const op = encodeBinding(device([b]), b, 999);
    expect(op?.kind).toBe('register');
    if (op?.kind === 'register') {
      // 50 / 0.1 = 500
      expect(decodeBinding(b, op.registers)).toBe(50);
    }
  });
});

describe('assembleFeatures', () => {
  it('groups bindings into feature payloads and skips shutterDirection', () => {
    const bindings = [
      binding({ id: 'temp', featureType: 'actualTemperature', field: 'actualTemperature' }),
      binding({ id: 'dir', featureType: 'shutterDirection', field: 'shutterDirection' }),
    ];
    const values = new Map<string, number | boolean | string | null>([
      ['temp', 21.5],
      ['dir', 1],
    ]);
    const feats = assembleFeatures(bindings, values);
    expect(feats).toHaveLength(1);
    expect(feats[0]!.type).toBe('actualTemperature');
    expect(feats[0]!.actualTemperature).toBe(21.5);
  });
});
