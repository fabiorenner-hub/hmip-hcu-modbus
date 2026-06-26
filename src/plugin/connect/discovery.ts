import type { AppConfig, ModbusDevice } from '../../shared/schema.js';
import type { DiscoverDevicePayload, FeaturePayload } from '../../shared/snapshot.js';
import { missingRequiredFeatures } from '../engine/validate.js';
import { encodeBinding, findWritableBinding, type WriteOp } from '../engine/bindings.js';
import { FEATURE_CATALOG } from '../../shared/catalog.js';
import type { ControlRequestBody } from './types.js';

/** Build the DISCOVER_RESPONSE device list for all complete, enabled devices. */
export function buildDiscoverDevices(
  config: AppConfig,
  cached: (deviceId: string) => FeaturePayload[],
): DiscoverDevicePayload[] {
  const devices: DiscoverDevicePayload[] = [];
  for (const device of config.devices) {
    if (!device.enabled) continue;
    // Requirement 5.4: exclude devices missing a required feature.
    if (missingRequiredFeatures(device).length > 0) continue;
    devices.push({
      deviceType: device.deviceType,
      deviceId: device.id,
      friendlyName: device.friendlyName,
      modelType: device.modelType,
      firmwareVersion: device.firmwareVersion,
      features: featureSkeleton(device, cached(device.id)),
    });
  }
  return devices;
}

/**
 * Discovery advertises the device's feature set. We use cached live values when
 * available and otherwise a neutral skeleton so the HCU learns the shape.
 */
function featureSkeleton(device: ModbusDevice, cached: FeaturePayload[]): FeaturePayload[] {
  if (cached.length > 0) return cached;
  const types = new Set(device.bindings.map((b) => b.featureType));
  const features: FeaturePayload[] = [];
  for (const type of types) {
    if (type === 'shutterDirection') continue;
    const def = FEATURE_CATALOG[type];
    const payload: FeaturePayload = { type };
    for (const field of def.fields) {
      payload[field.field] = field.kind === 'boolean' ? false : field.kind === 'number' ? 0 : '';
    }
    features.push(payload);
  }
  return features;
}

export interface ResolvedControl {
  writes: WriteOp[];
  /** Commanded feature values, used to prime the cache after a successful write. */
  commanded: FeaturePayload[];
  /** A read-only target was addressed — the command must be rejected. */
  rejected: boolean;
  rejectReason?: string;
}

/**
 * Translate a CONTROL_REQUEST into Modbus write operations. Read-only targets
 * are rejected (Requirement 6.5). Safety clamping happens inside encodeBinding
 * via the field catalog and binding limits.
 */
export function resolveControl(device: ModbusDevice, body: ControlRequestBody): ResolvedControl {
  const writes: WriteOp[] = [];
  const commanded: FeaturePayload[] = [];
  for (const feature of body.features ?? []) {
    const type = feature.type;
    for (const [field, value] of Object.entries(feature)) {
      if (field === 'type') continue;
      const binding = findWritableBinding(device, type, field);
      if (!binding) {
        // No writable binding for this field — treat as read-only rejection.
        return { writes: [], commanded: [], rejected: true, rejectReason: `${type}.${field} is not writable` };
      }
      const coerced = typeof value === 'boolean' ? value : Number(value);
      if (typeof coerced === 'number' && Number.isNaN(coerced)) {
        return { writes: [], commanded: [], rejected: true, rejectReason: `${type}.${field} value is not numeric` };
      }
      const op = encodeBinding(device, binding, coerced);
      if (!op) {
        return { writes: [], commanded: [], rejected: true, rejectReason: `${type}.${field} could not be encoded` };
      }
      writes.push(op);
      commanded.push({ type, [field]: coerced } as FeaturePayload);
    }
  }
  return { writes, commanded, rejected: false };
}
