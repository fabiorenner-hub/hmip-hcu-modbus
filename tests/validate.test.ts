import { describe, it, expect } from 'vitest';
import { validateConfig, missingRequiredFeatures } from '../src/plugin/engine/validate.js';
import { defaultConfig, parseConfigSafe } from '../src/shared/schema.js';
import type { AppConfig } from '../src/shared/schema.js';

describe('parseConfigSafe', () => {
  it('falls back to defaults on garbage input', () => {
    const { ok, config } = parseConfigSafe({ hubs: 'nope' });
    expect(ok).toBe(false);
    expect(config.hubs).toEqual([]);
  });
  it('applies schema defaults for omitted fields', () => {
    const { ok, config } = parseConfigSafe({ hubs: [{ id: 'h', name: 'H' }] });
    expect(ok).toBe(true);
    expect(config.hubs[0]!.port).toBe(502);
    expect(config.hubs[0]!.kind).toBe('tcp');
  });
});

describe('validateConfig', () => {
  it('reports CONFIG_REQUIRED for an empty config', () => {
    expect(validateConfig(defaultConfig()).readiness).toBe('CONFIG_REQUIRED');
  });

  it('flags devices referencing unknown hubs', () => {
    const cfg: AppConfig = {
      ...defaultConfig(),
      hubs: [],
      devices: [
        {
          id: 'd', hubId: 'missing', unitId: 1, deviceType: 'SWITCH', friendlyName: 'D',
          modelType: 'M', firmwareVersion: '1', pollMs: 1000, snapTolerance: 0, enabled: true, bindings: [],
        },
      ],
    };
    const result = validateConfig(cfg);
    expect(result.issues.some((i) => i.level === 'error')).toBe(true);
  });
  it('flags duplicate unit IDs on the same hub', () => {
    const mk = (id: string, unitId: number) => ({
      id, hubId: 'h', unitId, deviceType: 'SWITCH' as const, friendlyName: id,
      modelType: 'M', firmwareVersion: '1', pollMs: 1000, snapTolerance: 0, enabled: true, bindings: [],
    });
    const cfg: AppConfig = {
      ...defaultConfig(),
      hubs: [{ id: 'h', name: 'H', kind: 'tcp', host: '127.0.0.1', port: 502, serialPath: '', baudRate: 9600, parity: 'none', dataBits: 8, stopBits: 1, timeoutMs: 2000, delayMs: 0, enabled: true }],
      devices: [mk('a', 1), mk('b', 1)],
    };
    const result = validateConfig(cfg);
    expect(result.issues.some((i) => i.level === 'error' && /Unit/i.test(i.message.en))).toBe(true);
    expect(result.readiness).toBe('CONFIG_REQUIRED');
  });
});

describe('missingRequiredFeatures', () => {
  it('lists required features without a binding', () => {
    const missing = missingRequiredFeatures({
      id: 'd', hubId: 'h', unitId: 1, deviceType: 'SWITCH', friendlyName: 'D',
      modelType: 'M', firmwareVersion: '1', pollMs: 1000, snapTolerance: 0, enabled: true, bindings: [],
    });
    expect(missing).toContain('switchState');
  });
});
