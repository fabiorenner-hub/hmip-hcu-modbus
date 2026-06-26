import type { AppConfig, ModbusDevice } from '../../shared/schema.js';
import { DEVICE_TYPE_CATALOG } from '../../shared/catalog.js';

export interface ValidationIssue {
  level: 'error' | 'warning';
  scope: 'config' | 'hub' | 'device';
  id: string | null;
  message: { de: string; en: string };
}

export interface ValidationResult {
  readiness: 'READY' | 'CONFIG_REQUIRED' | 'ERROR';
  issues: ValidationIssue[];
}

/** Required feature types of a device that have no binding yet. */
export function missingRequiredFeatures(device: ModbusDevice): string[] {
  const def = DEVICE_TYPE_CATALOG[device.deviceType];
  const bound = new Set(device.bindings.map((b) => b.featureType));
  return def.required.filter((req) => !bound.has(req));
}

/** Validate the whole config and derive the plugin readiness status. */
export function validateConfig(config: AppConfig): ValidationResult {
  const issues: ValidationIssue[] = [];
  const hubIds = new Set(config.hubs.map((h) => h.id));

  if (config.hubs.length === 0) {
    issues.push({
      level: 'warning',
      scope: 'config',
      id: null,
      message: { de: 'Kein Modbus-Hub konfiguriert.', en: 'No Modbus hub configured.' },
    });
  }
  if (config.devices.length === 0) {
    issues.push({
      level: 'warning',
      scope: 'config',
      id: null,
      message: { de: 'Kein Gerät konfiguriert.', en: 'No device configured.' },
    });
  }

  // Requirement 1.10: Unit_Id must be unique within each hub.
  const unitsByHub = new Map<string, Map<number, string>>();
  for (const device of config.devices) {
    const seen = unitsByHub.get(device.hubId) ?? new Map<number, string>();
    const prior = seen.get(device.unitId);
    if (prior) {
      issues.push({
        level: 'error',
        scope: 'device',
        id: device.id,
        message: {
          de: `Unit-ID ${device.unitId} wird auf demselben Hub mehrfach verwendet (Gerät „${device.friendlyName}" und „${prior}").`,
          en: `Unit ID ${device.unitId} is used more than once on the same hub (devices "${device.friendlyName}" and "${prior}").`,
        },
      });
    } else {
      seen.set(device.unitId, device.friendlyName);
    }
    unitsByHub.set(device.hubId, seen);
  }

  let readyDevices = 0;
  for (const device of config.devices) {
    if (!hubIds.has(device.hubId)) {
      issues.push({
        level: 'error',
        scope: 'device',
        id: device.id,
        message: {
          de: `Gerät „${device.friendlyName}" verweist auf einen unbekannten Hub.`,
          en: `Device "${device.friendlyName}" references an unknown hub.`,
        },
      });
      continue;
    }
    const missing = missingRequiredFeatures(device);
    if (missing.length > 0) {
      issues.push({
        level: 'warning',
        scope: 'device',
        id: device.id,
        message: {
          de: `Gerät „${device.friendlyName}" fehlen Pflicht-Features: ${missing.join(', ')}.`,
          en: `Device "${device.friendlyName}" is missing required features: ${missing.join(', ')}.`,
        },
      });
    } else if (device.enabled && device.bindings.length > 0) {
      readyDevices += 1;
    }
  }

  const hasError = issues.some((i) => i.level === 'error');
  let readiness: ValidationResult['readiness'];
  if (config.hubs.length === 0 || config.devices.length === 0 || readyDevices === 0 || hasError) {
    readiness = 'CONFIG_REQUIRED';
  } else {
    readiness = 'READY';
  }

  return { readiness, issues };
}
