import { describe, it, expect } from 'vitest';
import { decideBundle, otaNewerThanCore } from '../src/bootstrap/loader.js';

const core = '1.0.6';

describe('decideBundle', () => {
  it('no OTA payload → image', () => {
    expect(decideBundle({ hasActive: false, manifest: null, mainShaActual: null, coreVersion: core, bootAttempts: 0 })).toEqual({
      target: 'image',
      reason: 'no-ota',
      quarantine: false,
    });
  });

  it('invalid manifest → image + quarantine', () => {
    const d = decideBundle({ hasActive: true, manifest: null, mainShaActual: 'x', coreVersion: core, bootAttempts: 0 });
    expect(d.target).toBe('image');
    expect(d.reason).toBe('bad-manifest');
    expect(d.quarantine).toBe(true);
  });

  it('sha mismatch → image + quarantine', () => {
    const d = decideBundle({
      hasActive: true,
      manifest: { version: '1.0.7', minCoreVersion: '1.0.0', mainSha256: 'a'.repeat(64) },
      mainShaActual: 'b'.repeat(64),
      coreVersion: core,
      bootAttempts: 0,
    });
    expect(d).toEqual({ target: 'image', reason: 'sha-mismatch', quarantine: true });
  });

  it('requires newer core → image, NO quarantine', () => {
    const d = decideBundle({
      hasActive: true,
      manifest: { version: '2.0.0', minCoreVersion: '2.0.0' },
      mainShaActual: null,
      coreVersion: core,
      bootAttempts: 0,
    });
    expect(d).toEqual({ target: 'image', reason: 'requires-core', quarantine: false });
  });

  it('core supersedes an older/equal payload → image, NO quarantine', () => {
    const d = decideBundle({
      hasActive: true,
      manifest: { version: '1.0.0', minCoreVersion: '1.0.0' },
      mainShaActual: null,
      coreVersion: core,
      bootAttempts: 0,
    });
    expect(d).toEqual({ target: 'image', reason: 'core-supersedes', quarantine: false });
  });

  it('crash loop → image + quarantine', () => {
    const d = decideBundle({
      hasActive: true,
      manifest: { version: '1.0.7', minCoreVersion: '1.0.0' },
      mainShaActual: null,
      coreVersion: core,
      bootAttempts: 3,
    });
    expect(d).toEqual({ target: 'image', reason: 'crash-loop', quarantine: true });
  });

  it('healthy newer payload → OTA', () => {
    const d = decideBundle({
      hasActive: true,
      manifest: { version: '1.0.7', minCoreVersion: '1.0.0' },
      mainShaActual: null,
      coreVersion: core,
      bootAttempts: 0,
    });
    expect(d).toEqual({ target: 'ota', reason: 'ota', quarantine: false });
  });

  it('otaNewerThanCore compares with build stamps', () => {
    expect(otaNewerThanCore('1.0.7', '1.0.6')).toBe(true);
    expect(otaNewerThanCore('1.0.6', '1.0.6')).toBe(false);
    expect(otaNewerThanCore('1.0.6+exp.2', '1.0.6')).toBe(true);
  });
});
