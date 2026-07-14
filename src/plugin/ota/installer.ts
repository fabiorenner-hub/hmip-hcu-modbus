import { promises as fs } from 'node:fs';
import { join, dirname } from 'node:path';
import type { FetchLike } from './github.js';
import type { OtaManifest } from './manifest.js';
import { sha256Hex, sha256Matches, verifySignature } from './verify.js';

export interface OtaBundle {
  format: string;
  version: string;
  files: Record<string, string>; // relative path → base64 content
}

/** Path-traversal guard: only `main.js` and files under `public/` are allowed. */
export function isSafeBundlePath(p: string): boolean {
  if (typeof p !== 'string' || p.length === 0) return false;
  if (p.includes('\\') || p.includes('..') || p.startsWith('/')) return false;
  if (p === 'main.js') return true;
  return p.startsWith('public/') && p.length > 'public/'.length;
}

export function parseBundleFile(json: string): OtaBundle | null {
  let o: unknown;
  try {
    o = JSON.parse(json);
  } catch {
    return null;
  }
  if (!o || typeof o !== 'object') return null;
  const b = o as Record<string, unknown>;
  if (typeof b['format'] !== 'string' || typeof b['version'] !== 'string') return null;
  if (!b['files'] || typeof b['files'] !== 'object') return null;
  const files: Record<string, string> = {};
  for (const [k, v] of Object.entries(b['files'] as Record<string, unknown>)) {
    if (!isSafeBundlePath(k) || typeof v !== 'string') return null;
    files[k] = v;
  }
  if (!('main.js' in files)) return null;
  return { format: b['format'], version: b['version'], files };
}

export type InstallOutcome = { ok: true; version: string } | { ok: false; reason: string };

export interface InstallDeps {
  otaDir: string;
  fetchImpl: FetchLike;
  manifest: OtaManifest;
  bundleUrl: string;
  publicKeyPem?: string;
}

/**
 * Download, verify and install an OTA bundle into `<otaDir>/active`. On any
 * failure the existing `active/` is left untouched.
 */
export async function installBundle(deps: InstallDeps): Promise<InstallOutcome> {
  const { otaDir, fetchImpl, manifest, bundleUrl, publicKeyPem } = deps;

  let bytes: Uint8Array;
  try {
    const res = await fetchImpl(bundleUrl, { headers: { 'User-Agent': 'hcu-ota' } });
    if (!res.ok) return { ok: false, reason: `download-failed (${res.status})` };
    bytes = new Uint8Array(await res.arrayBuffer());
  } catch {
    return { ok: false, reason: 'download-failed' };
  }

  if (!sha256Matches(bytes, manifest.sha256)) return { ok: false, reason: 'verify-failed' };
  if (!verifySignature(bytes, manifest.signature, publicKeyPem)) return { ok: false, reason: 'verify-failed' };

  const bundle = parseBundleFile(Buffer.from(bytes).toString('utf8'));
  if (!bundle) return { ok: false, reason: 'bad-bundle' };

  const staging = join(otaDir, 'staging');
  const active = join(otaDir, 'active');
  const backup = join(otaDir, 'active.bak');
  try {
    await fs.rm(staging, { recursive: true, force: true });
    await fs.mkdir(staging, { recursive: true });

    let mainBytes: Buffer | null = null;
    for (const [rel, b64] of Object.entries(bundle.files)) {
      const data = Buffer.from(b64, 'base64');
      const dest = join(staging, rel);
      await fs.mkdir(dirname(dest), { recursive: true });
      await fs.writeFile(dest, data);
      if (rel === 'main.js') mainBytes = data;
    }
    if (!mainBytes) return { ok: false, reason: 'bad-bundle' };

    // The loader validates active/main.js against this mainSha256 (hash of the
    // unpacked main.js — NOT the bundle file hash).
    const mainSha256 = sha256Hex(new Uint8Array(mainBytes));
    await fs.writeFile(
      join(staging, 'manifest.json'),
      JSON.stringify({ ...manifest, mainSha256 }, null, 2),
      'utf8',
    );

    // Swap active/ into place; keep the old copy until the rename succeeds.
    await fs.rm(backup, { recursive: true, force: true });
    try {
      await fs.rename(active, backup);
    } catch {
      /* no previous active */
    }
    await fs.rename(staging, active);
    await fs.rm(backup, { recursive: true, force: true });
    return { ok: true, version: manifest.version };
  } catch {
    return { ok: false, reason: 'error' };
  }
}
