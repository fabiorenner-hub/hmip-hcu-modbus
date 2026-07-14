import { describe, it, expect } from 'vitest';
import { isNewer, isAtLeast, isNewerWithBuild, buildTail, compareSemver } from '../src/plugin/ota/semver.js';
import { parseManifestJson } from '../src/plugin/ota/manifest.js';
import { sha256Hex, sha256Matches, verifySignature } from '../src/plugin/ota/verify.js';
import {
  parseRelease,
  findOtaAssets,
  fetchLatestPrerelease,
  type FetchLike,
} from '../src/plugin/ota/github.js';

describe('semver', () => {
  it('compares core versions', () => {
    expect(isNewer('1.2.0', '1.1.9')).toBe(true);
    expect(isNewer('1.0.0', '1.0.0')).toBe(false);
    expect(isAtLeast('1.4.7', '1.4.7')).toBe(true);
    expect(compareSemver('2.0.0', '1.9.9')).toBe(1);
  });

  it('isNewerWithBuild: same core → build stamp order, tail beats no-tail', () => {
    expect(isNewerWithBuild('1.0.0+exp.20260101T000000Z', '1.0.0+exp.20250101T000000Z')).toBe(true);
    expect(isNewerWithBuild('1.0.0+exp.20250101T000000Z', '1.0.0+exp.20260101T000000Z')).toBe(false);
    expect(isNewerWithBuild('1.0.0+exp.1', '1.0.0')).toBe(true); // tail beats no tail
    expect(isNewerWithBuild('1.0.0', '1.0.0')).toBe(false);
    expect(isNewerWithBuild('1.1.0+exp.1', '1.0.0+exp.9')).toBe(true); // core wins first
  });

  it('buildTail extracts the +build metadata', () => {
    expect(buildTail('1.0.0+exp.abc')).toBe('exp.abc');
    expect(buildTail('1.0.0')).toBe('');
  });
});

describe('manifest', () => {
  const good = JSON.stringify({
    version: '1.2.3',
    minCoreVersion: '1.0.0',
    sha256: 'a'.repeat(64),
    assetUrl: 'https://example.com/b.json',
    bundleName: 'x-ota-1.2.3.json',
  });
  it('accepts a valid manifest', () => {
    expect(parseManifestJson(good)?.version).toBe('1.2.3');
  });
  it('rejects a bad sha and non-https url', () => {
    expect(parseManifestJson(good.replace('a'.repeat(64), 'nope'))).toBeNull();
    expect(parseManifestJson(good.replace('https://', 'http://'))).toBeNull();
    expect(parseManifestJson('not json')).toBeNull();
  });
});

describe('verify', () => {
  it('hashes and matches', () => {
    const b = new TextEncoder().encode('hello');
    expect(sha256Hex(b)).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    expect(sha256Matches(b, sha256Hex(b).toUpperCase())).toBe(true);
    expect(sha256Matches(b, 'deadbeef')).toBe(false);
  });
  it('signature is a no-op without a public key, fails when key present but no signature', () => {
    const b = new Uint8Array([1, 2, 3]);
    expect(verifySignature(b)).toBe(true);
    expect(verifySignature(b, undefined, '-----BEGIN PUBLIC KEY-----\nx\n-----END PUBLIC KEY-----')).toBe(false);
  });
});

describe('github', () => {
  it('parseRelease keeps https assets and reads prerelease', () => {
    const rel = parseRelease({
      tag_name: 'v1.2.3',
      html_url: 'https://github.com/x/y/releases/tag/v1.2.3',
      prerelease: false,
      assets: [
        { name: 'ota-manifest.json', browser_download_url: 'https://x/ota-manifest.json' },
        { name: 'evil', browser_download_url: 'http://x/evil' },
      ],
    });
    expect(rel?.tagName).toBe('v1.2.3');
    expect(rel?.assets).toHaveLength(1);
  });

  it('findOtaAssets classifies the three asset kinds', () => {
    const set = findOtaAssets({
      tagName: 'experimental',
      htmlUrl: 'https://x',
      prerelease: true,
      assets: [
        { name: 'ota-manifest-exp.json', url: 'https://x/ota-manifest-exp.json' },
        { name: 'modbus-ota-exp.json', url: 'https://x/modbus-ota-exp.json' },
        { name: 'bundle.sha256', url: 'https://x/bundle.sha256' },
      ],
    });
    expect(set.manifest?.name).toBe('ota-manifest-exp.json');
    expect(set.bundle?.name).toBe('modbus-ota-exp.json');
    expect(set.sha256?.name).toBe('bundle.sha256');
  });

  it('fetchLatestPrerelease returns the first prerelease', async () => {
    const fake: FetchLike = async () => ({
      ok: true,
      status: 200,
      json: async () => [
        { tag_name: 'v1.2.3', prerelease: false, assets: [] },
        { tag_name: 'experimental', prerelease: true, assets: [] },
      ],
      text: async () => '',
      arrayBuffer: async () => new ArrayBuffer(0),
    });
    const rel = await fetchLatestPrerelease(fake);
    expect(rel?.tagName).toBe('experimental');
    expect(rel?.prerelease).toBe(true);
  });
});
