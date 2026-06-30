import type { Binding, ModbusDevice } from '../../shared/schema.js';
import type { FeaturePayload } from '../../shared/snapshot.js';
import { FEATURE_CATALOG } from '../../shared/catalog.js';
import {
  applyScale,
  assertValidWords,
  decodeNumeric,
  decodeString,
  encodeNumeric,
  extractBit,
  registerCount,
  removeScale,
} from './codec.js';

export type DecodedValue = number | boolean | string | null;

/** How many registers/coils a binding needs to read. */
export function bindingReadCount(binding: Binding): number {
  if (binding.registerKind === 'coil' || binding.registerKind === 'discrete') return 1;
  if (binding.dataType === 'string') return registerCount('string', binding.stringLength ?? 1);
  if (binding.dataType === 'bool') return 1;
  return registerCount(binding.dataType);
}

/**
 * Decode the raw register words read for a binding into a typed value.
 * `raw` is always an array of numbers; the adapter maps coil booleans to 0/1.
 * `scaleFactor` is the live signed SF value (SunSpec) when the binding references
 * a scale-factor register; the effective scale becomes `scale * 10^SF`.
 */
export function decodeBinding(binding: Binding, raw: number[], scaleFactor?: number): DecodedValue {
  if (raw.length === 0) return null;

  if (binding.registerKind === 'coil' || binding.registerKind === 'discrete') {
    const bit = (raw[0] ?? 0) !== 0;
    return binding.invert ? !bit : bit;
  }

  if (binding.dataType === 'bool') {
    assertValidWords(raw.slice(0, 1));
    const bit =
      binding.bitIndex !== undefined ? extractBit(raw[0] ?? 0, binding.bitIndex) : (raw[0] ?? 0) !== 0;
    return binding.invert ? !bit : bit;
  }

  if (binding.dataType === 'string') {
    assertValidWords(raw);
    return decodeString(raw, binding.byteSwap);
  }

  const rawNum = decodeNumeric(raw, binding.dataType, binding.wordSwap, binding.byteSwap);
  let scale = binding.scale;
  if (binding.scaleFactorAddress !== undefined && scaleFactor !== undefined) {
    scale = binding.scale * Math.pow(10, scaleFactor);
  }
  return applyScale(rawNum, scale, binding.offset, binding.precision);
}

export type WriteOp =
  | { bindingId: string; hubId: string; unitId: number; kind: 'coil'; address: number; coil: boolean }
  | { bindingId: string; hubId: string; unitId: number; kind: 'register'; address: number; registers: number[] }
  | {
      bindingId: string;
      hubId: string;
      unitId: number;
      kind: 'bit';
      address: number;
      bitIndex: number;
      bitOn: boolean;
    };

/** Translate a desired feature value into a Modbus write operation. */
export function encodeBinding(device: ModbusDevice, binding: Binding, value: number | boolean): WriteOp | null {
  if (binding.access !== 'rw') return null;
  const base = { bindingId: binding.id, hubId: device.hubId, unitId: device.unitId, address: binding.address };

  if (binding.registerKind === 'coil') {
    const on = typeof value === 'boolean' ? value : value !== 0;
    return { ...base, kind: 'coil', coil: binding.invert ? !on : on };
  }

  // discrete and input registers are read-only by Modbus definition.
  if (binding.registerKind === 'discrete' || binding.registerKind === 'input') return null;

  // Holding register write.
  if (binding.dataType === 'bool') {
    const on = typeof value === 'boolean' ? value : value !== 0;
    const effective = binding.invert ? !on : on;
    if (binding.bitIndex !== undefined) {
      return { ...base, kind: 'bit', bitIndex: binding.bitIndex, bitOn: effective };
    }
    return { ...base, kind: 'register', registers: [effective ? 1 : 0] };
  }

  if (binding.dataType === 'string') return null;

  const numeric = typeof value === 'number' ? value : value ? 1 : 0;
  const clamped = clampSafety(numeric, binding.writeMin, binding.writeMax);
  const rawNum = removeScale(clamped, binding.scale, binding.offset);
  const registers = encodeNumeric(rawNum, binding.dataType, binding.wordSwap, binding.byteSwap);
  return { ...base, kind: 'register', registers };
}

/** Clamp a commanded value to the binding's configured safety range. */
export function clampSafety(value: number, min?: number, max?: number): number {
  let v = value;
  if (min !== undefined) v = Math.max(min, v);
  if (max !== undefined) v = Math.min(max, v);
  return v;
}

/**
 * Assemble Connect feature payloads from decoded binding values. Bindings are
 * grouped by feature type; each contributes its field. `shutterDirection` is
 * never assembled here — it is driven by live movement state, not a register.
 */
export function assembleFeatures(
  bindings: Binding[],
  values: Map<string, DecodedValue>,
): FeaturePayload[] {
  const byType = new Map<string, FeaturePayload>();
  for (const binding of bindings) {
    if (binding.featureType === 'shutterDirection') continue;
    const value = values.get(binding.id);
    if (value === null || value === undefined) continue;
    const def = FEATURE_CATALOG[binding.featureType];
    const fieldDef = def.fields.find((f) => f.field === binding.field);
    let coerced: unknown = value;
    if (fieldDef?.kind === 'boolean') {
      coerced = typeof value === 'boolean' ? value : value !== 0;
    } else if (fieldDef?.kind === 'number') {
      const n = typeof value === 'number' ? value : Number(value);
      coerced = clampField(n, fieldDef.min, fieldDef.max);
    }
    let payload = byType.get(binding.featureType);
    if (!payload) {
      payload = { type: binding.featureType };
      byType.set(binding.featureType, payload);
    }
    payload[binding.field] = coerced;
  }
  return [...byType.values()];
}

function clampField(value: number, min?: number, max?: number): number {
  if (Number.isNaN(value)) return 0;
  let v = value;
  if (min !== undefined) v = Math.max(min, v);
  if (max !== undefined) v = Math.min(max, v);
  return v;
}

/** Find the binding that should receive a write for a given feature/field. */
export function findWritableBinding(
  device: ModbusDevice,
  featureType: string,
  field: string,
): Binding | undefined {
  return device.bindings.find(
    (b) => b.featureType === featureType && b.field === field && b.access === 'rw',
  );
}
