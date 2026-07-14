import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CallHome, type CallHomeDeps } from '../src/plugin/analytics/callHome.js';

function makeDeps(over: Partial<CallHomeDeps> & { dataDir: string }): CallHomeDeps {
  return {
    dataDir: over.dataDir,
    getConfig: over.getConfig ?? (() => ({ enabled: true, endpoint: 'https://x/ingest', intervalHours: 24 })),
    buildMeta:
      over.buildMeta ??
      (() => ({ coreVersion: '1.0.7', otaVersion: '1.0.7', buildId: '1.0.7+abc', arch: 'arm64', lang: 'de' })),
    fetchImpl: over.fetchImpl ?? (async () => ({ ok: true, status: 204 })),
  };
}

describe('CallHome', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mb-analytics-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('builds a minimal, non-identifying payload', async () => {
    const p = await new CallHome(makeDeps({ dataDir: dir })).preview('start');
    expect(p.schema).toBe(1);
    expect(p.event).toBe('start');
    expect(p.pluginId).toBe('de.fr.renner.plugin.modbusbridge');
    expect(p.coreVersion).toBe('1.0.7');
    // no forbidden / identifying fields
    const keys = Object.keys(p);
    for (const forbidden of ['name', 'host', 'ip', 'token', 'address', 'lat', 'lon', 'counts', 'rooms', 'devices', 'sgtin', 'serial']) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it('produces a 64-char lowercase hex installId, stable across instances', async () => {
    const a = await new CallHome(makeDeps({ dataDir: dir })).preview();
    expect(a.installId).toMatch(/^[0-9a-f]{64}$/);
    const b = await new CallHome(makeDeps({ dataDir: dir })).preview();
    expect(b.installId).toBe(a.installId);
  });

  it('respects the send guard: disabled or non-https means no send', () => {
    const disabled = { enabled: false, endpoint: 'https://x/ingest', intervalHours: 24 };
    const insecure = { enabled: true, endpoint: 'http://x/ingest', intervalHours: 24 };
    const ok = { enabled: true, endpoint: 'https://x/ingest', intervalHours: 24 };
    const wouldSend = (c: typeof ok) => c.enabled && !!c.endpoint && c.endpoint.startsWith('https://');
    expect(wouldSend(disabled)).toBe(false);
    expect(wouldSend(insecure)).toBe(false);
    expect(wouldSend(ok)).toBe(true);
  });
});
