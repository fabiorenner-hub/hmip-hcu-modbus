import { join } from 'node:path';
import { APP_VERSION } from '../../shared/version.js';
import { ENV_PREFIX } from '../pluginMeta.js';
import type { FetchLike } from './github.js';
import { fetchLatestPrerelease, fetchLatestRelease, findOtaAssets } from './github.js';
import { parseManifestJson, type OtaManifest } from './manifest.js';
import { isAtLeast, isNewer, isNewerWithBuild } from './semver.js';
import { installBundle } from './installer.js';

export type Channel = 'stable' | 'experimental';

export interface OtaLatest {
  version: string;
  notes?: string;
  requiresCore: boolean;
  canInstall: boolean;
  htmlUrl: string;
}

export interface OtaStatus {
  coreVersion: string;
  otaVersion: string;
  otaActive: boolean;
  channel: Channel;
  mode: 'manual' | 'auto';
  lastCheckAt: number | null;
  latest: OtaLatest | null;
  installing: boolean;
  lastError: string | null;
}

export interface OtaManagerDeps {
  dataDir: string;
  fetchImpl: FetchLike;
  getConfig: () => { mode: 'manual' | 'auto'; channel: Channel; checkIntervalHours: number };
  requestRestart: () => void;
  publicKeyPem?: string;
  logger?: (lvl: 'info' | 'warn' | 'error', msg: string) => void;
}

export class OtaManager {
  private latest: OtaLatest | null = null;
  private pending: { manifest: OtaManifest; bundleUrl: string } | null = null;
  private lastCheckAt: number | null = null;
  private installing = false;
  private lastError: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly deps: OtaManagerDeps) {}

  private env(name: string): string | undefined {
    return process.env[`${ENV_PREFIX}_${name}`];
  }

  coreVersion(): string {
    return this.env('VERSION') ?? APP_VERSION;
  }

  otaVersion(): string {
    return this.env('OTA_VERSION') ?? this.coreVersion();
  }

  otaActive(): boolean {
    return this.env('OTA_ACTIVE') === 'true' || this.otaVersion() !== this.coreVersion();
  }

  getChannel(): Channel {
    return this.deps.getConfig().channel === 'experimental' ? 'experimental' : 'stable';
  }

  private otaDir(): string {
    return join(this.deps.dataDir, 'ota');
  }

  private async fetchText(url: string): Promise<string | null> {
    try {
      const r = await this.deps.fetchImpl(url, { headers: { 'User-Agent': 'hcu-ota' } });
      if (!r.ok) return null;
      return await r.text();
    } catch {
      return null;
    }
  }

  /** Resolve the newest manifest for the active channel, or null. */
  private async resolveRelease(): Promise<{ manifest: OtaManifest; htmlUrl: string } | null> {
    const channel = this.getChannel();
    const rel =
      channel === 'experimental'
        ? await fetchLatestPrerelease(this.deps.fetchImpl)
        : await fetchLatestRelease(this.deps.fetchImpl);
    if (!rel) return null;
    const assets = findOtaAssets(rel);
    if (!assets.manifest) return null;
    const text = await this.fetchText(assets.manifest.url);
    if (!text) return null;
    const manifest = parseManifestJson(text);
    if (!manifest) return null;
    return { manifest, htmlUrl: rel.htmlUrl };
  }

  private computeLatest(manifest: OtaManifest, htmlUrl: string): OtaLatest {
    const channel = this.getChannel();
    const baseline = this.otaVersion();
    const available =
      channel === 'experimental'
        ? isNewerWithBuild(manifest.version, baseline)
        : isNewer(manifest.version, baseline);
    const requiresCore = !isAtLeast(this.coreVersion(), manifest.minCoreVersion);
    return {
      version: manifest.version,
      ...(manifest.notes !== undefined ? { notes: manifest.notes } : {}),
      requiresCore,
      canInstall: available && !requiresCore,
      htmlUrl,
    };
  }

  async check(): Promise<OtaStatus> {
    this.lastCheckAt = Date.now();
    try {
      const resolved = await this.resolveRelease();
      if (!resolved) {
        this.latest = null;
        this.pending = null;
      } else {
        this.latest = this.computeLatest(resolved.manifest, resolved.htmlUrl);
        this.pending = { manifest: resolved.manifest, bundleUrl: resolved.manifest.assetUrl };
      }
    } catch (e) {
      this.lastError = String(e);
    }
    return this.getStatus();
  }

  async install(): Promise<{ ok: boolean; reason?: string }> {
    if (this.installing) return { ok: false, reason: 'already-installing' };
    if (!this.latest || !this.pending) return { ok: false, reason: 'no-update' };
    if (!this.latest.canInstall) {
      return { ok: false, reason: this.latest.requiresCore ? 'requires-core' : 'already-current' };
    }
    this.installing = true;
    this.lastError = null;
    try {
      const outcome = await installBundle({
        otaDir: this.otaDir(),
        fetchImpl: this.deps.fetchImpl,
        manifest: this.pending.manifest,
        bundleUrl: this.pending.bundleUrl,
        ...(this.deps.publicKeyPem !== undefined ? { publicKeyPem: this.deps.publicKeyPem } : {}),
      });
      if (!outcome.ok) {
        this.lastError = outcome.reason;
        return { ok: false, reason: outcome.reason };
      }
      this.deps.logger?.('info', `OTA installed ${outcome.version}; restarting.`);
      this.deps.requestRestart();
      return { ok: true };
    } finally {
      this.installing = false;
    }
  }

  getStatus(): OtaStatus {
    const cfg = this.deps.getConfig();
    return {
      coreVersion: this.coreVersion(),
      otaVersion: this.otaVersion(),
      otaActive: this.otaActive(),
      channel: this.getChannel(),
      mode: cfg.mode,
      lastCheckAt: this.lastCheckAt,
      latest: this.latest,
      installing: this.installing,
      lastError: this.lastError,
    };
  }

  start(): void {
    if (this.timer) return;
    const tick = async (): Promise<void> => {
      await this.check();
      if (this.deps.getConfig().mode === 'auto' && this.latest?.canInstall) {
        await this.install().catch(() => undefined);
      }
    };
    void tick();
    const hours = Math.min(168, Math.max(1, this.deps.getConfig().checkIntervalHours));
    this.timer = setInterval(() => void tick().catch(() => undefined), hours * 3_600_000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
