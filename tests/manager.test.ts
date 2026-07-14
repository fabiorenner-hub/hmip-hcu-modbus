import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OtaManager } from '../src/plugin/ota/manager.js';
import { LATEST_RELEASE_API, RELEASES_API, type FetchLike } from '../src/plugin/ota/github.js';

const MANIFEST_URL = 'https://x/ota-manifest.json';

function releaseWithManifest(tag: string, prerelease: boolean) {
  return {
    tag_name: tag,
    html_url: `https://github.com/fabiorenner-hub/hmip-hcu-modbus/releases/tag/${tag}`,
    prerelease,
    assets: [{ name: 'ota-manifest.json', browser_download_url: MANIFEST_URL }],
  };
}

function makeFetch(map: Record<string, unknown>): FetchLike {
  return async (url) => {
    const val = map[url];
    const present = val !== undefined;
    return {
      ok: present,
      status: present ? 200 : 404,
      json: async () => val,
      text: async () => (typeof val === 'string' ? val : JSON.stringify(val)),
      arrayBuffer: async () => new ArrayBuffer(0),
    };
  };
}

describe('OtaManager', () => {
  beforeEach(() => {
    process.env['MODBUS_BRIDGE_VERSION'] = '1.0.6';
    delete process.env['MODBUS_BRIDGE_OTA_VERSION'];
    delete process.env['MODBUS_BRIDGE_OTA_ACTIVE'];
  });
  afterEach(() => {
    delete process.env['MODBUS_BRIDGE_VERSION'];
  });

  const manifest = (over: Record<string, unknown> = {}) =>
    JSON.stringify({
      version: '1.1.0',
      minCoreVersion: '1.0.0',
      sha256: 'a'.repeat(64),
      assetUrl: 'https://x/bundle.json',
      bundleName: 'modbus-ota-1.1.0.json',
      ...over,
    });

  const mk = (channel: 'stable' | 'experimental', map: Record<string, unknown>) =>
    new OtaManager({
      dataDir: '/tmp/ignored',
      fetchImpl: makeFetch(map),
      getConfig: () => ({ mode: 'manual', channel, checkIntervalHours: 6 }),
      requestRestart: () => undefined,
    });

  it('stable channel offers an installable newer release', async () => {
    const m = mk('stable', { [LATEST_RELEASE_API]: releaseWithManifest('v1.1.0', false), [MANIFEST_URL]: manifest() });
    const s = await m.check();
    expect(s.channel).toBe('stable');
    expect(s.latest?.version).toBe('1.1.0');
    expect(s.latest?.canInstall).toBe(true);
    expect(s.latest?.requiresCore).toBe(false);
  });

  it('experimental channel picks the prerelease and compares build stamps', async () => {
    const m = mk('experimental', {
      [RELEASES_API]: [releaseWithManifest('v1.1.0', false), releaseWithManifest('experimental', true)],
      [MANIFEST_URL]: manifest({ version: '1.0.6+exp.20260707T120000Z' }),
    });
    const s = await m.check();
    expect(s.channel).toBe('experimental');
    expect(s.latest?.version).toBe('1.0.6+exp.20260707T120000Z');
    expect(s.latest?.canInstall).toBe(true);
  });

  it('flags requiresCore when the core image is too old', async () => {
    const m = mk('stable', {
      [LATEST_RELEASE_API]: releaseWithManifest('v2.0.0', false),
      [MANIFEST_URL]: manifest({ version: '2.0.0', minCoreVersion: '2.0.0' }),
    });
    const s = await m.check();
    expect(s.latest?.requiresCore).toBe(true);
    expect(s.latest?.canInstall).toBe(false);
    expect((await m.install()).reason).toBe('requires-core');
  });

  it('reports already-current when the release is not newer', async () => {
    const m = mk('stable', {
      [LATEST_RELEASE_API]: releaseWithManifest('v1.0.6', false),
      [MANIFEST_URL]: manifest({ version: '1.0.6' }),
    });
    const s = await m.check();
    expect(s.latest?.canInstall).toBe(false);
    expect((await m.install()).reason).toBe('already-current');
  });
});
