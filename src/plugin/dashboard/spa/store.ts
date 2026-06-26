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
