import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { isSafeBundlePath, parseBundleFile, installBundle } from '../src/plugin/ota/installer.js';
import type { FetchLike } from '../src/plugin/ota/github.js';

describe('isSafeBundlePath', () => {
  it('allows main.js and public/*, rejects traversal', () => {
    expect(isSafeBundlePath('main.js')).toBe(true);
    expect(isSafeBundlePath('public/app.js')).toBe(true);
    expect(isSafeBundlePath('../evil')).toBe(false);
    expect(isSafeBundlePath('/etc/passwd')).toBe(false);
    expect(isSafeBundlePath('public/../../x')).toBe(false);
    expect(isSafeBundlePath('node_modules/x')).toBe(false);
    expect(isSafeBundlePath('public\\win')).toBe(false);
  });
});

describe('parseBundleFile', () => {
  it('rejects a bundle with an unsafe path', () => {
    const bad = JSON.stringify({ format: 'x', version: '1.0.0', files: { '../evil': 'AA==' } });
    expect(parseBundleFile(bad)).toBeNull();
  });
  it('requires main.js', () => {
    const noMain = JSON.stringify({ format: 'x', version: '1.0.0', files: { 'public/a': 'AA==' } });
    expect(parseBundleFile(noMain)).toBeNull();
  });
});

function fetchReturning(bytes: Uint8Array): FetchLike {
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({}),
    text: async () => Buffer.from(bytes).toString('utf8'),
    arrayBuffer: async () => ab,
  });
}

describe('installBundle', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mb-ota-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const mainSrc = 'globalThis.__otaMarkHealthy?.();\n';
  const bundleBytes = Buffer.from(
    JSON.stringify({
      format: 'modbus-ota-1',
      version: '1.0.7',
      files: {
        'main.js': Buffer.from(mainSrc).toString('base64'),
        'public/x.txt': Buffer.from('hi').toString('base64'),
      },
    }),
  );
  const bundleSha = createHash('sha256').update(bundleBytes).digest('hex');

  it('installs a verified bundle into active/ with mainSha256', async () => {
    const out = await installBundle({
      otaDir: dir,
      fetchImpl: fetchReturning(bundleBytes),
      manifest: {
        version: '1.0.7',
        minCoreVersion: '1.0.0',
        sha256: bundleSha,
        assetUrl: 'https://x/bundle.json',
        bundleName: 'modbus-ota-1.0.7.json',
      },
      bundleUrl: 'https://x/bundle.json',
    });
    expect(out).toEqual({ ok: true, version: '1.0.7' });
    expect(readFileSync(join(dir, 'active', 'main.js'), 'utf8')).toBe(mainSrc);
    expect(existsSync(join(dir, 'active', 'public', 'x.txt'))).toBe(true);
    const manifest = JSON.parse(readFileSync(join(dir, 'active', 'manifest.json'), 'utf8'));
    expect(manifest.mainSha256).toBe(createHash('sha256').update(Buffer.from(mainSrc)).digest('hex'));
  });

  it('fails with verify-failed on a sha mismatch and leaves active/ untouched', async () => {
    const out = await installBundle({
      otaDir: dir,
      fetchImpl: fetchReturning(bundleBytes),
      manifest: {
        version: '1.0.7',
        minCoreVersion: '1.0.0',
        sha256: 'b'.repeat(64),
        assetUrl: 'https://x/bundle.json',
        bundleName: 'x.json',
      },
      bundleUrl: 'https://x/bundle.json',
    });
    expect(out.ok).toBe(false);
    expect(existsSync(join(dir, 'active'))).toBe(false);
  });
});
