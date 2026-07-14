import { signal } from '@preact/signals';
import type { AppConfig } from '../../../shared/schema.js';
import type { Snapshot, TrendSeries, DecisionEntry } from '../../../shared/snapshot.js';
import type { FeatureDef, DeviceTypeDef } from '../../../shared/catalog.js';
import type { FeatureType, DeviceType } from '../../../shared/schema.js';

export interface Catalog {
  features: Record<FeatureType, FeatureDef>;
  deviceTypes: Record<DeviceType, DeviceTypeDef>;
}

export const snapshot = signal<Snapshot | null>(null);
export const config = signal<AppConfig | null>(null);
export const catalog = signal<Catalog | null>(null);
export const streamOnline = signal(false);
export const loadError = signal<string | null>(null);
export const latestVersion = signal<string | null>(null);
export const updateAvailable = signal(false);

export interface OtaStatusView {
  coreVersion: string;
  otaVersion: string;
  otaActive: boolean;
  channel: 'stable' | 'experimental';
  mode: 'manual' | 'auto';
  lastCheckAt: number | null;
  latest: { version: string; notes?: string; requiresCore: boolean; canInstall: boolean; htmlUrl: string } | null;
  installing: boolean;
  lastError: string | null;
}
export const otaStatus = signal<OtaStatusView | null>(null);
export const otaUnavailable = signal(false);

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export const api = {
  async loadConfig(): Promise<void> {
    config.value = await getJson<AppConfig>('/api/config');
  },
  async loadCatalog(): Promise<void> {
    catalog.value = await getJson<Catalog>('/api/catalog');
  },
  async saveConfig(next: AppConfig): Promise<{ ok: boolean; error?: string }> {
    const res = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(next),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      return { ok: false, error: body?.error?.message ?? `${res.status}` };
    }
    config.value = next;
    return { ok: true };
  },
  trends: () => getJson<TrendSeries[]>('/api/trends'),
  decisions: () => getJson<DecisionEntry[]>('/api/decisions'),
  diagnostics: () => getJson<Record<string, unknown>>('/api/diagnostics'),
  notifications: () => getJson<unknown[]>('/api/notifications'),
  connectLog: () => getJson<unknown[]>('/api/connect/log'),
  logs: () => getJson<unknown[]>('/api/logs'),
  updates: () => getJson<Record<string, unknown>>('/api/updates'),
  async scan(body: unknown): Promise<{ hits: { address: number; value: number }[]; scanned: number; errors: number }> {
    const res = await fetch('/api/sources/discover', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  },
};

export const otaApi = {
  async status(): Promise<void> {
    try {
      otaStatus.value = await getJson<OtaStatusView>('/api/ota/status');
      otaUnavailable.value = false;
    } catch {
      otaStatus.value = null;
      otaUnavailable.value = true;
    }
  },
  async check(): Promise<void> {
    try {
      const res = await fetch('/api/ota/check', { method: 'POST' });
      if (res.ok) otaStatus.value = (await res.json()) as OtaStatusView;
    } catch {
      /* ignore */
    }
  },
  async install(): Promise<{ ok: boolean; reason?: string }> {
    const res = await fetch('/api/ota/install', { method: 'POST' });
    try {
      return (await res.json()) as { ok: boolean; reason?: string };
    } catch {
      return { ok: res.ok };
    }
  },
  analyticsPreview: () => getJson<Record<string, unknown>>('/api/analytics/preview'),
};

/** Subscribe to the SSE snapshot stream, with auto-reconnect. */
export function startStream(): void {
  let es: EventSource | null = null;
  const connect = () => {
    es = new EventSource('/api/stream');
    es.onmessage = (ev) => {
      try {
        snapshot.value = JSON.parse(ev.data) as Snapshot;
        streamOnline.value = true;
        loadError.value = null;
      } catch {
        /* ignore */
      }
    };
    es.onerror = () => {
      streamOnline.value = false;
      es?.close();
      setTimeout(connect, 3000);
    };
  };
  connect();
}

function parseSemver(v: string): number[] {
  return v.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
}

/** True when `a` is a strictly newer semantic version than `b`. */
function isNewer(a: string, b: string): boolean {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da > db;
  }
  return false;
}

/** Build the GitHub releases API URL from the repo web URL. */
function githubLatestApi(repoUrl: string): string | null {
  const m = repoUrl.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
  if (!m) return null;
  return `https://api.github.com/repos/${m[1]}/${m[2]}/releases/latest`;
}

/**
 * Check GitHub for a newer release. Runs in the browser (keeps the plugin server
 * local; the check is best-effort and never blocks the UI).
 */
export async function checkForUpdate(current: string, repoUrl: string): Promise<void> {
  const url = githubLatestApi(repoUrl);
  if (!url) return;
  try {
    const res = await fetch(url, { headers: { accept: 'application/vnd.github+json' } });
    if (!res.ok) return;
    const data = (await res.json()) as { tag_name?: string };
    const tag = (data.tag_name ?? '').replace(/^v/i, '');
    if (!tag) return;
    latestVersion.value = tag;
    updateAvailable.value = isNewer(tag, current);
  } catch {
    /* offline or rate-limited — ignore */
  }
}
